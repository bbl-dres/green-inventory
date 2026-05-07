// ═══════════════════════════════════════════════════════════════════════════
// CONFIG — legend groups, palette, expressions, table columns
//
// The GeoJSON loaded by this app comes from scripts/gdb_to_geojson.py and
// contains six entity_types:
//   site            - 73 boundary polygons (Standortfläche)
//   site_location   - 73 centroid dots (one per Standort, useful zoomed out)
//   area            - polygon vegetation/surface (coloured by fk_profil hash)
//   tree_canopy     - circle polygons (tree crowns)
//   tree            - point trees with baumart
//   point           - other points (Kleinstrukturen, lamps, etc.)
// ═══════════════════════════════════════════════════════════════════════════

// ── Number formatting (Swiss style: 1'000.0) ─────────────────────────────
function fmtNum(v, decimals) {
  if (v == null || v === '') return '–';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  const fixed = decimals != null ? n.toFixed(decimals) : String(n);
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '’');
  return dec != null ? grouped + '.' + dec : grouped;
}

// ── Deterministic colour for fk_profil codes ─────────────────────────────
// The catalog from the source DB isn't available yet, so we hash the integer
// profile code into a stable HSL colour.  When the codelist arrives, swap
// this for an explicit lookup.
const _profileColorCache = {};
function profilColor(p) {
  if (p == null) return '#bbbbbb';
  if (_profileColorCache[p]) return _profileColorCache[p];
  // Spread hues across 0..360 using a multiplicative hash that avoids the
  // muddy yellow-green band where text contrast suffers.
  const hue = (p * 137) % 360;
  const sat = 55 + (p % 3) * 6;
  const lum = 60 + (p % 2) * 6;
  const c = `hsl(${hue}, ${sat}%, ${lum}%)`;
  _profileColorCache[p] = c;
  return c;
}

// ── Entity-type palette ──────────────────────────────────────────────────
const ENTITY_COLORS = {
  site:          { fill: '#7d8a9c', stroke: '#3d4757' },
  site_location: { fill: '#cc1f1f', stroke: '#7a0d0d' },
  area:          { fill: '#bdbdbd', stroke: 'rgba(0,0,0,0.32)' }, // overridden by profile hash
  tree_canopy:   { fill: '#5fa84a', stroke: '#2f6d20' },
  tree:          { fill: '#2d8000', stroke: '#0e3f00' },
  point:         { fill: '#e08a1c', stroke: '#7a4a06' },
};

// ── Legend groups (driven by entity_type, not category) ──────────────────
// NOTE: order matters - top group renders on top of map.
const LEGEND_GROUPS = [
  {
    id: 'site_location', label: 'Standort-Markierungen', entity_type: 'site_location',
    items: [
      { label: 'Standort (ein Punkt pro Parzelle)', fill: '#cc1f1f', swatchClass: 'sw-circ' },
    ]
  },
  {
    id: 'tree', label: 'Bäume', entity_type: 'tree',
    items: [
      { label: 'Baum mit Art', fill: '#2d8000', swatchClass: 'sw-circ' },
    ]
  },
  {
    id: 'tree_canopy', label: 'Baumkronen', entity_type: 'tree_canopy',
    items: [
      { label: 'Kronenfläche (Kreis)', fill: 'rgba(95,168,74,0.45)' },
    ]
  },
  {
    id: 'point_other', label: 'Andere Punktelemente', entity_type: 'point',
    items: [
      { label: 'Kleinstruktur / Möbel / Profil-Punkt', fill: '#e08a1c', swatchClass: 'sw-circ' },
    ]
  },
  {
    id: 'area', label: 'Pflegeflächen', entity_type: 'area',
    items: [] // populated dynamically from data (top profile codes)
  },
  {
    id: 'site', label: 'Standorte (Parzellen)', entity_type: 'site',
    items: [
      { label: 'Standortgrenze', fill: 'rgba(125,138,156,0.22)' },
    ]
  },
];

// ── Map paint expressions ────────────────────────────────────────────────
// Areas: pick fill colour by hashing fk_profil at runtime.  Built once after
// data loads (see installAreaFillExpr below).
let AREA_FILL_EXPR = ['literal', '#bdbdbd'];

function installAreaFillExpr(profileCodes) {
  const stops = [];
  for (const p of profileCodes) {
    stops.push(p, profilColor(p));
  }
  AREA_FILL_EXPR = ['match', ['get', 'fk_profil'], ...stops, '#bdbdbd'];
}

// ── GeoJSON source path ──────────────────────────────────────────────────
const GEOJSON_PATH = 'data/data.geojson';

