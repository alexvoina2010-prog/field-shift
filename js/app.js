// AI disclosure: written with Claude Code (Anthropic AI coding assistant) under the author's direction; see AI-USAGE.md.
// Page wiring: wizard steps, map, NASA POWER fetch, and rendering. All agronomy logic lives in the other modules.
/* global L */
import { CROPS } from '../src/model/crops.js';
import { powerUrl, expandDemo, toMonthly, summarize, START_YEAR, END_YEAR, HOT_DAY } from '../src/model/climate.js';
import { layout, suggest, METRICS } from '../src/model/rotation.js';
import { explain, title, LABELS, monthName, cropLabel } from './explain.js';
import { ribbon, cellText } from './ribbon.js';
import { mannKendall } from '../src/model/trend.js';
import { farmYears, moneySummary, equalBlocks } from '../src/model/money.js';
import { GOALS, sortByGoals } from '../src/model/goals.js';
import { costsPanel, applyInput, econsFor, sanitizeEcon, sumText, money, signed, moneyBlock } from './money-ui.js';
import { loadFarm, saveFarm, clearFarm } from './store.js';
import { moreInputs, applyMore, sanitizeMore, meters, farmNotes, AREAS } from './more-ui.js';
import { areaConfidence } from '../src/model/confidence.js';
import { decisionTable, change } from './table.js';
import { planHtml, planText, farmStrips } from './plan-ui.js';
import { drawTool } from './draw.js';
import { moveHectares } from '../src/model/plan.js';
import { cropFlags, FLAG_RULES } from '../src/model/flags.js';
import { HAZARDS } from './ribbon.js';
import { troubleCount } from '../src/model/goals.js';
import { HEAT_DAYS, STRESS_SHARE } from '../src/model/rotation.js';
import { reason, extraWork } from './table.js';
import { cropIcon, SOIL, TERRAIN, IRRIGATION as IRR_ICONS, GOAL_ICONS, SCENARIO_ICONS } from './icons.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const picked = (name) => document.querySelector(`input[name=${name}]:checked`).value;
// value may come from a shared link: matched against the radios, never put into a selector
const setPicked = (name, value) => { const el = [...document.querySelectorAll(`input[name=${name}]`)].find((r) => r.value === value); if (el) el.checked = true; };
const irrigated = () => picked('irrigation') !== 'none'; // "Sometimes" and "Fully" both count as irrigated
const coverOn = () => picked('cover') === 'yes'; // "Sometimes" replays as bare gaps, so the cover option still shows what every-year cover changes
const DEMO_CROPS = ['wheat', 'maize', 'sunflower'];
const state = { crops: DEMO_CROPS, power: null, base: null, loading: null, result: null, econ: {}, goals: [], costIds: '', blockSizes: {}, outline: null,
  more: { machines: [], pests: [], sow: {}, soil: {} } };
const MAX_YEARS = 5;
const DEMO_AREA = 120; // ha
// The coming harvest year: from September on, autumn sowing is for next year's harvest. Block A grows
// the first crop of the rotation in this year; money and the plan both use it.
const today = new Date();
const START_YEAR_PLAN = today.getMonth() >= 8 ? today.getFullYear() + 1 : today.getFullYear();
const areaOk = () => { const v = parseFloat($('area').value); return v >= 1 && v <= 100000; };
const area = () => (areaOk() ? parseFloat($('area').value) : DEMO_AREA); // the fallback is announced by #area-err

// ---------- steps ----------
const STEPS = ['start', 'field', 'crops', 'priorities', 'options', 'plan', 'weather', 'agronomist', 'how'];
const NEEDS_DATA = ['options', 'plan', 'weather', 'agronomist'];
const stepId = () => { const id = location.hash.slice(1).split('?')[0]; return STEPS.includes(id) ? id : 'start'; };

async function show(focus = true) {
  const id = stepId();
  if (NEEDS_DATA.includes(id)) {
    await state.loading;
    if (!state.power) { location.replace('#field'); return; } // the error is shown there
    if (stepId() !== id) return;
  }
  // The plan opens over the options, which stay underneath on wide screens.
  for (const s of document.querySelectorAll('[data-step]')) s.hidden = !(s.dataset.step === id || (id === 'plan' && s.dataset.step === 'options'));
  document.body.classList.toggle('plan-open', id === 'plan');
  if (id === 'field') map.invalidateSize();
  if (id === 'weather') renderClimate(); // the chart is sized to its container, so draw it once visible
  if (id === 'agronomist') renderReport();
  if (id === 'plan') { renderPlan(); document.querySelector('[data-step=plan]').scrollTop = 0; } else window.scrollTo(0, 0);
  if (focus) document.querySelector(`[data-step=${id}] [tabindex="-1"]`)?.focus({ preventScroll: true });
}

// ---------- map ----------
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const LAYERS = {
  ndvi: { id: 'MODIS_Terra_L3_NDVI_Monthly', tms: 'GoogleMapsCompatible_Level7', zoom: 7,
    note: 'NASA MODIS vegetation greenness (NDVI) for the chosen month. Greener means denser, healthier plants; pale or brown means bare or sparse ground. Try a month just after harvest to see bare fields.' },
  smap: { id: 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture', tms: 'GoogleMapsCompatible_Level6', zoom: 6,
    note: 'NASA SMAP root-zone soil moisture, latest available day. Squares are about 9 km wide, so this shows the region, not one field.' },
  imerg: { id: 'IMERG_Precipitation_Rate', tms: 'GoogleMapsCompatible_Level6', zoom: 6,
    note: 'NASA GPM IMERG rainfall rate, latest available day. Empty where it is not raining.' },
};
// The map sits in a scrolling step: the wheel must scroll the page, not zoom the map.
const map = L.map('map', { scrollWheelZoom: false }).setView([+$('lat').value, +$('lon').value], 7);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 15, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
const marker = L.circleMarker(map.getCenter(), { radius: 9, weight: 3, fillOpacity: 1, className: 'field-marker' }).addTo(map);
let overlay = null;
const draw = drawTool(map, {
  onArea: (ha) => {
    if (!(ha > 0)) return;
    $('area').value = Math.round(ha * 10) / 10;
    $('draw-note').textContent = `Your field: ${Math.round(ha * 10) / 10} ha, filled in as your farm size below.`;
    clearTimeout(drawTimer);
    drawTimer = setTimeout(() => { state.outline = draw.points; renderOptions(); }, 400); // re-run the money once dragging pauses
  },
  onDone: (c, pts) => { state.outline = pts; setField(c.lat, c.lng); },
});
let drawTimer = null;

function setOverlay() {
  const key = picked('layer'), def = LAYERS[key];
  if (overlay) { map.removeLayer(overlay); overlay = null; }
  $('ndvi-month-wrap').hidden = key !== 'ndvi';
  $('layer-note').textContent = def ? def.note : 'Tap the map to place your field.';
  if (!def) return;
  const month = $('ndvi-month').value;
  const time = key === 'ndvi' && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : 'default';
  overlay = L.tileLayer(`${GIBS}/${def.id}/default/${time}/${def.tms}/{z}/{y}/{x}.png`,
    { maxNativeZoom: def.zoom, opacity: 0.7, attribution: 'NASA GIBS' }).addTo(map);
}

function setField(lat, lon, zoom) {
  $('lat').value = (+lat).toFixed(2); $('lon').value = (+lon).toFixed(2);
  if (zoom) map.setView([+lat, +lon], zoom);
  return loadField();
}

// Place search: OpenStreetMap Nominatim, one request after a 1 s pause in typing (usage policy: max 1 request/s).
let searchTimer = null, searchSeq = 0;
async function searchPlace() {
  const q = $('place').value.trim(), box = $('place-results'), seq = ++searchSeq;
  if (q.length < 3) { box.innerHTML = ''; return; }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`error ${res.status}`);
    const hits = await res.json();
    if (seq !== searchSeq) return; // a newer search is on its way
    box.innerHTML = hits.length
      ? hits.slice(0, 5).map((h) => `<li><button type="button" data-lat="${Number(h.lat)}" data-lon="${Number(h.lon)}">${esc(h.display_name)}</button></li>`).join('')
      : '<li>No place found. Try another name, or tap the map.</li>';
  } catch {
    if (seq === searchSeq) box.innerHTML = '<li>Place search is unavailable right now. Tap the map instead.</li>';
  }
}

