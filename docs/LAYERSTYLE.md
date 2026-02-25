# Layer Style Guide

Canonical style reference for all map layers in Green Inventory. Styles are designed for dual-basemap readability (Mapbox Light grey + Satellite/Hybrid).

## Design Principles

| Principle | Rule |
|---|---|
| **Satellite readability** | All outlines ≥ 0.6 opacity; circle markers have white strokes; no very light fills that vanish on imagery |
| **Light map readability** | Fill opacities ≤ 0.35 so the base map labels and contours remain visible |
| **Semantic colors** | Green = vegetation, blue = water, grey = hard surfaces, brown = furniture, indigo = cadastral, amber = ecological structures |
| **Solid lines only** | All outlines use solid lines for a clean, consistent appearance |
| **Points always on top** | Circle markers render above all polygons and lines; white stroke ensures visibility on any basemap |

## Load Hierarchy (z-order)

Layers are added to the map in this order. Lower z-index = rendered first (behind higher layers).

| Z | Layer ID | Geometry | Display Name | Rationale |
|---|---|---|---|---|
| 1 | `parcels` | Polygon | Grundstücke | Cadastral boundaries — ground-level reference grid |
| 2 | `forest` | Polygon | Wald | Large natural forest areas |
| 3 | `woodlands` | Polygon | Gehölze & Parkwald | Smaller woodland areas within sites |
| 4 | `external-areas` | Polygon | Externe Bewirtschaftung | Externally managed zones |
| 5 | `lawns` | Polygon | Rasen & Wiesen | Grass and meadow surfaces |
| 6 | `gardens` | Polygon | Gärten | Designed garden areas |
| 7 | `plantings` | Polygon | Stauden & Pflanzungen | Perennial and shrub beds |
| 8 | `building-greenery` | Polygon | Gebäude-/Ausstattungsbegrünung | Green roofs, façade greening |
| 9 | `surfaces` | Polygon | Belagsflächen | Hard surfaces (paths, plazas, asphalt) |
| 10 | `water-features` | Polygon | Gewässer | Ponds, fountains, streams |
| 11 | `buildings` | Polygon | Gebäude | Building footprints (on top of landscape) |
| 12 | `linear-features` | LineString | Linienobjekte | Hedges, walls, edges (lines above fills) |
| 13 | `structure-elements` | Point | Strukturelemente | Ecological structures (nesting boxes, insect hotels) |
| 14 | `trees` | Point | Bäume | Individual trees |
| 15 | `furniture` | Point | Mobiliar | Benches, bins, lighting |

**Logic:** Large ground-cover polygons at bottom → smaller/specific polygons → buildings → lines → points on top.

## Polygon Layers

### parcels — Grundstücke
Cadastral land boundaries. Transparent fill with a solid border.

| Property | Value |
|---|---|
| Fill color | *transparent* |
| Fill opacity | `0` |
| Line color | `#5c6bc0` (indigo) |
| Line width | `2` |
| Line opacity | `0.8` |

### forest — Wald
Dense forest areas under forestry management.

| Property | Value |
|---|---|
| Fill color | `#1b5e20` (dark green) |
| Fill opacity | `0.20` |
| Line color | `#1b5e20` |
| Line width | `1.5` |
| Line opacity | `0.6` |

### woodlands — Gehölze & Parkwald
Park woodland, tree groups, and hedgerow plantings.

| Property | Value |
|---|---|
| Fill color | `#388e3c` (medium green) |
| Fill opacity | `0.20` |
| Line color | `#2e7d32` |
| Line width | `1.5` |
| Line opacity | `0.6` |

### external-areas — Externe Bewirtschaftung
Zones managed by third parties.

| Property | Value |
|---|---|
| Fill color | `#78909c` (blue-grey) |
| Fill opacity | `0.12` |
| Line color | `#546e7a` |
| Line width | `1.5` |
| Line opacity | `0.6` |

### lawns — Rasen & Wiesen
Grass surfaces, meadows, and maintained lawns.

| Property | Value |
|---|---|
| Fill color | `#66bb6a` (fresh green) |
| Fill opacity | `0.20` |
| Line color | `#43a047` |
| Line width | `1.5` |
| Line opacity | `0.6` |

### gardens — Gärten
Designed garden areas (historic gardens, ornamental gardens).

| Property | Value |
|---|---|
| Fill color | `#81c784` (light green) |
| Fill opacity | `0.22` |
| Line color | `#66bb6a` |
| Line width | `1.5` |
| Line opacity | `0.6` |

### plantings — Stauden & Pflanzungen
Perennial beds, shrub plantings, ground-cover areas.

