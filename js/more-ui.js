// "Tell us more about your farm": optional inputs, each tied to the one confidence area it informs.
import { CROPS } from '../src/model/crops.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const AREAS = { weather: 'Weather', soil: 'Soil', money: 'Money', calendar: 'Calendar' };

// Pests and diseases a farmer may have seen, with the crops they hit. Notes are general agronomy (assumption).
export const PESTS = {
  broomrape: { name: 'Broomrape', crops: ['sunflower'], note: 'You have seen broomrape: sunflower on an infested block needs a tolerant hybrid, and a longer gap between sunflowers.' },
  sclerotinia: { name: 'White mould (Sclerotinia)', crops: ['sunflower', 'rapeseed', 'soybean', 'pea', 'chickpea'], note: 'You have seen white mould: it survives in the soil for years and hits sunflower, rapeseed and the legumes. Keep these crops apart in the rotation.' },
  ascochyta: { name: 'Ascochyta blight', crops: ['chickpea', 'pea'], note: 'You have seen Ascochyta: chickpea and pea need clean seed, a tolerant variety and a fungicide plan for wet springs.' },
  rootworm: { name: 'Western corn rootworm', crops: ['maize'], note: 'You have seen corn rootworm: maize after maize feeds it; rotation is the main control.' },
  rootrot: { name: 'Pea root rot (Aphanomyces)', crops: ['pea'], note: 'You have seen pea root rot: it stays in the soil for many years. Ask whether peas should be grown on that block at all.' },
};

/** Machinery used by any crop in the table. */
export const ALL_MACHINES = [...new Set(Object.values(CROPS).flatMap((c) => c.machinery))];

/** Notes an option gets from the farmer's pest checklist and soil test. */
export function farmNotes(rot, more) {
  const out = [];
  for (const key of more.pests || []) {
    const p = PESTS[key];
    if (p && rot.crops.some((id) => p.crops.includes(id))) out.push(p.note);
  }
  const { ph, om } = more.soil || {}, legumes = rot.crops.filter((id) => CROPS[id].legume).map((id) => CROPS[id].name.toLowerCase());
  if (Number.isFinite(ph) && ph < 5.8 && legumes.length) out.push(`Your soil pH is ${ph}: ${legumes.join(' and ')} ${legumes.length > 1 ? 'fix' : 'fixes'} less nitrogen in acid soil. Ask about liming before sowing them.`);
  if (Number.isFinite(ph) && ph > 8 && rot.crops.includes('soybean')) out.push(`Your soil pH is ${ph}: soybean can turn yellow (iron chlorosis) on soils this alkaline. Ask about a tolerant variety.`);
  if (Number.isFinite(om) && om < 1.5) out.push(`Your organic matter is ${om} %, which is low: crops that leave residue, legumes and cover crops help most. Months of bare soil cost the most here.`);
  return out;
}

/** The four meters, with what moved since the last render. */
export function meters(conf, changed) {
  return `<ul class="meters">${Object.entries(AREAS).map(([k, name]) => {
    const c = conf[k], lv = c.level.toLowerCase();
    return `<li class="meter ${lv}"><span class="m-name">${name}</span><span class="m-bar" aria-hidden="true"><i></i><i></i><i></i></span>
      <b>${c.level}</b><span class="m-why">${esc(c.reason)}${c.next ? ` <em>${esc(c.next)}</em>` : ''}</span></li>`;
  }).join('')}</ul>${changed.length ? `<p class="m-moved" role="status">${changed.map(esc).join(' ')}</p>` : ''}`;
}

/** Inputs for the crops shown; values come from the farmer's saved answers. */
export function moreInputs(more, crops) {
  const sow = (id) => `<label>${esc(CROPS[id].name)}<select data-more="sow" data-crop="${id}"><option value="">Typical (${MONTHS[CROPS[id].sow - 1]})</option>${
    MONTHS.map((m, i) => `<option value="${i + 1}"${more.sow?.[id] === i + 1 ? ' selected' : ''}>${m}</option>`).join('')}</select></label>`;
  return `
    <fieldset><legend>Usual sowing month <span class="src">sets the dates in your plan (Calendar)</span></legend><div class="more-grid">${crops.map(sow).join('')}</div></fieldset>
    <fieldset><legend>Soil test <span class="src">adds notes to each option (Soil); the water balance keeps your soil type</span></legend><div class="more-grid">
      <label>Organic matter, % <input type="number" inputmode="decimal" min="0" max="20" step="0.1" data-more="om" value="${more.soil?.om ?? ''}"></label>
      <label>pH <input type="number" inputmode="decimal" min="3" max="10" step="0.1" data-more="ph" value="${more.soil?.ph ?? ''}"></label></div></fieldset>
    <fieldset class="chips-pick"><legend>Machinery you own <span class="src">used for "Less work" and "Extra work"</span></legend><div>${
      ALL_MACHINES.map((m) => `<label><input type="checkbox" data-more="machine" value="${esc(m)}"${(more.machines || []).includes(m) ? ' checked' : ''}> ${esc(m)}</label>`).join('')}</div></fieldset>
    <fieldset class="chips-pick"><legend>Pests or diseases seen on your farm <span class="src">add questions to your plan</span></legend><div>${
      Object.entries(PESTS).map(([k, p]) => `<label><input type="checkbox" data-more="pest" value="${k}"${(more.pests || []).includes(k) ? ' checked' : ''}> ${esc(p.name)}</label>`).join('')}</div></fieldset>
    <p class="hint">Your costs and prices are under "Your costs and prices" above (Money).</p>`;
}

/** Applies one input to a copy of the answers; invalid values are dropped. */
export function applyMore(more, el) {
  const next = { machines: [...(more.machines || [])], pests: [...(more.pests || [])], sow: { ...(more.sow || {}) }, soil: { ...(more.soil || {}) } };
  const kind = el.dataset.more, v = parseFloat(el.value);
  if (kind === 'sow' && el.dataset.crop in CROPS) {
    if (Number.isInteger(v) && v >= 1 && v <= 12) next.sow[el.dataset.crop] = v; else delete next.sow[el.dataset.crop];
  } else if (kind === 'om' || kind === 'ph') {
    const ok = kind === 'om' ? v >= 0 && v <= 20 : v >= 3 && v <= 10;
    if (Number.isFinite(v) && ok) next.soil[kind] = v; else delete next.soil[kind];
  } else if (kind === 'machine' && ALL_MACHINES.includes(el.value)) {
    next.machines = el.checked ? [...new Set([...next.machines, el.value])] : next.machines.filter((m) => m !== el.value);
  } else if (kind === 'pest' && el.value in PESTS) {
    next.pests = el.checked ? [...new Set([...next.pests, el.value])] : next.pests.filter((p) => p !== el.value);
  }
  return next;
}

/** Saved answers are outside input: keep only known keys and sane numbers. */
export const sanitizeMore = (m) => {
  const blank = { machines: [], pests: [], sow: {}, soil: {} };
  if (!m || typeof m !== 'object') return blank;
  return [
    ...(Array.isArray(m.machines) ? m.machines.map((v) => ({ dataset: { more: 'machine' }, value: v, checked: true })) : []),
    ...(Array.isArray(m.pests) ? m.pests.map((v) => ({ dataset: { more: 'pest' }, value: v, checked: true })) : []),
    ...Object.entries(m.sow || {}).map(([id, v]) => ({ dataset: { more: 'sow', crop: id }, value: String(v) })),
    ...['om', 'ph'].filter((k) => m.soil?.[k] != null).map((k) => ({ dataset: { more: k }, value: String(m.soil[k]) })),
  ].reduce(applyMore, blank);
};
