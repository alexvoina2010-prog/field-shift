// Turns scores and facts into plain sentences: why, evidence, benefits, gaps, risks.
import { CROPS } from '../src/model/crops.js';
import { METRICS, HEAT_DAYS, COVER_MIN_GAP } from '../src/model/rotation.js';
import { HEAVY_RAIN as HEAVY_RAIN_MM, START_YEAR, END_YEAR } from '../src/model/climate.js';

export const LABELS = {
  water: 'Seasons with enough water', heat: 'Seasons without a heat hit', frost: 'Seasons without frost after sowing',
  erosion: 'Heavy rain kept off bare soil', nitrogen: 'Years with a nitrogen-fixing crop',
};
// Short chip labels for the same five scores.
const SHORT = { water: 'Water', heat: 'Heat safety', frost: 'Frost safety', erosion: 'Soil cover', nitrogen: 'Nitrogen' };
// Calendar labels: [three letters, full name], so narrow segments still read on a phone.
const ABBR = { wheat: 'Wht', barley: 'Bar', rapeseed: 'Rap', maize: 'Mze', sunflower: 'Sun', sorghum: 'Sor', soybean: 'Soy', pea: 'Pea', chickpea: 'Chk', alfalfa: 'Alf' };
export const cropLabel = (id) => [ABBR[id] ?? CROPS[id].name.slice(0, 3), CROPS[id].name];
const NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Model months are shifted by 6 south of the equator; shift back for display.
export const monthName = (m0, shift = 0) => NAMES[(((m0 - shift) % 12) + 12) % 12];

const pct = (v) => Math.round(v * 100);
const one = (v) => v.toFixed(1);
const name = (id) => CROPS[id].name;
const SRC_CLIMATE = { source: `NASA POWER ${START_YEAR}–${END_YEAR} replayed through an FAO-56 daily water balance`, conf: 'medium' };
const SRC_HEAT = { source: `NASA POWER ${START_YEAR}–${END_YEAR}; heat limits and flowering months are assumptions`, conf: 'low' };
const SRC_TRAITS = { source: 'Crop calendar and return intervals (assumptions)', conf: 'low' };
const of = (x, k) => `${x[k]} of ${x.n}`;
// One line per crop in the rotation: the backtest headline.
export const headline = (ev) => ev.rot.crops.map((id, i) => `${name(id)}: short of water at flowering in ${of(ev.facts.crops[i], 'dry')} seasons`);

export function title(c) {
  if (!c.kind) return { title: 'Your current rotation', lead: 'The baseline. Every alternative is measured against it.' };
  if (c.kind === 'cover') return { title: 'Keep the crops, add cover crops', lead: `Same crops. A cover mix (for example vetch + oats) is sown in every gap of ${COVER_MIN_GAP} months or more.` };
  if (c.kind === 'swap') return { title: `Swap ${name(c.old)} for ${name(c.id)}`, lead: `Year ${c.at + 1}: ${name(c.id)} instead of ${name(c.old)}. Everything else stays.` };
  return { title: `Add ${/^[AEIOU]/.test(name(c.id)) ? 'an' : 'a'} ${name(c.id)} year`, lead: `The rotation grows from ${c.rot.crops.length - 1} to ${c.rot.crops.length} years.` };
}

const rate = (w, k) => (w.n ? w[k] / w.n : 0);
const KEY_FACTS = { hot: 'Heatwave at flowering', dry: 'Short of water at flowering' };
// The single most important fact for a card: what the change moves, or the rotation's worst count.
function keyFact(c, cur) {
  const f = c.ev.facts;
  if (c.kind === 'swap') {
    const o = cur.facts.crops[c.at], x = f.crops[c.at], drop = (k) => rate(o, k) - rate(x, k);
    const k = drop('hot') >= drop('dry') ? 'hot' : 'dry';
    if (drop(k) >= 0.1) return `${KEY_FACTS[k]}: ${o.n === x.n ? `${o[k]} → ${x[k]} of ${x.n}` : `${of(o, k)} → ${of(x, k)}`} seasons`;
  }
  if (c.kind === 'cover') return `Bare soil: ${one(cur.facts.bare / cur.facts.n)} → ${one(f.bare / f.n)} months a year`;
  if (c.kind === 'insert' && CROPS[c.id].legume) return `Legume years: ${cur.facts.legumeYears} of ${cur.facts.n} → ${f.legumeYears} of ${f.n}`;
  const worst = c.ev.rot.crops.flatMap((id, i) => ['hot', 'dry'].map((k) => ({ id, k, w: f.crops[i] }))).sort((a, b) => rate(b.w, b.k) - rate(a.w, a.k))[0];
  return `${name(worst.id)}: ${KEY_FACTS[worst.k].toLowerCase()} in ${of(worst.w, worst.k)} seasons`;
}

