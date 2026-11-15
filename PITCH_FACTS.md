# Pitch facts

Striking numbers from the demo field, each with how it was computed. Re-check after any model change:
the numbers below come from `node --test` data and the browser on 2026-11-14 (landing-page rows: 2026-11-15).

## Demo field: Bărăgan Plain, Romania (44.56 N, 27.36 E), loam, rain-fed

Source for all of these: NASA POWER daily data, 2000-01-01 to 2025-12-31 (9,497 days, no missing values),
saved in `data/demo_field.json`.

| Fact | Number | How computed |
|---|---|---|
| Rain against crop demand | 514 mm of rain a year against 1,124 mm of reference evapotranspiration | Mean annual sums; reference ET is FAO-56 Penman-Monteith from POWER temperature, radiation, wind and dew point |
| Hot days look to be rising, but the test says "not confirmed" | Days at 35 °C or more: about +6.3 days per decade, average 20.3 a year; Mann-Kendall p = 0.08 (decade means: 15.1 a year in 2000–2009, 25.1 in 2016–2025) | Sen's slope and Mann-Kendall test on the 26 annual counts. p is above 0.05, so the app says "possibly rising: weak evidence", not "significant trend" |
| No trend in rain or summer water shortfall | Annual rain: p = 0.76. June–August shortfall (crop demand minus rain): p = 0.63, average 397 mm | Same test. The honest headline is the size of the shortfall and its year-to-year swings, not a trend |
| The driest year on record here | 2000: 241 mm of rain in the whole year, against an average of 514 mm | Annual sum of PRECTOTCORR |
| One month, in numbers | July 2012: 17 mm of rain against 236 mm of crop demand, 23 days at 35 °C or more | Ribbon read-out for that square |
| Maize would have struggled most years | Short of water at flowering in **15 of 26** seasons | Daily FAO-56 root-zone water balance, wheat–maize–sunflower rotation; a season counts when at least half of July's days have stress coefficient Ks < 0.5 |
| Sunflower no better | Short of water at flowering in **18 of 26** seasons | Same rule, July |
| Winter wheat holds up better | Short of water in **10 of 25** seasons | Same rule, May–June |
| The model finds the known drought years | Maize's worst Julys: 2007 (9 mm of rain, mean daily maximum 35.6 °C), 2000 (12 mm, 34.0 °C), 2024 (29 mm, 36.1 °C), 2012 (17 mm, 36.2 °C) | Lowest mean Ks in July; rain and temperature are the recorded POWER values for that month |
| …and the good years | July 2005 (140 mm) and July 2010 (115 mm): zero stress days for maize | Same run |
| Wheat's worst seasons | May–June 2002 (62 mm of rain), 2001 (76 mm), 2007 (63 mm): short of water on 53–60 of 61 days | "Worst years" drill-down on the baseline card |
| Confidence is earned, not assumed | Swapping in chickpea drops the badge from Medium to Low, because its growth-stage lengths are not in the FAO-56 table | Confidence rules in `js/explain.js`, listed on the page under "Data and method" |
| Same crop, different continent | Maize near Ames, Iowa (42.0 N, 93.6 W): short of water at flowering in **1 of 26** seasons | Same model, live POWER data, loam |
| The landing headline: sunflower flowers in a heatwave | **17 of 26** summers; chickpea in its place: **8 of 26** | Seasons whose flowering month reaches the crop's heat limit. Flowering month and heat limit are assumptions, so the chickpea option carries a Low badge. Read from the live demo on 2026-11-15 |
| Chickpea is no better on water | Short of water at flowering in 18 of 26 seasons, the same as sunflower | Same water rule as above, best-match card evidence |
| Whole rotation, seasons short of water at flowering | 43 of 77 crop seasons now, 40 of 77 with the chickpea swap | Sum over the three crops of the rotation, best-match card evidence |
| Wheat after chickpea | Short of water in 7 of 25 seasons, against 10 of 25 after sunflower | Same rule, May–June |
| Overall score at default priorities | 51 of 100 now, 61 of 100 with the chickpea swap | Equal weights on all sub-scores; a score for comparing options, not a yield |
| Stress test | At +1.5 °C and 20% less rain the ranking holds: bad seasons 20 → 23 now, 19 → 23 with the chickpea swap (read 15 Nov, 22:10) | Same replay on the perturbed record, options screen |
| The water balance agrees with NASA's soil model | Correlation 0.96 with POWER GWETROOT over 312 months (0.93 anomalies, 0.95 summer anomalies); driest summers 2000, 2001, 2024 in both top fives | `node scripts/check_gwetroot.mjs`; same MERRA-2 rain drives both, so it checks the bucket, not the rain |

## Money on the demo farm (120 ha, example prices and costs, 2026-11-15)

All figures are whole-farm profit over the replayed years 2001–2025 (25 years with every crop's season complete), equal blocks, rain-fed, FAO-33 yield response with FAO-66 Table 1 Ky. They are estimates from **example** prices and costs, not market data. Re-read from the options screen after any change.

| Fact | Number | How computed |
|---|---|---|
| What you grow now, wheat → maize → sunflower | Normal year **+28 900 lei**, bad year **−78 900 lei**, a loss in **10 of 25** years | Median and 20th percentile of the 25 yearly whole-farm profits; loss = below zero |
| Swap sunflower for chickpea | Normal year +57 300 lei, bad year −60 700 lei, loss in 9 of 25 | Same |
| Add a chickpea year (4-year rotation, 4 blocks of 30 ha) | Normal year **+80 400 lei**, bad year **−19 000 lei**, loss in **7 of 25** | Same |
| The bad-year difference | Adding a chickpea year is **about 60 000 lei better in a bad year** than the current rotation | −19 000 against −78 900 |
| Maize is the money problem here | In the median season maize gets **35 %** of the yield it could make with enough water; wheat 64 %, sunflower 50 %, chickpea 63 % | Ya/Ym = 1 − Ky (1 − ETa/ETc) per replayed season, median |
| The farmer's price decides | Drop the chickpea price from 3 000 to 2 000 lei/t and the swap falls from +57 300 to −13 300 lei in a normal year, below what the farm grows now | Same calculation, one input changed in "Your costs and prices" |
| Goals reorder, numbers stay | With no goal picked, "Swap sunflower for chickpea" comes first (model score); pick "Steadier income in bad years" and "Add a chickpea year" moves to the top and the cover-crop option drops below the current rotation | Goals only sort; see How it works |

## Wording rules

- Money and yield are the farmer's estimate from their own (or example) numbers on recorded weather: "your estimate", never "you will earn" or a forecast.
- Say "would have been short of water in 15 of 26 seasons", not "yield would have dropped by …" unless it is the labelled FAO-33 estimate.
- "Short of water" is a model definition (adjustable defaults in `src/model/rotation.js`), not a measured crop failure.
- Do not say "the climate here is getting significantly hotter": at this field no tested trend clears p < 0.05. Say "the app only calls a trend a trend when the test agrees".
- Flowering months and heat limits are assumptions for temperate Europe, not variety data.