// ── Basemap definitions ──────────────────────────────────────────────────
const BASEMAPS = [
  { id: 'positron',    label: 'Hell',   bg: '#f2f0ec',
    thumb: 'https://a.basemaps.cartocdn.com/light_all/7/66/45.png',
    url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json' },
  { id: 'dark-matter', label: 'Dunkel', bg: '#1c1c24',
    thumb: 'https://a.basemaps.cartocdn.com/dark_all/7/66/45.png',
    url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' },
  { id: 'voyager',     label: 'Reise',  bg: '#e8dfd0',
    thumb: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/7/66/45.png',
    url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json' },
  { id: 'swisstopo',   label: 'Luftbild', bg: '#2a3a2a',
    thumb: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/8/133/91.jpeg',
    url: 'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.imagerybasemap.vt/style.json' },
];

// ── Table column definitions ─────────────────────────────────────────────
// All raw GDB fields are reachable via this list; default-visible ones cover
// the most useful overview.  Toggle the rest in the column dropdown.
const TABLE_COLS = [
  { key: '_idx',           label: '#',                  visible: true  },
  { key: 'entity_type',    label: 'Typ',                visible: true  },
  { key: 'feature_type',   label: 'Feature',            visible: false },
  { key: 'subtype',        label: 'Subtyp',             visible: true  },
  { key: 'site_name',      label: 'Standort',           visible: true  },
  { key: 'site_objektnummer', label: 'Objekt-Nr.',      visible: false },
  { key: 'site_adresse',   label: 'Adresse',            visible: false },
  { key: 'site_lose',      label: 'Los',                visible: false },
  { key: 'name',           label: 'Name',               visible: false }, // sites only
  { key: 'objektnummer',   label: 'Objekt-Nr.',         visible: false }, // sites only
  { key: 'adresse',        label: 'Adresse',            visible: false }, // sites only
  { key: 'lose',           label: 'Los',                visible: false }, // sites only
  { key: 'pflegeklasse',   label: 'Pflegeklasse',       visible: false },
  { key: 'eigentuemer',    label: 'Eigentümer',         visible: false },
  { key: 'pflegeverantwortung', label: 'Pflegeverantw.',visible: false },
  { key: 'kontrolle',      label: 'Kontrolle',          visible: false },
  { key: 'reinigung',      label: 'Reinigung',          visible: false },
  { key: 'erstellungsjahr',label: 'Baujahr',            visible: false },
  { key: 'erfassungsdatum',label: 'Erfasst',            visible: false },
  { key: 'baumart',        label: 'Baumart',            visible: true  },
  { key: 'baumnummer',     label: 'Baum-Nr.',           visible: false },
  { key: 'fk_baumart',     label: 'fk_baumart',         visible: false },
  { key: 'fk_profil',      label: 'Profil',             visible: true  },
  { key: 'profil_label',   label: 'Profil-Label',       visible: false },
  { key: 'fk_pflegedurchfuehrung', label: 'fk_pflegedurchf.', visible: false },
  { key: 'fk_pflegeklasse',label: 'fk_pflegeklasse',    visible: false },
  { key: 'fk_pflegeverantwortung', label: 'fk_pflegeverantw.', visible: false },
  { key: 'fk_zustand',     label: 'fk_zustand',         visible: false },
  { key: 'fk_winterdienst',label: 'fk_winterdienst',    visible: false },
  { key: 'fk_kostenstelle',label: 'fk_kostenstelle',    visible: false },
  { key: 'kostenstelle_name', label: 'Kostenstelle',    visible: false },
  { key: 'bewaesserung',   label: 'Bewässerung',        visible: false },
  { key: 'lauben',         label: 'Lauben',             visible: false },
  { key: 'max_hoehe_m',    label: 'Max. Höhe m',        visible: false },
  { key: 'hoehe',          label: 'Höhe',               visible: false },
  { key: 'ausmass',        label: 'Ausmass',            visible: false },
  { key: 'naturobjekt',    label: 'Naturobjekt',        visible: false },
  { key: 'parzelle',       label: 'Parzelle',           visible: false },
  { key: 'parzelle_name',  label: 'Parzelle (Name)',    visible: false },
  { key: 'crown_diameter_m', label: 'Krone Ø m',        visible: false },
  { key: 'crown_radius_m', label: 'Krone Radius m',     visible: false },
  { key: 'area_m2',        label: 'Fläche m²',          visible: true,
    fmt: v => fmtNum(v, 1) },
  { key: 'shape_area_m2',  label: 'Standort m²',        visible: false,
    fmt: v => fmtNum(v, 1) },
  { key: 'shape_length_m', label: 'Standort Umfang m',  visible: false,
    fmt: v => fmtNum(v, 1) },
  { key: 'lv95_east',      label: 'LV95 Ost',           visible: false,
    fmt: v => fmtNum(v, 0) },
  { key: 'lv95_north',     label: 'LV95 Nord',          visible: false,
    fmt: v => fmtNum(v, 0) },
  { key: 'lv95_east_centroid',  label: 'LV95 Ost (Z.)', visible: false,
    fmt: v => fmtNum(v, 0) },
  { key: 'lv95_north_centroid', label: 'LV95 Nord (Z.)',visible: false,
    fmt: v => fmtNum(v, 0) },
  { key: 'bemerkung',      label: 'Bemerkung',          visible: false },
  { key: 'titel_objektblatt', label: 'Objektblatt',     visible: false },
  { key: 'titel_kalkulation', label: 'Kalkulation',     visible: false },
  { key: 'source',         label: 'Quelle',             visible: false },
];

// Filter dropdown columns - which columns get a checkbox-list filter.
const FILTER_COLS_DEFAULT = ['entity_type', 'site_lose', 'pflegeklasse',
                             'eigentuemer', 'fk_profil', 'baumart', 'site_name'];
