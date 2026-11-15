// Climate flags: crops that rarely suited this field in the replay. A flag is a warning with a
// computed reason; the crop stays selectable. Each crop is replayed on its own (one-crop rotation).
// Heat alone is not flagged: the heat limits are assumptions, and a heat-only rule flagged winter
// wheat in Bărăgan and Kansas, two of the main wheat regions of their continents.
import { CROPS } from './crops.js';
import { evaluate, HEAT_DAYS, STRESS_SHARE } from './rotation.js';

// One place for the thresholds; How it works lists them from here.
export const FLAG_RULES = {
  heatDry: { share: 0.7, text: 'a heatwave and a water shortage in the same flowering season, in at least 70 % of seasons (rain-fed fields)' },
  heat: { share: 0.95, text: 'a heatwave at flowering in at least 95 % of seasons (irrigated fields)' },
  frost: { share: 0.5, text: 'frost in the month after sowing in at least 50 % of seasons (frost-sensitive crops)' },
  cool: { tmax: 15, share: 0.5, text: 'flowering-month days averaging under 15 °C in at least 50 % of seasons (season too short or cool)' },
};

/**
 * @param {object} ctx { mo, clim, soil, slope } on the recorded weather
 * @param {boolean} irrigated water shortage does not count on an irrigated field
 * @returns {Record<string, {rule:string, reason:string}|null>}
 */
export function cropFlags(ctx, irrigated = false) {
  return Object.fromEntries(Object.keys(CROPS).map((id) => {
    const ev = evaluate({ crops: [id], cover: false }, ctx), w = ev?.facts.crops[0];
    if (!w || !w.n) return [id, null];
    const of = (k) => `${k} of ${w.n}`, summer = CROPS[id].flower.every((m) => m >= 6 && m <= 8) ? 'summers' : 'seasons';
    const hot = (s) => s.hot >= HEAT_DAYS, dry = (s) => s.stress >= STRESS_SHARE * s.days;
    const both = w.list.filter((s) => hot(s) && dry(s)).length, cool = w.list.filter((s) => s.tmax < FLAG_RULES.cool.tmax).length;
    if (!irrigated && both / w.n >= FLAG_RULES.heatDry.share) return [id, { rule: 'heatDry', reason: `too hot and too dry at flowering in ${of(both)} ${summer}` }];
    if (irrigated && w.hot / w.n >= FLAG_RULES.heat.share) return [id, { rule: 'heat', reason: `too hot at flowering in ${of(w.hot)} ${summer}` }];
    if (w.frost / w.n >= FLAG_RULES.frost.share) return [id, { rule: 'frost', reason: `frost after sowing in ${of(w.frost)} seasons` }];
    if (cool / w.n >= FLAG_RULES.cool.share) return [id, { rule: 'cool', reason: `too cool at flowering in ${of(cool)} seasons` }];
    return [id, null];
  }));
}
