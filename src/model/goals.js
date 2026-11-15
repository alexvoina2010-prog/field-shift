// Farmer goals: each one is a number already computed for every option (money from money.js,
// counts from the backtest). Goals only re-order options; they never change a number.
import { CROPS } from './crops.js';

export const GOALS = {
  profit: 'More profit',
  steady: 'Steadier income in bad years',
  work: 'Less work and machinery',
  soil: 'Healthier soil',
  water: 'Use less water',
};
const WORKLOAD = { low: 1, medium: 2, high: 3 };
const NEW_MACHINE = 0.5; // one machine the farm does not use now counts as half a workload step (assumption)

/** Machinery an option needs that the current rotation does not use. */
export const newMachinery = (rot, current) => {
  const have = new Set(current.crops.flatMap((id) => CROPS[id].machinery));
  return [...new Set(rot.crops.flatMap((id) => CROPS[id].machinery))].filter((m) => !have.has(m));
};

/**
 * Crop seasons in trouble at flowering, over every crop of the rotation: heat-hit, short of water, or
 * either. Same definitions as the backtest counts (HEAT_DAYS, STRESS_SHARE in rotation.js).
 * @returns {{any:number, heat:number, water:number, total:number}} counts of crop seasons
 */
export function troubleCount(ev, heatDays, stressShare) {
  const all = ev.facts.crops.flatMap((c) => c.list);
  const hot = (s) => s.hot >= heatDays, dry = (s) => s.stress >= stressShare * s.days;
  return { any: all.filter((s) => hot(s) || dry(s)).length, heat: all.filter(hot).length, water: all.filter(dry).length, total: all.length };
}

export const workloadOf = (rot) => rot.crops.reduce((s, id) => s + WORKLOAD[CROPS[id].workload], 0) / rot.crops.length;

/**
 * Raw goal values for one option; higher is better for every goal.
 * @param {{rot:object, ev:object, money:{normal:number,bad:number,lossYears:number,n:number}}} o
 * @param {object} current  the current rotation { crops, cover }
 */
export function goalValues(o, current) {
  const f = o.ev.facts, s = o.ev.scores;
  return {
    profit: o.money.normal,
    steady: o.money.bad - (o.money.n ? o.money.lossYears / o.money.n : 0) * Math.abs(o.money.bad || 1),
    work: -(workloadOf(o.rot) + NEW_MACHINE * newMachinery(o.rot, current).length),
    soil: (s.nitrogen + s.erosion + (1 - f.bare / (12 * f.n))) / 3,
    water: s.water,
  };
}

/**
 * Sorts options by the picked goals (all five when none is picked): each goal is scaled 0..1
 * across the options shown, then summed. Returns new objects with .fit (0..1) and .values.
 */
export function sortByGoals(options, current, picks) {
  const keys = picks.length ? picks : Object.keys(GOALS);
  const rows = options.map((o) => ({ ...o, values: goalValues(o, current) }));
  const span = Object.fromEntries(keys.map((k) => {
    const v = rows.map((r) => r.values[k]);
    return [k, [Math.min(...v), Math.max(...v)]];
  }));
  const scaled = (r, k) => { const [lo, hi] = span[k]; return hi - lo > 1e-9 ? (r.values[k] - lo) / (hi - lo) : 0.5; };
  return rows
    .map((r) => ({ ...r, fit: keys.reduce((s, k) => s + scaled(r, k), 0) / keys.length }))
    .sort((a, b) => b.fit - a.fit || b.total - a.total);
}