// ---------- data ----------
let request = null;
const DEMO = { lat: 44.56, lon: 27.36 }; // saved by scripts/fetch_demo.mjs, so the demo needs no live API

// Returns { p, elev, saved }: POWER daily parameters keyed by date, elevation in m, and the date
// the record was saved (demo field only).
async function fetchPower(lat, lon, signal) {
  if (lat === DEMO.lat && lon === DEMO.lon) {
    const res = await fetch('data/demo_field.json', { signal });
    if (res.ok) { const demo = await res.json(); return { p: expandDemo(demo), elev: demo.elev, saved: demo.fetched }; }
  }
  const res = await fetch(powerUrl(lat, lon), { signal });
  if (!res.ok) throw new Error(`NASA POWER answered with error ${res.status}`);
  const json = await res.json(), p = json?.properties?.parameter;
  if (!p?.T2M_MAX || !p.T2M_MIN || !p.PRECTOTCORR) throw new Error('NASA POWER returned no data for this point');
  const z = json.geometry?.coordinates?.[2];
  return { p, elev: Number.isFinite(z) && z > -500 ? z : 0 };
}

function loadField() {
  state.loading = (async () => {
    const lat = parseFloat($('lat').value), lon = parseFloat($('lon').value), status = $('status');
    status.className = '';
    if (!(lat >= -60 && lat <= 70 && lon >= -180 && lon <= 180)) {
      state.power = null;
      status.className = 'error';
      status.textContent = 'Latitude must be between -60 and 70, longitude between -180 and 180.';
      return;
    }
    marker.setLatLng([lat, lon]);
    map.panTo([lat, lon]);
    request?.abort();
    const mine = request = new AbortController();
    status.textContent = `Loading ${END_YEAR - START_YEAR + 1} years of NASA data…`;
    try {
      const { p, elev, saved } = await fetchPower(lat, lon, mine.signal);
      const base = toMonthly(p, lat, undefined, elev);
      if (base.years.length < 10) throw new Error('fewer than 10 complete years of data here');
      state.power = { p, lat, lon, elev, saved };
      state.base = base;
      status.textContent = '';
      renderClimate();
      renderOptions();
    } catch (e) {
      if (e.name === 'AbortError') return;
      state.power = null; // never show another field's results under these coordinates
      status.className = 'error';
      status.textContent = `Live NASA data is unavailable right now: ${e.message}. Try again, or use the Bărăgan example field, which is saved with the page.`;
      if (NEEDS_DATA.includes(stepId())) location.replace('#field');
    }
  })();
  return state.loading;
}

// ---------- landing ----------
// The demo answer, computed from the saved Bărăgan record with the default inputs. No number is typed in.
async function renderLanding() {
  $('l-eyebrow').textContent = `A farm near Slobozia grows wheat, then maize, then sunflower. Replayed on NASA weather, ${START_YEAR} to ${END_YEAR}.`;
  try {
    const { p, elev } = await fetchPower(DEMO.lat, DEMO.lon);
    const mo = toMonthly(p, DEMO.lat, undefined, elev);
    const ctx = { mo, clim: summarize(mo).clim, soil: 'loam', slope: 'gentle', lat: DEMO.lat, irrigated: false };
    const allowed = Object.keys(CROPS).filter((id) => !CROPS[id].forage);
    const { cur, alts } = suggest({ crops: DEMO_CROPS, cover: false }, allowed, ctx, Object.fromEntries(METRICS.map((k) => [k, 1])));
    const swap = alts.find((a) => a.kind === 'swap');
    if (!swap) return;
    // The fact the swap moves most: heat or water at flowering, on the swapped year only.
    const o = cur.ev.facts.crops[swap.at], x = swap.ev.facts.crops[swap.at], rate = (w, k) => (w.n ? w[k] / w.n : 0);
    const k = rate(o, 'hot') - rate(x, 'hot') >= rate(o, 'dry') - rate(x, 'dry') ? 'hot' : 'dry';
    const summer = (id) => CROPS[id].flower.every((m) => m >= 6 && m <= 8);
    $('l-act').textContent = `Swap ${CROPS[swap.old].name.toLowerCase()} for ${CROPS[swap.id].name.toLowerCase()} in year ${swap.at + 1}.`;
    $('l-what').textContent = k === 'hot' ? 'Heatwave during flowering:' : 'Short of water at flowering:';
    $('l-nums').textContent = `${o[k]} → ${x[k]}`;
    $('l-of').textContent = `of the last ${Math.max(o.n, x.n)} ${summer(swap.old) && summer(swap.id) ? 'summers' : 'seasons'}.`;
    state.landingPick = { kind: swap.kind, at: swap.at, id: swap.id };
    $('ledger').hidden = false;
  } catch { /* the ledger stays hidden; the headline and "Check my field" still work */ }
}

// ---------- climate ----------
const TREND_P = 0.05; // a trend is only called clear below this Mann-Kendall p-value

// One trend box: a plain headline and a "how sure" pill; the test and the numbers sit under "How we know".
function fact(label, series, unit, digits) {
  const { p, slope } = mannKendall(series), per = slope * 10, clear = p < TREND_P, weak = !clear && p < 2 * TREND_P;
  const size = `${per > 0 ? '+' : '−'}${Math.abs(per).toFixed(digits)}${unit} per decade`;
  const avg = (series.reduce((s, v) => s + v, 0) / series.length).toFixed(digits);
  const pText = p < 0.001 ? 'p below 0.001' : `p = ${p.toFixed(p < 0.01 ? 3 : 2)}`;
  const dir = per > 0 ? ['▲ Rising', 'Possibly rising'] : ['▼ Falling', 'Possibly falling'];
  return `<div class="tile"><div class="k">${esc(label)}</div>
    <div class="v">${clear ? dir[0] : weak ? dir[1] : 'No clear trend'}</div>
    ${clear || weak ? `<span class="pill ${clear ? 'strong' : 'weak'}">How sure: ${clear ? 'strong' : 'weak'}</span>` : ''}
    <details><summary>How we know</summary><p>${clear ? 'A clear trend' : weak ? 'Weak evidence, not a confirmed trend' : 'Year-to-year swings are larger than the drift'}:
      ${size} (Sen's slope), Mann-Kendall test, ${pText}. Average ${avg}${unit} a year.</p></details></div>`;
}

function renderRibbon() {
  if (!state.base) return;
  const lay = layout({ crops: state.crops, cover: coverOn() });
  $('ribbon').innerHTML = ribbon(state.base, lay, picked('hazard'));
  $('ribbon-story').textContent = ribbonStory(state.base, lay, picked('hazard'));
}

// One plain sentence read off the ribbon: the worst month on average for the chosen indicator, how
// many years it reached the two darkest shades, and which of the farmer's crops flower then.
const STORY = {
  deficit: (m, a) => `${m} is the driest month for crops here: on average a well-watered crop would have needed ${Math.round(a)} mm more water than the rain brought.`,
  heat: (m, a) => `${m} has the most very hot days (${HOT_DAY} °C or more): ${a.toFixed(1)} a year on average.`,
  rain: (m, a) => `${m} brings the most heavy-rain days: ${a.toFixed(1)} a year on average.`,
  frost: (m, a) => `${m} has the most frost days: ${a.toFixed(1)} a year on average.`,
};
function ribbonStory(mo, lay, key) {
  const h = HAZARDS[key], N = mo.years.length;
  const vals = (m) => mo.years.map((_, y) => h.value(mo.m[y * 12 + m]));
  const avg = Array.from({ length: 12 }, (_, m) => vals(m).reduce((s, v) => s + v, 0) / N);
  const top = avg.indexOf(Math.max(...avg));
  if (!(avg[top] > 0)) return `No month in ${mo.years[0]}–${mo.years.at(-1)} had any of this here.`;
  const name = monthName(top, mo.shift), bad = vals(top).filter((v) => v > h.cuts[2]).length;
  const flowering = lay.feasible ? [...new Set(lay.crops)].filter((id) => CROPS[id].flower.includes(top + 1)).map((id) => CROPS[id].name) : [];
  return `${STORY[key](name, avg[top])} It reached the two darkest shades in ${bad} of ${N} years. ${flowering.length
    ? `${flowering.join(' and ')} ${flowering.length > 1 ? 'flower' : 'flowers'} then, so a bad ${name} costs ${flowering.length > 1 ? 'them' : 'it'} the most.`
    : `None of your crops flowers in ${name}.`}`;
}

