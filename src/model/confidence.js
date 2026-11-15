// AI disclosure: written with Claude Code (Anthropic AI coding assistant) under the author's direction; see AI-USAGE.md.
// Confidence per area (Weather, Soil, Money, Calendar). Honesty rule: an input raises only the
// area it actually changes. Nothing the farmer types changes the NASA weather, so Weather never moves.

const LEVELS = ['Low', 'Medium', 'High'];

/**
 * @param {{crops:string[], econ:object, sow:object, soilTest:{om?:number, ph?:number}, lat:number}} x
 *   crops: every crop shown in the options; econ: the farmer's price/yield/cost overrides;
 *   sow: the farmer's usual sowing month per crop; soilTest: optional organic matter % and pH.
 * @returns {Record<'weather'|'soil'|'money'|'calendar', {level:string, reason:string, next?:string}>}
 */
export function areaConfidence(x) {
  const all = (pred) => x.crops.length > 0 && x.crops.every(pred);
  const ownMoney = all((id) => x.econ[id]?.price != null);
  const ownCosts = ownMoney && all((id) => x.econ[id]?.ym != null && x.econ[id]?.costs && Object.keys(x.econ[id].costs).length > 0);
  const ownSow = all((id) => Number.isInteger(x.sow[id]));
  const soilTest = Number.isFinite(x.soilTest?.om) || Number.isFinite(x.soilTest?.ph);
  const temperate = Math.abs(x.lat) >= 35 && Math.abs(x.lat) <= 60;
  return {
    weather: { level: 'Medium', reason: 'NASA POWER, one grid cell about 50 km wide, one rainfall source. Nothing you type changes the weather record.' },
    soil: soilTest
      ? { level: 'Medium', reason: 'Your soil test is noted against each option. The water balance still uses the soil type you picked.' }
      : { level: 'Low', reason: 'Only the soil type you picked is used.', next: 'Add a soil test (organic matter, pH).' },
    money: ownCosts
      ? { level: 'Medium', reason: 'Your own yields, prices and costs. Yield losses in bad years still come from the FAO-33 model, not your records.' }
      : ownMoney
        ? { level: 'Medium', reason: 'Your own prices; some yields or costs are still example values.', next: 'Add your yields and costs too.' }
        : { level: 'Low', reason: 'Example prices and costs, not yours.', next: 'Enter your price for every crop shown, under "Your costs and prices".' },
    calendar: ownSow
      ? { level: temperate ? 'Medium' : 'Low', reason: `Your sowing months set the plan dates. Flowering months and the replay still use the crop calendar${temperate ? '' : ', written for 35°–60° latitude'}.` }
      : { level: 'Low', reason: 'Sowing months are typical for temperate Europe, not yours.', next: 'Enter your usual sowing month for every crop shown.' },
  };
}

export const levelIndex = (level) => LEVELS.indexOf(level);
