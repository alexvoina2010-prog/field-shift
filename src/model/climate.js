// Turns NASA POWER daily data into monthly records and a plain climate summary.
export const START_YEAR = 2000;
export const END_YEAR = 2025;
export const HOT_DAY = 35;   // deg C, ADJUSTABLE DEFAULT for the "hot days" tile
export const HEAVY_RAIN = 10; // mm/day, ETCCDI "R10mm" heavy precipitation day
const MISSING = -900;        // POWER fill value is -999

export const powerUrl = (lat, lon) =>
  'https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,GWETROOT,ALLSKY_SFC_SW_DWN,WS2M,T2MDEW' +
  `&community=AG&longitude=${lon}&latitude=${lat}&start=${START_YEAR}0101&end=${END_YEAR}1231&format=JSON`;

// data/demo_field.json stores each parameter as one array of daily values from `start` (YYYYMMDD).
// Turns it back into the date-keyed shape the POWER API returns.
export function expandDemo(demo) {
  const t0 = Date.UTC(+demo.start.slice(0, 4), +demo.start.slice(4, 6) - 1, +demo.start.slice(6, 8));
  const n = Object.values(demo.parameter)[0].length;
  const keys = Array.from({ length: n }, (_, i) => new Date(t0 + i * 864e5).toISOString().slice(0, 10).replaceAll('-', ''));
  return Object.fromEntries(Object.entries(demo.parameter).map(([name, values]) =>
    [name, Object.fromEntries(values.map((v, i) => [keys[i], v]))]));
}

// Extraterrestrial radiation, MJ/m2/day (FAO-56 eq. 21).
export function extraterrestrialRadiation(latDeg, doy) {
  const phi = (latDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta))));
  return ((24 * 60) / Math.PI) * 0.082 * dr *
    (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
}

// Reference evapotranspiration, mm/day (Hargreaves, FAO-56 eq. 52): needs only temperature.
export function hargreavesEt0(tmax, tmin, latDeg, doy) {
  const ra = extraterrestrialRadiation(latDeg, doy);
  return Math.max(0, 0.0023 * ((tmax + tmin) / 2 + 17.8) * Math.sqrt(Math.max(0, tmax - tmin)) * ra * 0.408);
}

const satVp = (t) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3)); // kPa

// Reference evapotranspiration, mm/day (FAO-56 Penman-Monteith, eq. 6, daily step, G = 0).
// rs = solar radiation MJ/m2/day, u2 = wind at 2 m in m/s, z = elevation in m.
export function penmanMonteithEt0({ tmax, tmin, tdew, rs, u2, lat, doy, z = 0 }) {
  const t = (tmax + tmin) / 2;
  const es = (satVp(tmax) + satVp(tmin)) / 2, ea = satVp(tdew);
  const slope = (4098 * satVp(t)) / (t + 237.3) ** 2;
  const gamma = 0.000665 * 101.3 * ((293 - 0.0065 * z) / 293) ** 5.26;
  const rso = (0.75 + 2e-5 * z) * extraterrestrialRadiation(lat, doy);
  const cloud = rso > 0 ? Math.min(1, rs / rso) : 1;
  const rnl = 4.903e-9 * (((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2) * (0.34 - 0.14 * Math.sqrt(ea)) * (1.35 * cloud - 0.35);
  const rn = 0.77 * rs - rnl;
  return Math.max(0, (0.408 * slope * rn + (gamma * 900 * u2 * (es - ea)) / (t + 273)) / (slope + gamma * (1 + 0.34 * u2)));
}

// p = POWER `properties.parameter`. sc = what-if scenario (rain multiplier, degrees of warming;
// warming keeps the dew point, so the air gets drier). z = elevation in m.
// Returns complete years only, months flat: m[yearIndex * 12 + month0].
// South of the equator months are shifted by 6 so that index 6 is always mid-summer.
export function toMonthly(p, lat, sc = { rain: 1, dT: 0 }, z = 0) {
  const shift = lat < 0 ? 6 : 0;
  const byAbs = new Map();
  for (const key of Object.keys(p.T2M_MAX)) {
    const y = +key.slice(0, 4), mth = +key.slice(4, 6), d = +key.slice(6, 8);
    let tmax = p.T2M_MAX[key], tmin = p.T2M_MIN[key], rain = p.PRECTOTCORR[key];
    if (!(tmax > MISSING && tmin > MISSING && rain > MISSING)) continue;
    tmax += sc.dT; tmin += sc.dT; rain *= sc.rain;
    const abs = y * 12 + mth - 1 + shift;
    let b = byAbs.get(abs);
    // tmax, rainD and et0D are parallel per-day arrays: the daily soil-water bucket reads them.
    if (!b) byAbs.set(abs, (b = { days: 0, rain: 0, et0: 0, tmax: [], rainD: [], et0D: [], frostDays: 0, r10: 0, wetSum: 0, wetN: 0 }));
    const doy = Math.round((Date.UTC(y, mth - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
    b.days++;
    b.rain += rain;
    const rs = p.ALLSKY_SFC_SW_DWN?.[key], u2 = p.WS2M?.[key], tdew = p.T2MDEW?.[key];
    // Hargreaves (temperature only) fills days where radiation, wind or humidity is missing.
    const et0 = rs > MISSING && u2 > MISSING && tdew > MISSING
      ? penmanMonteithEt0({ tmax, tmin, tdew, rs, u2, lat, doy, z })
      : hargreavesEt0(tmax, tmin, lat, doy);
    b.et0 += et0;
    b.tmax.push(tmax); b.rainD.push(rain); b.et0D.push(et0);
    if (tmin < 0) b.frostDays++;
    if (rain >= HEAVY_RAIN) b.r10++;
    const wet = p.GWETROOT?.[key];
    if (wet > MISSING) { b.wetSum += wet; b.wetN++; }
  }
  const years = [], m = [];
  const all = [...byAbs.keys()].map((a) => Math.floor(a / 12));
  for (let y = Math.min(...all); y <= Math.max(...all); y++) {
    const months = Array.from({ length: 12 }, (_, i) => byAbs.get(y * 12 + i));
    if (!months.every((b) => b && b.days >= 25)) continue;
    years.push(y);
    for (const b of months) m.push({ ...b, wet: b.wetN ? b.wetSum / b.wetN : null });
  }
  return { shift, years, m };
}

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

// Monthly normals plus one-value-per-year series for the trend test.
export function summarize(mo) {
  const clim = Array.from({ length: 12 }, (_, i) => {
    const col = mo.years.map((_, y) => mo.m[y * 12 + i]);
    return { rain: mean(col.map((b) => b.rain)), et0: mean(col.map((b) => b.et0)), r10: mean(col.map((b) => b.r10)) };
  });
  const perYear = (fn) => mo.years.map((_, y) => fn(mo.m.slice(y * 12, y * 12 + 12)));
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  // One value per year, for the trend test.
  const series = {
    hotDays: perYear((ms) => sum(ms.map((b) => b.tmax.filter((t) => t >= HOT_DAY).length))),
    summerGap: perYear((ms) => sum(ms.slice(5, 8).map((b) => b.et0 - b.rain))), // June-August demand minus rain, mm
    rain: perYear((ms) => sum(ms.map((b) => b.rain))),
  };
  return { clim, series, annualRain: sum(clim.map((c) => c.rain)), annualEt0: sum(clim.map((c) => c.et0)) };
}