// W is the drawing width in CSS pixels, so the 14 px labels stay 14 px on a phone.
function chart(clim, shift, W) {
  const H = 280, l = 40, r = 10, t = 12, b = 26, pw = W - l - r, ph = H - t - b;
  const top = Math.max(20, Math.ceil(Math.max(...clim.flatMap((c) => [c.rain, c.et0])) / 40) * 40);
  const x = (i) => l + (pw / 12) * (i + 0.5), y = (v) => t + ph * (1 - v / top), bw = (pw / 12) * 0.56;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${l}" x2="${W - r}" y1="${y(top * f)}" y2="${y(top * f)}" stroke="var(--grid)"/>
    <text x="${l - 6}" y="${y(top * f) + 4}" text-anchor="end">${Math.round(top * f)}</text>`).join('');
  const bars = clim.map((c, i) => {
    const h = t + ph - y(c.rain), rr = Math.min(4, h);
    return `<path class="bar" fill="var(--rain)" d="M${x(i) - bw / 2},${t + ph} v${-(h - rr)} q0,${-rr} ${rr},${-rr} h${bw - 2 * rr} q${rr},0 ${rr},${rr} v${h - rr} z">
      <title>${monthName(i, shift)}: ${Math.round(c.rain)} mm of rain</title></path>`;
  }).join('');
  const line = `<polyline fill="none" stroke="var(--et)" stroke-width="2" stroke-linejoin="round" points="${clim.map((c, i) => `${x(i)},${y(c.et0)}`).join(' ')}"/>`;
  const dots = clim.map((c, i) => `<circle class="dot" cx="${x(i)}" cy="${y(c.et0)}" r="5" fill="var(--et)" stroke="var(--surface)" stroke-width="2">
    <title>${monthName(i, shift)}: crops could use ${Math.round(c.et0)} mm</title></circle>`).join('');
  const months = clim.map((_, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${W < 520 ? monthName(i, shift)[0] : monthName(i, shift)}</text>`).join('');
  return `<ul class="legend"><li><span class="sw" style="background:var(--rain)"></span>Rain, mm per month</li>
    <li><span class="sw" style="background:var(--et);height:3px"></span>Water a well-watered crop could use (reference ET), mm per month</li></ul>
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Monthly rain compared with reference evapotranspiration. The table below has the numbers.">
    ${grid}${bars}${line}${dots}${months}</svg>`;
}

function renderClimate() {
  if (!state.base) return;
  const mo = state.base, s = summarize(mo), y = mo.years, { lat, lon, elev, saved } = state.power;
  const notes = [`NASA POWER grid cell around ${lat.toFixed(2)}°, ${lon.toFixed(2)}° (about 50 km wide, ${Math.round(elev)} m above sea level). ` +
    `Rain averages ${Math.round(s.annualRain)} mm a year; a well-watered crop could use ${Math.round(s.annualEt0)} mm. ` +
    `The three boxes test ${y[0]}–${y.at(-1)} for a trend: what happened, not a forecast.`];
  if (saved) notes.push(`Demo field: NASA POWER record saved on ${saved}, so it loads without a live connection to NASA.`);
  if (Math.abs(lat) < 35 || Math.abs(lat) > 60) notes.push('This point is outside the temperate latitudes (35°–60°) the crop calendar was written for. Sowing and flowering months may not match local practice, so treat the rotation results as illustrative only.');
  $('climate-note').textContent = notes.join(' ');
  $('weather-eyebrow').textContent = `${placeText()} · ${y[0]}–${y.at(-1)}`;
  $('tiles').innerHTML = [
    fact(`Days of ${HOT_DAY} °C or more, per year`, s.series.hotDays, ' days', 1),
    fact(`Summer water shortfall (${monthName(5, mo.shift)}–${monthName(7, mo.shift)} crop demand minus rain)`, s.series.summerGap, ' mm', 0),
    fact('Rain per year', s.series.rain, ' mm', 0),
  ].join('');
  renderRibbon();
  $('chart').innerHTML = chart(s.clim, mo.shift, Math.min(720, $('chart').clientWidth || 720));
  $('chart-table').innerHTML = `<table><thead><tr><th>Month</th><th>Rain, mm</th><th>Reference ET, mm</th><th>Heavy-rain days</th></tr></thead><tbody>${
    s.clim.map((c, i) => `<tr><td>${monthName(i, mo.shift)}</td><td>${Math.round(c.rain)}</td><td>${Math.round(c.et0)}</td><td>${c.r10.toFixed(1)}</td></tr>`).join('')}</tbody></table>`;
}

// ---------- setup controls ----------
const WEIGHT_HINTS = {
  water: 'How often crops had water at flowering',
  heat: 'How often flowering escaped very hot days',
  frost: 'How often young crops escaped frost',
  erosion: 'Little bare soil when heavy rain falls',
  nitrogen: 'Legumes that fix nitrogen from the air',
};
// Step 3: farmer goals (up to two) set the order; the advanced sliders set the model weights.
const UNPICKED = 1, MAX_PICKS = 2;
const IRRIGATION = { none: 'No irrigation', some: 'Sometimes', full: 'Fully irrigated' };

// Climate flags for this field, recomputed only when the field, soil or irrigation changes.
function flagsFor() {
  if (!state.base) return {};
  const key = `${state.power.lat},${state.power.lon},${picked('soil')},${irrigated()}`;
  if (state.flagKey !== key) {
    state.flags = cropFlags({ mo: state.base, clim: summarize(state.base).clim, soil: picked('soil'), slope: picked('slope') }, irrigated());
    state.flagKey = key;
    renderFlags();
  }
  return state.flags;
}

// Flagged crops stay selectable: greyed, with the computed reason.
function renderFlags() {
  const f = state.flags || {};
  for (const label of document.querySelectorAll('#allowed label')) {
    const id = label.querySelector('input').value, flag = f[id];
    label.classList.toggle('flagged', Boolean(flag));
    label.querySelector('.flag')?.remove();
    if (flag) label.insertAdjacentHTML('beforeend', `<span class="flag">Rarely suits your area: ${esc(flag.reason)}</span>`);
  }
  renderRotation();
}

// The rotation as a loop of crop cards: change, reorder (arrows or drag), remove, add.
function renderRotation() {
  const f = state.flags || {}, n = state.crops.length;
  const options = (sel) => Object.entries(CROPS).map(([id, c]) => `<option value="${id}"${id === sel ? ' selected' : ''}>${esc(c.name)}${f[id] ? ' (rarely suits your area)' : ''}</option>`).join('');
  $('rotation').innerHTML = state.crops.map((id, i) => `<li class="crop-card${f[id] ? ' flagged' : ''}" draggable="true" data-i="${i}">
    <span class="year">Year ${i + 1}</span>
    ${cropIcon(id)}
    <label class="visually-hidden" for="crop-${i}">Crop in year ${i + 1}</label>
    <select id="crop-${i}" data-year="${i}">${options(id)}</select>
    ${f[id] ? '<span class="flag-badge">⚠ Rarely suits your area</span>' : ''}
    <span class="card-tools">
      <button type="button" data-move="${i}" data-dir="-1" aria-label="Move year ${i + 1} earlier"${i === 0 ? ' disabled' : ''}>←</button>
      <button type="button" data-move="${i}" data-dir="1" aria-label="Move year ${i + 1} later"${i === n - 1 ? ' disabled' : ''}>→</button>
      <button type="button" data-remove="${i}" aria-label="Remove year ${i + 1}"${n === 1 ? ' disabled' : ''}>✕</button>
    </span></li>`).join('');
  $('add-year').disabled = n >= MAX_YEARS;
  $('add-year').querySelector('small').textContent = n >= MAX_YEARS ? `Up to ${MAX_YEARS} years` : '';
  $('loop-note').textContent = n > 1 ? `After year ${n}, back to year 1` : 'The same crop every year';
  const flagged = state.crops.filter((id) => f[id]);
  $('rotation-flags').textContent = flagged.map((id) => `${CROPS[id].name} rarely suits your area: ${f[id].reason}.`).join(' ');
}

const moveCrop = (from, to) => {
  if (from === to || to < 0 || to >= state.crops.length) return;
  const next = state.crops.filter((_, k) => k !== from);
  state.crops = [...next.slice(0, to), state.crops[from], ...next.slice(to)];
  renderRotation(); renderOptions();
};

