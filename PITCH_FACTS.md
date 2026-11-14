# Pitch facts

Striking numbers from the demo field, each with how it was computed. Re-check after any model change:
the numbers below come from `node --test` data and the browser on 2026-11-14.

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

## Wording rules

- Say "would have been short of water in 15 of 26 seasons", never "yield would have dropped by …".
- "Short of water" is a model definition (adjustable defaults in `src/model/rotation.js`), not a measured crop failure.
- Do not say "the climate here is getting significantly hotter": at this field no tested trend clears p < 0.05. Say "the app only calls a trend a trend when the test agrees".
- Flowering months and heat limits are assumptions for temperate Europe, not variety data.
