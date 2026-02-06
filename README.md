# Green Area Inventory / Grünflächeninventar GIS

> [!CAUTION]
> **This is an unofficial mockup for demonstration purposes only.**
> All data is fictional. Not all features are fully functional. This project serves as a visual and conceptual prototype — it is not intended for production use.

Interactive GIS web application mockup for urban green space inventory, maintenance planning, and field survey — built around interactive maps, care profiles, and task management.

**Live Demo:** [bbl-dres.github.io/green-inventory](https://bbl-dres.github.io/green-inventory/)

## Features

### Core Views
- **Map View** — Interactive Mapbox map with multi-layer management (green areas, trees, furniture, buildings, parcels), 4 basemap styles, swisstopo WMTS integration, measurement tools, and geometry editing
- **Wiki View** — Sortable table with search, filtering, configurable columns, and export to CSV/Excel/GeoJSON
- **Task View** — Maintenance planning with calendar, task assignment, checklists, and time tracking
- **Dashboard** — KPI display with cost analysis, budget utilization, and trend reporting
- **Detail View** — Comprehensive property dashboard with tabbed sections:
  - Overview (images, basic info, mini-map)
  - Measurements (SIA 416 compliant area data)
  - Documents (plans, certificates, permits)
  - Costs (operational expenses by category)
  - Contracts (service & maintenance agreements)
  - Contacts (personnel & stakeholders)
  - Facilities (equipment & infrastructure inventory)

### Inventory & Geometry Editing
- **Green Areas** (Polygons) — Profile types, area m², condition, usage intensity, soil type, irrigation status
- **Trees** (Points) — Species, trunk circumference, crown diameter, height, planting year, condition, protection status
- **Furniture** (Points) — Benches, fountains, play equipment with type classification
- **Buildings & Parcels** — Building identifiers, cadastral data integration
- Full polygon/point/line editing with snapping, undo/redo, validation, and split/merge operations

### Care Profile Library (Pflegeprofil-Bibliothek)
- 31 standardized GSZ profiles across 9 categories (lawns, plantings, shrubs, trees, special surfaces, structural elements, surfaces, water features, usage areas)
- Structured maintenance instructions with timing, frequency, equipment, and cost data
- Automatic map coloring based on assigned care profile

### Search & Filtering
- Multi-source search: local objects + Swisstopo location API + geocat.ch layers
- Attribute filtering with complex combinations (profile type, condition, status, responsibility)
- Deep linking with URL-based navigation and filter persistence

### Data Export
- CSV, Excel (.xlsx), GeoJSON, and KML export
- Custom column selection before export

## Tech Stack

| Technology | Version | Usage |
|------------|---------|-------|
| Vanilla JavaScript | ES6+ | Application logic |
| Mapbox GL JS | v3.4.0 | Interactive WebGL map |
| CSS3 + Design Tokens | Modern | Styling (Flexbox, Grid, CSS Variables) |
| GeoJSON | RFC 7946 | Geospatial data format |
| Swisstopo API | v3 | Swiss location search & WMTS tiles |
| geo.admin.ch API | — | ÖREB-Kataster, Amtliche Vermessung |
| Material Symbols | Google | Icon library |

No build tools or frameworks — pure static files.

## Getting Started

```bash
# Python
python -m http.server 8000

# Node.js
npx http-server

# PHP
php -S localhost:8000
```

Then open http://localhost:8000

## Project Structure

```
green-inventory/
├── index.html                    # HTML structure
├── js/
│   └── app.js                    # Application logic (~4,100 lines)
├── css/
│   ├── tokens.css                # Design token system
│   └── main.css                  # Styles & design system
├── data/
│   ├── sites.geojson             # Site/location perimeters
│   ├── green-areas.geojson       # Green space areas
│   ├── trees.geojson             # Tree inventory
│   ├── furniture.geojson         # Park furniture/equipment
│   ├── buildings.geojson         # Building geometries
│   ├── parcels.geojson           # Land parcels
│   ├── care-profiles.json        # GSZ care profile library (31 profiles)
│   ├── contacts.json             # Personnel & stakeholders
│   ├── contracts.json            # Service agreements
│   ├── costs.json                # Operational expenses
│   ├── documents.json            # Plans, certificates, permits
│   ├── assets.json               # Equipment inventory
│   ├── furniture.json            # Additional furniture data
│   └── area-measurements.json    # Area measurement data
├── assets/
│   └── images/                   # Preview screenshots & icons
├── documentation/
│   ├── DATAMODEL.md              # Complete entity schema
│   └── DESIGNGUIDE.md            # Design system & components
├── REQUIEREMENTS.md              # 171 detailed requirements (MoSCoW)
├── README.md
└── LICENSE
```

## Swiss Standards & Integrations

| Standard / Service | Description |
|--------------------|-------------|
| GSZ "Mehr als Grün" | Care profile catalog for green space maintenance |
| SIA 416 | Building area measurements (BGF, NGF, EBF) |
| SIA 380/1 | Energy reference area |
| LV95 (EPSG:2056) | Swiss coordinate system |
| WGS84 (EPSG:4326) | GeoJSON coordinate system |
| EGID / EGRID | Federal Building & Property Identifiers |
| swisstopo WMTS | Official Swiss mapping tiles |
| ÖREB-Kataster | Public-law restrictions on land ownership |
| Amtliche Vermessung | Official cadastral survey data |
| Infoflora | Invasive neophyte species database |

## Deployment

**GitHub Pages:** Push to `main` deploys automatically.

**Alternatives:** Netlify, Vercel, CloudFlare Pages, or any static file server.

## License

Licensed under [MIT](https://opensource.org/licenses/MIT)

---

> [!CAUTION]
> **This is an unofficial mockup for demonstration purposes only.**
> All data is fictional. Not all features are fully functional. This project serves as a visual and conceptual prototype — it is not intended for production use.