// Priority cards: farmer words on top, what each one actually ranks by underneath.
const GOAL_UI = {
  profit: ['Higher profits', 'Most profit in a normal year'],
  steady: ['Stable income', 'Best bad year, fewest years with a loss'],
  work: ['Less work', 'Lighter workload, no machinery you lack'],
  soil: ['Healthier soil', 'Legume years, soil covered, fewer bare months'],
  water: ['Use less water', 'Fewest seasons short of water at flowering'],
};
const ICONS = {
  'soil-sandy': SOIL.sandy, 'soil-loam': SOIL.loam, 'soil-clay': SOIL.clay,
  'terrain-flat': TERRAIN.flat, 'terrain-gentle': TERRAIN.gentle, 'terrain-steep': TERRAIN.steep,
  'irr-none': IRR_ICONS.none, 'irr-some': IRR_ICONS.some, 'irr-full': IRR_ICONS.full,
  'sc-now': SCENARIO_ICONS.now, 'sc-warm': SCENARIO_ICONS.warm, 'sc-dry': SCENARIO_ICONS.dry,
};
const STEP_NAMES = [['field', 'Your field'], ['crops', 'Your crops'], ['priorities', 'Priorities'], ['options', 'Results']];

function renderGoalCount() {
  const n = state.goals.length;
  $('goal-count').textContent = `${n} of ${MAX_PICKS} priorities selected${n === MAX_PICKS ? '. Unselect one to pick another.' : ''}`;
  for (const b of document.querySelectorAll('input[name=goal]')) b.closest('label').classList.toggle('locked', n >= MAX_PICKS && !b.checked);
}

function buildControls() {
  for (const el of document.querySelectorAll('[data-ico]')) el.innerHTML = ICONS[el.dataset.ico] ?? '';
  // Progress: earlier steps are links back (inputs are kept), the current one is marked.
  for (const ol of document.querySelectorAll('.progress')) {
    const at = +ol.dataset.at;
    ol.setAttribute('aria-label', `Step ${at + 1} of 3`);
    ol.innerHTML = STEP_NAMES.slice(0, 3).map(([id, t], i) => i < at
      ? `<li class="done"><a href="#${id}"><b>✓</b>${t}</a></li>`
      : `<li${i === at ? ' aria-current="step"' : ''}><span><b>${i + 1}</b>${t}</span></li>`).join('');
  }
  $('allowed').innerHTML = Object.entries(CROPS).map(([id, c]) => `<label><input type="checkbox" value="${id}" checked> ${esc(c.name)}</label>`).join('');
  $('flag-rules').textContent = `A crop is flagged "rarely suits your area" when, replayed on its own on this field, it had ${Object.values(FLAG_RULES).map((r) => r.text).join('; or ')}. Heat alone is not flagged on a rain-fed field: the heat limits are assumptions. Flagged crops stay selectable.`;
  $('prio').insertAdjacentHTML('beforeend', Object.keys(GOALS).map((k) => `<label><input type="checkbox" name="goal" value="${k}"${state.goals.includes(k) ? ' checked' : ''}>
    <span class="goal-ico">${GOAL_ICONS[k]}</span><span class="goal-t">${esc(GOAL_UI[k][0])}</span><span class="goal-d">${esc(GOAL_UI[k][1])}</span><span class="goal-check" aria-hidden="true">✓</span></label>`).join(''));
  renderGoalCount();
  $('weights').innerHTML = METRICS.map((k) => `<label>${esc(LABELS[k])} <output id="wo-${k}"></output>
    <span class="src">${esc(WEIGHT_HINTS[k])}</span>
    <input type="range" id="w-${k}" min="0" max="5" step="1" value="${UNPICKED}"></label>`).join('');
  const now = new Date(), year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  $('ndvi-month').value = `${year}-06`;
  $('ndvi-month').max = new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString().slice(0, 7);
  renderRotation();
}

// ---------- comparison ----------
const KIND_TAG = { cover: 'Smallest change', swap: 'One crop changes', insert: 'Longer rotation' };
const rotName = (rot) => rot.crops.map((id) => CROPS[id].name).join(' → ') + (rot.cover ? ' with cover crops' : '');
const score = (c) => Math.round(c.total * 100);
const seasonsOk = (c) => `${Math.round(score(c) / 10)} of 10 seasons OK`;

function calendar(ev, shift) {
  const { slots } = ev.lay, N = slots.length;
  const info = (s) => (!s ? { key: 'bare', cls: 'bare', name: 'Bare soil', label: ['', 'Bare'] }
    : s.cover ? { key: 'cover', cls: 'cover', name: 'Cover crop', label: ['Cov', 'Cover'] }
    : { key: `c${s.i}`, cls: CROPS[ev.rot.crops[s.i]].legume ? 'legume' : 'crop', name: CROPS[ev.rot.crops[s.i]].name, label: cropLabel(ev.rot.crops[s.i]) });
  const segs = [];
  slots.forEach((s, m) => {
    const it = info(s), last = segs.at(-1);
    if (last && last.key === it.key) last.len++; else segs.push({ ...it, start: m, len: 1 });
  });
  const span = (g) => `${monthName(g.start % 12, shift)}–${monthName((g.start + g.len - 1) % 12, shift)}`;
  // Room for a label on a 300 px wide card: a full crop name needs about 72 px, three letters 26 px.
  const text = (g) => { const px = (300 * g.len) / N; return px >= 72 ? g.label[1] : px >= 26 ? g.label[0] : ''; };
  const cols = `style="grid-template-columns:repeat(${N},1fr)"`;
  const years = ev.rot.crops.map((_, i) => `<span style="grid-column:span 12">Year ${i + 1}</span>`).join('');
  // One letter per quarter: 36 letters of readable size do not fit a phone.
  const months = `<div class="cal-months" ${cols} aria-hidden="true">${Array.from({ length: N / 3 }, (_, q) => `<span style="grid-column:span 3">${monthName((q * 3) % 12, shift)[0]}</span>`).join('')}</div>`;
  const row = segs.map((g) => `<span class="seg ${g.cls}" style="grid-column:span ${g.len}" title="${esc(g.name)}: ${span(g)}">${text(g)}</span>`).join('');
  const label = segs.map((g) => `${g.name} ${span(g)}`).join(', ');
  return `<div class="cal" role="img" aria-label="${esc(label)}"><div class="cal-years" ${cols}>${years}</div>${months}<div class="cal-row" ${cols}>${row}</div></div>`;
}

