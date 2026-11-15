// Hand-checked cases for the money layer: FAO-33 yield response, profit sums across blocks, percentiles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yieldRatio, profitPerHa, farmYears, percentile, moneySummary, equalBlocks } from '../src/model/money.js';
import { sortByGoals } from '../src/model/goals.js';
import { CROPS } from '../src/model/crops.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('FAO-33: cereal (maize, Ky 1.25) at 80 % of crop water use keeps 75 % of yield', () => {
  near(CROPS.maize.ky, 1.25);
  near(yieldRatio({ etc: 500, eta: 400 }, CROPS.maize.ky), 0.75); // 1 - 1.25 x 0.2
});

test('FAO-33: oilseed (sunflower, Ky 0.95) at 60 % keeps 62 %', () => {
  near(yieldRatio({ etc: 500, eta: 300 }, CROPS.sunflower.ky), 0.62); // 1 - 0.95 x 0.4
});

test('FAO-33: legume (soybean, Ky 0.85) at 50 % keeps 57.5 %', () => {
  near(yieldRatio({ etc: 600, eta: 300 }, CROPS.soybean.ky), 0.575); // 1 - 0.85 x 0.5
});

test('yield ratio is clamped at zero and is 1 when fully irrigated', () => {
  assert.equal(yieldRatio({ etc: 500, eta: 50 }, 1.25), 0);
  assert.equal(yieldRatio({ etc: 500, eta: 50 }, 1.25, true), 1);
});

test('profit per hectare = yield x price - all five costs', () => {
  const econ = { ym: 6, price: 1000, costs: { seed: 450, fertiliser: 1300, protection: 600, machinery: 1100, labour: 300 } };
  near(profitPerHa(0.75, econ), 6 * 0.75 * 1000 - 3750); // 750 lei/ha
});

test("whole-farm profit sums each block's crop for that year, times its hectares", () => {
  const season = (year, eta) => ({ year, etc: 100, eta });
  const ev = { rot: { crops: ['wheat', 'maize'] }, facts: { crops: [
    { list: [season(2001, 100), season(2002, 100)] },
    { list: [season(2001, 100), season(2002, 50), season(2003, 100)] }, // 2003 has no wheat season: left out
  ] } };
  const econ = (ym, price, cost) => ({ ym, price, costs: { seed: cost, fertiliser: 0, protection: 0, machinery: 0, labour: 0 } });
  const econs = { wheat: econ(6, 1000, 4000), maize: econ(8, 1000, 5000) }; // full-yield profit: wheat 2000, maize 3000 lei/ha
  const years = farmYears(ev, econs, [10, 30], false, 2001);
  assert.deepEqual(years.map((y) => y.year), [2001, 2002]);
  near(years[0].profit, 10 * 2000 + 30 * 3000); // 2001: block A wheat, block B maize
  // 2002: block A maize at 1 - 1.25 x 0.5 = 0.375 of yield -> 8 x 0.375 x 1000 - 5000 = -2000; block B wheat 2000
  near(years[1].profit, 10 * -2000 + 30 * 2000);
});

test('percentile interpolates linearly; summary counts loss years', () => {
  near(percentile([5, 1, 4, 2, 3], 0.2), 1.8);
  near(percentile([5, 1, 4, 2, 3], 0.5), 3);
  const s = moneySummary([-10, 5, 20, 30, 40].map((profit, i) => ({ year: 2000 + i, profit })));
  assert.equal(s.lossYears, 1); assert.equal(s.n, 5); assert.equal(s.worst.year, 2000);
  assert.deepEqual(equalBlocks(3, 120), [40, 40, 40]);
});

test('picking "steadier income" ranks the option with the better bad year first', () => {
  const opt = (normal, bad, lossYears) => ({ rot: { crops: ['wheat'] }, total: 0.5,
    ev: { scores: { water: 0.5, nitrogen: 0, erosion: 0.5 }, facts: { bare: 3, n: 1 } }, money: { normal, bad, lossYears, n: 25 } });
  const rich = opt(200, -50, 6), steady = opt(150, 40, 1), cur = { crops: ['wheat'] };
  assert.equal(sortByGoals([rich, steady], cur, ['profit'])[0].money.normal, 200);
  assert.equal(sortByGoals([rich, steady], cur, ['steady'])[0].money.bad, 40);
});
