// AI disclosure: written with Claude Code (Anthropic AI coding assistant) under the author's direction; see AI-USAGE.md.
// Independent check of the soil-water bucket: compares its monthly root-zone water (demo field,
// wheat -> maize -> sunflower, loam, averaged over the rotation's blocks) with NASA POWER GWETROOT
// (MERRA-2 land-model root-zone wetness, which the app downloads but does not use for scores).
// Run: node scripts/check_gwetroot.mjs
import { readFile } from 'node:fs/promises';
import { expandDemo, toMonthly } from '../src/model/climate.js';
import { layout, backtest } from '../src/model/rotation.js';

const demo = JSON.parse(await readFile(new URL('../data/demo_field.json', import.meta.url), 'utf8'));
const mo = toMonthly(expandDemo(demo), demo.lat, undefined, demo.elev);
const lay = layout({ crops: ['wheat', 'maize', 'sunflower'], cover: false });
const trace = [];
backtest(lay, mo, 'loam', trace);
const T = mo.m.length;
const bucket = mo.m.map((_, t) => Array.from({ length: lay.n }, (_, o) => trace[o * T + t]).reduce((s, v) => s + v, 0) / lay.n);
const wet = mo.m.map((m) => m.wet);
if (wet.some((w) => w == null)) throw new Error('GWETROOT missing for some months');

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const pearson = (a, b) => {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
};
// Anomaly = value minus that calendar month's 26-year mean, so the shared seasonal cycle cannot inflate r.
const anomaly = (a) => {
  const clim = Array.from({ length: 12 }, (_, k) => mean(a.filter((_, t) => t % 12 === k)));
  return a.map((v, t) => v - clim[t % 12]);
};
const pick = (a, months) => a.filter((_, t) => months.includes(t % 12));
const SUMMER = [5, 6, 7]; // June-August (index 6 is always mid-summer, see toMonthly)
const ba = anomaly(bucket), wa = anomaly(wet);

const r = {
  months: T,
  monthly: pearson(bucket, wet),
  anomalies: pearson(ba, wa),
  summerAnomalies: pearson(pick(ba, SUMMER), pick(wa, SUMMER)),
};
// Driest summers by each measure: do they name the same years?
const summerMean = (a) => mo.years.map((y, i) => ({ y, v: mean(SUMMER.map((k) => a[i * 12 + k])) }));
const driest = (a) => summerMean(a).sort((x, z) => x.v - z.v).slice(0, 5).map((d) => d.y);
console.log(JSON.stringify({ ...r, driestSummersBucket: driest(bucket), driestSummersGWETROOT: driest(wet) }, null, 1));
