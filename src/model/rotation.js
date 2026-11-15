// Rotation backtest: lays crops on a month calendar, replays the NASA POWER record day by day
// through an FAO-56 soil-water bucket, and scores each rotation by how often its seasons were in
// trouble. Every score is a frequency over real seasons; nothing here predicts yield or income.
import { CROPS, COVER } from './crops.js';

// ADJUSTABLE DEFAULTS (assumptions, not benchmarks)
export const COVER_MIN_GAP = 3;   // months of bare soil before a cover crop is worth sowing
export const STRESS_KS = 0.5;     // a "short of water" day: the crop can draw under half the water it needs
export const STRESS_SHARE = 0.5;  // a season is water-stressed when at least this share of flowering days are such days
export const HEAT_DAYS = 5;       // a season is heat-hit with this many days above the crop's limit while flowering
export const SLOPE_F = { flat: 0.25, gentle: 0.6, steep: 1 }; // how much bare-soil rain matters
// Plant-available water, mm per metre of soil: midpoints of FAO-56 Table 19. Confidence: medium.
export const SOIL_AWC = { sandy: 80, loam: 155, clay: 160 };
// Runoff curve numbers: row crops, straight rows, good condition, soil groups A / B / D (USDA TR-55, Table 2-2b).
export const CURVE_NUMBER = { sandy: 67, loam: 78, clay: 89 };
const KC_BARE = 0.25;  // evaporation from bare soil, fraction of reference ET (assumption)

export const METRICS = ['water', 'heat', 'frost', 'erosion', 'nitrogen'];

const mod = (a, n) => ((a % n) + n) % n;
const clamp = (v) => Math.max(0, Math.min(1, v));
const sum = (a) => a.reduce((s, v) => s + v, 0);

// rot = { crops: [cropId per year], cover: boolean }
// Year i's crop is harvested in year i; winter crops are sown the autumn before.
export function layout(rot) {
  const n = rot.crops.length, N = 12 * n;
  const slots = Array(N).fill(null);
  const span = rot.crops.map((id, i) => {
    const c = CROPS[id];
    return { sow: 12 * (i - (c.winter ? 1 : 0)) + c.sow - 1, harv: 12 * i + c.harvest - 1 };
  });
  span.forEach((s, i) => {
    const crop = CROPS[rot.crops[i]], L = s.harv - s.sow + 1, [a, b, c] = crop.kc;
    // FAO-56 crop coefficient curve; the crop's stage lengths are scaled to its calendar span.
    const st = crop.stages, tot = sum(st), f1 = st[0] / tot, f2 = (st[0] + st[1]) / tot, f3 = (tot - st[3]) / tot;
    for (let k = 0; k < L; k++) {
      const f = (k + 0.5) / L;
      const kc = f < f1 ? a : f < f2 ? a + ((b - a) * (f - f1)) / (f2 - f1) : f < f3 ? b : b + ((c - b) * (f - f3)) / (1 - f3);
      slots[mod(s.sow + k, N)] = { i, kc };
    }
  });
  let feasible = true;
  const tight = [], clash = [];
  const gaps = span.map((s, i) => {
    const j = (i + 1) % n;
    const len = span[j].sow + (j <= i ? N : 0) - s.harv - 1;
    if (len < -1) { feasible = false; clash.push(i); } // next crop must be sown before this one is harvested
    if (len === -1) tight.push(i);              // harvest and sowing in the same month
    const covered = rot.cover && len >= COVER_MIN_GAP;
    const months = [];
    for (let k = 0; k < len; k++) {
      const abs = mod(s.harv + 1 + k, N), cover = covered && k > 0; // first month: residue and seedbed
      if (cover) slots[abs] = { cover: true, kc: COVER.kc };
      months.push({ abs, cover });
    }
    return { after: i, len: Math.max(0, len), covered, months };
  });
  const len = rot.crops.map((_, i) => slots.filter((s) => s && s.i === i).length);
  return { n, crops: rot.crops, slots, gaps, tight, clash, feasible, len };
}