const list = (items) => `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
const NO_RISK = 'The replay flags no specific risk. Still review any change with a local agronomist.';

function card(c, i, cur, ctx, best) {
  const t = explain(c, cur.ev, ctx), d = score(c) - score(cur);
  const delta = !c.kind ? '' : d > 0 ? `<span>▲ ${d} better than now</span>` : d < 0 ? `<span>▼ ${-d} lower than now</span>` : '<span>same as now</span>';
  const metrics = METRICS.map((k) => {
    const v = Math.round(c.ev.scores[k] * 100), dv = v - Math.round(cur.ev.scores[k] * 100);
    const ch = !c.kind || dv === 0 ? '' : ` <b>${dv > 0 ? '+' : '−'}${Math.abs(dv)}</b>`;
    return `<div class="metric"><span>${esc(LABELS[k])}</span><span class="track"><i style="width:${v}%"></i></span><span class="n">${v}${ch}</span></div>`;
  }).join('');
  const chips = t.benefits.map((x) => `<li class="good">+ ${esc(x)}</li>`).concat(t.tradeoffs.map((x) => `<li class="warnc">− ${esc(x)}</li>`)).join('');
  const evidenceItem = (e) => `<li>${esc(e.text)}<span class="src">${esc(e.source)}; confidence: <span class="conf">${esc(e.conf)}</span></span></li>`;
  const { level, reasons, short } = t.confidence;
  return `<article class="card${c.kind ? '' : ' current'}${best ? ' best' : ''}" id="card-${i}">
    <h3>${esc(t.title)}</h3>
    <p class="tag">${!c.kind ? 'You now' : best ? 'Best match for you' : KIND_TAG[c.kind]}</p>
    <p class="badge ${level.toLowerCase()}">${level}: ${esc(short)}</p>
    <p class="key">${esc(t.key)}</p>
    ${moneyBlock(c.money, area(), c.kind ? cur.money : null)}
    ${chips ? `<ul class="chips">${chips}</ul>` : ''}
    ${calendar(c.ev, ctx.mo.shift)}
    <details><summary>Why this option</summary><p>${esc(t.lead)}</p>${list(t.why)}</details>
    <details><summary>Show the evidence</summary>
      <div class="total"><b>${score(c)}</b><span>/ 100</span>${delta}</div>${metrics}
      <h4>Replayed on ${ctx.mo.years[0]}–${ctx.mo.years.at(-1)} weather</h4>${list(t.headline)}
      <ul>${t.evidence.map(evidenceItem).join('')}</ul>
      ${t.worst.map((w) => `<p class="worst"><b>${esc(w.crop)}</b>: three worst flowering seasons (${esc(w.window)})</p>${list(w.seasons)}<p class="src">${esc(w.used)}</p>`).join('')}
    </details>
    <details><summary>What we don't know</summary>${list([`Confidence is ${level.toLowerCase()}. ${reasons.join(' ')}`, ...t.gaps])}
      <p class="src">Plus what the tool can't see for any option, listed once above the cards.</p></details>
    <p><a class="card-plan" href="#plan" data-plan="${i}">See the plan for this option →</a></p>
    <details><summary>Check with your agronomist</summary>${list(t.risks.length ? t.risks : [NO_RISK])}
      <p><a href="#agronomist" data-pick="${i}">Take this option to your agronomist</a></p></details>
    </article>`;
}

// Block sizes for a rotation of n years: the farmer's own when they add up to the farm, else equal.
const BLOCK_STEP = 5; // ha per stepper tap
function blocksFor(n) {
  const s = state.blockSizes?.[n], a = area();
  return Array.isArray(s) && s.length === n && Math.abs(s.reduce((x, y) => x + y, 0) - a) < 0.05 ? s : equalBlocks(n, a);
}

// Current rotation plus alternatives, each with its replayed whole-farm money, in the farmer's goal order.
// With no goal picked, the order is the model total from the advanced weights.
function ranked(current, allowed, ctx, weights) {
  const { cur, alts } = suggest(current, allowed, ctx, weights);
  const econs = econsFor(state.econ), full = picked('irrigation') === 'full', ha = area();
  const all = [{ rot: current, ev: cur.ev, total: cur.total }, ...alts].map((o) => ({
    ...o, money: moneySummary(farmYears(o.ev, econs, blocksFor(o.rot.crops.length), full, START_YEAR_PLAN)) }));
  const options = state.goals.length ? sortByGoals(all, current, state.goals, state.more.machines) : [...all].sort((a, b) => b.total - a.total);
  return { options, now: options.find((o) => !o.kind) };
}

function persist() {
  saveFarm({ lat: $('lat').value, lon: $('lon').value, soil: picked('soil'), slope: picked('slope'), irr: picked('irrigation'),
    crops: state.crops, cover: picked('cover'), livestock: $('livestock').checked, area: $('area').value,
    econ: state.econ, goals: state.goals, notes: $('notes').value, outline: state.outline || null, blockSizes: state.blockSizes || {}, more: state.more, place: state.placeName || null });
  $('start-over-top').hidden = false;
}

// Saved farm from this browser. Read like any outside input: only known crops, goals and numbers pass.
function applyFarm(f) {
  if (!f) return;
  const lat = parseFloat(f.lat), lon = parseFloat(f.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) { $('lat').value = lat.toFixed(2); $('lon').value = lon.toFixed(2); map.setView([lat, lon], 7); }
  setPicked('soil', f.soil); setPicked('slope', f.slope); setPicked('irrigation', f.irr);
  const crops = (Array.isArray(f.crops) ? f.crops : []).filter((id) => id in CROPS).slice(0, MAX_YEARS);
  if (crops.length) state.crops = crops;
  setPicked('cover', f.cover === true ? 'yes' : f.cover); $('livestock').checked = f.livestock === true;
  if (+f.area > 0 && +f.area <= 100000) $('area').value = +f.area;
  state.econ = sanitizeEcon(f.econ);
  state.more = sanitizeMore(f.more);
  state.goals = (Array.isArray(f.goals) ? f.goals : []).filter((g) => g in GOALS).slice(0, MAX_PICKS);
  if (typeof f.notes === 'string') $('notes').value = f.notes.slice(0, 5000);
  if (typeof f.place === 'string') state.placeName = f.place.slice(0, 80);
  const sizes = f.blockSizes && typeof f.blockSizes === 'object' ? f.blockSizes : {};
  state.blockSizes = Object.fromEntries(Object.entries(sizes).filter(([n, s]) => Array.isArray(s) && s.length === +n && s.every((v) => typeof v === 'number' && v >= 0)));
  if (Array.isArray(f.outline) && f.outline.length >= 3 && f.outline.length <= 200) {
    state.outline = f.outline.filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng)).map((p) => ({ lat: p.lat, lng: p.lng }));
    draw.load(state.outline); showDrawing(false);
  }
  $('start-over-top').hidden = false;
}

// ---------- results: header, top recommendation, stress comparison ----------
const SOIL_NAMES = { sandy: 'Sandy soil', loam: 'Loamy soil', clay: 'Clay soil' };
const SLOPE_NAMES = { flat: 'Flat', gentle: 'Gentle slope', steep: 'Steep slope' };
const hemi = (v, pos, neg) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;
const placeText = () => state.placeName || `Field at ${hemi(state.power.lat, 'N', 'S')}, ${hemi(state.power.lon, 'E', 'W')}`;

function renderHead(mo, stressed) {
  $('analysis-title').textContent = placeText();
  const items = [`Recorded weather ${mo.years[0]}–${mo.years.at(-1)}`, SOIL_NAMES[picked('soil')], SLOPE_NAMES[picked('slope')], IRRIGATION[picked('irrigation')], `${Math.round(area())} ha`];
  $('analysis-meta').innerHTML = items.map((t) => `<li>${esc(t)}</li>`).join('') +
    `<li class="status-chip${stressed ? ' warn' : ''}">${stressed ? 'Stress test on' : '✓ Analysis ready'}</li>`;
}

const badOf = (ev) => { const t = troubleCount(ev, HEAT_DAYS, STRESS_SHARE); return { bad: t.total ? Math.round((26 * t.any) / t.total) : 0, t }; };
// ▲/▼ against the baseline, in words too, so colour is never the only signal.
function vsNow(v, base, higherBetter, fmt) {
  const d = v - base, same = fmt === money ? Math.round(d / 100) === 0 : d === 0;
  if (same) return '<span class="dl same">Same as now</span>';
  const good = higherBetter ? d > 0 : d < 0;
  return `<span class="dl ${good ? 'up' : 'down'}">${good ? '▲ Better' : '▼ Worse'}: ${fmt === money ? signed(d) : `${d > 0 ? '+' : '−'}${Math.abs(d)}`} vs now</span>`;
}
const tip = (label, text) => `<details class="tip"><summary aria-label="${esc(label)}: what it means">i</summary><p>${esc(text)}</p></details>`;

function metric(label, value, compare, help) {
  return `<div class="metric-card"><div class="mc-k">${esc(label)} ${tip(label, help)}</div><div class="mc-v num">${value}</div>${compare ? `<div class="mc-c">${compare}</div>` : ''}</div>`;
}

// The recommended sequence as crop chips; the changed year is marked in words and colour.
function rotChips(c) {
  const changed = (i) => (c.kind === 'swap' || c.kind === 'insert') && i === c.at;
  return `<ol class="rot-chips" aria-label="${esc(rotName(c.rot))}">${c.rot.crops.map((id, i) => `<li class="${changed(i) ? 'changed' : ''}">
    ${cropIcon(id, 'crop-ico sm')}<span><small>Year ${i + 1}</small>${esc(CROPS[id].name)}</span>${changed(i) ? '<em>New</em>' : ''}</li>`).join('')}
    <li class="loop" aria-hidden="true">↻</li></ol>${c.rot.cover ? '<p class="cover-tag">+ Cover crops sown in the long bare gaps</p>' : ''}`;
}

function topPick(top, now, ctx) {
  const t = explain(top, now.ev, ctx), alt = Boolean(top.kind), n = top.money.n;
  const b = badOf(top.ev).bad, b0 = badOf(now.ev).bad;
  const { level, short, reasons } = t.confidence;
  const work = extraWork(top, now.rot, state.more.machines).text;
  const metrics = [
    metric('Bad seasons, of 26', `${b}`, alt ? vsNow(b, b0, false) : '', 'Crop seasons with a heatwave or a water shortage at flowering, replayed on recorded weather and scaled to 26 seasons.'),
    metric('Profit, normal year', money(top.money.normal), alt ? vsNow(top.money.normal, now.money.normal, true, money) : '', 'Whole-farm profit in the middle replayed year, with your prices and costs (example values until you change them). An estimate, not a forecast.'),
    metric('Profit, bad year', money(top.money.bad), alt ? vsNow(top.money.bad, now.money.bad, true, money) : '', 'Whole-farm profit in the worst one year in five of the replay.'),
    metric('Years with a loss', `${top.money.lossYears} of ${n}`, alt ? vsNow(top.money.lossYears, now.money.lossYears, false) : '', 'Replayed years in which the whole farm would have lost money with your prices and costs.'),
  ].join('');
  const goalText = state.goals.length ? state.goals.map((g) => GOAL_UI[g][0].toLowerCase()).join(' and ') : 'the five model scores';
  return `<article class="top-card${alt ? '' : ' holds'}" aria-labelledby="top-title">
    <div class="top-main">
      <p class="top-label">${alt ? 'Best match on the replay' : 'Your current rotation'} · ${state.goals.length ? `best match for ${esc(goalText)}` : 'ranked on all five model scores'}</p>
      <h3 id="top-title">${alt ? esc(t.title) : 'Your current rotation holds up best'}</h3>
      <p class="top-sub">${esc(!alt ? `None of the alternatives beats what you grow now on ${goalText}. The comparison below shows how close they come.`
        : state.goals.length ? reason(top, now, state.goals, state.more.machines) : `${change(top)}.`)}</p>
      ${rotChips(top)}
      ${alt ? `<p class="top-was">Now: ${esc(rotName(now.rot))}</p>` : ''}
    </div>
    <div class="metric-grid">${metrics}</div>
    <div class="top-why">
      <h4>${alt ? 'Why this option' : 'What the replay shows'}</h4>
      <ul class="reasons">${[t.key, ...t.why].slice(0, 4).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${alt ? `<p class="hint">Extra work: ${esc(work.toLowerCase())}.</p>` : ''}
    </div>
    <div class="top-foot">
      <div class="conf-line"><span class="badge ${level.toLowerCase()}">Confidence: ${level}</span> <span class="hint">${esc(short)}</span>
        <details class="tip"><summary aria-label="What confidence means">i</summary><p>${esc(reasons.join(' '))} Confidence says how solid the inputs are. It is not a probability that this option succeeds.</p></details></div>
      <div class="top-actions">
        <a class="btn primary" href="#plan" data-plan="0">${alt ? 'Explore this option' : 'See your plan'} <span aria-hidden="true">→</span></a>
        <button type="button" class="btn" data-jump="cmp-h">Compare all options</button>
        <a class="btn ghost" href="#agronomist" data-pick="0">Share with an agronomist</a>
      </div>
    </div>
  </article>`;
}

// After a scenario: the current rotation and the scenario's first option, recorded weather against scenario.
function stressCompare(current, allowed, ctx, weights, options, now) {
  const base = ranked(current, allowed, { ...ctx, mo: state.base, clim: summarize(state.base).clim }, weights);
  const top = options[0], match = (list, c) => list.find((o) => rotName(o.rot) === rotName(c.rot));
  const rows = [[now, base.now], ...(top.kind ? [[top, match(base.options, top)]] : [])];
  const cell = (was, is, fmt, higherBetter) => (was == null ? `<b>${fmt(is)}</b>` : `${fmt(was)} → <b>${fmt(is)}</b> ${vsNow(is, was, higherBetter, fmt === money ? money : null).replace(' vs now', '')}`);
  const flips = rotName(base.options[0].rot) !== rotName(top.rot);
  return `<p class="stress-verdict ${flips ? 'flip' : 'hold'}">${flips
    ? `<b>The best option changes.</b> On recorded weather ${esc(title(base.options[0]).title.toLowerCase())} came first; in this scenario ${esc(title(top).title.toLowerCase())} does.`
    : `<b>The best option holds.</b> ${esc(title(top).title)} still comes first.`}</p>
    <div class="table-scroll"><table class="stress-table"><thead><tr><th scope="col">Option</th><th scope="col">Bad seasons, of 26: recorded → scenario</th><th scope="col">Profit, normal year: recorded → scenario</th></tr></thead><tbody>${
    rows.map(([s, b]) => `<tr><th scope="row">${esc(title(s).title)}</th><td>${cell(b && badOf(b.ev).bad, badOf(s.ev).bad, (v) => `${v}`, false)}</td><td>${cell(b && b.money.normal, s.money.normal, money, true)}</td></tr>`).join('')}</tbody></table></div>
    <p class="src">Same 26 years, adjusted day by day. "Worse" here means worse than on the recorded weather.</p>`;
}

function renderOptions() {
  if (!state.power) return;
  $('area-err').hidden = areaOk();
  const rainPct = +$('sc-rain').value, dT = +$('sc-temp').value;
  $('rain-out').textContent = rainPct ? `${rainPct > 0 ? '+' : '−'}${Math.abs(rainPct)}%` : 'no change';
  $('temp-out').textContent = dT ? `+${dT} °C` : 'no change';
  for (const b of document.querySelectorAll('#stress button')) b.setAttribute('aria-pressed', +b.dataset.rain === rainPct && +b.dataset.temp === dT);
  const note = $('scenario-note');
  note.hidden = !(rainPct || dT);
  note.textContent = `Stress test on: rainfall ${$('rain-out').textContent}, temperature ${$('temp-out').textContent}. Every number on this page uses the adjusted weather. Pick "Current" under the climate test to go back.`;

  renderRibbon(); // the crop bands on the ribbon follow the rotation
  const current = { crops: state.crops, cover: coverOn() }, lay = layout(current);
  const wet = irrigated();
  $('irr-echo').textContent = IRRIGATION[picked('irrigation')];
  state.result = null;
  if (!lay.feasible) {
    const i = lay.clash[0], a = CROPS[state.crops[i]].name, b = CROPS[state.crops[(i + 1) % state.crops.length]].name;
    $('top-pick').innerHTML = `<div class="empty"><p class="warn">Your rotation does not fit the calendar: ${esc(b)} has to be sown before ${esc(a)} is harvested.</p><a class="btn primary" href="#crops">Change your rotation</a></div>`;
    $('ranking').innerHTML = ''; $('farm-strips').innerHTML = ''; $('stress-result').innerHTML = '';
    $('cards').innerHTML = `<p class="warn">This order does not fit the calendar: ${esc(b)} has to be sown before ${esc(a)} is harvested. <a href="#crops">Change one of them</a>, or put another crop between them.</p>`;
    return;
  }
  const { p, lat, elev } = state.power;
  const mo = rainPct || dT ? toMonthly(p, lat, { rain: 1 + rainPct / 100, dT }, elev) : state.base;
  const ctx = { mo, clim: summarize(mo).clim, soil: picked('soil'), slope: picked('slope'), lat, irrigated: wet };
  // Constraints: an irrigated field takes the rain-only water count out of the total; forage crops
  // are only offered when there is livestock or a hay buyer. Sliders only re-weight computed scores.
  $('w-water').disabled = wet;
  const weights = Object.fromEntries(METRICS.map((k) => [k, k === 'water' && wet ? 0 : +$(`w-${k}`).value]));
  const weightSum = METRICS.reduce((s, k) => s + weights[k], 0);
  for (const k of METRICS) $(`wo-${k}`).textContent = k === 'water' && wet ? 'not counted (irrigated)' : weightSum ? `${Math.round((100 * weights[k]) / weightSum)}% of the score` : '0%';
  flagsFor();
  const allowed = [...document.querySelectorAll('#allowed input:checked')].map((i) => i.value)
    .filter((id) => id in CROPS && ($('livestock').checked || !CROPS[id].forage));
  const { options, now } = ranked(current, allowed, ctx, weights), top = options[0];
  renderHead(mo, rainPct || dT);
  $('top-pick').innerHTML = topPick(top, now, ctx);
  $('stress-result').innerHTML = rainPct || dT ? stressCompare(current, allowed, ctx, weights, options, now) : '';
  $('ranking').innerHTML = decisionTable(options, now, state.goals, state.more.machines);
  $('farm-strips').innerHTML = `<p class="hint">Your ${Math.round(area())} ha in ${START_YEAR_PLAN} with ${top.kind ? 'the best match' : 'what you grow now'}: one block per year of the rotation.</p>${farmStrips(top, blocksFor(top.rot.crops.length), START_YEAR_PLAN)}
    <p><a class="card-plan" href="#plan" data-plan="0">See the plan, season by season →</a></p>`;
  $('cards').innerHTML = options.map((c, i) => card(c, i, now, ctx, c === top && c.kind)).join('');
  const ids = [...new Set(options.flatMap((o) => o.rot.crops))];
  if (ids.join() !== state.costIds) { // re-draw only when the crops change, so typing keeps its focus
    $('costs').innerHTML = costsPanel(ids, state.econ); $('more-inputs').innerHTML = moreInputs(state.more, ids); state.costIds = ids.join();
  }
  renderMeters(ids, lat);
  state.result = { options, now, ctx };
  persist();
  $('pick').innerHTML = options.map((c, i) => `<option value="${i}">${esc(title(c).title)}</option>`).join('');
  if (stepId() === 'agronomist') renderReport();
  if (stepId() === 'plan') renderPlan();
}

// ---------- your plan ----------
const planOpts = (c, ctx) => {
  const blockHa = blocksFor(c.rot.crops.length);
  return { blockHa, equal: blockHa.every((v) => Math.abs(v - blockHa[0]) < 0.05), startYear: START_YEAR_PLAN,
    month0: today.getMonth(), shift: ctx.mo.shift, area: area(), step: BLOCK_STEP, sow: state.more.sow, notes: (rot) => farmNotes(rot, state.more) };
};

// Confidence meters: say what moved, and why, when an answer changes a level.
function renderMeters(ids, lat) {
  const conf = areaConfidence({ crops: ids, econ: state.econ, sow: state.more.sow, soilTest: state.more.soil, lat });
  const moved = state.conf ? Object.keys(AREAS).filter((k) => state.conf[k].level !== conf[k].level)
    .map((k) => `${AREAS[k]} confidence ${state.conf[k].level} → ${conf[k].level}: ${conf[k].reason}`) : [];
  if (moved.length) state.moved = moved; // the last change stays on screen until the next one
  state.conf = conf;
  $('meters').innerHTML = meters(conf, state.moved || []);
}

// The option whose plan is open: a tapped row or card, the landing page's swap, else the best match.
function planOption() {
  const r = state.result;
  if (state.planKey) {
    const k = state.planKey, j = r.options.findIndex((o) => o.kind === k.kind && o.at === k.at && o.id === k.id);
    state.planIndex = j >= 0 ? j : 0; state.planKey = null;
  }
  state.planIndex = Math.min(state.planIndex ?? 0, r.options.length - 1);
  return r.options[state.planIndex];
}

function renderPlan() {
  const r = state.result;
  if (!r) { $('plan').innerHTML = '<p class="warn">Your rotation does not fit the calendar yet. <a href="#crops">Change it</a> to see a plan.</p>'; return; }
  const c = planOption(), o = planOpts(c, r.ctx), { lat, lon } = state.power;
  $('plan').innerHTML = planHtml(c, r.now, o);
  $('pick').value = state.planIndex; // the agronomist report follows the open plan
  $('plan-whatsapp').href = `https://wa.me/?text=${encodeURIComponent(`BioShift, my farm at ${lat.toFixed(2)}, ${lon.toFixed(2)}.\n${planText(c, r.now, o)}\n` +
    `Money: ${money(c.money.normal)} in a normal year, ${money(c.money.bad)} in a bad year (my estimate, example prices unless I changed them). A plan on NASA weather ${r.ctx.mo.years[0]}–${r.ctx.mo.years.at(-1)}, not advice. ${shareUrl()}`)}`;
}

// ---------- agronomist report ----------
// Field state for a shared link; read back by restore() on load.
function shareUrl() {
  const q = new URLSearchParams({ lat: $('lat').value, lon: $('lon').value, soil: picked('soil'), slope: picked('slope'),
    irr: picked('irrigation'), crops: state.crops.join(','), cover: picked('cover') });
  return `${location.origin}${location.pathname}#options?${q}`;
}

