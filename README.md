# Grünflächen Inventar

**Bundesamt für Bauten und Logistik (BBL)**
Prototype for extracting and visualising green space features from landscape plan PDFs.

---

## Project structure

```
green-inventory/
├── index.html              # Map viewer (MapLibre GL JS + CARTO basemap)
├── extract_features.py     # PDF → GeoJSON extraction script
├── data/
│   ├── [838147959] 1602.GR_Mühlestrasse 2+4+6+8Grünflächenpflege.pdf
│   └── [838147959] 1602.GR_Mühlestrasse 2+4+6+8Grünflächenpflege.geojson
└── prototype1/             # Earlier prototype (separate app)
```

---

## extract_features.py

Extracts vector features from a Swiss landscape plan PDF (*Grünflächenpflege*, scale 1:650) and outputs a WGS 84 GeoJSON file.

### Dependencies

```bash
pip install pymupdf shapely numpy pyproj
```

### Usage

```bash
python extract_features.py
```

Input and output paths are configured at the top of the script (`PDF_PATH`, `OUTPUT_PATH`).

### How it works

The script reads all vector drawing paths from the PDF page using **PyMuPDF** and processes them in two passes:

#### Pass 1 — Large filled areas (`>= 20 pt` in both dimensions)
These are solid-colour polygons and hatching stripes that define feature boundaries directly. Paths are grouped by their classified feature type, then merged using a **buffer → union → erode** operation (`MERGE_BUFFER_M = 1.8 m`) to collapse individual hatch stripes into unified area polygons. The result is exploded back into individual polygons per spatially disconnected region.

#### Pass 2 — Pattern tiles (`< 20 pt`)
These are the small repeated elements (dots, dashes, crosshatch marks) that fill patterned areas. Each tile's bounding rect is converted to a small Shapely polygon, then the same **buffer → union → erode** approach merges adjacent tiles into area polygons. This replaces the earlier convex-hull-of-centroids approach, which over-estimated boundaries.

#### Color classification
Each path's fill RGB is matched against `FEATURE_COLORS` (a lookup table of ~30 entries) using Euclidean distance in RGB space with a tolerance of `0.04`. Unclassified fills (white building footprints, etc.) are skipped — those will be sourced from official survey data.

#### Georeferencing
A single ground control point (GCP) is used:

| GCP | WGS 84 | Assumed local position |
|-----|--------|----------------------|
| 1 | 46.97510 N, 7.47417 E | Map centre |

The scale is calibrated from the plan's scale bar (174.49 PDF points = 40 m → **1 pt ≈ 0.2292 m**). Local metre coordinates are converted to WGS 84 via Swiss LV95 (EPSG:2056) as an intermediate CRS for accurate metric offsets.

> **Note:** North is assumed to be up. The plan may have a slight rotation. Use the **Position bearbeiten** tool in the map viewer to drag and correct the position, then save the updated GeoJSON.

---

## Legend layers

The following feature types are extracted from the plan. Building footprints and the site boundary (red outline) are intentionally excluded — these will be sourced from official Swiss survey data (amtliche Vermessung).

### Rasen
| Subtype | Category | Description |
|---------|----------|-------------|
| Geb.Rasen kf. | `lawn` | Gebundener Rasen, kurzgehalten |
| Blumenrasen | `lawn` | Flower lawn (dotted pattern) |

### Wiesen
| Subtype | Category | Description |
|---------|----------|-------------|
| Feuchtwiese | `meadow` | Wet meadow |
| Blumenwiese gf. | `meadow` | Flower meadow, grosspflegig (stripe pattern) |
| Blumenwiese kf. | `meadow` | Flower meadow, kleinpflegig |
| Magerrasen | `meadow` | Dry grassland (dot pattern) |
| Saumvegetation | `meadow` | Edge vegetation (dot pattern) |

### Rabatten
| Subtype | Category | Description |
|---------|----------|-------------|
| Wechselflor | `planting_bed` | Annual/seasonal bedding |
| Moorbeet | `planting_bed` | Bog/heath bed |
| Stauden int. | `planting_bed` | Perennial bed, intensiv |
| Stauden ext. | `planting_bed` | Perennial bed, extensiv |
| Beetrosen | `planting_bed` | Rose bed |
| Ruderalfläche | `planting_bed` | Ruderal area |

### Hecken
| Subtype | Category | Description |
|---------|----------|-------------|
| Wildhecke | `hedge` | Native mixed hedge |
| Formhecke + 1.5 m | `hedge` | Clipped hedge, height > 1.5 m |
| Formhecke - 1.5 m | `hedge` | Clipped hedge, height ≤ 1.5 m |

### Gehölzflächen
| Subtype | Category | Description |
|---------|----------|-------------|
| Gehölz & Bodend. | `woody_area` | Shrub planting with groundcover |
| Bodendecker | `woody_area` | Groundcover only |
| Gehölzrabatte | `woody_area` | Mixed shrub border |
| Wald | `woody_area` | Forest / woodland |

### Spezielle Bepflanzungsformen
| Subtype | Category | Description |
|---------|----------|-------------|
| Dach: ext. Stauden | `special_planting` | Extensive roof planting with perennials |

### Beläge
| Subtype | Category | Description |
|---------|----------|-------------|
| Asphaltbelag | `surface` | Asphalt paving |
| Rasengittersteine | `surface` | Grass pavers (crosshatch pattern) |
| Holzhäckselbelag | `surface` | Wood chip surface |
| Chaussierung | `surface` | Gravel/crushed stone path |
| Betonpl./Verbund/Naturstein | `surface` | Concrete, composite or stone paving |
| Geröllstreifen/Bollensteine | `surface` | Gravel strip / cobblestones |

### Wasserflächen
| Subtype | Category | Description |
|---------|----------|-------------|
| Brunnen | `water` | Fountain / drinking trough |
| Gewässer, ruhend | `water` | Still water body |

### Anderes
| Subtype | Category | Description |
|---------|----------|-------------|
| Anderes | `other` | Other / unclassified green space |

---

## GeoJSON output format

```json
{
  "type": "FeatureCollection",
  "crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:OGC:1.3:CRS84" } },
  "metadata": {
    "source_pdf": "...",
    "site": "Muehlestrasse 2-6, 3063 Ittigen",
    "scale": "1:650",
    "gcp1_wgs84": [46.97510, 7.47417],
    "map_extent_m": [245.7, 251.8],
    "approx_bbox_wgs84": [7.4726, 46.9740, 7.4758, 46.9762],
    "offset_m": [0.0, 0.0]
  },
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [...] },
      "properties": {
        "feature_type": "Belag",
        "subtype": "Chaussierung",
        "category": "surface",
        "fill_rgb": [0.804, 0.537, 0.4],
        "source": "area_merged",
        "area_m2": 283.0
      }
    }
  ]
}
```

**`source` field values:**
- `area_merged` — reconstructed from large filled paths (solid areas or merged hatch stripes)
- `pattern_merged` — reconstructed from small pattern tiles (dots, dashes, crosshatch)

---

## Map viewer

Open `index.html` via a local HTTP server (required for the `fetch` call):

```bash
python -m http.server 8000
# then open http://localhost:8000
```

Features:
- CARTO Positron basemap via MapLibre GL JS (no API key required)
- Full legend panel matching the plan legend, grouped identically
- Eye icon toggles per legend group
- Hover popup with feature type, subtype, area m²
- **Position bearbeiten** — drag the entire layer to correct georeferencing offset, then download the updated GeoJSON
