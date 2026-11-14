// Run: node --test test/
// Optional: POWER_JSON=<path to a saved NASA POWER response> prints a real-data report too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extraterrestrialRadiation, penmanMonteithEt0, toMonthly, summarize, powerUrl } from '../src/model/climate.js';
import { layout, backtest, evaluate, suggest, total, METRICS } from '../src/model/rotation.js';
import { explain } from '../js/explain.js';
import { CROPS } from '../src/model/crops.js';
import { mannKendall } from '../src/model/trend.js';

// Synthetic continental climate: hot dry summers, frosty winters, rain every 4th day.
function fakePower(years = 12) {
  const p = { T2M_MAX: {}, T2M_MIN: {}, PRECTOTCORR: {}, GWETROOT: {} };
  for (let d = new Date(Date.UTC(2001, 0, 1)); d.getUTCFullYear() < 2001 + years; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10).replaceAll('-', '');
    const doy = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
    const season = -Math.cos((2 * Math.PI * (doy - 15)) / 365); // -1 mid-January, +1 mid-July
    p.T2M_MAX[key] = 16 + 18 * season;
    p.T2M_MIN[key] = 5 + 12 * season;
    p.PRECTOTCORR[key] = d.getUTCDate() % 4 === 0 ? 12 - 5 * season : 0;
    p.GWETROOT[key] = 0.5 - 0.2 * season;
  }
  return p;
}

const ctxFor = (mo) => ({ mo, clim: summarize(mo).clim, soil: 'loam', slope: 'gentle' });
const weights = Object.fromEntries(METRICS.map((k) => [k, 3]));
const base = { crops: ['wheat', 'maize', 'sunflower'], cover: false };

test('extraterrestrial radiation matches FAO-56 tables at 45N in late June', () => {
  const ra = extraterrestrialRadiation(45, 172);
  assert.ok(ra > 40 && ra < 43, `got ${ra}`);
});

test('Penman-Monteith reproduces FAO-56 example 18 (Uccle, 6 July: 3.9 mm/day)', () => {
  const et0 = penmanMonteithEt0({ tmax: 21.5, tmin: 12.3, tdew: 12.07, rs: 22.07, u2: 2.078, lat: 50.8, doy: 187, z: 100 });
  assert.ok(Math.abs(et0 - 3.9) < 0.15, `got ${et0}`);
});

test('calendar: gaps, tight turnarounds and impossible sequences', () => {
  const lay = layout(base);
  assert.equal(lay.feasible, true);
  assert.deepEqual(lay.gaps.map((g) => g.len), [8, 5, 0]); // Aug-Mar, Nov-Mar, none
  assert.deepEqual(layout({ crops: ['maize', 'wheat'], cover: false }).tight, [0]);
  assert.equal(layout({ crops: ['maize', 'rapeseed'], cover: false }).feasible, false);
  assert.deepEqual(layout({ crops: ['wheat'], cover: false }).gaps.map((g) => g.len), [2]);
});

test('monthly record keeps complete years only, also south of the equator', () => {
  assert.equal(toMonthly(fakePower(), 45).years.length, 12);
  const south = toMonthly(fakePower(), -35);
  assert.equal(south.years.length, 11);
  assert.equal(south.m.length, 11 * 12);
});

test('scores stay in 0-1 and respond to cover crops and a drier scenario', () => {
  const ctx = ctxFor(toMonthly(fakePower(), 45));
  const plain = evaluate(base, ctx), covered = evaluate({ ...base, cover: true }, ctx);
  for (const k of METRICS) assert.ok(plain.scores[k] >= 0 && plain.scores[k] <= 1, `${k}=${plain.scores[k]}`);
  assert.ok(covered.facts.bare < plain.facts.bare);
  assert.ok(covered.scores.erosion > plain.scores.erosion);
  const dry = evaluate(base, ctxFor(toMonthly(fakePower(), 45, { rain: 0.6, dT: 2 })));
  assert.ok(dry.scores.water <= plain.scores.water); // counts over seasons can tie
  assert.ok(dry.scores.heat <= plain.scores.heat);
});

test('suggestions are feasible, use only allowed crops, and can be explained', () => {
  const ctx = ctxFor(toMonthly(fakePower(), 45));
  const allowed = ['wheat', 'maize', 'sunflower', 'sorghum', 'pea'];
  const { cur, alts } = suggest(base, allowed, ctx, weights);
  assert.ok(alts.length >= 2);
  assert.deepEqual(alts.map((a) => a.kind).slice(0, 3), ['cover', 'swap', 'insert']);
  for (const a of alts) assert.ok(a.ev.facts.violations.length <= cur.ev.facts.violations.length);
  for (const a of alts) {
    assert.ok(a.rot.crops.every((id) => allowed.includes(id)));
    assert.ok(a.ev.lay.feasible);
    const text = explain(a, cur.ev, ctx);
    assert.ok(text.why.length && text.evidence.length >= 5 && text.headline.length && text.risks.length && text.gaps.length);
    assert.ok(!JSON.stringify(text).match(/NaN|undefined/), JSON.stringify(text));
  }
  assert.ok(!JSON.stringify(explain({ rot: base, ev: cur.ev }, cur.ev, ctx)).match(/NaN|undefined/));
});

