# Code review — 20 November 2026

Review of `prototype-main` from three angles: software (bugs, dead code,
robustness, duplication), GIS (projection, layers, labels, hit-testing) and
domain (how care profiles, areas and counts are derived). Findings marked
**fixed** were implemented with this review; **open** ones are recommendations
that need a decision or more work than a review should take on.

## Scope and method

| Coverage | Files |
|---|---|
| Read in full | `js/table.js`, `js/data.js`, `js/mapkit.js`, `js/mappanels.js`, `js/standort.js`, `js/util.js`, `standort.html`, `css/standort.css` |
| Read in part | `js/map.js` (state, selection, legend, feature card, load, identify, edit placeholder — not the measure tool and the header search), `js/report.js` (map pages, geo.admin link), `js/config.js` (legend groups, profile lookups, basemaps), `css/styles.css` (legend, card, map chrome, compact tier) |
| Not reviewed | `scripts/*.py`, `scripts/*.mjs` (only searched for specific terms; not run), `tools/responsive-audit` |

Besides reading: a mechanical scan for CSS selectors, design tokens, top-level
JS identifiers, icons and HTML ids that nothing refers to; measurements on the
data files; and browser tests in headless Chromium at 1440×900, 1280×585,
820×1180 and 390×844 before and after the changes (map page, detail page,
basemap switches, exports, PDF, print).

## Summary

| # | Severity | Area | Finding | Status |
|---|---|---|---|---|
| 1 | high | GIS / bug | After a switch to the Luftbild, areas, trees and perimeters vanished from every newly loaded map tile | fixed |
| 2 | high | bug | Detail page on tablets and phones: no zoom, home, 3D or basemap controls | fixed |
| 3 | medium | domain | 268 circular beds and fountains were shown as «Baumkrone» | fixed |
| 4 | medium | bug | Table exports listed every Standort twice | fixed |
| 5 | medium | cartography | Standort names lost against parcel labels | fixed |
| 6 | low | bug | PDF report: parcel outlines drawn outside the map frame | fixed |
| 7 | low | performance | Table filtered the full row set three times per render and re-sent the map filter on every sort, page turn and row click | fixed |
| 8 | low | robustness | Unguarded Excel export, download helper, data assembly | fixed |
| 9 | low | dead code | About 65 lines of CSS, 4 tokens, 9 icons, the unused save banner, 6 JS identifiers | fixed |
| 10 | low | duplication | Legend, feature card, selection and filters existed once per page or per file | fixed |
| 11 | low | docs | Accuracy of the coordinate formulas overstated; stale comments | fixed |
| 12 | medium | domain | 366 points with a tree profile but no species are typed `point` | open |
| 13 | medium | domain | «Anzahl» counts map features, not the surveyed quantity (`count`) | open |
| 14 | low | GIS | Identify highlight and Standort markers are up to about 2.6 m off | open |
| 15 | low | security | Identify popup inserts remote HTML unsanitised | open |
| 16 | low | data model | Feature ids are array positions, so `?sel=` links do not survive a data update | open |
| 17 | low | accessibility | Table rows can be selected with the mouse only | open |
| 18 | low | maintainability | `map.js` is still 1 780 lines; the pipeline scripts keep the name `tree_canopy` | open |

## Fixed

### 1. Vector layers disappear after a basemap switch

MapLibre fetches glyphs from the font server of the active basemap style. Our
two label layers asked for `Open Sans Regular`, which CARTO's server has and
swisstopo's does not. A failed glyph request does not just drop the label:
the whole tile fails, and every layer in it goes with it. Tiles loaded before
the switch stayed, which is why the effect looked random. Measured at Bern,
zoom 16, after switching to the Luftbild: 0 of 407 areas drawn, all eight
tiles in state `errored`.

`styleLabelFont()` in `mapkit.js` now picks the most used upright regular font
stack of the active style, when the layers are added and again inside the
basemap switch. After the fix the same view draws 407 of 407.

### 2. Detail map without controls on narrow screens

`#map` is a CSS size container. Its height came from `min-height` alone, and a
height that exists only as a minimum reaches container queries as 0. The rules
for very short maps therefore applied and hid the controls. The map now has an
explicit height.

### 3. Circular areas shown as tree crowns

Polygons that the survey drew as circles carry a radius, and `data.js` typed
every such polygon `tree_canopy`. Their care profiles say what they are:

| Profile | Circles |
|---|---|
| Staudenmischpflanzung, intensiv | 125 |
| Gehölzrabatte | 95 |
| Staudenmischpflanzung, extensiv | 30 |
| Formhecke (both heights) | 9 |
| Brunnen, Bodendecker, Chaussierung, Sand, Anderes | 9 |

They were drawn in one crown green whatever their profile, listed under
«Bäume › Kronenfläche (Kreis)», described as «Baumkrone» in the feature card
and hidden in 3D. `DATAMODEL.md` already calls the name a misnomer. All
polygons are `area` now and are drawn, grouped and described by their profile;
the radius stays as a plain measure («Durchmesser»). The entity type is gone
from the browser code (35 references in 9 files). Totals do not change: the
circles were already counted as areas.

### 4. Exports contained the Standort markers

The table hides the `site_location` features (one point per Standort, a map
aid) but the exports did not: «Alle Daten» wrote 6 317 rows, 73 of them
duplicates of the Standorte as points. It now writes 6 244.

### 5. Standort names and layer order

MapLibre places the labels of upper layers first. The parcel labels sat above
the Standort names and won every collision. The Standort points and names are
now the topmost data layers, and a name may move to any side of its point
before it gives way. The layer order, bottom to top:

1. parcel fill, perimeter fill, area fill and pattern, area outline
2. parcel outline, perimeter outline
3. trees, point elements
4. parcel labels (from zoom 16)
5. Standort points, Standort names (from zoom 13)
6. selection and hover overlays

Everything in 1–4 is drawn from zoom 14 (`DETAIL_MIN_ZOOM`); below that the map
shows the Standort points only.

### 6–8. Smaller fixes

- **PDF**: elements, parcels and perimeter are clipped to the map box.
- **Table**: the filtered row set is computed once per filter state; sorting,
  paging and selecting no longer push a filter to the map (measured after the
  change: 0 pushes for two sorts, a page turn and a row click; before, each of
  them pushed one). Sorting uses German collation with numbers compared as
  numbers.
- **Exports**: the Excel export reports a missing library instead of throwing;
  downloads release their object URL after the download has started.
- **Data assembly**: missing polygon or point collections no longer throw.

### 9. Dead code removed

- CSS: `.section-label`, `.filter-group-label`, `.check-item`,
  `.filter-clear-btn`, `.sw-outline`, `#tbl-filter-dd`, `.filter-search*`,
  `.row-active`, the `#save-banner` rules, the crown swatches.
- Tokens: `--success-bg`, `--shadow-drawer-l`, `--shadow-pop`, `--map-canopy`.
- Markup: the save banner of the former offset tool, an unused id.
- JS: four variables of the former offset tool, `isDialogOpen`, nine icons, two
  escaping aliases, a config fallback that could never apply.

### 10. Shared code instead of copies

| Now in | Used by | Replaces |
|---|---|---|
| `mappanels.js`: legend model, legend list, feature card | map page, detail page | the legend and card code in `map.js`, the chip legend of the detail page |
| `mapkit.js`: layer filters, selection and hover overlays, hit-testing | both maps | three functions in `map.js` |
| `util.js`: `shareUrl`, `featuresBbox` | header share button, table | a second share implementation, a second bounding-box loop |
| `config.js`: `profileDomain` | style and care-catalogue lookups | three copies of the same test |

### 11. Comments that claimed more than the code does

The LV95 ⇄ WGS 84 functions were described as swisstopo «Reframe» with
sub-metre accuracy. They are swisstopo's approximate formulas. Measured against
the 2 736 surveyed points, which carry both coordinate pairs:

| Direction | Mean | Worst |
|---|---|---|
| LV95 → WGS 84 (markers, identify highlight) | 0.6 m | 2.6 m |
| WGS 84 → LV95 (coordinate read-outs) | not measured | 1.0 m |

The read-outs are shown to the metre, which matches. The comments now say so.

## Open

### 12. Trees without a species

`data.js` types a point as `tree` when it has a species. 366 points carry a
tree profile and no species. The legend, the map colours and the «Bäume» tile
treat them as trees; the table calls them «Punktelement» and the 3D view does
not extrude them. Recommendation: type by profile group. This changes the tree
count in the table from 1 620 to 1 986, so it needs a decision.

### 13. Quantity versus number of features

Points have a surveyed quantity (`count`, shown as «Ausmass»): 2 376 points
have 1, 49 have more (up to 64), 311 have none. «Pflegeelemente» and the
«Anzahl» column of the Pflegekalender count features. For a profile such as
mobile planters the quantity is what drives the work. Recommendation: decide
per profile whether «Anzahl» should be the sum of `count`.

### 14. Approximate projection in two places

The highlight of an identified external feature and the Standort markers are
placed with the approximate formula (see 11). At zoom 19 an identified parcel
boundary can sit visibly beside the basemap. The identify request deliberately
uses LV95 because some layers return nothing in WGS 84, so the fix belongs on
the conversion: a rigorous transformation (proj4js, or the closed-form Swiss
projection) instead of the approximation.

### 15. Remote HTML in the identify popup

`runIdentify` inserts the `htmlPopup` response of api3.geo.admin.ch into the
page as it is. The source is a federal service, but the page would run whatever
it returns. Recommendation: render it in a sandboxed frame or sanitise it.

### 16. Unstable feature ids

A feature's id is its position in the assembled collection (Standorte, then
parcels, then elements, then markers). Adding one parcel shifts every element
id, so a shared `?sel=` link then selects something else. Recommendation: ids
built from entity type and source id.

### 17. Keyboard access to table rows

Rows react to clicks and hover only; they cannot be focused. Recommendation:
make the row or its first cell a button, and use one delegated listener on the
table body instead of three listeners per row and render.

### 18. Maintainability

- `map.js` still holds the external layers, identify, the measure tool and the
  header search. Each is self-contained and could be its own file.
- `scripts/gdb_to_geojson.py`, `scripts/split_entities.mjs` and `DATAMODEL.md`
  still use `tree_canopy` / `crown_radius` for the circles. Renaming them is a
  pipeline change with regenerated data files.
- The «Bearbeiten» button only shows a banner and suspends selection. Hide it
  until the edit flow exists, or keep it as an announced placeholder.
- The table filter reaches the map as a list of feature ids on twelve layers.
  That is fine for 6 000 features and will not scale much further.

## Consequences of this round's interaction rules

Two things follow from decisions taken while this review ran, and are worth
knowing:

- Selecting never moves the map. On phones, an open table hides the feature
  card, so after tapping a row there is no zoom button until the table is
  closed.
- The prototype banner takes 24 px. At 1280×585 a feature card with a pager
  and a two-line profile name now scrolls slightly.

## Not verified

Real devices, Safari and iOS, and printing on paper. The print layout was
checked through Chromium's print pipeline, not on a printer.
