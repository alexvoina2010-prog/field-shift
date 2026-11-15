// The decision table: one row per option, current rotation included, in the farmer's goal order.
// A table on wide screens; each row becomes a compact card on a phone (labels from data-label).
import { CROPS } from '../src/model/crops.js';
import { HEAT_DAYS, STRESS_SHARE } from '../src/model/rotation.js';
import { GOALS, troubleCount, newMachinery, workloadOf } from '../src/model/goals.js';
import { money, signed, CURRENCY } from './money-ui.js';
import { title } from './explain.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const lc = (id) => CROPS[id].name.toLowerCase();
const PER = 26; // bad seasons are shown per 26, the length of the record

/** What changes on the farm, as a short verb phrase. */
export function change(c) {
  if (!c.kind) return 'Nothing: what you grow now';
  if (c.kind === 'swap') return `Grow ${lc(c.id)} instead of ${lc(c.old)} on one block`;
  if (c.kind === 'cover') return 'Sow a cover crop in the long bare gaps';
  return `Add a year of ${lc(c.id)}, in ${c.rot.crops.length} blocks instead of ${c.rot.crops.length - 1}`;
}

const per26 = (k, total) => (total ? Math.round((PER * k) / total) : 0);

/** Extra work against now: new machinery first, then a change in workload. */
export function extraWork(c, current, owned = []) {
  if (!c.kind) return { text: 'As now', more: 0 };
  const machines = newMachinery(c.rot, current, owned), dw = workloadOf(c.rot) - workloadOf(current);
  const parts = [];
  if (machines.length) parts.push(`needs a ${machines.join(', a ')}`);
  if (c.kind === 'cover') parts.push('one extra sowing after harvest');
  if (dw >= 0.25) parts.push('a bit more work'); else if (dw <= -0.25) parts.push('a bit less work');
  return { text: parts.length ? parts.join('; ').replace(/^./, (m) => m.toUpperCase()) : 'Same machinery and work', more: machines.length + (c.kind === 'cover') + (dw >= 0.25) - (dw <= -0.25) };
}

// Money deltas are rounded to 100 lei like the figures; counts are whole seasons.
const delta = (v, base, higherBetter = true, isMoney = true) => {
  const d = v - base, good = higherBetter ? d > 0 : d < 0;
  if (isMoney ? Math.round(d / 100) === 0 : d === 0) return '<span class="dl same">= now</span>';
  return `<span class="dl ${good ? 'up' : 'down'}">${good ? '▲' : '▼'} ${isMoney ? signed(d) : `${d > 0 ? '+' : '−'}${Math.abs(d)}`}</span>`;
};

/** One-line reason the first option is first, in the farmer's own goals. */
export function reason(top, now, goals, owned = []) {
  if (!top.kind) return 'None of the alternatives beats what you grow now on what you picked.';
  const lead = goals[0];
  const why = {
    profit: `${money(top.money.normal)} in a normal year against ${money(now.money.normal)} now`,
    steady: `${money(top.money.bad)} in a bad year against ${money(now.money.bad)} now, a loss in ${top.money.lossYears} of ${top.money.n} years instead of ${now.money.lossYears}`,
    work: extraWork(top, now.rot, owned).text.toLowerCase(),
    soil: 'more legume years or less bare soil than now',
    water: 'fewer seasons short of water at flowering',
  };
  return lead ? `Best for ${GOALS[lead].toLowerCase()}: ${why[lead]}.` : `Best on the five model scores together (no goal picked): ${title(top).title.toLowerCase()}.`;
}

/**
 * @param {object[]} options sorted, with .money; @param {object} now the current rotation's row
 * @param {string[]} goals picked goals @returns {string} HTML
 */
export function decisionTable(options, now, goals, owned = []) {
  const t0 = troubleCount(now.ev, HEAT_DAYS, STRESS_SHARE);
  const rows = options.map((c, i) => {
    const t = troubleCount(c.ev, HEAT_DAYS, STRESS_SHARE), w = extraWork(c, now.rot, owned), best = i === 0 && c.kind;
    const bad = per26(t.any, t.total), bad0 = per26(t0.any, t0.total);
    return `<tr class="${c.kind ? '' : 'now'}${best ? ' best' : ''}">
      <th scope="row" data-label="Option"><a href="#plan" data-plan="${i}">${esc(title(c).title)}</a>${c.kind ? '' : ' <em>You now</em>'}${best ? ' <em class="pick">Best match</em>' : ''}</th>
      <td data-label="What changes on your farm" class="txt"><span class="v">${esc(change(c))}</span></td>
      <td data-label="Bad seasons, of ${PER}"><span class="v"><b>${bad}</b> ${c.kind ? delta(bad, bad0, false, false) : ''}<small>heat ${per26(t.heat, t.total)} · water ${per26(t.water, t.total)}</small></span></td>
      <td data-label="Profit, normal year"><span class="v"><b>${money(c.money.normal)}</b> ${c.kind ? delta(c.money.normal, now.money.normal) : ''}</span></td>
      <td data-label="Profit, bad year"><span class="v"><b>${money(c.money.bad)}</b> ${c.kind ? delta(c.money.bad, now.money.bad) : ''}<small>loss in ${c.money.lossYears} of ${c.money.n} years</small></span></td>
      <td data-label="Extra work" class="txt"><span class="v">${esc(w.text)}</span></td>
    </tr>`;
  }).join('');
  return `<p class="reason">${esc(reason(options[0], now, goals, owned))}</p>
    <table class="decide">
      <thead><tr><th scope="col">Option</th><th scope="col">What changes on your farm</th><th scope="col">Bad seasons (heat or water at flowering), of ${PER}</th>
      <th scope="col">Profit, normal year</th><th scope="col">Profit, bad year (worst one in five)</th><th scope="col">Extra work</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <p class="src">Profit: your estimate for the whole farm in ${CURRENCY}, using your numbers and NASA weather. Not a price forecast. Example values until you change them under "Your costs and prices". Bad seasons: crop seasons in the replay with a heatwave or a water shortage at flowering, scaled to ${PER}. ▲ better than now, ▼ worse than now. Tap an option to see its plan.</p>`;
}
