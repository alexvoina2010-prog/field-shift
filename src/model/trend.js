// AI disclosure: written with Claude Code (Anthropic AI coding assistant) under the author's direction; see AI-USAGE.md.
// Trend test for one value per year: Mann-Kendall (is there a monotonic trend?) and Sen's slope
// (how fast). Non-parametric, so one extreme year does not create or hide a trend.

// Standard normal CDF, via the Abramowitz-Stegun 7.1.26 approximation of erf (error under 1.5e-7).
function normalCdf(z) {
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

// values: one number per year, in order. Returns { s, z, p (two-sided), slope (Sen, per year) }.
export function mannKendall(values) {
  const n = values.length, slopes = [];
  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      s += Math.sign(values[j] - values[i]);
      slopes.push((values[j] - values[i]) / (j - i));
    }
  }
  const ties = new Map();
  for (const v of values) ties.set(v, (ties.get(v) || 0) + 1);
  let variance = n * (n - 1) * (2 * n + 5);
  for (const t of ties.values()) variance -= t * (t - 1) * (2 * t + 5); // tie correction
  variance /= 18;
  const z = variance > 0 ? (s - Math.sign(s)) / Math.sqrt(variance) : 0;
  slopes.sort((a, b) => a - b);
  const mid = slopes.length >> 1;
  const slope = !slopes.length ? 0 : slopes.length % 2 ? slopes[mid] : (slopes[mid - 1] + slopes[mid]) / 2;
  return { s, z, p: 2 * (1 - normalCdf(Math.abs(z))), slope };
}
