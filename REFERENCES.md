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

## Use of AI tools

- Claude (Anthropic), through Claude Code, was used to write and review the application code, tests and documentation, and to read parameter values out of the FAO-56 online tables. Alex directed the product, scope and decisions.
- Claude also drafted the submission text and the video script from numbers the app computes, and found the public source for the 2024 drought figure by web search.
- No AI model runs inside the app. All results come from the NASA data and the published formulas above.
- No AI-generated images, and no NASA logos or insignia, are used.
