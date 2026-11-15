// Season-by-season plan for one rotation on a farm split into blocks. Pure: reads layout() and the
// crop calendar, never the weather. Months are model months (index 6 = mid-summer in both hemispheres).
import { CROPS } from './crops.js';
import { layout } from './rotation.js';

export const SEASONS = [ // model months, 1-12; autumn and winter start in the year before the harvest
  { key: 'autumn', name: 'Autumn', months: [9, 10, 11], before: [true, true, true] },
  { key: 'winter', name: 'Winter', months: [12, 1, 2], before: [true, false, false] },
  { key: 'spring', name: 'Spring', months: [3, 4, 5], before: [false, false, false] },
  { key: 'summer', name: 'Summer', months: [6, 7, 8], before: [false, false, false] },
];
export const BLOCK_IDS = 'ABCDEFGH';
const mod = (a, n) => ((a % n) + n) % n;

/** Crop index of block b in harvest year y: block A grows the first crop in startYear. */
export const cropIndex = (b, y, startYear, n) => mod(b + y - startYear, n);

// What happens on one block in one month: sow / harvest / flower / grow / cover / bare.
function monthEvents(lay, rot, b, calYear, month, startYear) {
  const n = rot.crops.length, N = 12 * n, k = cropIndex(b, calYear, startYear, n);
  const at = (s) => lay.slots[mod(s, N)], s = 12 * k + month - 1, here = at(s);
  if (!here) return [{ type: 'bare' }];
  if (here.cover) return at(s - 1)?.cover ? [{ type: 'cover' }] : [{ type: 'sow-cover', month }];
  const id = rot.crops[here.i], c = CROPS[id], out = [];
  const first = at(s - 1)?.i !== here.i, last = at(s + 1)?.i !== here.i;
  if (first) out.push({ type: 'sow', id, month });
  if (last) out.push({ type: 'harvest', id, month });
  if (!first && !last) out.push({ type: c.flower.includes(month) ? 'flower' : 'grow', id, month });
  return out;
}

/** Collapses three months into the few events a farmer acts on, in order. */
function seasonEvents(months) {
  const acts = months.flat().filter((e) => ['sow', 'harvest', 'sow-cover', 'flower'].includes(e.type));
  const seen = new Set(), out = [];
  for (const e of acts) { const key = `${e.type}:${e.id}`; if (!seen.has(key)) { seen.add(key); out.push(e); } }
  if (out.length) return out;
  const e = months.flat().find((x) => x.type === 'grow') || months.flat().find((x) => x.type === 'cover') || { type: 'bare' };
  return [e];
}

/**
 * The full rotation, season by season, for every block.
 * @param {{crops:string[], cover:boolean}} rot
 * @param {number[]} blockHa hectares per block (length = rotation years)
 * @param {number} startYear harvest year in which block A grows the first crop
 * @returns {{blocks:{id:string, ha:number}[], rows:{year:number, season:object, label:string, cells:object[][]}[]}}
 */
export function timeline(rot, blockHa, startYear) {
  const lay = layout(rot), n = rot.crops.length;
  const blocks = blockHa.map((ha, b) => ({ id: BLOCK_IDS[b], ha }));
  const rows = [];
  for (let y = startYear; y < startYear + n; y++) {
    for (const season of SEASONS) {
      const cells = blocks.map((_, b) => seasonEvents(season.months.map((m, j) =>
        monthEvents(lay, rot, b, season.before[j] ? y - 1 : y, m, startYear))));
      const label = season.key === 'autumn' ? `${season.name} ${y - 1}` : season.key === 'winter' ? `${season.name} ${y - 1}–${String(y).slice(2)}` : `${season.name} ${y}`;
      rows.push({ year: y, season, label, cells });
    }
  }
  return { blocks, rows };
}

/** The season a date falls in, as an index into timeline rows of the first year (model month). */
export function seasonOf(month0) {
  const m = month0 + 1;
  return SEASONS.findIndex((s) => s.months.includes(m));
}

/**
 * Moves `step` hectares into block b (or out of it when step < 0), taken from the largest other
 * block (or given to the smallest). The farm total never changes and no block goes below zero.
 * @returns {number[]} new sizes
 */
export function moveHectares(sizes, b, step) {
  const others = sizes.map((v, i) => ({ v, i })).filter((x) => x.i !== b);
  if (!others.length) return sizes;
  const pick = step > 0 ? others.reduce((m, x) => (x.v > m.v ? x : m)) : others.reduce((m, x) => (x.v < m.v ? x : m));
  const amount = step > 0 ? Math.min(step, pick.v) : -Math.min(-step, sizes[b]);
  return sizes.map((v, i) => (i === b ? v + amount : i === pick.i ? v - amount : v));
}

/**
 * Marks what differs from the current rotation: events of a crop the farm does not grow now, and
 * cover-crop sowings when the farm sows none now.
 */
export function isChange(e, current) {
  if (e.type === 'sow-cover') return !current.cover;
  return Boolean(e.id) && !current.crops.includes(e.id);
}
