// AI disclosure: written with Claude Code (Anthropic AI coding assistant) under the author's direction; see AI-USAGE.md.
// "Your costs and prices" panel and money formatting. Numbers come from src/model/money.js.
import { CROPS, SOURCES } from '../src/model/crops.js';
import { COST_KEYS, costTotal, exampleEcon } from '../src/model/money.js';

export const CURRENCY = 'lei'; // the one place the currency is named
export const ESTIMATE = 'Your estimate, using your numbers and NASA weather. Not a price forecast.';
export const EXAMPLE = 'Example values, change them to yours.';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const group = (n) => String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); // thin space between thousands
/** Whole-farm or per-hectare lei, rounded to 100 so it does not look more exact than it is. */
export const money = (v, step = 100) => `${v < 0 ? '−' : ''}${group(Math.round(Math.abs(v) / step) * step)} ${CURRENCY}`;
export const signed = (v) => (Math.round(v / 100) === 0 ? '±0' : `${v > 0 ? '+' : '−'}${group(Math.round(Math.abs(v) / 100) * 100)}`);

const COST_LABELS = { seed: 'Seed', fertiliser: 'Fertiliser', protection: 'Crop protection', machinery: 'Machinery and fuel', labour: 'Labour' };

/** The farmer's numbers for each crop id: their own where entered, the examples otherwise. */
export const econsFor = (overrides) => Object.fromEntries(Object.keys(CROPS).map((id) => {
  const ex = exampleEcon(id), o = overrides[id] || {};
  return [id, { ym: o.ym ?? ex.ym, price: o.price ?? ex.price, costs: { ...ex.costs, ...(o.costs || {}) } }];
}));

const isOwn = (overrides, id) => Boolean(overrides[id] && Object.keys(overrides[id]).length);

const field = (id, key, label, value, unit) => `<label>${esc(label)} <span class="unit">${unit}</span>
  <input type="number" inputmode="decimal" min="0" step="any" data-crop="${id}" data-key="${key}" value="${value}"></label>`;

/** One block of inputs per crop. ids = crops grown now or offered in an option. */
export function costsPanel(ids, overrides) {
  const econs = econsFor(overrides);
  return ids.map((id) => {
    const e = econs[id], own = isOwn(overrides, id);
    return `<fieldset class="econ" data-crop="${id}"><legend>${esc(CROPS[id].name)} <span class="src">${own ? 'your numbers' : 'example values'}</span></legend>
      <div class="econ-grid">
        ${field(id, 'ym', 'Yield with no water shortage', e.ym, 't/ha')}
        ${field(id, 'price', 'Price', e.price, `${CURRENCY}/t`)}
        ${COST_KEYS.map((k) => field(id, `costs.${k}`, COST_LABELS[k], e.costs[k], `${CURRENCY}/ha`)).join('')}
      </div>
      <p class="hint econ-sum" data-sum="${id}">${sumText(e)}</p></fieldset>`;
  }).join('');
}

export const sumText = (e) => `Costs ${money(costTotal(e))} per ha. With no water shortage: ${money(e.ym * e.price - costTotal(e))} per ha.`;

/**
 * Applies one edited input to a copy of the overrides. Empty or invalid input falls back to the example.
 * @returns {object} new overrides object
 */
export function applyInput(overrides, input) {
  const id = input.dataset.crop, key = input.dataset.key, v = parseFloat(input.value);
  if (!(id in CROPS)) return overrides;
  const cur = { ...(overrides[id] || {}), costs: { ...(overrides[id]?.costs || {}) } };
  const ok = Number.isFinite(v) && v >= 0;
  if (key.startsWith('costs.')) {
    const k = key.slice(6);
    if (!COST_KEYS.includes(k)) return overrides;
    if (ok) cur.costs[k] = v; else delete cur.costs[k];
  } else if (key === 'ym' || key === 'price') {
    if (ok) cur[key] = v; else delete cur[key];
  }
  if (!Object.keys(cur.costs).length) delete cur.costs;
  const next = { ...overrides, [id]: cur };
  if (!Object.keys(cur).length) delete next[id];
  return next;
}

export const moneySource = () => SOURCES.illustrative;

/** Keeps only known crops and non-negative numbers from saved overrides (localStorage is outside input). */
export function sanitizeEcon(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const out = {};
  for (const [id, o] of Object.entries(raw)) {
    if (!(id in CROPS) || !o || typeof o !== 'object') continue;
    const e = {}, costs = {};
    if (num(o.ym) !== undefined) e.ym = o.ym;
    if (num(o.price) !== undefined) e.price = o.price;
    for (const k of COST_KEYS) if (num(o.costs?.[k]) !== undefined) costs[k] = o.costs[k];
    if (Object.keys(costs).length) e.costs = costs;
    if (Object.keys(e).length) out[id] = e;
  }
  return out;
}

/** Whole-farm money for one option card. */
export function moneyBlock(m, ha, now) {
  const d = (v, base) => (now ? ` <small>${v >= base ? '▲' : '▼'} ${money(Math.abs(v - base))} vs now</small>` : '');
  return `<div class="money"><p class="money-k">Whole farm, ${Math.round(ha)} ha</p>
    <dl><div><dt>Normal year</dt><dd>${money(m.normal)}${now ? d(m.normal, now.normal) : ''}</dd></div>
    <div><dt>Bad year (worst one in five)</dt><dd>${money(m.bad)}${now ? d(m.bad, now.bad) : ''}</dd></div>
    <div><dt>Years with a loss</dt><dd>${m.lossYears} of ${m.n}</dd></div></dl>
    <p class="src">${ESTIMATE} ${EXAMPLE}</p></div>`;
}
