// Page wiring: map, NASA POWER fetch, and rendering. All agronomy logic lives in the other modules.
/* global L */
import { CROPS } from '../src/model/crops.js';
import { powerUrl, expandDemo, toMonthly, summarize, START_YEAR, END_YEAR, HOT_DAY } from '../src/model/climate.js';
import { layout, suggest, METRICS } from '../src/model/rotation.js';
import { explain, LABELS, monthName } from './explain.js';
import { ribbon, cellText } from './ribbon.js';
import { mannKendall } from '../src/model/trend.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const state = { crops: ['wheat', 'maize', 'sunflower'], power: null, base: null };
const MAX_YEARS = 5;

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
const map = L.map('map').setView([+$('lat').value, +$('lon').value], 7);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 15, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
const marker = L.circleMarker(map.getCenter(), { radius: 9, color: '#1f3d2b', weight: 3, fillColor: '#eda100', fillOpacity: 1 }).addTo(map);
let overlay = null;

function setOverlay() {
  const key = document.querySelector('input[name=layer]:checked').value, def = LAYERS[key];
  if (overlay) { map.removeLayer(overlay); overlay = null; }
  $('ndvi-month-wrap').hidden = key !== 'ndvi';
  $('layer-note').textContent = def ? def.note : 'Click the map to move the field marker.';
  if (!def) return;
  const month = $('ndvi-month').value;
  const time = key === 'ndvi' && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : 'default';
  overlay = L.tileLayer(`${GIBS}/${def.id}/default/${time}/${def.tms}/{z}/{y}/{x}.png`,
    { maxNativeZoom: def.zoom, opacity: 0.7, attribution: 'NASA GIBS' }).addTo(map);
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

async function loadField() {
  const lat = parseFloat($('lat').value), lon = parseFloat($('lon').value), status = $('status');
  status.className = 'hint';
  if (!(lat >= -60 && lat <= 70 && lon >= -180 && lon <= 180)) {
    status.className = 'hint error';
    status.textContent = 'Latitude must be between -60 and 70, longitude between -180 and 180.';
    return;
  }
  marker.setLatLng([lat, lon]);
  map.panTo([lat, lon]);
  request?.abort();
  request = new AbortController();
  status.textContent = `Loading ${END_YEAR - START_YEAR + 1} years of NASA data…`;
  try {
    const { p, elev, saved } = await fetchPower(lat, lon, request.signal);
    const base = toMonthly(p, lat, undefined, elev);
    if (base.years.length < 10) throw new Error('fewer than 10 complete years of data here');
    state.power = { p, lat, lon, elev };
    state.base = base;
    status.textContent = saved ? `Demo field: NASA POWER record saved on ${saved}, so it loads without a live connection to NASA.` : '';
    for (const id of ['climate', 'setup', 'compare']) $(id).hidden = false;
    renderClimate();
    renderStrategies();
  } catch (e) {
    if (e.name === 'AbortError') return;
    status.className = 'hint error';
    status.textContent = `Live NASA data is unavailable right now: ${e.message}. Try again, or use the Bărăgan example, which is saved with the page.`;
  }
}

// ---------- climate ----------
const TREND_P = 0.05; // a trend is only called clear below this Mann-Kendall p-value

// One headline fact: Sen's slope per decade, called a trend only if the Mann-Kendall test says so.
function fact(label, series, unit, digits) {
  const { p, slope } = mannKendall(series), per = slope * 10, clear = p < TREND_P, weak = !clear && p < 2 * TREND_P;
  const size = `${Math.abs(per).toFixed(digits)}${unit} per decade`;
  const avg = (series.reduce((s, v) => s + v, 0) / series.length).toFixed(digits);
  const pText = p < 0.001 ? 'p below 0.001' : `p = ${p.toFixed(p < 0.01 ? 3 : 2)}`;
  return `<div class="tile"><div class="k">${esc(label)}</div>
    <div class="v">${clear ? `${per > 0 ? '▲ Up' : '▼ Down'} ${size}` : weak ? `Possibly ${per > 0 ? 'rising' : 'falling'}` : 'No clear trend'}</div>
    <div class="d">${clear ? 'A clear trend' : `${weak ? 'Weak evidence, not a confirmed trend' : 'Year-to-year swings are larger than the drift'} (${per > 0 ? '+' : '−'}${size})`}:
      Mann-Kendall test, ${pText}. Average ${avg}${unit} a year.</div></div>`;
}

function renderRibbon() {
  if (!state.base) return;
  const key = document.querySelector('input[name=hazard]:checked').value;
  $('ribbon').innerHTML = ribbon(state.base, layout({ crops: state.crops, cover: $('cover').checked }), key);
}

function chart(clim, shift) {
  const W = 720, H = 280, l = 40, r = 10, t = 12, b = 26, pw = W - l - r, ph = H - t - b;
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
  const months = clim.map((_, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${monthName(i, shift)}</text>`).join('');
  return `<ul class="legend"><li><span class="sw" style="background:var(--rain)"></span>Rain, mm per month</li>
    <li><span class="sw" style="background:var(--et);height:3px"></span>Water a well-watered crop could use (reference ET), mm per month</li></ul>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly rain compared with reference evapotranspiration. The table below has the numbers.">
    ${grid}${bars}${line}${dots}${months}</svg>`;
}

function renderClimate() {
  const mo = state.base, s = summarize(mo), y = mo.years, { lat, lon, elev } = state.power;
  const notes = [`NASA POWER grid cell around ${lat.toFixed(2)}°, ${lon.toFixed(2)}° (about 50 km wide, ${Math.round(elev)} m above sea level). ` +
    `Rain averages ${Math.round(s.annualRain)} mm a year; a well-watered crop could use ${Math.round(s.annualEt0)} mm. ` +
    `The three boxes test ${y[0]}–${y.at(-1)} for a trend: what happened, not a forecast.`];
  if (Math.abs(lat) < 35 || Math.abs(lat) > 60) notes.push('⚠ This point is outside the temperate latitudes (35°–60°) the crop calendar was written for. Sowing and flowering months may not match local practice, so treat the rotation results as illustrative only.');
  $('climate-note').textContent = notes.join(' ');
  $('tiles').innerHTML = [
    fact(`Days of ${HOT_DAY} °C or more, per year`, s.series.hotDays, ' days', 1),
    fact(`Summer water shortfall (${monthName(5, mo.shift)}–${monthName(7, mo.shift)} crop demand minus rain)`, s.series.summerGap, ' mm', 0),
    fact('Rain per year', s.series.rain, ' mm', 0),
  ].join('');
  renderRibbon();
  $('chart').innerHTML = chart(s.clim, mo.shift);
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

function renderRotation() {
  const options = (sel) => Object.entries(CROPS).map(([id, c]) => `<option value="${id}"${id === sel ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  $('rotation').innerHTML = state.crops.map((id, i) => `<div class="year-row"><span>Year ${i + 1}</span>
    <select data-year="${i}" aria-label="Crop in year ${i + 1}">${options(id)}</select>
    <button type="button" data-remove="${i}" aria-label="Remove year ${i + 1}"${state.crops.length === 1 ? ' disabled' : ''}>✕</button></div>`).join('');
  $('add-year').disabled = state.crops.length >= MAX_YEARS;
}

function buildControls() {
  $('allowed').innerHTML = Object.entries(CROPS).map(([id, c]) => `<label><input type="checkbox" value="${id}" checked> ${esc(c.name)}</label>`).join('');
  $('weights').innerHTML = METRICS.map((k) => `<label>${esc(LABELS[k])} <output id="wo-${k}"></output>
    <span class="src">${esc(WEIGHT_HINTS[k])}</span>
    <input type="range" id="w-${k}" min="0" max="5" step="1" value="3"></label>`).join('');
  const now = new Date(), year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  $('ndvi-month').value = `${year}-06`;
  $('ndvi-month').max = new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString().slice(0, 7);
  renderRotation();
}

// ---------- comparison ----------
const KIND_TAG = { cover: 'Smallest change', swap: 'One crop changes', insert: 'Longer rotation' };

function calendar(ev, shift) {
  const { slots } = ev.lay, N = slots.length;
  const info = (s) => (!s ? { key: 'bare', cls: 'bare', name: 'Bare soil', short: 'bare' }
    : s.cover ? { key: 'cover', cls: 'cover', name: 'Cover crop', short: 'cover' }
    : { key: `c${s.i}`, cls: CROPS[ev.rot.crops[s.i]].legume ? 'legume' : 'crop', name: CROPS[ev.rot.crops[s.i]].name, short: CROPS[ev.rot.crops[s.i]].name });
  const segs = [];
  slots.forEach((s, m) => {
    const it = info(s), last = segs.at(-1);
    if (last && last.key === it.key) last.len++; else segs.push({ ...it, start: m, len: 1 });
  });
  const span = (g) => `${monthName(g.start % 12, shift)}–${monthName((g.start + g.len - 1) % 12, shift)}`;
  const cols = `style="grid-template-columns:repeat(${N},1fr)"`;
  const years = ev.rot.crops.map((_, i) => `<span style="grid-column:span 12">Year ${i + 1}</span>`).join('');
  const months = N <= 36 ? `<div class="cal-months" ${cols} aria-hidden="true">${slots.map((_, m) => `<span>${monthName(m % 12, shift)[0]}</span>`).join('')}</div>` : '';
  const row = segs.map((g) => `<span class="seg ${g.cls}" style="grid-column:span ${g.len}" title="${esc(g.name)}: ${span(g)}">${g.len >= 2 ? esc(g.short) : ''}</span>`).join('');
  const label = segs.map((g) => `${g.name} ${span(g)}`).join(', ');
  return `<div class="cal" role="img" aria-label="${esc(label)}"><div class="cal-years" ${cols}>${years}</div>${months}<div class="cal-row" ${cols}>${row}</div></div>`;
}

const list = (items) => `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;

function card(c, cur, ctx, best) {
  const t = explain(c, cur.ev, ctx), score = Math.round(c.total * 100), d = score - Math.round(cur.total * 100);
  const delta = !c.kind ? '' : d > 0 ? `<span class="up">▲ ${d} better than now</span>` : d < 0 ? `<span class="down">▼ ${-d} lower than now</span>` : '<span>same as now</span>';
  const metrics = METRICS.map((k) => {
    const v = Math.round(c.ev.scores[k] * 100), dv = v - Math.round(cur.ev.scores[k] * 100);
    const ch = !c.kind || dv === 0 ? '' : ` <span class="${dv > 0 ? 'up' : 'down'}">${dv > 0 ? '+' : '−'}${Math.abs(dv)}</span>`;
    return `<div class="metric"><span>${esc(LABELS[k])}</span><span class="track"><i style="width:${v}%"></i></span><span class="n">${v}${ch}</span></div>`;
  }).join('');
  const chips = (items, cls) => (items.length ? `<ul class="chips">${items.map((x) => `<li class="${cls}">${esc(x)}</li>`).join('')}</ul>` : '');
  const evidenceItem = (e) => `<li>${esc(e.text)}<span class="src">${esc(e.source)} · confidence: <span class="conf">${esc(e.conf)}</span></span></li>`;
  const { level, reasons } = t.confidence;
  return `<article class="card${c.kind ? '' : ' current'}${best ? ' best' : ''}">
    <span class="tag">${c.kind ? (best ? 'Best fit for your priorities' : KIND_TAG[c.kind]) : 'Baseline'}</span>
    <span class="badge ${level.toLowerCase()}">Confidence: ${level}</span>
    <h3>${esc(t.title)}</h3><p class="lead">${esc(t.lead)}</p>
    <h4>Replayed on ${ctx.mo.years[0]}–${ctx.mo.years.at(-1)} weather</h4>${list(t.headline)}
    <div class="total"><b>${score}</b><span>/ 100</span>${delta}</div>
    ${calendar(c.ev, ctx.mo.shift)}${metrics}
    <h4>Why suggested</h4>${list(t.why)}
    <h4>Evidence</h4><ul>${t.evidence.slice(0, 3).map(evidenceItem).join('')}</ul>
    <details><summary>Worst years and the numbers used</summary>
      ${t.worst.map((w) => `<p class="worst"><b>${esc(w.crop)}</b>: three worst flowering seasons (${esc(w.window)})</p>${list(w.seasons)}<p class="src">${esc(w.used)}</p>`).join('')}
      <p class="worst"><b>Other evidence</b></p><ul>${t.evidence.slice(3).map(evidenceItem).join('')}</ul>
    </details>
    <h4>Benefits</h4>${chips(t.benefits, 'up') || '<p class="none">None stands out for these priorities.</p>'}
    ${t.tradeoffs.length ? `<p class="none">Trade-offs</p>${chips(t.tradeoffs, 'down')}` : ''}
    <h4>Information gaps</h4>${list([`Confidence is ${level.toLowerCase()}. ${reasons.join(' ')}`, ...t.gaps])}
    <h4>Risks needing local review</h4>${list(t.risks.length ? t.risks : ['The replay flags no specific risk. Still review any change with a local agronomist.'])}
    </article>`;
}

function renderStrategies() {
  if (!state.power) return;
  const rainPct = +$('sc-rain').value, dT = +$('sc-temp').value;
  $('rain-out').textContent = rainPct ? `${rainPct > 0 ? '+' : '−'}${Math.abs(rainPct)}%` : 'no change';
  $('temp-out').textContent = dT ? `+${dT} °C` : 'no change';
  const note = $('scenario-note');
  note.hidden = !(rainPct || dT);
  note.textContent = `What-if scenario on: rainfall ${$('rain-out').textContent}, temperature ${$('temp-out').textContent}. Scores below use the adjusted weather.`;

  renderRibbon(); // the crop bands on the ribbon follow the rotation
  const current = { crops: state.crops, cover: $('cover').checked }, lay = layout(current);
  if (!lay.feasible) {
    const i = lay.clash[0], a = CROPS[state.crops[i]].name, b = CROPS[state.crops[(i + 1) % state.crops.length]].name;
    $('cards').innerHTML = `<p class="warn">This order does not fit the calendar: ${esc(b)} has to be sown before ${esc(a)} is harvested. Change one of them, or put another crop between them.</p>`;
    return;
  }
  const { p, lat, elev } = state.power;
  const mo = rainPct || dT ? toMonthly(p, lat, { rain: 1 + rainPct / 100, dT }, elev) : state.base;
  const irrigated = $('irrigated').checked;
  const ctx = { mo, clim: summarize(mo).clim, soil: $('soil').value, slope: $('slope').value, lat, irrigated };
  // Constraints: an irrigated field takes the rain-only water count out of the total; forage crops
  // are only offered when there is livestock or a hay buyer. Sliders only re-weight computed scores.
  $('w-water').disabled = irrigated;
  const weights = Object.fromEntries(METRICS.map((k) => [k, k === 'water' && irrigated ? 0 : +$(`w-${k}`).value]));
  const weightSum = METRICS.reduce((s, k) => s + weights[k], 0);
  for (const k of METRICS) $(`wo-${k}`).textContent = k === 'water' && irrigated ? 'not counted (irrigated)' : weightSum ? `${Math.round((100 * weights[k]) / weightSum)}% of the score` : '0%';
  const allowed = [...document.querySelectorAll('#allowed input:checked')].map((i) => i.value)
    .filter((id) => id in CROPS && ($('livestock').checked || !CROPS[id].forage));
  const { cur, alts } = suggest(current, allowed, ctx, weights);
  const top = alts.reduce((m, a) => (a.total > m.total ? a : m), cur);
  $('cards').innerHTML = [{ rot: current, ev: cur.ev, total: cur.total }, ...alts].map((c) => card(c, cur, ctx, c === top && c.kind)).join('') +
    (top === cur ? '<p class="warn">For these priorities, none of the alternatives scores higher than what you grow now.</p>' : '');
}

// ---------- events ----------
$('field-form').addEventListener('submit', (e) => { e.preventDefault(); loadField(); });
document.querySelector('.presets').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $('lat').value = b.dataset.lat; $('lon').value = b.dataset.lon;
  map.setView([+b.dataset.lat, +b.dataset.lon], 7);
  loadField();
});
map.on('click', (e) => {
  const p = e.latlng.wrap();
  $('lat').value = p.lat.toFixed(2); $('lon').value = p.lng.toFixed(2);
  loadField();
});
document.querySelector('.layers').addEventListener('change', setOverlay);
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
  renderStrategies();
});
$('rotation').addEventListener('click', (e) => {
  if (e.target.dataset.remove == null || state.crops.length === 1) return;
  state.crops = state.crops.filter((_, i) => i !== +e.target.dataset.remove);
  renderRotation(); renderStrategies();
});
$('add-year').addEventListener('click', () => {
  if (state.crops.length >= MAX_YEARS) return;
  state.crops = [...state.crops, 'wheat'];
  renderRotation(); renderStrategies();
});
for (const id of ['setup', 'soil', 'slope', 'irrigated']) $(id).addEventListener('input', (e) => { if (!e.target.closest('#rotation')) renderStrategies(); });

buildControls();
loadField();