test('an impossible current rotation still returns alternatives', () => {
  const ctx = ctxFor(toMonthly(fakePower(), 45));
  const r = suggest({ crops: ['maize', 'rapeseed'], cover: false }, Object.keys(CROPS), ctx, weights);
  assert.equal(r.cur, null);
  assert.ok(r.alts.length >= 1);
});

test('Mann-Kendall and Sen slope: a steady rise, a flat line, and noise', () => {
  const up = mannKendall([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // S = 45, var = 125, z = 44 / sqrt(125)
  assert.equal(up.s, 45);
  assert.ok(Math.abs(up.z - 3.9355) < 1e-3 && Math.abs(up.p - 8.3e-5) < 1e-5, JSON.stringify(up));
  assert.equal(up.slope, 1);
  assert.equal(mannKendall([10, 8, 6, 4, 2]).slope, -2);
  const flat = mannKendall([3, 3, 3, 3, 3, 3]);
  assert.ok(flat.p > 0.999999); // erf is an approximation
  assert.equal(flat.slope, 0);
  assert.ok(mannKendall([5, 1, 4, 2, 6, 3, 5, 2, 4, 3]).p > 0.05);
});

// One year of identical days, repeated: rain mm/day and reference-ET-driving temperatures are fixed.
function steadyPower(rain, tmax, tmin, years = 4) {
  const p = { T2M_MAX: {}, T2M_MIN: {}, PRECTOTCORR: {} };
  for (let d = new Date(Date.UTC(2001, 0, 1)); d.getUTCFullYear() < 2001 + years; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10).replaceAll('-', '');
    p.T2M_MAX[key] = tmax; p.T2M_MIN[key] = tmin; p.PRECTOTCORR[key] = rain;
  }
  return p;
}
const maizeOnly = layout({ crops: ['maize'], cover: false });

test('backtest: rain above crop demand every day gives zero stress days', () => {
  const [maize] = backtest(maizeOnly, toMonthly(steadyPower(8, 24, 14), 45), 'loam');
  assert.equal(maize.n, 4);
  assert.equal(maize.dry, 0);
  assert.ok(maize.list.every((s) => s.stress === 0 && s.ks === 1), JSON.stringify(maize.list));
});

test('backtest: no rain at all stresses every flowering season', () => {
  const [maize] = backtest(maizeOnly, toMonthly(steadyPower(0, 30, 16), 45), 'loam');
  assert.equal(maize.dry, maize.n);
  assert.ok(maize.list.every((s) => s.stress === s.days));
});

test('demo field file matches the live POWER shape and gives 26 complete years', async () => {
  const { expandDemo } = await import('../src/model/climate.js');
  const demo = JSON.parse(readFileSync(new URL('../data/demo_field.json', import.meta.url), 'utf8'));
  const p = expandDemo(demo);
  assert.equal(Object.keys(p.T2M_MAX)[0], '20000101');
  assert.equal(Object.keys(p.T2M_MAX).at(-1), '20251231');
  assert.equal(toMonthly(p, demo.lat, undefined, demo.elev).years.length, 26);
});

test('every numeric crop field carries a source and a confidence', () => {
  const raw = JSON.parse(readFileSync(new URL('../data/crops.json', import.meta.url), 'utf8'));
  for (const [id, c] of Object.entries(raw.crops)) {
    for (const k of ['sow', 'harvest', 'kc', 'stages', 'root', 'p', 'flower', 'heatTmax', 'minReturn']) {
      assert.ok(c[k] && c[k].source in raw.sources && c[k].confidence, `${id}.${k}`);
    }
  }
});

if (process.env.POWER_JSON) {
  test('real-data report', () => {
    const json = JSON.parse(readFileSync(process.env.POWER_JSON, 'utf8')), p = json.properties.parameter;
    const mo = toMonthly(p, 44.6, undefined, json.geometry.coordinates[2]), s = summarize(mo), ctx = ctxFor(mo);
    console.log('years', mo.years.length, 'rain', Math.round(s.annualRain), 'et0', Math.round(s.annualEt0));
    const { cur, alts } = suggest(base, Object.keys(CROPS), ctx, weights);
    for (const c of [{ rot: base, ev: cur.ev, total: cur.total }, ...alts]) {
      const t = explain(c, cur.ev, ctx);
      console.log(`\n== ${t.title} [${c.rot.crops}] total ${total(c.ev.scores, weights).toFixed(3)}`,
        JSON.stringify(c.ev.scores, (k, v) => (typeof v === 'number' ? +v.toFixed(2) : v)));
      console.log(' why:', t.why, '\n evidence:', t.evidence.map((e) => e.text), '\n +', t.benefits, '-', t.tradeoffs, '\n risks:', t.risks);
    }
  });
}
