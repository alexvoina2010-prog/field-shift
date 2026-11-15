// The farmer's farm, kept in this browser only (localStorage). Every access is wrapped: private
// windows and blocked storage simply start from the defaults.
const KEY = 'bioshift.farm.v1';

/** @returns {object|null} the saved farm, or null when nothing is saved or storage is unavailable */
export function loadFarm() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}

/** @param {object} farm  plain data only: field, area, crops, costs, notes */
export function saveFarm(farm) {
  try { localStorage.setItem(KEY, JSON.stringify(farm)); } catch { /* storage full or blocked: nothing to do */ }
}

export function clearFarm() {
  try { localStorage.removeItem(KEY); } catch { /* blocked: nothing saved anyway */ }
}
