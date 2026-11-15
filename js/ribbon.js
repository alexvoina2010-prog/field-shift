// AI disclosure: written with Claude Code (Anthropic AI coding assistant) under the author's direction; see AI-USAGE.md.
// Climate ribbon: one square per month of the record, coloured by one hazard at a time. The
// current rotation's crop calendar sits on top, so bare and flowering months line up with bad ones.
import { CROPS } from '../src/model/crops.js';
import { HOT_DAY, HEAVY_RAIN } from '../src/model/climate.js';
import { monthName, cropLabel } from './explain.js';

const hotDays = (m) => m.tmax.filter((t) => t >= HOT_DAY).length;

// cuts: upper edges of colour levels 0-3; anything above the last cut is level 4 (darkest).
export const HAZARDS = {
  deficit: { cuts: [0, 40, 80, 120], unit: ' mm', value: (m) => Math.max(0, Math.round(m.et0 - m.rain)),
    legend: 'Water shortfall: what a well-watered crop could use minus the rain that fell, mm in the month' },
  heat: { cuts: [0, 3, 7, 14], unit: '', value: hotDays, legend: `Days of ${HOT_DAY} °C or more in the month` },
  frost: { cuts: [0, 5, 12, 20], unit: '', value: (m) => m.frostDays, legend: 'Days with frost (night below 0 °C) in the month' },
  rain: { cuts: [0, 1, 2, 3], unit: '', value: (m) => m.r10, legend: `Days with ${HEAVY_RAIN} mm of rain or more in the month` },
};
const level = (v, cuts) => cuts.filter((c) => v > c).length;
const binLabels = ({ cuts, unit }) => cuts.map((c, i) => (i === 0 ? `${c}` : cuts[i - 1] + 1 === c ? `${c}` : `${cuts[i - 1] + 1}–${c}`))
  .concat(`over ${cuts.at(-1)}`).map((t) => t + unit);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Plain sentence for one month of the record; t = index into mo.m.
export function cellText(mo, t) {
  const m = mo.m[t];
  return `${monthName(t % 12, mo.shift)} ${mo.years[Math.floor(t / 12)]}: ${Math.round(m.rain)} mm of rain, a well-watered crop could use ${Math.round(m.et0)} mm. ` +
    `${hotDays(m)} days of ${HOT_DAY} °C or more, ${m.frostDays} frost days, ${m.r10} heavy-rain days.`;
}

// One row per rotation year: what is in the ground each month, plus a row marking flowering months.
function bands(lay, shift) {
  if (!lay.feasible) return '';
  const rows = lay.crops.map((_, i) => {
    const segs = [];
    for (let m = 0; m < 12; m++) {
      const s = lay.slots[i * 12 + m];
      const it = !s ? { key: 'bare', cls: 'bare', name: 'Bare soil' }
        : s.cover ? { key: 'cover', cls: 'cover', name: 'Cover crop' }
        : { key: `c${s.i}`, cls: CROPS[lay.crops[s.i]].legume ? 'legume' : 'crop', name: CROPS[lay.crops[s.i]].name, id: lay.crops[s.i] };
      const last = segs.at(-1);
      if (last && last.key === it.key) last.len++; else segs.push({ ...it, start: m, len: 1 });
    }
    return `<div class="rb-row"><span class="rb-y">Year ${i + 1}</span>${segs.map((g) =>
      `<span class="seg ${g.cls}" style="grid-column:span ${g.len}" title="${esc(g.name)}: ${monthName(g.start, shift)}–${monthName(g.start + g.len - 1, shift)}">${g.id ? cropLabel(g.id)[g.len >= 3 ? 1 : 0] : g.key === 'cover' && g.len >= 2 ? 'Cover' : ''}</span>`).join('')}</div>`;
  });
  const flowering = Array.from({ length: 12 }, (_, m) => [...new Set(lay.crops)].filter((id) => CROPS[id].flower.includes(m + 1)).map((id) => CROPS[id].name));
  rows.push(`<div class="rb-row rb-flower"><span class="rb-y">Flowering</span>${flowering.map((names) =>
    (names.length ? `<span title="Flowering: ${esc(names.join(', '))}">●</span>` : '<span></span>')).join('')}</div>`);
  return rows.join('');
}

// mo = monthly record, lay = layout of the current rotation, key = one of HAZARDS.
export function ribbon(mo, lay, key) {
  const h = HAZARDS[key], shift = mo.shift, labels = binLabels(h);
  const months = Array.from({ length: 12 }, (_, m) => monthName(m, shift));
  const flowers = (m) => lay.feasible && lay.crops.some((id) => CROPS[id].flower.includes(m + 1)); // the ● months
  const cells = mo.years.map((year, y) => `<div class="rb-row"><span class="rb-y">${year}</span>${months.map((name, m) => {
    const v = h.value(mo.m[y * 12 + m]);
    return `<span class="rb-c l${level(v, h.cuts)}${flowers(m) ? ' fl' : ''}" data-t="${y * 12 + m}" title="${name} ${year}: ${v}${h.unit}"></span>`;
  }).join('')}</div>`).join('');
  const table = `<table><thead><tr><th>Year</th>${months.map((n) => `<th>${n}</th>`).join('')}</tr></thead><tbody>${
    mo.years.map((year, y) => `<tr><td>${year}</td>${months.map((_, m) => `<td>${h.value(mo.m[y * 12 + m])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return `<ul class="legend" aria-label="Colour scale"><li>${esc(h.legend)}:</li>${
    labels.map((t, i) => `<li><span class="sw rb-c l${i}"></span>${t}</li>`).join('')}</ul>
    <div class="ribbon h-${key}" role="img" aria-label="${esc(h.legend)}, for every month of ${mo.years[0]} to ${mo.years.at(-1)}. The table below has the numbers.">
      ${bands(lay, shift)}
      <div class="rb-row rb-head" aria-hidden="true"><span></span>${months.map((n) => `<span>${n[0]}</span>`).join('')}</div>
      ${cells}
    </div>
    <details class="more"><summary>View detailed monthly data</summary><div class="rb-table">${table}</div></details>`;
}
