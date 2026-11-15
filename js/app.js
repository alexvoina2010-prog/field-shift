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
import { costsPanel, applyInput, econsFor, sanitizeEcon, sumText, money, moneyBlock } from './money-ui.js';
import { loadFarm, saveFarm, clearFarm } from './store.js';
import { decisionTable, change } from './table.js';
import { planHtml, planText, farmStrips } from './plan-ui.js';
import { drawTool } from './draw.js';
import { moveHectares } from '../src/model/plan.js';
import { cropFlags, FLAG_RULES } from '../src/model/flags.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const picked = (name) => document.querySelector(`input[name=${name}]:checked`).value;
const setPicked = (name, value) => { const el = document.querySelector(`input[name=${name}][value="${value}"]`); if (el) el.checked = true; };
const irrigated = () => picked('irrigation') !== 'none'; // "Sometimes" and "Fully" both count as irrigated
const DEMO_CROPS = ['wheat', 'maize', 'sunflower'];
const state = { crops: DEMO_CROPS, power: null, base: null, loading: null, result: null, econ: {}, goals: [], costIds: '', blockSizes: {}, outline: null };
const MAX_YEARS = 5;
const DEMO_AREA = 120; // ha
// The coming harvest year: from September on, autumn sowing is for next year's harvest. Block A grows
// the first crop of the rotation in this year; money and the plan both use it.
const today = new Date();
const START_YEAR_PLAN = today.getMonth() >= 8 ? today.getFullYear() + 1 : today.getFullYear();
const area = () => { const v = parseFloat($('area').value); return v > 0 && v <= 100000 ? v : DEMO_AREA; };

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
    $('draw-note').textContent = `Your field: ${Math.round(ha * 10) / 10} ha. Weather comes from NASA's grid for your area (about 50 km); the outline gives your farm size.`;
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
  $('layer-note').textContent = def ? def.note : 'Tap the map to move the field marker.';
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

// Place search: OpenStreetMap Nominatim, at most one request per 500 ms pause in typing.
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
  $('ribbon').innerHTML = ribbon(state.base, layout({ crops: state.crops, cover: $('cover').checked }), picked('hazard'));
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
const GOAL_HINTS = {
  profit: 'Profit in a normal year', steady: 'Profit in a bad year, and years with a loss', work: 'Workload and machinery you do not have yet',
  soil: 'Legume years, soil covered in heavy rain, fewer bare months', water: 'How often crops were short of water at flowering',
};
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

function renderRotation() {
  const f = state.flags || {};
  const options = (sel) => Object.entries(CROPS).map(([id, c]) => `<option value="${id}"${id === sel ? ' selected' : ''}>${esc(c.name)}${f[id] ? ' (rarely suits your area)' : ''}</option>`).join('');
  $('rotation').innerHTML = state.crops.map((id, i) => `<div class="year-row"><span>Year ${i + 1}</span>
    <select data-year="${i}" aria-label="Crop in year ${i + 1}">${options(id)}</select>
    <button type="button" data-remove="${i}" aria-label="Remove year ${i + 1}"${state.crops.length === 1 ? ' disabled' : ''}>✕</button></div>`).join('');
  $('add-year').disabled = state.crops.length >= MAX_YEARS;
  const flagged = state.crops.filter((id) => f[id]);
  $('rotation-flags').textContent = flagged.map((id) => `${CROPS[id].name} rarely suits your area: ${f[id].reason}.`).join(' ');
}

function buildControls() {
  $('allowed').innerHTML = Object.entries(CROPS).map(([id, c]) => `<label><input type="checkbox" value="${id}" checked> ${esc(c.name)}</label>`).join('');
  $('flag-rules').textContent = `A crop is flagged "rarely suits your area" when, replayed on its own on this field, it had ${Object.values(FLAG_RULES).map((r) => r.text).join('; or ')}. Heat alone is not flagged on a rain-fed field: the heat limits are assumptions. Flagged crops stay selectable.`;
  $('prio').insertAdjacentHTML('beforeend', Object.entries(GOALS).map(([k, t]) => `<label><input type="checkbox" name="goal" value="${k}"${state.goals.includes(k) ? ' checked' : ''}>
    <span>${esc(t)}<span class="src">${esc(GOAL_HINTS[k])}</span></span></label>`).join(''));
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
  const options = state.goals.length ? sortByGoals(all, current, state.goals) : [...all].sort((a, b) => b.total - a.total);
  return { options, now: options.find((o) => !o.kind) };
}

