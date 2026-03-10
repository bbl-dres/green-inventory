// ═══════════════════════════════════════════════════════════════════════════
// CONFIG — legend definitions, colour maps, expressions, constants
// ═══════════════════════════════════════════════════════════════════════════

// ── Number formatting (Swiss style: 1'000.0) ─────────────────────────────
function fmtNum(v, decimals) {
  if (v == null || v === '') return '–';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  const fixed = decimals != null ? n.toFixed(decimals) : String(n);
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u2019');
  return dec != null ? grouped + '.' + dec : grouped;
}

const LEGEND_GROUPS = [
  {
    id: "lawn", label: "Rasen", category: "lawn",
    items: [
      { label: "Geb.Rasen kf.",  fill: "#98e640" },
      { label: "Blumenrasen",    fill: "#98e640", swatchClass: "sw-dots" },
    ]
  },
  {
    id: "meadow", label: "Wiesen", category: "meadow",
    items: [
      { label: "Feuchtwiese",      fill: "#a8e3d9" },
      { label: "Blumenwiese gf.",  fill: "#c6eeab", swatchClass: "sw-pstripe" },
      { label: "Blumenwiese kf.",  fill: "#c6eeab" },
      { label: "Magerrasen",       fill: "#f0f0b0", swatchClass: "sw-vdots" },
      { label: "Saumvegetation",   fill: "#f0f0b0", swatchClass: "sw-odots" },
    ]
  },
  {
    id: "planting_bed", label: "Rabatten", category: "planting_bed",
    items: [
      { label: "Wechselflor",   fill: "#ff74df", swatchClass: "sw-dots" },
      { label: "Moorbeet",      fill: "#5c45a8" },
      { label: "Stauden. int.", fill: "#cc66ff", swatchClass: "sw-pstripe" },
      { label: "Stauden. ext.", fill: "#cc66ff" },
      { label: "Beetrosen",     fill: "#ff5500" },
      { label: "Ruderalfläche", fill: "#ffaa00", swatchClass: "sw-ostripe" },
    ]
  },
  {
    id: "hedge", label: "Hecken", category: "hedge",
    items: [
      { label: "Wildhecke",        fill: "#d9d89e" },
      { label: "Formhecke + 1.5 m",fill: "#c07020", swatchClass: "sw-hstripe" },
      { label: "Formhecke - 1.5 m",fill: "#c07020" },
    ]
  },
  {
    id: "woody_area", label: "Gehölzflächen", category: "woody_area",
    items: [
      { label: "Gehölz & Bodend.", fill: "#8a7248", swatchClass: "sw-dots" },
      { label: "Bodendecker",      fill: "#7a6e3e" },
      { label: "Gehölzrabatte",    fill: "#8a9044", swatchClass: "sw-gdots" },
      { label: "Wald",             fill: "#254700" },
    ]
  },
  {
    id: "special_planting", label: "Spezielle Bepflanzungsformen", category: "special_planting",
    items: [
      { label: "Dach: ext. Stauden", fill: "#ffbebe" },
    ]
  },
  {
    id: "surface", label: "Beläge", category: "surface",
    items: [
      { label: "Asphaltbelag",             fill: "#686868" },
      { label: "Rasengittersteine",         fill: "#70a800", swatchClass: "sw-xhatch" },
      { label: "Holzhäckselbelag",          fill: "#8b3a00", swatchClass: "sw-xhatch" },
      { label: "Chaussierung",              fill: "#cd8a66" },
      { label: "Betonpl./Verbund/Naturstein",fill: "#9c9c9c" },
      { label: "Geröllstreifen/Bollensteine",fill: "#6a6a6a", swatchClass: "sw-gdots" },
    ]
  },
  {
    id: "water", label: "Wasserflächen", category: "water",
    items: [
      { label: "Brunnen",          fill: "#00aae6" },
      { label: "Gewässer, ruhend", fill: "#006fff" },
    ]
  },
  {
    id: "other", label: "Anderes", category: "other",
    items: [
      { label: "Anderes", fill: "#ffff00" },
    ]
  },
  {
    id: "tree", label: "Baum", category: "tree",
    items: [
      { label: "Laubb. Kopf-/Form",         fill: "#b0e000", swatchClass: "sw-circ-cross" },
      { label: "Laubb. nat. kleink.",        fill: "#60c800", swatchClass: "sw-circ" },
      { label: "Laubb. nat. grossk.",        fill: "#38b000", swatchClass: "sw-circ" },
      { label: "Nadelb. nat.",               fill: "#1a7000", swatchClass: "sw-circ" },
      { label: "Hochstammobst",              fill: "#60c800", swatchClass: "sw-circ-cross" },
      { label: "Strassenb. Laub Kopf/Form",  fill: "#007a94", swatchClass: "sw-circ-cross" },
      { label: "Strassenb. Laub nat. kleink.",fill: "#008aaa", swatchClass: "sw-circ" },
      { label: "Strassenb. Laub nat. grossk.",fill: "#006680", swatchClass: "sw-circ" },
    ]
  },
  {
    id: "special_point", label: "Spezielle Bepflanzungsformen", category: null,
    items: [
      { label: "Pflanzgefäss mobil Dauerbepflanzung", fill: "#1a1a8a", swatchClass: "sw-circ" },
      { label: "Pflanzgefäss Wechselflor",             fill: "#cc00cc", swatchClass: "sw-circ" },
      { label: "Schling- & Kletterpf.",                fill: "#cc0000", swatchClass: "sw-triangle" },
    ]
  },
  {
    id: "kleinstrukturen", label: "Kleinstrukturen", category: null,
    items: [
      { label: "Asthaufen",        fill: "#c09060" },
      { label: "Steinhaufen",      fill: "#808080" },
      { label: "Wildbienenhotel",  fill: "#804000" },
      { label: "Baumstämme",       fill: "#604020" },
    ]
  },
];