const gapText = (g, shift) => `${monthName(g.months[0].abs % 12, shift)}–${monthName(g.months.at(-1).abs % 12, shift)}`;

function why(c, cur, shift) {
  const ev = c.ev, out = [];
  if (c.kind === 'cover') {
    const gaps = ev.lay.gaps.filter((g) => g.covered).map((g) => `${gapText(g, shift)} after ${name(ev.rot.crops[g.after])}`);
    out.push(`Your soil is bare for ${cur.facts.bare} of ${12 * cur.facts.n} months. Cover crops fill the long gaps: ${gaps.join('; ')}.`);
    return out;
  }
  const X = CROPS[c.id], xw = ev.facts.crops[c.at];
  if (c.kind === 'swap') {
    const O = CROPS[c.old], ow = cur.facts.crops[c.at], rate = (w, k) => (w.n ? w[k] / w.n : 0);
    if (rate(ow, 'dry') - rate(xw, 'dry') >= 0.1) {
      out.push(`${O.name} would have been short of water at flowering in ${of(ow, 'dry')} seasons here. ${X.name}: ${of(xw, 'dry')}.`);
    }
    if (rate(ow, 'hot') - rate(xw, 'hot') >= 0.1) {
      out.push(`${O.name} met ${HEAT_DAYS} or more days above ${O.heatTmax} °C while flowering in ${of(ow, 'hot')} seasons. ${X.name} (limit ${X.heatTmax} °C): ${of(xw, 'hot')}.`);
    }
    if (X.legume && !O.legume) out.push(`${X.name} is a legume: it fixes nitrogen from the air and leaves some for the next crop.`);
  } else {
    if (X.legume) out.push(`${X.name} is a legume: it fixes nitrogen from the air and leaves some for the next crop.`);
    out.push('A longer rotation gives every crop a longer break before it returns to the same field.');
  }
  if (ev.facts.families > cur.facts.families) {
    out.push(`The rotation becomes more varied (${cur.facts.families} → ${ev.facts.families} plant families), so pests and diseases tied to one crop are interrupted.`);
  }
  const bareNow = cur.facts.bare / cur.facts.n, bareAlt = ev.facts.bare / ev.facts.n;
  if (bareNow - bareAlt >= 0.5) out.push(`Bare soil falls from ${one(bareNow)} to ${one(bareAlt)} months a year.`);
  if (!out.length) out.push('Among single changes with the crops you ticked, this one scores highest for your priorities.');
  return out;
}

function evidence(ev, cur) {
  const f = ev.facts, b = cur && cur !== ev ? cur.facts : null;
  const ch = (now, before) => (before == null || before === now ? `${now}` : `${before} → ${now}`);
  const late = (x) => (x.violations.length ? x.violations.map((v) => `${name(v.id)} every ${one(v.interval)} yr (guide: ${v.min}+)`).join(', ') : 'none');
  const count = (x, k) => `${x.crops.reduce((s, c) => s + c[k], 0)} of ${x.seasons}`;
  return [
    { text: `Crop seasons short of water at flowering: ${ch(count(f, 'dry'), b && count(b, 'dry'))}`, ...SRC_CLIMATE },
    { text: `Crop seasons with ${HEAT_DAYS} or more days above the crop's heat limit at flowering: ${ch(count(f, 'hot'), b && count(b, 'hot'))}`, ...SRC_HEAT },
    { text: `Crop seasons with frost in the month after sowing (frost-sensitive crops): ${ch(count(f, 'frost'), b && count(b, 'frost'))}`, ...SRC_CLIMATE },
    { text: `Heavy-rain days (${HEAVY_RAIN_MM} mm or more) that fall on bare soil: ${ch(pct(f.bareShare), b && pct(b.bareShare))}%`, ...SRC_CLIMATE },
    { text: `Bare soil, months per year: ${ch(one(f.bare / f.n), b && one(b.bare / b.n))}. Legume years: ${ch(f.legumeYears, b && b.legumeYears)} of ${f.n}`, ...SRC_TRAITS },
    { text: `Soil organic matter (qualitative, not measured): ${organicMatter(f, b)}`, source: 'Rule of thumb from months of bare soil and cover crops (assumption)', conf: 'low' },
    { text: `Plant families: ${ch(f.families, b && b.families)}. Crops returning too soon: ${late(f)}`, ...SRC_TRAITS },
  ];
}

