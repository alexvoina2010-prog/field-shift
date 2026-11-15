// "Your plan": first step this season, what changes, the season-by-season timeline per block, and the
// questions for the agronomist. All dates come from the crop calendar in data/crops.json.
import { CROPS } from '../src/model/crops.js';
import { timeline, seasonOf, isChange } from '../src/model/plan.js';
import { monthName, title } from './explain.js';
import { change } from './table.js';
import { moneyBlock } from './money-ui.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const lc = (id) => CROPS[id].name.toLowerCase();
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const RISKY = 0.4; // a crop flagged at flowering when heat or water trouble hit at least this share of seasons
const ha = (v) => `${Math.round(v * 10) / 10} ha`;

// Short cell text and the sentence form of one event.
const VERB = { sow: 'Sow', harvest: 'Harvest', flower: 'Flowers', grow: 'Growing', 'sow-cover': 'Sow cover crop', cover: 'Cover crop', bare: 'Bare soil' };
const cellText = (e, shift) => `${VERB[e.type]}${e.id ? ` ${lc(e.id)}` : ''}${e.month && e.type !== 'grow' ? ` · ${monthName(e.month - 1, shift)}` : ''}`;

/** Crops of this rotation that flowered in trouble often, with the counts that say so. */
function riskyCrops(c) {
  const out = {};
  c.rot.crops.forEach((id, i) => {
    const w = c.ev.facts.crops[i];
    if (!w.n) return;
    if (w.hot / w.n >= RISKY) out[id] = `${CROPS[id].name} flowered in a heatwave in ${w.hot} of ${w.n} seasons here.`;
    else if (w.dry / w.n >= RISKY) out[id] = `${CROPS[id].name} was short of water at flowering in ${w.dry} of ${w.n} seasons here.`;
  });
  return out;
}

/** Agronomist questions: every crop the farm does not grow now, then crops that often flowered in trouble. */
export function questions(c, current) {
  const risky = riskyCrops(c), out = [];
  for (const id of new Set(c.rot.crops)) {
    if (!current.crops.includes(id)) out.push({ id, text: `${CROPS[id].name} (new on your farm): ${CROPS[id].ask} ${CROPS[id].risk}` });
    else if (risky[id]) out.push({ id, text: `${risky[id]} Ask: an earlier variety or sowing date, or a crop that flowers outside the hottest, driest weeks?` });
  }
  if (c.rot.cover && !current.cover) out.push({ id: 'cover', text: 'Cover crops: which mix and sowing date suit your autumn rain, and when should it be ended before the next crop?' });
  return out;
}

/** "First step this season": the actions of the current season, block by block. */
export function firstStep(plan, c, current, month0, shift) {
  const m = (month0 + shift) % 12, si = seasonOf(m), row = plan.rows[si], nowPos = row.season.months.indexOf(m + 1);
  const items = row.cells.flatMap((events, b) => events.filter((e) => ['sow', 'harvest', 'sow-cover'].includes(e.type)).map((e) => {
    const past = row.season.months.indexOf(e.month) < nowPos;
    const when = `${MONTHS[(e.month - 1 - shift + 12) % 12]}`, crop = e.id ? lc(e.id) : 'a cover crop';
    const what = e.type === 'harvest'
      ? (past ? `${crop} should be harvested by now (${when})` : `harvest ${crop} in ${when}`)
      : (past ? `${crop} should be sown by now (${when})` : `sow ${crop} in ${when}`);
    return `Block ${plan.blocks[b].id}: ${what}${isChange(e, current) ? ' (new)' : ', as now'}.`;
  }));
  // Blocks with nothing to do this season: say what comes next on them.
  const idle = row.cells.map((events, b) => {
    if (!events.every((e) => ['bare', 'grow', 'cover', 'flower'].includes(e.type))) return null;
    const next = plan.rows.slice(si + 1).flatMap((r) => r.cells[b].map((e) => ({ e, r }))).find(({ e }) => e.type === 'sow' || e.type === 'harvest');
    const state = events[0].type === 'bare' ? 'stubble or bare soil' : `${lc(events[0].id || '') || 'crop'} growing`;
    return `Block ${plan.blocks[b].id}: ${state}${next ? `, until you ${next.e.type} ${lc(next.e.id)} in ${MONTHS[(next.e.month - 1 - shift + 12) % 12]} ${next.r.label.match(/\d{4}$/)?.[0] ?? ''}`.trimEnd() : ''}.`;
  }).filter(Boolean);
  return { label: row.label.replace(/ \d.*/, '').toLowerCase(), items, idle };
}

