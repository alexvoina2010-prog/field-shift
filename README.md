# BioShift

A decision-support tool for the 2026 NASA Space Apps Challenge, **"Field Shift: Adapting Farms with NASA Data"**.

**Live site: https://alexvoina2010-prog.github.io/field-shift/** (no login, works on a phone)

A farmer picks a field on a map, sees what 26 years of NASA data say about it, enters the current rotation and priorities, and compares it with up to three alternatives. Each option shows why it was suggested, the evidence, the gains and trade-offs, the information gaps, and the risks to review locally. It supports the farmer's judgment; it does not replace it.

## Run it

It is a static site with no build step and no API keys.

```bash
python -m http.server 8000
```

Then open http://localhost:8000. Tests:

```bash
node --test
```

## What it does

1. **Your field.** Click the map or type coordinates; choose soil type and slope. Optional NASA map layers: vegetation (NDVI), root-zone soil moisture, latest rainfall.
2. **What the last 26 years say.** Three headline facts, each tested for a trend (Mann-Kendall, Sen's slope) and only called a trend when the test agrees; a climate ribbon with one square per month since 2000 (water shortfall, very hot days, frost or heavy rain) under the current rotation's crop calendar; and a monthly chart of rain against crop water demand.
3. **Your rotation and priorities.** Current crops by year, which crops you could actually grow and sell, five priority sliders, and a what-if for drier or warmer weather.
4. **Compare your options.** The current rotation plus one alternative per size of change: add cover crops, swap one crop, add a year. Every card has the same five headings (why suggested, evidence, benefits, information gaps, risks needing local review), the three worst flowering seasons per crop with the rain and temperature NASA recorded, and a confidence badge with documented rules. Constraints: irrigated field, livestock or hay buyer, and the list of crops you can grow.

## Data

| Source | Used for | Access |
|---|---|---|
| NASA POWER daily point API, 2000–2025 (MERRA-2, CERES) | Temperature, rainfall, solar radiation, wind, dew point | Live, in the browser |
| NASA GIBS: MODIS Terra NDVI (monthly) | Vegetation map layer | Live tiles |
| NASA GIBS: SMAP L4 root-zone soil moisture | Soil moisture map layer | Live tiles |
| NASA GIBS: GPM IMERG precipitation rate | Rainfall map layer | Live tiles |
| FAO Irrigation and Drainage Paper 56 | Reference evapotranspiration method, crop coefficients, soil water capacity | Values in `data/crops.json`, `src/model/rotation.js` |
| OpenStreetMap | Base map | Live tiles |

## Method

- **Reference evapotranspiration:** FAO-56 Penman-Monteith, daily, from NASA POWER inputs. Checked against FAO-56 worked example 18 in the tests.
- **Crop water demand:** reference ET times a FAO-56 crop coefficient curve over each crop's season.
- **Water balance:** a daily FAO-56 root-zone water balance (capacity from soil type and rooting depth, curve-number runoff on heavy-rain days). Scores are counts of seasons that would have been in trouble, never yields. Every phase of the rotation is replayed over the whole record, so each crop meets each year.
- **Five scores (0–100):** water fit, soil building (cover, legumes, residue, deep roots), pest and disease break (plant families, return intervals), erosion protection (heavy-rain days of 10 mm or more falling on bare soil, weighted by slope), heat and frost safety.
- **Total:** weighted average using the farmer's priority sliders.
- **Suggestions:** every single-crop swap and every one-year insertion using the crops the farmer ticked is scored; calendar-impossible sequences are dropped; the best of each kind is shown.

## Confidence and limits

- Climate numbers: **medium** confidence. The grid cell is about 50 km wide and comes from a model blended with observations, not from a station in the field.
- Crop traits (heat thresholds, return intervals, residue ratings, calendars): **low** confidence. They are generic rules of thumb for temperate climates.
- Thresholds such as "short of water at flowering" or "cover crops in gaps of 3+ months" are **adjustable defaults**, not benchmarks. They are named constants at the top of `src/model/rotation.js`.
- Not modelled: irrigation, prices and markets, actual pest pressure, soil tests, perennial crops, tropical cropping calendars.
- Scores compare options on one field. They are not yield predictions.

## Files

- `index.html`, `style.css`: the page.
- `data/crops.json`: crop table, every number with a source and confidence. `src/model/crops.js` loads it.
- `data/demo_field.json`: saved NASA POWER record for the demo field (`node scripts/fetch_demo.mjs` refreshes it).
- `src/model/climate.js`: NASA POWER request, evapotranspiration, monthly summaries.
- `src/model/rotation.js`: calendar layout, daily water-balance backtest, scores, suggestions.
- `src/model/trend.js`: Mann-Kendall test and Sen's slope.
- `js/ribbon.js`: the climate ribbon.
- `js/explain.js`: turns scores into sentences.
- `js/app.js`: map and page wiring.
- `test/logic.test.mjs`: tests for the logic.

## AI usage

Built solo with **Claude Code** (Anthropic's AI coding assistant) and its sub-agents, the only AI tools used. Full detail: [AI-USAGE.md](AI-USAGE.md).

- **The author's:** the idea (replaying decades of NASA weather against a farm's rotation to see the most likely outcome before risking a season), the name, the design direction, the five farmer priorities, the money and profit system, the direction of every change and redesign, and the rules the AI had to follow (audit first, phased plan, no yields or profit as facts, unsourced values labelled "assumption", no untested trends). Tested by hand on a phone.
- **Claude Code's:** the code, the 25 tests, the documentation and in-app text, the master prompts and clarifying questions that turned the author's explanations into specifications, reading values from the FAO tables, the example prices and costs (labelled as examples), and the SVG icons, logo and favicon (AI-generated images, marked in their files and in the site footer).
- **Not AI:** no AI runs inside the app; every result comes from NASA data and published formulas. No AI-generated photographs, audio or video. No NASA logos or insignia.
- **Disclosure in metadata:** a header comment in every source file, `aiDisclosure` in `package.json`, `_ai_note` in `data/crops.json`, and an `ai-disclosure` meta tag in `index.html`.