// Qualitative only: less bare soil and more cover means more roots and residue feeding the soil.
function organicMatter(f, b) {
  const bare = f.bare / f.n;
  if (!b) return bare <= 2 ? 'likely holding or building, the soil is rarely bare' : bare <= 4 ? 'uncertain' : `at risk of declining, the soil is bare ${one(bare)} months a year`;
  const d = bare - b.bare / b.n;
  return d <= -0.5 ? 'likely better than now, less bare soil' : d >= 0.5 ? 'likely worse than now, more bare soil' : 'about the same as now';
}

const tag = (c, k) => (c.src[k].source === 'assumption' ? 'assumption' : c.src[k].source.replace('FAO56-T', 'FAO-56 Table '));

// For each crop in the rotation: its three worst flowering seasons with the weather NASA recorded,
// and the parameters the backtest used with where each came from.
function worst(ev, shift) {
  return ev.rot.crops.map((id, i) => {
    const c = CROPS[id], months = c.flower.map((m) => monthName(m - 1, shift));
    return {
      crop: c.name,
      window: months.length > 1 ? `${months[0]}–${months.at(-1)}` : months[0],
      seasons: [...ev.facts.crops[i].list].sort((a, b) => a.ks - b.ks).slice(0, 3).map((s) =>
        `${s.year}: ${Math.round(s.rain)} mm of rain, average daily high ${one(s.tmax)} °C, short of water on ${s.stress} of ${s.days} days`),
      used: `Crop coefficients ${c.kc.join(' / ')} (${tag(c, 'kc')}); stage lengths (${tag(c, 'stages')}); roots ${c.root} m and depletion fraction ${c.p} (${tag(c, 'root')}); ` +
        `flowering months (${tag(c, 'flower')}); heat limit ${c.heatTmax} °C (${tag(c, 'heatTmax')}).`,
    };
  });
}

// CONFIDENCE RULES (also listed under "Data and method" on the page)
// Low:    a water-balance parameter (crop coefficient, stage lengths, rooting depth, depletion
//         fraction) of any crop is an assumption; or the field lies outside 35-60 degrees latitude,
//         where the temperate crop calendar does not apply; or a crop has fewer than 15 replayed seasons.
// Medium: all water-balance parameters are FAO-56 table values. Flowering months and heat limits
//         are still assumptions and rainfall comes from one source.
// High:   not reachable yet. Needs sourced flowering months and heat limits, and a second rainfall
//         source agreeing within 20%.
const WATER_PARAMS = ['kc', 'stages', 'root', 'p'];
export function confidence(ev, lat) {
  const reasons = [], short = []; // short: the few-word reason shown on the badge
  const weak = [...new Set(ev.rot.crops)].filter((id) => WATER_PARAMS.some((k) => CROPS[id].src[k].source === 'assumption'));
  if (weak.length) reasons.push(`${weak.map(name).join(', ')}: growth-stage lengths are an assumption, not an FAO-56 table value.`) && short.push(`${weak.map(name).join(', ')} data is an estimate`);
  if (Math.abs(lat) < 35 || Math.abs(lat) > 60) reasons.push('This field is outside the temperate latitudes (35°–60°) the crop calendar was written for.') && short.push('outside the crop calendar’s latitudes');
  if (ev.facts.crops.some((c) => c.n < 15)) reasons.push('Fewer than 15 replayed seasons for at least one crop.') && short.push('fewer than 15 seasons replayed');
  if (reasons.length) return { level: 'Low', reasons, short: short[0] };
  return { level: 'Medium', short: 'flowering and heat limits are assumed', reasons: ['Water-balance parameters are FAO-56 table values, but flowering months and heat limits are assumptions and rainfall comes from one source.'] };
}