function restore() {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  if (!q.size) return false;
  const lat = parseFloat(q.get('lat')), lon = parseFloat(q.get('lon'));
  if (Number.isFinite(lat) && Number.isFinite(lon)) { $('lat').value = lat.toFixed(2); $('lon').value = lon.toFixed(2); map.setView([lat, lon], 7); }
  setPicked('soil', q.get('soil')); setPicked('slope', q.get('slope')); setPicked('irrigation', q.get('irr'));
  const crops = (q.get('crops') ?? '').split(',').filter((id) => id in CROPS).slice(0, MAX_YEARS);
  if (crops.length) state.crops = crops;
  setPicked('cover', q.get('cover') === '1' ? 'yes' : q.get('cover'));
  history.replaceState(null, '', `#${stepId()}`);
  return true;
}

function renderReport() {
  const r = state.result;
  if (!r) { $('report').innerHTML = '<p class="warn">Your rotation does not fit the calendar yet. <a href="#crops">Change it</a> to see options.</p>'; return; }
  const c = r.options[Math.min(+$('pick').value || 0, r.options.length - 1)], t = explain(c, r.now.ev, r.ctx);
  const { lat, lon } = state.power;
  const shared = [...document.querySelectorAll('#shared li')].map((li) => li.textContent); // said once in the page, reused here
  const box = (items) => `<ul class="todo">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  $('report').innerHTML = `
    <p class="src">Field at ${lat.toFixed(2)}°, ${lon.toFixed(2)}°; ${esc(picked('soil'))} soil, ${esc(picked('slope'))} slope; ${esc(IRRIGATION[picked('irrigation')].toLowerCase())}. Replayed on NASA POWER weather, ${r.ctx.mo.years[0]} to ${r.ctx.mo.years.at(-1)}.</p>
    <p><b>Grown now:</b> ${esc(rotName(r.now.rot))} (${seasonsOk(r.now)})</p>
    <p><b>Option to discuss:</b> ${esc(t.title)}${c.kind ? `: ${esc(rotName(c.rot))}` : ''} (${seasonsOk(c)})</p>
    <p class="key">${esc(t.key)}</p>
    <h3>Plan, block by block</h3>${box(planText(c, r.now, planOpts(c, r.ctx)).split('\n').filter((l) => !l.startsWith('Ask: ')).slice(1))}
    <p class="src">Money for the whole farm, ${Math.round(area())} ha: ${money(c.money.normal)} in a normal year, ${money(c.money.bad)} in a bad year (worst one in five), a loss in ${c.money.lossYears} of ${c.money.n} years. Your estimate, using your numbers and NASA weather. Not a price forecast.</p>
    <h3>Check for this option</h3>${box(t.risks.length ? t.risks : [NO_RISK])}
    <h3>What the tool can't see</h3>${box(shared)}
    <p class="src">BioShift compares options on recorded weather. It supports, it does not replace, your judgment or a local agronomist. Counts are seasons out of trouble, not yields.</p>`;
  const text = `BioShift, my field at ${lat.toFixed(2)}, ${lon.toFixed(2)}. Now: ${rotName(r.now.rot)} (${seasonsOk(r.now)}). ` +
    `Option to discuss: ${t.title} (${seasonsOk(c)}). ${t.key}. A comparison on NASA weather ${r.ctx.mo.years[0]}–${r.ctx.mo.years.at(-1)}, not advice. ${shareUrl()}`;
  $('whatsapp').href = `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// ---------- events ----------
window.addEventListener('hashchange', () => { if (restore()) { renderRotation(); loadField(); } show(); });
const loadDemo = () => { state.crops = DEMO_CROPS; state.placeName = 'Bărăgan Plain, Romania'; $('area').value = DEMO_AREA; renderRotation(); return setField(DEMO.lat, DEMO.lon, 7); };
$('see-example').addEventListener('click', loadDemo);
$('l-plan').addEventListener('click', () => { state.planKey = state.landingPick; loadDemo(); });
$('place').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(searchPlace, 1000); });
$('place-results').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $('place').value = b.textContent; $('place-results').innerHTML = '';
  state.placeName = b.textContent.split(',')[0];
  setField(b.dataset.lat, b.dataset.lon, 10);
});
$('locate').addEventListener('click', () => {
  const status = $('status');
  if (!navigator.geolocation) { status.className = 'error'; status.textContent = 'This browser cannot share a location. Search for a place or tap the map.'; return; }
  status.className = ''; status.textContent = 'Finding your location…';
  navigator.geolocation.getCurrentPosition(
    (pos) => { state.placeName = 'Your location'; setField(pos.coords.latitude, pos.coords.longitude, 10); },
    () => { status.className = 'error'; status.textContent = 'Could not get your location. Search for a place or tap the map.'; },
    { timeout: 10000 });
});
document.querySelector('.presets').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) { state.placeName = b.textContent; setField(b.dataset.lat, b.dataset.lon, 7); }
});
map.on('click', (e) => { if (draw.active) return; const p = e.latlng.wrap(); state.placeName = null; setField(p.lat, p.lng); });
// Draw your field: the outline sets the farm size and moves the weather point to its middle.
const showDrawing = (on) => { $('draw-start').hidden = on; $('draw-done').hidden = !on; $('draw-clear').hidden = !on && !draw.points.length; };
$('draw-start').addEventListener('click', () => { draw.start(); showDrawing(true); $('draw-note').textContent = 'Tap each corner of your field on the map. Drag a corner to adjust. Then tap Done.'; });
$('draw-done').addEventListener('click', () => {
  if (!draw.finish()) { $('draw-note').textContent = 'Tap at least three corners on the map first.'; draw.start(); return; }
  showDrawing(false);
});
$('draw-clear').addEventListener('click', () => { draw.clear(); state.outline = null; showDrawing(false); persist(); $('draw-note').textContent = 'Outline cleared. Type the size below, or draw again.'; });
for (const id of ['lat', 'lon']) $(id).addEventListener('change', () => { state.placeName = null; loadField(); });
$('layers').addEventListener('change', setOverlay);
$('hazard').addEventListener('change', renderRibbon);
for (const type of ['click', 'mouseover']) {
  $('ribbon').addEventListener(type, (e) => {
    const t = e.target.dataset.t;
    if (t != null) $('ribbon-readout').textContent = cellText(state.base, +t);
  });
}
$('rotation').addEventListener('change', (e) => {
  if (e.target.dataset.year == null || !(e.target.value in CROPS)) return;
  state.crops = state.crops.map((c, i) => (i === +e.target.dataset.year ? e.target.value : c));
  renderOptions();
});
$('rotation').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.move != null) {
    const from = +b.dataset.move, to = from + +b.dataset.dir;
    moveCrop(from, to);
    $('rotation').querySelector(`[data-move="${to}"][data-dir="${b.dataset.dir}"]:not(:disabled)`)?.focus(); // keep focus on the moved card
    return;
  }
  if (b.dataset.remove == null || state.crops.length === 1) return;
  state.crops = state.crops.filter((_, i) => i !== +b.dataset.remove);
  renderRotation(); renderOptions();
});
// Drag to reorder (mouse); the arrow buttons do the same for keyboard and touch.
$('rotation').addEventListener('dragstart', (e) => {
  const li = e.target.closest?.('[data-i]');
  if (!li) return;
  state.dragFrom = +li.dataset.i; li.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', li.dataset.i);
});
$('rotation').addEventListener('dragover', (e) => { if (state.dragFrom != null) e.preventDefault(); });
$('rotation').addEventListener('drop', (e) => {
  const li = e.target.closest('[data-i]');
  if (!li || state.dragFrom == null) return;
  e.preventDefault(); moveCrop(state.dragFrom, +li.dataset.i); state.dragFrom = null;
});
$('rotation').addEventListener('dragend', () => { state.dragFrom = null; for (const li of $('rotation').children) li.classList.remove('dragging'); });
$('add-year').addEventListener('click', () => {
  if (state.crops.length >= MAX_YEARS) return;
  state.crops = [...state.crops, 'wheat'];
  renderRotation(); renderOptions();
  $(`crop-${state.crops.length - 1}`)?.focus(); // straight into choosing the new year's crop
});
$('prio').addEventListener('change', (e) => {
  const boxes = [...document.querySelectorAll('input[name=goal]')];
  if (boxes.filter((b) => b.checked).length > MAX_PICKS) e.target.checked = false;
  state.goals = boxes.filter((b) => b.checked).map((b) => b.value);
  renderGoalCount(); renderOptions(); persist();
});
document.addEventListener('click', (e) => { // in-page jumps: the hash drives the steps, so these scroll instead
  const b = e.target.closest('[data-jump]');
  if (b) $(b.dataset.jump)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
});
$('gloss-q').addEventListener('input', () => {
  const q = $('gloss-q').value.trim().toLowerCase();
  let shown = 0;
  for (const item of $('glossary').children) { const hit = !q || item.textContent.toLowerCase().includes(q); item.hidden = !hit; shown += hit; }
  $('gloss-none').hidden = shown > 0;
});
$('weights').addEventListener('input', renderOptions);
$('costs').addEventListener('input', (e) => {
  if (!e.target.dataset.crop) return;
  state.econ = applyInput(state.econ, e.target);
  const id = e.target.dataset.crop, fs = e.target.closest('fieldset');
  fs.querySelector(`[data-sum="${id}"]`).textContent = sumText(econsFor(state.econ)[id]);
  fs.querySelector('legend .src').textContent = state.econ[id] ? 'your numbers' : 'example values';
  renderOptions(); persist();
});
for (const type of ['input', 'change']) {
  $('more-inputs').addEventListener(type, (e) => {
    if (!e.target.dataset.more || (type === 'input' && e.target.type === 'checkbox')) return;
    state.more = applyMore(state.more, e.target);
    renderOptions();
  });
}
$('reset-costs').addEventListener('click', () => { state.econ = {}; state.costIds = ''; renderOptions(); persist(); });
$('area').addEventListener('input', () => { renderOptions(); persist(); });
$('notes').addEventListener('input', persist);
for (const id of ['start-over', 'start-over-top']) {
  $(id).addEventListener('click', () => { clearFarm(); location.hash = '#start'; location.reload(); });
}
$('stress').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $('sc-rain').value = b.dataset.rain; $('sc-temp').value = b.dataset.temp;
  // The replay takes a few hundred ms: show that it is working, let the browser paint, then run it.
  $('stress').setAttribute('aria-busy', 'true'); b.classList.add('busy');
  $('stress-result').innerHTML = '<p class="hint" role="status">Replaying 26 years with this climate…</p>';
  requestAnimationFrame(() => setTimeout(() => { renderOptions(); $('stress').removeAttribute('aria-busy'); b.classList.remove('busy'); }));
});
for (const id of ['sc-rain', 'sc-temp']) $(id).addEventListener('input', renderOptions);
for (const id of ['cover-q', 'livestock', 'allowed']) $(id).addEventListener('change', renderOptions);
for (const name of ['soil', 'slope', 'irrigation']) for (const el of document.querySelectorAll(`input[name=${name}]`)) el.addEventListener('change', renderOptions);
for (const id of ['cards', 'top-pick']) $(id).addEventListener('click', (e) => { const a = e.target.closest('[data-pick]'); if (a) $('pick').value = a.dataset.pick; });
$('pick').addEventListener('change', renderReport);
for (const id of ['ranking', 'cards', 'farm-strips', 'top-pick']) {
  $(id).addEventListener('click', (e) => { // a row or card opens that option's plan
    const a = e.target.closest('[data-plan]');
    if (a) state.planIndex = +a.dataset.plan;
  });
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stepId() === 'plan') location.hash = '#options'; });
$('plan').addEventListener('click', (e) => { // block steppers: the farm total stays, money follows
  const btn = e.target.closest('[data-block]');
  if (!btn || !state.result) return;
  const n = state.result.options[state.planIndex].rot.crops.length;
  state.blockSizes = { ...state.blockSizes, [n]: moveHectares(blocksFor(n), +btn.dataset.block, +btn.dataset.ha) };
  renderOptions();
  document.querySelector(`[data-block="${btn.dataset.block}"][data-ha="${btn.dataset.ha}"]`)?.focus();
});
$('area').addEventListener('change', () => { state.blockSizes = {}; renderOptions(); }); // a new farm size starts from equal blocks
$('plan-print').addEventListener('click', () => window.print());
$('print').addEventListener('click', () => window.print());

if (!new URLSearchParams(location.hash.split('?')[1] ?? '').size) applyFarm(loadFarm()); // a shared link wins over the saved farm
buildControls();
restore();
renderRotation();
renderLanding();
loadField();
show(false);