// Daily root-zone water balance (FAO-56 chapter 8). dr = depletion below field capacity, mm.
// The crop draws kc x reference ET until depletion passes p x TAW, then Ks falls linearly to 0 (eq. 84).
// Heavy-rain runoff uses the SCS curve number. Every phase of the rotation is run against the whole
// record, so each crop meets each year. Returns, per crop in the rotation, one record per season:
// what happened during its flowering months.
// shortcut: TAW switches to each new crop's rooting depth and p is not adjusted for daily ETc;
// upgrade to a layered soil profile if rooting-depth differences start driving the ranking.
export function backtest(lay, mo, soil) {
  const awc = SOIL_AWC[soil], S = 25400 / CURVE_NUMBER[soil] - 254, ia = 0.2 * S;
  const N = lay.slots.length, T = mo.m.length;
  const seasons = lay.len.map(() => []);
  const close = (run) => {
    if (!run || run.k !== lay.len[run.i] || !run.days) return; // skip seasons cut by the record edge
    seasons[run.i].push({ year: run.year, days: run.days, stress: run.stress, ks: run.ksSum / run.days,
      rain: run.rain, hot: run.hot, tmax: run.tmaxSum / run.days, frost: run.frost });
    Object.assign(seasons[run.i].at(-1), { etc: run.etc || 0, eta: run.eta || 0 }); // whole-season crop water use, mm (FAO-33 yield response)
  };
  for (let o = 0; o < lay.n; o++) {
    let taw = awc, p = 0.5, dr = taw / 2, run = null, crop = null;
    for (let t = 0; t < T; t++) {
      const slot = lay.slots[(t + 12 * o) % N], i = slot && slot.i != null ? slot.i : null, m = mo.m[t];
      if (!run || run.i !== i) {
        close(run);
        run = i == null ? null : { i, k: 0, year: 0, days: 0, stress: 0, ksSum: 0, rain: 0, hot: 0, tmaxSum: 0, frost: 0 };
        if (run) { crop = CROPS[lay.crops[i]]; taw = awc * crop.root; p = crop.p; dr = Math.min(dr, taw); }
      }
      const kc = slot ? slot.kc : KC_BARE, flowering = run && crop.flower.includes((t % 12) + 1);
      for (let j = 0; j < m.days; j++) {
        const rain = m.rainD[j], runoff = rain > ia ? (rain - ia) ** 2 / (rain + 0.8 * S) : 0;
        const ks = dr <= p * taw ? 1 : (taw - dr) / ((1 - p) * taw);
        dr = Math.min(taw, Math.max(0, dr - (rain - runoff) + ks * kc * m.et0D[j]));
        if (run) { run.etc = (run.etc || 0) + kc * m.et0D[j]; run.eta = (run.eta || 0) + ks * kc * m.et0D[j]; } // ETc and ETa, whole season
        if (!flowering) continue;
        run.days++; run.ksSum += ks; run.rain += rain; run.tmaxSum += m.tmax[j];
        if (ks < STRESS_KS) run.stress++;
        if (m.tmax[j] > crop.heatTmax) run.hot++;
      }
      if (!run) continue;
      if (run.k === 1 && crop.frostSensitive) run.frost = m.frostDays; // frost in the month after sowing
      if (flowering) run.year = mo.years[Math.floor(t / 12)];
      run.k++;
    }
    close(run);
  }
  return seasons.map((list) => ({
    list, n: list.length,
    dry: list.filter((s) => s.stress >= STRESS_SHARE * s.days).length,
    hot: list.filter((s) => s.hot >= HEAT_DAYS).length,
    frost: list.filter((s) => s.frost > 0).length,
  }));
}

// ctx = { mo, clim (from summarize), soil, slope }
export function evaluate(rot, ctx) {
  const lay = layout(rot);
  if (!lay.feasible) return null;
  const n = lay.n, crops = rot.crops.map((id) => CROPS[id]);
  const bt = backtest(lay, ctx.mo, ctx.soil), seasons = sum(bt.map((c) => c.n));
  const troubleFree = (k) => (seasons ? 1 - sum(bt.map((c) => c[k])) / seasons : 1);
  const gapMonths = lay.gaps.flatMap((g) => g.months);
  const bare = gapMonths.filter((m) => !m.cover).length;
  const coveredGaps = lay.gaps.filter((g) => g.covered).length;
  const legumeYears = crops.filter((c) => c.legume).length;

  // Not scored: crops that return sooner than the usual guidance are reported as risks instead.
  const counts = {};
  rot.crops.forEach((id) => (counts[id] = (counts[id] || 0) + 1));
  const violations = Object.keys(counts)
    .map((id) => ({ id, interval: n / counts[id], min: CROPS[id].minReturn }))
    .filter((v) => v.interval < v.min);
  const families = new Set(crops.map((c) => c.family)).size;

  const r10 = ctx.clim.map((c) => c.r10), r10Year = sum(r10);
  const bareShare = r10Year ? sum(gapMonths.filter((m) => !m.cover).map((m) => r10[m.abs % 12])) / (n * r10Year) : 0;

  return {
    rot, lay,
    scores: {
      water: troubleFree('dry'), heat: troubleFree('hot'), frost: troubleFree('frost'),
      erosion: 1 - clamp(bareShare * SLOPE_F[ctx.slope]),
      nitrogen: legumeYears / n,
    },
    facts: { n, bare, coveredGaps, legumeYears, families, violations, bareShare, seasons, crops: bt },
  };
}

export const total = (scores, weights) => {
  const w = sum(METRICS.map((k) => weights[k]));
  return w ? sum(METRICS.map((k) => scores[k] * weights[k])) / w : 0;
};

// Returns the current rotation plus up to three alternatives, one per size of change:
// keep the crops and add cover crops / swap one crop / add a year.
// Alternatives that bring a crop back sooner than the current rotation does are left out.
export function suggest(current, allowed, ctx, weights) {
  const cur = evaluate(current, ctx);
  const maxViolations = cur ? cur.facts.violations.length : Infinity;
  const rank = (cands) => cands
    .map((c) => ({ ...c, ev: evaluate(c.rot, ctx) }))
    .filter((c) => c.ev && c.ev.facts.violations.length <= maxViolations)
    .map((c) => ({ ...c, total: total(c.ev.scores, weights) }))
    .sort((a, b) => b.total - a.total);
  const { crops, cover } = current, n = crops.length;
  const swaps = rank(crops.flatMap((old, i) => allowed.filter((id) => id !== old).map((id) => (
    { kind: 'swap', at: i, old, id, rot: { crops: crops.map((c, k) => (k === i ? id : c)), cover } }))));
  const inserts = n >= 5 ? [] : rank(crops.flatMap((_, i) => allowed.map((id) => (
    { kind: 'insert', at: i + 1, id, rot: { crops: [...crops.slice(0, i + 1), id, ...crops.slice(i + 1)], cover } }))));
  const covers = cover || !cur ? [] : rank([{ kind: 'cover', rot: { crops, cover: true } }])
    .filter((c) => c.ev.facts.coveredGaps > 0);
  const alts = [covers[0], swaps[0], inserts[0]].filter(Boolean);
  const second = swaps[0] && swaps.find((s) => s.id !== swaps[0].id);
  if (alts.length < 3 && second) alts.push(second);
  return { cur: cur && { ev: cur, total: total(cur.scores, weights) }, alts };
}