/** First season each block meets the change, in words. */
function changes(plan, c, current, shift) {
  const out = [];
  plan.blocks.forEach((blk, b) => {
    for (const [ri, row] of plan.rows.entries()) {
      const e = row.cells[b].find((x) => (x.type === 'sow' || x.type === 'sow-cover') && isChange(x, current));
      if (!e) continue;
      const harvest = plan.rows.flatMap((r) => r.cells[b]).find((x) => x.type === 'harvest' && x.id === e.id);
      const what = e.type === 'sow-cover' ? 'cover crop after harvest' : `${CROPS[e.id].name.toLowerCase()}${c.kind === 'swap' ? ` instead of ${lc(c.old)}` : ''}`;
      out.push({ ri, text: `${row.label}, Block ${blk.id}: ${what}. Sow in ${MONTHS[(e.month - 1 - shift + 12) % 12]}${harvest ? `, harvest in ${MONTHS[(harvest.month - 1 - shift + 12) % 12]}` : ''}.` });
      break;
    }
  });
  return out.sort((a, b) => a.ri - b.ri).map((x) => x.text);
}

/** Steppers to resize blocks; the total stays the farm size. */
const steppers = (plan, step) => `<div class="steppers">${plan.blocks.map((b, i) => `<div class="stepper"><span>Block ${b.id} <b>${ha(b.ha)}</b></span>
  <button type="button" data-block="${i}" data-ha="${-step}" aria-label="Block ${b.id}: ${step} ha smaller">−</button>
  <button type="button" data-block="${i}" data-ha="${step}" aria-label="Block ${b.id}: ${step} ha larger">+</button></div>`).join('')}</div>
  <p class="hint">Blocks start equal. Change their sizes with − and +: the farm total stays ${ha(plan.blocks.reduce((s, b) => s + b.ha, 0))} and the money above updates.</p>`;

/** Block strips: widths proportional to hectares, labelled with this year's crop. */
export function strips(plan, rot, year, startYear) {
  const n = rot.crops.length, total = plan.blocks.reduce((s, b) => s + b.ha, 0) || 1;
  return `<div class="strips" role="img" aria-label="${esc(plan.blocks.map((b, i) => `Block ${b.id}, ${ha(b.ha)}: ${CROPS[rot.crops[(i + year - startYear) % n]].name}`).join('; '))}">${
    plan.blocks.map((b, i) => {
      const id = rot.crops[(((i + year - startYear) % n) + n) % n];
      return `<div class="strip ${CROPS[id].legume ? 'legume' : 'crop'}" style="flex:${b.ha / total}"><b>${b.id}</b><span>${esc(CROPS[id].name)}</span><small>${ha(b.ha)}</small></div>`;
    }).join('')}</div>`;
}

/**
 * @param {object} c the option (with .rot, .ev, .money); @param {object} now the current rotation's row
 * @param {{blockHa:number[], startYear:number, month0:number, shift:number, area:number}} o
 */
