// Money on replayed weather: FAO-33 yield response, then the farmer's prices and costs.
// Reads backtest() seasons (etc, eta) and never changes them. Every value here is an estimate built
// from the farmer's own numbers (or the labelled example values), not a price or yield forecast.
import { CROPS } from './crops.js';

export const BAD_YEAR_Q = 0.2;   // "bad year": the worst one-in-five, 20th percentile of replayed years
export const NORMAL_YEAR_Q = 0.5; // "normal year": the median
export const COST_KEYS = ['seed', 'fertiliser', 'protection', 'machinery', 'labour'];

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Relative yield of one season, FAO-33: 1 - Ya/Ym = Ky (1 - ETa/ETc).
 * Water only: heat at flowering is counted separately and not folded into yield.
 * @param {{etc:number, eta:number}} season  @param {number} ky  @param {boolean} fullyIrrigated
 * @returns {number} Ya/Ym, 0..1
 */
export function yieldRatio(season, ky, fullyIrrigated = false) {
  if (fullyIrrigated || !(season.etc > 0)) return 1; // shortcut: irrigation water is not modelled, so a fully irrigated crop gets no water loss
  return clamp01(1 - ky * (1 - season.eta / season.etc));
}

/** Example economics for a crop from data/crops.json, as a plain object the farmer can override. */
export const exampleEcon = (id) => ({ ym: CROPS[id].ym, price: CROPS[id].price, costs: { ...CROPS[id].costs } });

export const costTotal = (econ) => COST_KEYS.reduce((s, k) => s + (+econ.costs[k] || 0), 0);

/** Profit per hectare, lei: yield x price - costs. */
export const profitPerHa = (ratio, econ) => econ.ym * ratio * econ.price - costTotal(econ);

/**
 * Whole-farm profit for each replayed calendar year.
 * Block b grows rot.crops[(b + y - startYear) mod n] in harvest year y, so every crop is grown every
 * year (as on real farms) and block A grows the first crop in startYear.
 * Years where any crop's season is missing (cut by the record edge) are left out.
 * @param {object} ev  evaluate() result  @param {Record<string, object>} econs  per crop id
 * @param {number[]} blockHa  hectares per block, length n  @param {boolean} fullyIrrigated
 * @returns {{year:number, profit:number}[]}
 */
export function farmYears(ev, econs, blockHa, fullyIrrigated = false, startYear = 0) {
  const crops = ev.rot.crops, n = crops.length;
  const byYear = ev.facts.crops.map((c) => new Map(c.list.map((s) => [s.year, s])));
  const years = [...byYear[0].keys()].filter((y) => byYear.every((m) => m.has(y))).sort((a, b) => a - b);
  return years.map((y) => ({
    year: y,
    profit: blockHa.reduce((sum, ha, b) => {
      const i = (((b + y - startYear) % n) + n) % n, id = crops[i];
      return sum + ha * profitPerHa(yieldRatio(byYear[i].get(y), CROPS[id].ky, fullyIrrigated), econs[id]);
    }, 0),
  }));
}

/** Linear-interpolation percentile (same as spreadsheet PERCENTILE.INC). q in 0..1. */
export function percentile(xs, q) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b), pos = (s.length - 1) * q, lo = Math.floor(pos);
  return lo + 1 < s.length ? s[lo] + (s[lo + 1] - s[lo]) * (pos - lo) : s[lo];
}

/** @returns {{normal:number, bad:number, lossYears:number, n:number, worst:{year:number, profit:number}}} */
export function moneySummary(years) {
  const p = years.map((y) => y.profit);
  return {
    normal: percentile(p, NORMAL_YEAR_Q), bad: percentile(p, BAD_YEAR_Q),
    lossYears: p.filter((v) => v < 0).length, n: p.length,
    worst: years.reduce((w, y) => (!w || y.profit < w.profit ? y : w), null),
  };
}

/** Equal blocks by default: a rotation of n years on A hectares is n blocks of A/n. */
export const equalBlocks = (n, area) => Array.from({ length: n }, () => area / n);
