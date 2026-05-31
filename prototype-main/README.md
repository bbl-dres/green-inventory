# Green Inventory — Main App (Green Areas)

> **Unofficial mockup.** Fictional data, not for production use. Part of the [`green-inventory`](../README.md) repo.

GDB-backed inventory of **73 sites (Standorte)** and **~6 000 green-area features** (areas, trees, canopies, small structures) on a MapLibre GL map, with care-profile classification, attribute filtering, a scoped table view, and identify against external swisstopo layers.

<p align="center">
  <img src="assets/images/preview1.jpg" width="45%" style="vertical-align: top;"/>
  <img src="assets/images/preview2.jpg" width="45%" style="vertical-align: top;"/>
</p>

## Live app

https://bbl-dres.github.io/green-inventory/prototype-main/

The repository root [`/`](https://bbl-dres.github.io/green-inventory/) redirects here.

## Features

### Map
- **MapLibre GL JS** map with four basemaps: CARTO Positron / Dark Matter / Voyager + **swisstopo Luftbild** (vector tiles).
- **2D / 3D toggle** — camera pitches to 60°; OSM building footprints extrude (via [OpenFreeMap](https://openfreemap.org) `render_height`, 8 m default); each tree renders as a 12-gon cylinder coloured by species class.
- **Home button** resets to the data bbox; full-screen zoom range to z22.
- **Identify on click** for external swisstopo layers via the federal MapServer API; results returned as GeoJSON in LV95 and re-projected client-side.

### Legend (left drawer)
- **GSZ Profilkatalog grouping** — Rasen / Wiesen / Rabatten / Hecken / Gehölzflächen / Spezielle Bepflanzungsformen / Beläge / Wasserflächen / Anderes, plus Baum / Spezielle Bepflanzungsformen (Punkt) / Kleinstrukturen.
- **PDF-faithful colours and pattern swatches** (Wechselflor purple dots, Magerrasen brown dots, Rasengittersteine cross-hatch, Bollensteine grey dots, etc.).
- Eye-toggle per group filters the map at the **profile-code** level (e.g. hide all `Hecken` codes 16/17/18 in one click).

### Filter sidebar (right drawer)
- Collapsible accordion groups: Standort / Profil / Baumart / Typ / Los / Pflegeklasse / Eigentümer / Pflege durch.
- Search-within-filters auto-expands matching groups; per-group active-count chip; "Alle zurücksetzen" link.

### Table panel
- **Standorte / Grünflächen tabs** — segmented control filters the table to sites only (73) or green features only (~6 000); per-tab column-visibility defaults.
- Search, sort, configurable columns, 100/200/500 rows-per-page pagination, CSV / GeoJSON / Excel export (all data or filtered set).
- Selecting a row pans the map and opens its popup; row hover highlights the feature on the map.

### Coordinates & header actions
- Footer shows live **WGS 84** + **LV95** (Swiss-grid) coordinates as the cursor moves; right-click copies both forms.
- **Filter** (active-count badge), **Share** (Web Share API + clipboard fallback), **Drucken** (`preserveDrawingBuffer` print pipeline), 2D/3D toggle.
- All view state — center, zoom, selection, active external layers, tab scope — round-trips through URL parameters (`?center=…&zoom=…&sel=…&ext=…&scope=…`).

## Data pipeline

The map data lives in [`data/data.geojson`](data/data.geojson) (~16 MB, 6 164 features). It's generated from a Bundesgärtnerei FileGDB by [`scripts/gdb_to_geojson.py`](scripts/gdb_to_geojson.py), which:

1. Reads three GDB layers via **pyogrio** + the bundled GDAL FileGDB driver.
2. Extracts **17 field-domain codelists** (idPPy polygon profiles, idPP point profiles, idBa species list, etc.) via `ctypes` against the GDAL OGR field-domain API.
3. Reprojects **LV03 → LV95** (CHENyx06 NTv2 grid, 0.2 m accuracy) **→ WGS 84** (1.0 m accuracy, the published ceiling for non-Reframe transforms).
4. Validates geometry (`make_valid`), simplifies high-vertex outliers at 5 cm in LV95, enforces RFC 7946 right-hand winding.
5. Embeds all codelists, accuracy info, attribution, and `bbox` into the output metadata.

The full data-model contract — source GDB schema, codelists, conversion rules, and output contract — is documented in [`docs/DATAMODEL.md`](docs/DATAMODEL.md).

## Tech stack

| Technology | Version | Usage |
|---|---|---|
| Vanilla JavaScript | ES6+ | Application logic |
| MapLibre GL JS | v4.7 | Map rendering (WebGL) |
| CSS3 | Modern | Design tokens + flex/grid layouts |
| GeoJSON | RFC 7946 | Geospatial data format |
| swisstopo MapServer | v3 | External-layer search + identify |
| OpenFreeMap | planet | 3D OSM building tiles |
| pyogrio + GDAL | 0.12 / 3.11 | FileGDB read + field-domain extraction (Python pipeline) |
| pyproj | 3.x | CRS reprojection (CHENyx06 grid) |
| shapely | 2.x | Geometry validation + simplification |

No build tools or frameworks for the frontend; pure static files.

## Running

Static files only — no build step. From the repo root:

```bash
python -m http.server 8000   # → http://localhost:8000/prototype-main/
npx http-server
```

Then open <http://localhost:8000/prototype-main/> (or the repo root, which redirects here).

To regenerate `data/data.geojson` from a fresh GDB:

```bash
pip install pyogrio pyproj shapely pandas
python scripts/gdb_to_geojson.py
```

Edit the `GDB_PATH` constant at the top of the script if your GDB lives elsewhere.

## Layout

```
prototype-main/
├── index.html              # App entry point
├── js/
│   ├── config.js           # Legend groups, profile styles, table columns, basemaps
│   ├── map.js              # MapLibre init, layers, controls, popups, search
│   └── table.js            # Table widget: tabs, scope, filtering, export
├── css/
│   ├── tokens.css          # Design tokens (colours, spacing, shadows, …)
│   └── styles.css          # Component styles
├── data/
│   └── data.geojson        # Single FeatureCollection (6 164 features)
├── scripts/
│   └── gdb_to_geojson.py   # GDB → GeoJSON conversion pipeline
├── docs/
│   └── DATAMODEL.md        # Source GDB schema, codelists, output contract
└── assets/
    └── images/             # Preview screenshots (used by this README)
```

## License

[MIT](../LICENSE)