| Property | Value |
|---|---|
| Fill color | `#aed581` (lime green) |
| Fill opacity | `0.22` |
| Line color | `#8bc34a` |
| Line width | `1.5` |
| Line opacity | `0.6` |

### building-greenery — Gebäude-/Ausstattungsbegrünung
Green roofs, façade greening, planter systems on structures.

| Property | Value |
|---|---|
| Fill color | `#00c853` (bright green) |
| Fill opacity | `0.25` |
| Line color | `#00c853` |
| Line width | `1.5` |
| Line opacity | `0.6` |

### surfaces — Belagsflächen
Hard surfaces: asphalt, gravel, paving, concrete.

| Property | Value |
|---|---|
| Fill color | `#bdbdbd` (light grey) |
| Fill opacity | `0.20` |
| Line color | `#9e9e9e` |
| Line width | `1.5` |
| Line opacity | `0.6` |

### water-features — Gewässer
Ponds, fountains, retention basins, streams.

| Property | Value |
|---|---|
| Fill color | `#42a5f5` (blue) |
| Fill opacity | `0.30` |
| Line color | `#1e88e5` |
| Line width | `2` |
| Line opacity | `0.7` |

### buildings — Gebäude
Building footprints.

| Property | Value |
|---|---|
| Fill color | `#90a4ae` (blue-grey) |
| Fill opacity | `0.35` |
| Line color | `#78909c` (dark blue-grey) |
| Line width | `2` |
| Line opacity | `0.9` |

Selected building highlight: `#c00` (red), line-width `3`.

## Line Layers

### linear-features — Linienobjekte
Hedges, walls, retaining edges, paths.

| Property | Value |
|---|---|
| Line color | `#558b2f` (olive green) |
| Line width | `3` |
| Line opacity | `0.7` |

## Point Layers

All point layers use `circle` type with a white stroke for basemap contrast.

### structure-elements — Strukturelemente
Ecological structures: nesting boxes, insect hotels, dry stone walls.

| Property | Value |
|---|---|
| Circle radius | `6` |
| Circle color | `#ff8f00` (amber) |
| Circle stroke width | `1.5` |
| Circle stroke color | `#ffffff` |

### trees — Bäume
Individual trees (specimen, avenue, park trees).

| Property | Value |
|---|---|
| Circle radius | `7` |
| Circle color | `#2e7d32` (dark green) |
| Circle stroke width | `1.5` |
| Circle stroke color | `#ffffff` |

### furniture — Mobiliar
Site furniture: benches, waste bins, lighting, signage.

| Property | Value |
|---|---|
| Circle radius | `6` |
| Circle color | `#8d6e63` (brown) |
| Circle stroke width | `1.5` |
| Circle stroke color | `#ffffff` |

## Color Reference

Quick visual reference grouped by semantic category.

| Category | Layers | Color Range |
|---|---|---|
| Vegetation (dark → light) | forest, woodlands, lawns, gardens, plantings, building-greenery | `#1b5e20` → `#00c853` |
| Water | water-features | `#42a5f5` |
| Hard surfaces | surfaces | `#bdbdbd` |
| Buildings | buildings | `#90a4ae` (blue-grey) |
| Cadastral | parcels | `#5c6bc0` (indigo) |
| External mgmt | external-areas | `#78909c` (blue-grey) |
| Lines | linear-features | `#558b2f` (olive) |
| Ecological | structure-elements | `#ff8f00` (amber) |
| Trees | trees | `#2e7d32` |
| Furniture | furniture | `#8d6e63` (brown) |

## GeoJSON Source Files

| Layer ID | File | Geometry Type |
|---|---|---|
| parcels | `data/parcels.geojson` | Polygon |
| forest | `data/forest.geojson` | Polygon |
| woodlands | `data/woodlands.geojson` | Polygon |
| external-areas | `data/external-areas.geojson` | Polygon |
| lawns | `data/lawns.geojson` | Polygon |
| gardens | `data/gardens.geojson` | Polygon |
| plantings | `data/plantings.geojson` | Polygon |
| building-greenery | `data/building-greenery.geojson` | Polygon |
| surfaces | `data/surfaces.geojson` | Polygon |
| water-features | `data/water-features.geojson` | Polygon |
| buildings | `data/buildings.geojson` | Polygon |
| linear-features | `data/linear-features.geojson` | LineString |
| structure-elements | `data/structure-elements.geojson` | Point |
| trees | `data/trees.geojson` | Point |
| furniture | `data/furniture.geojson` | Polygon |