function persist() {
  saveFarm({ lat: $('lat').value, lon: $('lon').value, soil: picked('soil'), slope: picked('slope'), irr: picked('irrigation'),
    crops: state.crops, cover: $('cover').checked, livestock: $('livestock').checked, area: $('area').value,
    econ: state.econ, goals: state.goals, notes: $('notes').value, outline: state.outline || null, blockSizes: state.blockSizes || {} });
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
  $('cover').checked = f.cover === true; $('livestock').checked = f.livestock === true;
  if (+f.area > 0 && +f.area <= 100000) $('area').value = +f.area;
  state.econ = sanitizeEcon(f.econ);
  state.goals = (Array.isArray(f.goals) ? f.goals : []).filter((g) => g in GOALS).slice(0, MAX_PICKS);
  if (typeof f.notes === 'string') $('notes').value = f.notes.slice(0, 5000);
  const sizes = f.blockSizes && typeof f.blockSizes === 'object' ? f.blockSizes : {};
  state.blockSizes = Object.fromEntries(Object.entries(sizes).filter(([n, s]) => Array.isArray(s) && s.length === +n && s.every((v) => typeof v === 'number' && v >= 0)));
  if (Array.isArray(f.outline) && f.outline.length >= 3 && f.outline.length <= 200) {
    state.outline = f.outline.filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng)).map((p) => ({ lat: p.lat, lng: p.lng }));
    draw.load(state.outline); showDrawing(false);
  }
  $('start-over-top').hidden = false;
}

