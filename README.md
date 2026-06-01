# Tree-cover service deficits and heat-exposure mismatch in Yangtze River Delta cities

Selected code and derived data for the manuscript *"Tree-cover service deficits and
heat-exposure mismatch in Yangtze River Delta cities: implications for street-level
greening priorities."*

The framework maps a remotely sensed **tree-cover proxy** (heat-mitigation service supply),
**population-weighted summer land-surface-temperature (LST) exposure** (demand), and their
**spatial mismatch** on a 500 m grid across the built-up cores of four cities (Shanghai,
Suzhou, Nanjing, Hangzhou), combines them into a transparent **Greening Priority Index** and
five management zones, and localises priorities to the **road network**.

> **Scope of this repository.** This is a *representative selection* — the core data-extraction
> and analysis scripts plus the derived 500 m gridded indicators — intended to document the
> method. Figure-generation code and the complete toolkit are available from the corresponding
> author and will be released, with a Zenodo DOI, upon publication.

## Data sources (all open)

| Dataset | Used for | Reference / access |
|---|---|---|
| Dynamic World V1 (10 m) | tree-cover proxy, built-up, water, crops, bare | Brown et al. 2022, *Sci. Data* 9:251; `GOOGLE/DYNAMICWORLD/V1` |
| Landsat 8/9 Collection-2 L2 surface temperature (30 m) | summer LST, LST anomaly | USGS; `LANDSAT/LC0{8,9}/C02/T1_L2` |
| WorldPop (100 m, 2020) | population, population-weighted exposure | Tatem 2017, *Sci. Data* 4:170004; `WorldPop/GP/100m/pop` |
| ESA WorldCover 10 m v100 | proxy cross-validation | Zanaga et al. 2021, Zenodo 10.5281/zenodo.5571936 |
| OpenStreetMap roads | road density, road-buffer greenness | © OpenStreetMap contributors (Overpass API) |
| SRTM (30 m) | elevation, slope | `USGS/SRTMGL1_003` |
| FAO GAUL 2015 | city administrative boundaries | `FAO/GAUL/2015/level1`, `level2` |

## Contents

**`gee/`** — Google Earth Engine scripts (run in <https://code.earthengine.google.com>):
- `export_admin.js` — export the 500 m grid per city (strict urban core: built > 0.3, water < 0.5, crops < 0.2, bare < 0.2) with all indicators → `data/gridS_<City>.csv`.
- `summary_admin.js` — city-level summary, priority zones and road-buffer (H3) analysis.
- `cross_validate.js` — tree-cover proxy vs ESA WorldCover and Sentinel-2 NDVI.

**`osm/fetch_roads.py`** — pull OSM highways via the Overpass API and write a shapefile for upload to GEE as a `FeatureCollection`.

**`analysis/spatial_regression.py`** — H1 spatial models: OLS → Moran's I / Lagrange-multiplier diagnostics → spatial error, spatial lag and combined SARAR models (libpysal + spreg).

**`data/`** — derived 500 m gridded indicators (non-sensitive): `gridS_<City>.csv` for the four cities (tree-cover proxy, LST anomaly, built-up, water, elevation, slope, road density, population, coordinates).

## Reproduce the spatial models

```bash
pip install -r requirements.txt
python analysis/spatial_regression.py     # reads data/gridS_*.csv
```

## Notes

- The tree-cover proxy is a **relative, screening-grade indicator**, not a precise canopy map
  (cross-validated against ESA WorldCover, Sentinel-2 NDVI and visual interpretation at
  r ≈ 0.55–0.61).
- A generative AI assistant was used for code development and language editing; the author
  reviewed and is responsible for all content.

## License

Code: MIT (see `LICENSE`). Derived data: CC-BY-4.0. Third-party datasets retain their original
licenses and must be cited as above.

## Citation

Huang G. (2026). Tree-cover service deficits and heat-exposure mismatch in Yangtze River Delta
cities: implications for street-level greening priorities. *(manuscript)*.