// Rain in the first two months of the longest covered gap: average and driest-third value.
function establishmentRain(ev, mo) {
  const g = ev.lay.gaps.filter((x) => x.covered).sort((a, b) => b.len - a.len)[0];
  if (!g) return null;
  const months = [g.months[0].abs % 12, g.months[1].abs % 12];
  const perYear = mo.years.map((_, y) => months.reduce((s, m) => s + mo.m[y * 12 + m].rain, 0)).sort((a, b) => a - b);
  return { months, avg: perYear.reduce((s, v) => s + v, 0) / perYear.length, low: perYear[Math.floor(perYear.length / 3)] };
}

function risks(c, ctx) {
  const ev = c.ev, f = ev.facts, shift = ctx.mo.shift, out = [];
  if (c.id) out.push(`${name(c.id)}: ${CROPS[c.id].risk}`);
  const est = establishmentRain(ev, ctx.mo);
  if (est) {
    out.push(`Cover crops need moisture to establish and use some water themselves. In ${monthName(est.months[0], shift)}–${monthName(est.months[1], shift)} rain here averaged ${Math.round(est.avg)} mm, and stayed under ${Math.round(est.low)} mm in the driest third of years.`);
  }
  ev.lay.tight.forEach((i) => {
    const next = ev.rot.crops[(i + 1) % f.n];
    out.push(`${name(ev.rot.crops[i])} harvest and ${name(next)} sowing fall in the same month: a late harvest delays sowing.`);
  });
  f.violations.forEach((v) => out.push(`${name(v.id)} returns every ${one(v.interval)} years; common guidance is at least ${v.min}.`));
  ev.rot.crops.forEach((id, i) => {
    const w = f.crops[i];
    if (w.n && w.dry / w.n >= 0.4) out.push(`${name(id)}: short of water at flowering in ${of(w, 'dry')} replayed seasons.`);
    if (w.n && w.frost / w.n >= 0.2) out.push(`${name(id)}: frost in the month after sowing in ${of(w, 'frost')} seasons.`);
  });
  return [...new Set(out)];
}

// Card-specific gaps only. What applies to every option (grid cell, soil, irrigation, money,
// calendars) is said once in the "What this tool can't see" panel above the cards.
function gaps(c) {
  const out = [];
  if (c.id) out.push(`No local yield, price or contract data for ${name(c.id)}.`);
  if (c.ev.facts.coveredGaps) out.push('Cover crop species, sowing date and termination are not modelled.');
  return out;
}

// c = { kind?, id?, old?, at?, rot, ev, total }; cur = evaluated current rotation (may equal c.ev).
export function explain(c, cur, ctx) {
  const delta = (k) => (cur ? c.ev.scores[k] - cur.scores[k] : 0);
  const moved = (sign) => METRICS.filter((k) => sign * delta(k) >= 0.03).map((k) => `${SHORT[k]} ${sign > 0 ? '+' : '−'}${Math.abs(pct(delta(k)))}`);
  return {
    ...title(c),
    headline: headline(c.ev),
    why: c.kind ? why(c, cur, ctx.mo.shift) : ['This is what you grow now. It is replayed on the same weather so every alternative has something to be measured against.'],
    evidence: evidence(c.ev, cur),
    worst: worst(c.ev, ctx.mo.shift),
    // Baseline: its strongest scores. Alternatives: what moves against the baseline.
    benefits: c.kind ? moved(1) : METRICS.filter((k) => c.ev.scores[k] >= 0.75).map((k) => `${SHORT[k]} ${pct(c.ev.scores[k])} of 100`),
    tradeoffs: c.kind ? moved(-1) : [],
    gaps: gaps(c),
    key: keyFact(c, cur),
    risks: risks(c, ctx),
    confidence: confidence(c.ev, ctx.lat),
  };
}