function renderOptions() {
  if (!state.power) return;
  const rainPct = +$('sc-rain').value, dT = +$('sc-temp').value;
  $('rain-out').textContent = rainPct ? `${rainPct > 0 ? '+' : '−'}${Math.abs(rainPct)}%` : 'no change';
  $('temp-out').textContent = dT ? `+${dT} °C` : 'no change';
  for (const b of document.querySelectorAll('#stress button')) b.setAttribute('aria-pressed', +b.dataset.rain === rainPct && +b.dataset.temp === dT);
  const note = $('scenario-note');
  note.hidden = !(rainPct || dT);
  note.textContent = `Stress test on: rainfall ${$('rain-out').textContent}, temperature ${$('temp-out').textContent}. Scores below use the adjusted weather.`;

  renderRibbon(); // the crop bands on the ribbon follow the rotation
  const current = { crops: state.crops, cover: $('cover').checked }, lay = layout(current);
  const wet = irrigated();
  $('irr-echo').textContent = IRRIGATION[picked('irrigation')];
  state.result = null;
  if (!lay.feasible) {
    const i = lay.clash[0], a = CROPS[state.crops[i]].name, b = CROPS[state.crops[(i + 1) % state.crops.length]].name;
    $('answer').textContent = ''; $('ranking').innerHTML = '';
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
  if (rainPct || dT) {
    // Stress test: say whether the adjusted weather changes which option comes first.
    const was = rotName(ranked(current, allowed, { ...ctx, mo: state.base, clim: summarize(state.base).clim }, weights).options[0].rot), is = rotName(top.rot);
    note.textContent += was === is
      ? ` The order holds: ${is} still comes first.`
      : ` The order flips: on the recorded weather ${was} came first; in this scenario ${is} does.`;
  }
  const goalText = state.goals.length ? state.goals.map((g) => GOALS[g].toLowerCase()).join(' and ') : 'the five model scores';
  $('answer').textContent = top.kind
    ? `Best match for ${goalText}: ${change(top).replace(/^./, (m) => m.toLowerCase())}.`
    : `For ${goalText}, none of the alternatives beats what you grow now.`;
  $('ranking').innerHTML = decisionTable(options, now, state.goals);
  $('farm-strips').innerHTML = `<p class="hint">Your ${Math.round(area())} ha in ${START_YEAR_PLAN} with ${top.kind ? 'the best match' : 'what you grow now'}: one block per year of the rotation.</p>${farmStrips(top, blocksFor(top.rot.crops.length), START_YEAR_PLAN)}
    <p><a class="card-plan" href="#plan" data-plan="0">See the plan, season by season →</a></p>`;
  $('cards').innerHTML = options.map((c, i) => card(c, i, now, ctx, c === top && c.kind)).join('');
  const ids = [...new Set(options.flatMap((o) => o.rot.crops))];
  if (ids.join() !== state.costIds) { $('costs').innerHTML = costsPanel(ids, state.econ); state.costIds = ids.join(); } // keep focus while typing
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
    month0: today.getMonth(), shift: ctx.mo.shift, area: area(), step: BLOCK_STEP };
};

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
    irr: picked('irrigation'), crops: state.crops.join(','), cover: $('cover').checked ? 1 : 0 });
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
  $('cover').checked = q.get('cover') === '1';
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
const loadDemo = () => { state.crops = DEMO_CROPS; $('area').value = DEMO_AREA; renderRotation(); return setField(DEMO.lat, DEMO.lon, 7); };
$('see-example').addEventListener('click', loadDemo);
$('l-plan').addEventListener('click', () => { state.planKey = state.landingPick; loadDemo(); });
$('place').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(searchPlace, 500); });
$('place-results').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $('place').value = b.textContent; $('place-results').innerHTML = '';
  setField(b.dataset.lat, b.dataset.lon, 10);
});
$('locate').addEventListener('click', () => {
  const status = $('status');
  if (!navigator.geolocation) { status.className = 'error'; status.textContent = 'This browser cannot share a location. Search for a place or tap the map.'; return; }
  status.className = ''; status.textContent = 'Finding your location…';
  navigator.geolocation.getCurrentPosition(
    (pos) => setField(pos.coords.latitude, pos.coords.longitude, 10),
    () => { status.className = 'error'; status.textContent = 'Could not get your location. Search for a place or tap the map.'; },
    { timeout: 10000 });
});
document.querySelector('.presets').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) setField(b.dataset.lat, b.dataset.lon, 7);
});
map.on('click', (e) => { if (draw.active) return; const p = e.latlng.wrap(); setField(p.lat, p.lng); });
// Draw your field: the outline sets the farm size and moves the weather point to its middle.
const showDrawing = (on) => { $('draw-start').hidden = on; $('draw-done').hidden = !on; $('draw-clear').hidden = !on && !draw.points.length; };
$('draw-start').addEventListener('click', () => { draw.start(); showDrawing(true); $('draw-note').textContent = 'Tap each corner of your field on the map. Drag a corner to adjust. Then tap Done.'; });
$('draw-done').addEventListener('click', () => {
  if (!draw.finish()) { $('draw-note').textContent = 'Tap at least three corners on the map first.'; draw.start(); return; }
  showDrawing(false);
});
$('draw-clear').addEventListener('click', () => { draw.clear(); state.outline = null; showDrawing(false); persist(); $('draw-note').textContent = 'Outline cleared. Type the size below, or draw again.'; });
for (const id of ['lat', 'lon']) $(id).addEventListener('change', loadField);
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
  if (e.target.dataset.remove == null || state.crops.length === 1) return;
  state.crops = state.crops.filter((_, i) => i !== +e.target.dataset.remove);
  renderRotation(); renderOptions();
});
$('add-year').addEventListener('click', () => {
  if (state.crops.length >= MAX_YEARS) return;
  state.crops = [...state.crops, 'wheat'];
  renderRotation(); renderOptions();
});
$('prio').addEventListener('change', (e) => {
  const boxes = [...document.querySelectorAll('input[name=goal]')];
  if (boxes.filter((b) => b.checked).length > MAX_PICKS) e.target.checked = false;
  state.goals = boxes.filter((b) => b.checked).map((b) => b.value);
  renderOptions(); persist();
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
  renderOptions();
});
for (const id of ['sc-rain', 'sc-temp']) $(id).addEventListener('input', renderOptions);
for (const id of ['cover', 'livestock', 'allowed']) $(id).addEventListener('change', renderOptions);
for (const name of ['soil', 'slope', 'irrigation']) for (const el of document.querySelectorAll(`input[name=${name}]`)) el.addEventListener('change', renderOptions);
$('cards').addEventListener('click', (e) => { if (e.target.dataset.pick != null) $('pick').value = e.target.dataset.pick; });
$('pick').addEventListener('change', renderReport);
for (const id of ['ranking', 'cards', 'farm-strips']) {
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
