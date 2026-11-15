# References

## Datasets

| Dataset | Used for | How accessed |
|---|---|---|
| NASA POWER daily point API, community AG (MERRA-2 meteorology, CERES radiation): T2M_MAX, T2M_MIN, PRECTOTCORR, GWETROOT, ALLSKY_SFC_SW_DWN, WS2M, T2MDEW, 2000–2025 | Weather record replayed by the backtest; climate tiles | Live in the browser for any clicked point; saved to `data/demo_field.json` for the demo field by `scripts/fetch_demo.mjs` |
| NASA GIBS WMTS: `MODIS_Terra_L3_NDVI_Monthly` | Vegetation map layer | Live tiles |
| NASA GIBS WMTS: `SMAP_L4_Analyzed_Root_Zone_Soil_Moisture` | Soil moisture map layer | Live tiles |
| NASA GIBS WMTS: `IMERG_Precipitation_Rate` | Rainfall map layer | Live tiles |
| OpenStreetMap | Base map tiles; Nominatim place search ("Village or town" box, only the typed name is sent) | Live |

Planned, not yet used: GPM IMERG monthly totals as a rainfall cross-check; elevation/slope from SRTM.

## Methods and parameter sources

- Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998). *Crop evapotranspiration: guidelines for computing crop water requirements.* FAO Irrigation and Drainage Paper 56. Used for: Penman-Monteith reference ET (eq. 6), Hargreaves fallback (eq. 52), stage lengths (Table 11), crop coefficients (Table 12), soil available water (Table 19), rooting depth and depletion fraction (Table 22), water stress coefficient Ks (eq. 84). Values were read from the FAO online edition (fao.org/4/X0490E) on 2026-11-14.
- USDA Natural Resources Conservation Service (1986). *Urban Hydrology for Small Watersheds*, Technical Release 55. Used for: runoff curve numbers on heavy-rain days (Table 2-2b, row crops, straight rows, good condition).
- Mann (1945) and Kendall (1975) rank trend test with tie correction; Sen (1968) slope estimator. Used for: the three headline climate facts (`src/model/trend.js`).
- ETCCDI climate indices: R10mm (days with 10 mm of rain or more) as the heavy-rain day definition.
- Doorenbos, J., Kassam, A.H. (1979). *Yield response to water.* FAO Irrigation and Drainage Paper 33. Used for: the yield response equation 1 − Ya/Ym = Ky (1 − ETa/ETc) over the whole season (`src/model/money.js`).
- Steduto, P., Hsiao, T.C., Fereres, E., Raes, D. (2012). *Crop yield response to water.* FAO Irrigation and Drainage Paper 66, Table 1 "Seasonal Ky values from FAO Irrigation and Drainage Paper No. 33" (fao.org/4/i2800e, read 2026-11-15). Used for Ky: winter wheat 1.05, maize 1.25, sunflower 0.95, sorghum 0.9, soybean 0.85, peas 1.15, alfalfa 1.1. Barley, rapeseed and chickpea are not in that table; their Ky is `"source": "assumption"`.

## Example economics (not data)

Yield with no water shortage, price and the five cost lines per crop in `data/crops.json` are `"source": "illustrative"`: plausible example values for a rain-fed farm in South-East Romania, chosen by us, not taken from a market or statistics source. The UI labels them "Example values, change them to yours" and every money figure "Your estimate, using your numbers and NASA weather. Not a price forecast." The farmer's own numbers are kept in their browser only (localStorage), never sent anywhere.

Parameters with no citation (sowing and flowering months, heat limits, return intervals, nitrogen credits, cover-crop and bare-soil coefficients, stress thresholds) are marked `"source": "assumption"` in `data/crops.json` or "ADJUSTABLE DEFAULTS" in `src/model/rotation.js`.

## Context figure (not used in the model)

- Statement by Romania's agriculture minister, reported 13 August 2024: about 2 million hectares of crops affected by drought, mostly spring crops, as reported by the Netherlands agricultural counsellor's office: https://www.agroberichtenbuitenland.nl/actueel/nieuws/2024/08/13/two-million-hectares-affected-so-far-by-drought-in-romania

## Dataset links

- NASA POWER daily API: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- MERRA-2: https://gmao.gsfc.nasa.gov/gmao-products/merra-2/
- CERES: https://ceres.larc.nasa.gov/
- NASA GIBS: https://nasa-gibs.github.io/gibs-api-docs/
- MODIS: https://www.earthdata.nasa.gov/data/instruments/modis · SMAP: https://smap.jpl.nasa.gov/ · GPM IMERG: https://gpm.nasa.gov/data/imerg

## Libraries

- Leaflet 1.9.4 (map), loaded from cdnjs with subresource integrity.
- No chart library: charts are hand-written SVG.
- Node.js built-in test runner for unit tests.
- Fonts from Google Fonts (SIL Open Font License): Newsreader (headings), Hanken Grotesk (text), IBM Plex Mono (figures).
- Landing photograph: combine harvester by Ermell, CC BY-SA 4.0, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Fr%C3%A4nkische_Schweiz_Getreideernte-20210821-RM-154445.jpg). A stand-in, not the demo field.

## Use of AI tools

- Claude (Anthropic), through Claude Code, was used to write and review the application code, tests and documentation, and to read parameter values out of the FAO-56 online tables. Alex directed the product, scope and decisions.
- Claude also drafted the submission text and the video script from numbers the app computes, and found the public source for the 2024 drought figure by web search.
- Farm-plan build (15 Nov): Claude wrote the money, goals and plan modules and their tests, located the FAO-66 PDF by web search and read the Ky table from it (the value it first had in mind for winter wheat, 1.0, was wrong; the table says 1.05), and chose the illustrative example prices and costs, which are labelled as such.
- Farm-plan build (15 Nov): Claude wrote the money, goals and plan modules and their tests, located the FAO-66 PDF by web search and read the Ky table from it (the first value it had in mind for winter wheat, 1.0, was wrong; the table says 1.05), and chose the illustrative example prices and costs, which are labelled as such.
- The visual identity (palette, type, the three-band BioShift mark, page layout) was redesigned with Claude Code and the Hallmark design skill, on Alex's choices of tone and colour.
- No AI model runs inside the app. All results come from the NASA data and the published formulas above.
- No AI-generated images, and no NASA logos or insignia, are used.