export function planHtml(c, now, o) {
  const plan = timeline(c.rot, o.blockHa, o.startYear), current = now.rot, n = c.rot.crops.length;
  const first = firstStep(plan, c, current, o.month0, o.shift), ch = changes(plan, c, current, o.shift);
  const qs = questions(c, current), risky = riskyCrops(c), ask = new Set(qs.map((q) => q.id));
  const head = plan.rows.length ? `<tr><th scope="col">Season</th>${plan.blocks.map((b) => `<th scope="col">Block ${b.id}<small>${ha(b.ha)}</small></th>`).join('')}</tr>` : '';
  const body = plan.rows.map((r, ri) => `<tr class="${r.season.key}${ri === seasonOf((o.month0 + o.shift) % 12) ? ' now' : ''}"><th scope="row">${esc(r.label)}</th>${
    r.cells.map((events) => `<td>${events.map((e) => {
      const chg = isChange(e, current), warn = (chg && ['sow', 'sow-cover'].includes(e.type)) || (e.type === 'flower' && risky[e.id] && ask.has(e.id));
      return `<span class="ev ${e.type}${chg ? ' chg' : ''}">${esc(cellText(e, o.shift))}${warn ? ' <b class="warn-mark" title="Check with your agronomist">⚠</b>' : ''}</span>`;
    }).join('')}</td>`).join('')}</tr>`).join('');
  return `
    <p class="plan-kicker">${esc(title(c).title)}</p>
    <h2 tabindex="-1" id="plan-title">Your plan</h2>
    <p class="plan-change">${esc(change(c))}.</p>
    <section class="plan-first" aria-labelledby="first-h"><h3 id="first-h">First step this ${esc(first.label)}</h3>
      ${first.items.length ? `<ul>${first.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p>No sowing or harvest this season. Check the blocks below.</p>'}
      ${first.idle.length ? `<p class="hint">${first.idle.map(esc).join(' ')}</p>` : ''}
      ${ch.length ? `<p class="plan-next"><b>First change:</b> ${esc(ch[0])}</p>` : ''}</section>
    <p class="hint plan-blocks">Your ${Math.round(o.area)} ha become ${n} blocks${o.equal ? ` of ${ha(o.area / n)}` : ''}. Each block is one year ahead of the next, so every year you grow every crop of the rotation, as most farms do.</p>
    ${strips(plan, c.rot, o.startYear, o.startYear)}
    <p class="hint">This year (${o.startYear} harvest).</p>
    ${moneyBlock(c.money, o.area, c.kind ? now.money : null)}
    ${o.step ? steppers(plan, o.step) : ''}
    ${ch.length ? `<h3>What changes against now</h3><ul class="plan-changes">${ch.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<h3>What changes against now</h3><p>Nothing: this is what you grow now, laid out block by block.</p>'}
    <h3>Season by season</h3>
    <div class="plan-scroll"><table class="plan-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <ul class="legend"><li><span class="sw chg"></span>Changes against now</li><li>⚠ Check with your agronomist (below)</li><li>Months are typical for temperate Europe; set your own under "Tell us more".</li></ul>
    <h3>⚠ Check with your agronomist</h3>
    ${qs.length ? `<ul class="todo">${qs.map((q) => `<li>${esc(q.text)}</li>`).join('')}</ul>` : '<p>No new crop and no crop that often flowered in trouble. Still review the plan with a local agronomist.</p>'}
    <p class="src">A plan laid out from the crop calendar, not advice. This tool supports, it does not replace, your judgment or a local agronomist.</p>`;
}

/** The farm this year under one option, as block strips (results page). */
export const farmStrips = (c, blockHa, startYear) => strips(timeline(c.rot, blockHa, startYear), c.rot, startYear, startYear);

/** Plain-text plan for WhatsApp. */
export function planText(c, now, o) {
  const plan = timeline(c.rot, o.blockHa, o.startYear);
  const first = firstStep(plan, c, now.rot, o.month0, o.shift), ch = changes(plan, c, now.rot, o.shift);
  return [`Plan: ${change(c)}.`, `This ${first.label}: ${first.items.join(' ')}`, ...ch, ...questions(c, now.rot).map((q) => `Ask: ${q.text}`)].join('\n');
}