// ── Subtype-level fill colours for map rendering ───────────────────────────
const SUBTYPE_FILL = {
  'Chaussierung':          '#cd8a66',
  'Asphaltbelag':          '#686868',
  'Rasengittersteine':     '#70a800',
  'Holzhaeckselbelag':     '#8b3a00',
  'Betonpl./Naturstein':   '#9c9c9c',
  'Geroellstreifen':       '#6a6a6a',
  'Feuchtwiese':           '#a8e3d9',
  'Blumenwiese':           '#c6eeab',
  'Saumvegetation':        '#f0f0b0',
  'Geb.Rasen kf.':         '#98e640',
  'Gehoelz & Bodend.':     '#8a7248',
  'Gehoelzrabatte':        '#8a9044',
  'Wald':                  '#254700',
  'Stauden':               '#cc66ff',
  'Moorbeet':              '#5c45a8',
  'Wechselflor':           '#ff74df',
  'Beetrosen':             '#ff5500',
  'Ruderalflaeche':        '#ffaa00',
  'Wildhecke':             '#d9d89e',
  'Formhecke':             '#c07020',
  'Objekt':                '#e8edf2',
  'Dach: ext. Stauden':    '#ffbebe',
  'Brunnen':               '#00aae6',
  'Gewaesser ruhend':      '#006fff',
  'Anderes':               '#ffff00',
};

const CAT_FILL = {
  lawn:            '#98e640', meadow: '#c6eeab',
  planting_bed:    '#cc66ff', hedge: '#c07020', woody_area: '#8a7248',
  special_planting:'#ffbebe', surface: '#9c9c9c', water: '#00aae6',
  other:           '#ffff00', tree: '#60c800',
};

function fillExpr() {
  return ['match', ['get', 'subtype'],
    ...Object.entries(SUBTYPE_FILL).flatMap(([k, v]) => [k, v]),
    ['match', ['get', 'category'],
      ...Object.entries(CAT_FILL).flatMap(([k, v]) => [k, v]),
      '#aaaaaa'
    ]
  ];
}
function lineColorExpr() {
  return ['match', ['get', 'category'],
    'water', '#0055cc',
    'rgba(0,0,0,0.28)'
  ];
}
function lineWidthExpr() {
  return 0.8;
}

// ── GeoJSON source path ────────────────────────────────────────────────────
const GEOJSON_PATH =
  'data/[838147959] 1602.GR_M\u00FChlestrasse 2+4+6+8Gr\u00FCnfl\u00E4chenpflege.geojson';

// ── Basemap definitions ────────────────────────────────────────────────────
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

// ── Table column definitions ───────────────────────────────────────────────
const TABLE_COLS = [
  { key: '_idx',         label: '#',         visible: true  },
  { key: 'feature_type', label: 'Typ',       visible: true  },
  { key: 'subtype',      label: 'Subtyp',    visible: true  },
  { key: 'category',     label: 'Kategorie', visible: false },
  { key: 'area_m2',      label: 'Fläche m²', visible: true,
    fmt: v => fmtNum(v, 1) },
  { key: 'source',       label: 'Quelle',    visible: false },
];
