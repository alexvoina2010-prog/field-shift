// AI disclosure: written with Claude Code (Anthropic AI coding assistant) under the author's direction; see AI-USAGE.md.
// Saves the demo field's NASA POWER record to data/demo_field.json so the demo works offline.
// Run: node scripts/fetch_demo.mjs
import { writeFile } from 'node:fs/promises';
import { powerUrl } from '../src/model/climate.js';

const LAT = 44.56, LON = 27.36; // Baragan Plain, Romania. Keep in sync with DEMO in js/app.js.
const url = powerUrl(LAT, LON);
const res = await fetch(url);
if (!res.ok) throw new Error(`NASA POWER answered with error ${res.status}`);
const json = await res.json(), p = json.properties.parameter;
const dates = Object.keys(p.T2M_MAX).sort();
const demo = {
  lat: LAT, lon: LON, elev: json.geometry.coordinates[2],
  start: dates[0], fetched: new Date().toISOString().slice(0, 10), source: url,
  parameter: Object.fromEntries(Object.entries(p).map(([name, byDate]) => [name, dates.map((d) => byDate[d])])),
};
const out = new URL('../data/demo_field.json', import.meta.url);
await writeFile(out, JSON.stringify(demo));
console.log(`${dates.length} days from ${dates[0]} to ${dates.at(-1)}, ${Object.keys(p).length} parameters`);
