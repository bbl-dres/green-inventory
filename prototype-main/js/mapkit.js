// ═══════════════════════════════════════════════════════════════════════════
// MAPKIT — map building blocks shared by the main map (map.js) and the
// Situationsplan of the Standort detail page (standort.js): the inventory
// layers and their filters, the selection / hover overlays, hit-testing, the
// profile fill patterns, the 3D layers, the control button group, the basemap
// switcher and the context-menu helpers.  Every function takes the MapLibre
// map it works on; nothing here knows about the app state.
// Depends on: config.js (ENTITY_COLORS, TOKENS, PATTERN_DEFS, profilStyle,
//   BASEMAPS, AREA_FILL_EXPR, *_PROFILE_STYLE), util.js (escapeHtml)
// ═══════════════════════════════════════════════════════════════════════════

// All map layers we add - kept in one place so filters/visibility/cleanup are simple.
const MAP_LAYERS = {
  polygons: ['parcel-fill', 'site-fill', 'area-fill', 'area-pattern', 'area-line',
             'parcel-line', 'site-line'],
  points:   ['tree-circle', 'point-circle'],
  labels:   ['parcel-label'],   // separate point source: label anchors precomputed in the pipeline
  sites:    ['site-location-circle', 'site-location-label'],   // on top: the Standort points and names
  selection:['selection-fill', 'selection-line', 'selection-circle'],
  hover:    ['hover-line', 'hover-circle'],
};
// The data layers, bottom to top (the order addInventoryLayers adds them in).
const ALL_LAYERS = [...MAP_LAYERS.polygons, ...MAP_LAYERS.points, ...MAP_LAYERS.labels, ...MAP_LAYERS.sites];

// All map layers that should be hit-tested for click / hover.
const INTERACTIVE_LAYERS = ['parcel-fill', 'site-fill', 'area-fill',
                             'tree-circle', 'point-circle', 'site-location-circle'];

// Sources / layers of ours that a basemap swap must carry over (the callers
// add their own, e.g. the external swisstopo layers of the main map).
const INVENTORY_SOURCE_IDS = ['features', 'parcel-labels', 'osm-buildings-3d', 'tree-3d'];
const EXTRUSION_LAYER_IDS = ['osm-buildings-3d', 'tree-3d'];
function inventoryLayerIds() {
  return [...ALL_LAYERS, ...MAP_LAYERS.selection, ...MAP_LAYERS.hover, ...EXTRUSION_LAYER_IDS];
}

// A filter that matches nothing (hides a layer without touching `visibility`,
// which the 3D mode uses for its own purposes).
const FILTER_NONE = ['==', ['literal', '0'], ['literal', '1']];

// «Zoom to» never goes closer than this, however small the object: a single
// tree or a small bed stays readable in its surroundings.
const ZOOM_TO_MAX = 18.5;

// Below this zoom — a country, a region, a city — the map shows the Standorte
// as points only; perimeters, parcels, areas, trees and point elements appear
// from here on.  (The largest Standort fits a phone screen at zoom 15.)
const DETAIL_MIN_ZOOM = 14;

// entity_type each layer draws.
const _LAYER_ENTITY = {
  'parcel-fill': 'parcel', 'parcel-line': 'parcel', 'parcel-label': 'parcel',
  'site-fill': 'site', 'site-line': 'site',
  'area-fill': 'area', 'area-pattern': 'area', 'area-line': 'area',
  'tree-circle': 'tree', 'point-circle': 'point',
  'site-location-circle': 'site_location', 'site-location-label': 'site_location',
};
function layerEntityType(id) { return _LAYER_ENTITY[id] || null; }

// ── Label font ────────────────────────────────────────────────────────────
// Glyphs are served by the basemap style's own font server, and every server
// carries different fonts (CARTO: Montserrat / Open Sans; swisstopo: Frutiger
// Neue).  A symbol layer that asks for a font the server does not have fails
// its whole tile: MapLibre then drops every layer in that tile, not just the
// label — areas, trees and perimeters vanished after a switch to the
// Luftbild.  So our labels use a font stack the active style itself uses:
// the most frequent upright, regular-weight one.
const LABEL_FONT_FALLBACK = ['Open Sans Regular', 'Arial Unicode MS Regular'];
const _OWN_SYMBOL_LAYERS = ['site-location-label', 'parcel-label'];
function styleLabelFont(style) {
  const uses = new Map();                 // JSON of a font stack → number of layers
  for (const l of (style && style.layers) || []) {
    const stack = l.layout && l.layout['text-font'];
    if (l.type !== 'symbol' || _OWN_SYMBOL_LAYERS.includes(l.id)) continue;
    // Literal stacks only: an expression is an array too, but it starts with
    // an operator name (lower case, no blanks) instead of a font name.
    if (!Array.isArray(stack) || !stack.length || !stack.every(s => typeof s === 'string')) continue;
    if (/^[a-z][a-z-]*$/.test(stack[0])) continue;
    const key = JSON.stringify(stack);
    uses.set(key, (uses.get(key) || 0) + 1);
  }
  let best = null, bestScore = -1;
  for (const [key, n] of uses) {
    const first = JSON.parse(key)[0];
    const plain = /regular|medium|book/i.test(first) && !/italic|bold|condensed|light/i.test(first);
    const score = (plain ? 1e6 : 0) + n;
    if (score > bestScore) { bestScore = score; best = key; }
  }
  return best ? JSON.parse(best) : LABEL_FONT_FALLBACK;
}
// A copy of one of our layers with the label font of `style` (other layers
// are returned as they are).
function withStyleLabelFont(layer, style) {
  if (layer.type !== 'symbol' || !layer.layout || !layer.layout['text-font']) return layer;
  return { ...layer, layout: { ...layer.layout, 'text-font': styleLabelFont(style) } };
}

// ── Profile styles (runtime index from care_profiles.json, seed as fallback) ──
function _profileStyleIndex(domain) {
  const idx = (typeof PROFILE_STYLES !== 'undefined' && PROFILE_STYLES) ? PROFILE_STYLES[domain] : null;
  if (idx && Object.keys(idx).length) return idx;
  return domain === 'idPPy' ? AREA_PROFILE_STYLE : POINT_PROFILE_STYLE;
}

// MapLibre paint expression: per-profile colour for trees and other points.
// One `match` over every idPP code, shared by both point layers: a point with
// a tree profile but no species is still coloured as that tree profile.
function pointProfileColorExpr(defaultColor) {
  const stops = [];
  for (const [code, style] of Object.entries(_profileStyleIndex('idPP'))) {
    if (style && style.fill) stops.push(Number(code), style.fill);
  }
  if (stops.length === 0) return defaultColor;
  return ['match', ['get', 'fk_profil'], ...stops, defaultColor];
}

// ── Fill patterns ─────────────────────────────────────────────────────────
// Area profiles that share a colour carry a pattern (dots, stripes, cross-
// hatch).  The legend draws it in CSS; the map draws the same kind and ink
// from a small canvas image, laid over the coloured fill as a second layer.
function patternImageId(cls) { return 'pat-' + cls; }

// pattern class → [area profile codes]
function _patternedAreaCodes() {
  const out = {};
  for (const [code, style] of Object.entries(_profileStyleIndex('idPPy'))) {
    const cls = style && style.swatchClass;
    if (cls && PATTERN_DEFS[cls]) (out[cls] = out[cls] || []).push(Number(code));
  }
  return out;
}

function makePatternImage(cls) {
  const def = PATTERN_DEFS[cls];
  if (!def) return null;
  const RATIO = 2;
  const S = def.size * RATIO;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  const ink = cssToken(def.ink);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  if (def.kind === 'dots') {
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.17, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 45° lines, drawn across the tile and its neighbours so the corners join.
    ctx.lineWidth = (def.kind === 'xhatch' ? 0.9 : 1.3) * RATIO;
    ctx.lineCap = 'square';
    const diagonal = (rising) => {
      for (const k of [-1, 0, 1]) {
        ctx.beginPath();
        if (rising) { ctx.moveTo(k * S, S); ctx.lineTo(k * S + S, 0); }
        else        { ctx.moveTo(k * S, 0); ctx.lineTo(k * S + S, S); }
        ctx.stroke();
      }
    };
    diagonal(true);
    if (def.kind === 'xhatch') diagonal(false);
  }
  const img = ctx.getImageData(0, 0, S, S);
  return { image: { width: S, height: S, data: new Uint8Array(img.data.buffer) }, pixelRatio: RATIO };
}

// (Re-)add the pattern images.  Idempotent; call after every style load —
// a basemap swap drops images added at runtime.
function ensurePatternImages(m) {
  for (const cls of Object.keys(PATTERN_DEFS)) {
    const id = patternImageId(cls);
    if (m.hasImage(id)) continue;
    const pat = makePatternImage(cls);
    if (pat) m.addImage(id, pat.image, { pixelRatio: pat.pixelRatio });
  }
}
// Safety net: MapLibre asks for an image it does not have (first render after
// a style swap, before ensurePatternImages ran).
function installPatternImages(m) {
  m.on('styleimagemissing', (e) => {
    if (!e.id || !e.id.startsWith('pat-') || m.hasImage(e.id)) return;
    const pat = makePatternImage(e.id.slice(4));
    if (pat) m.addImage(e.id, pat.image, { pixelRatio: pat.pixelRatio });
  });
}

// Base filter of a layer: its entity_type, and for the pattern layer only the
// profiles that have a pattern.  applyInventoryFilters() ANDs the legend and
// table constraints onto it.
function baseLayerFilter(id) {
  const ent = ['==', ['get', 'entity_type'], layerEntityType(id)];
  if (id !== 'area-pattern') return ent;
  const codes = [].concat(...Object.values(_patternedAreaCodes()));
  return ['all', ent, ['in', ['get', 'fk_profil'], ['literal', codes]]];
}

// ── Inventory layers ──────────────────────────────────────────────────────
// Adds the `features` GeoJSON source and every layer drawn from it, bottom to
// top: parcels, Pflegeperimeter, areas (+ patterns), outlines, crowns, points,
// labels, selection and hover overlays.  Idempotent.
//   opts.detailMinZoom   zoom from which everything but the Standort points
//                        is drawn (default DETAIL_MIN_ZOOM; 0 = always, for a
//                        map of a single Standort)
function addInventoryLayers(m, data, opts = {}) {
  if (!data || m.getSource('features')) return;
  ensurePatternImages(m);
  const detailMin = opts.detailMinZoom != null ? opts.detailMinZoom : DETAIL_MIN_ZOOM;
  let labelFont = LABEL_FONT_FALLBACK;
  try { labelFont = styleLabelFont(m.getStyle()); } catch (_) { /* style still loading */ }
  // tolerance / maxzoom: the GeoJSON source's defaults (0.375, 18) over-
  // simplify our data, leaving angular corners visible against high-
  // contrast aerial imagery at z19+.
  //   tolerance: 0    (no tile-level Douglas-Peucker.  At maxzoom 22 the
  //                    default 0.375 px ≈ 2 mm — already invisible — but
  //                    on a HiDPI screen at z21 with low data density it
  //                    can produce subtle pixel snapping.  Setting 0 makes
  //                    the rendered geometry exactly match the source.)
  //   maxzoom: 22     (re-tile right up to the map's maxZoom so detail
  //                    is preserved past z18 instead of being stretched)
  m.addSource('features', {
    type: 'geojson',
    data,
    tolerance: 0,
    maxzoom: 22,
    attribution: (data.metadata && data.metadata.attribution_html) || undefined,
  });

  // Cadastral parcels (Amtliche Vermessung) — the legal unit of ground and
  // the bottom of the stack: a faint fill so empty parcel ground is clickable,
  // the dashed outline is added above the area fills further down.
  m.addLayer({
    id: 'parcel-fill', type: 'fill', source: 'features',
    minzoom: detailMin,
    filter: baseLayerFilter('parcel-fill'),
    paint: { 'fill-color': ENTITY_COLORS.parcel.fill, 'fill-opacity': 0.06 },
  });

  // Standort perimeters (Pflegeperimeter) — a faint wash as click target; the
  // red outline is added above the area fills further down.
  m.addLayer({
    id: 'site-fill', type: 'fill', source: 'features',
    minzoom: detailMin,
    filter: baseLayerFilter('site-fill'),
    paint: { 'fill-color': ENTITY_COLORS.site.fill, 'fill-opacity': 0.08 },
  });

  // Pflegeflächen (areas) — coloured by profile, patterned where two
  // profiles share a colour.
  m.addLayer({
    id: 'area-fill', type: 'fill', source: 'features',
    minzoom: detailMin,
    filter: baseLayerFilter('area-fill'),
    paint: { 'fill-color': AREA_FILL_EXPR, 'fill-opacity': 0.62 },
  });
  const patterned = _patternedAreaCodes();
  const patternClasses = Object.keys(patterned);
  if (patternClasses.length) {
    const stops = [];
    for (const cls of patternClasses) stops.push(patterned[cls], patternImageId(cls));
    m.addLayer({
      id: 'area-pattern', type: 'fill', source: 'features',
      minzoom: detailMin,
      filter: baseLayerFilter('area-pattern'),
      paint: {
        'fill-pattern': ['match', ['get', 'fk_profil'], ...stops, patternImageId(patternClasses[0])],
        'fill-opacity': 0.6,
      },
    });
  }
  m.addLayer({
    id: 'area-line', type: 'line', source: 'features',
    minzoom: detailMin,
    filter: baseLayerFilter('area-line'),
    paint: { 'line-color': 'rgba(0,0,0,0.35)', 'line-width': 0.5 },
  });

  // Parcel boundaries above the area fills so they stay legible where
  // maintained polygons cover the parcel; dashed, the cadastral convention.
  m.addLayer({
    id: 'parcel-line', type: 'line', source: 'features',
    minzoom: detailMin,
    filter: baseLayerFilter('parcel-line'),
    paint: {
      'line-color': ENTITY_COLORS.parcel.stroke,
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 16, 1.2, 20, 2],
      'line-opacity': 0.85,
      'line-dasharray': [3, 1.5],
    },
  });

  // Pflegeperimeter outline, on top of the parcels (as in the PDF plan).
  m.addLayer({
    id: 'site-line', type: 'line', source: 'features',
    minzoom: detailMin,
    filter: baseLayerFilter('site-line'),
    paint: {
      'line-color': ENTITY_COLORS.site.stroke,
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 1.4, 20, 2.2],
      'line-opacity': 0.9,
    },
  });

  // Tree points - colour by fk_profil so the map matches the legend
  // (Laubbäume green, Strassenbäume teal, Nadelb. dark green, etc.).
  m.addLayer({
    id: 'tree-circle', type: 'circle', source: 'features',
    minzoom: detailMin,
    filter: baseLayerFilter('tree-circle'),
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 16, 3.5, 20, 6],
      'circle-color': pointProfileColorExpr(ENTITY_COLORS.tree.fill),
      'circle-stroke-color': ENTITY_COLORS.tree.stroke,
      'circle-stroke-width': 0.8,
      'circle-opacity': 0.9,
    },
  });

  // Other points - colour by fk_profil through the same point catalog
  // (Pflanzgefäss Wechselflor magenta, Spielgerät orange, ...).
  m.addLayer({
    id: 'point-circle', type: 'circle', source: 'features',
    minzoom: detailMin,
    filter: baseLayerFilter('point-circle'),
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 1.2, 16, 3, 20, 5],
      'circle-color': pointProfileColorExpr(ENTITY_COLORS.point.fill),
      'circle-stroke-color': ENTITY_COLORS.point.stroke,
      'circle-stroke-width': 0.8,
      'circle-opacity': 0.9,
    },
  });

  // Parcel labels: EGRID, and the ERP key on a second line where one is
  // matched.  Anchored at the pole of inaccessibility stored on each parcel
  // (label_lon / label_lat) instead of MapLibre's per-tile placement, which
  // shifts and duplicates labels on parcels that span tile boundaries.  The
  // label points carry the parcel's feature id and entity_type so the legend
  // eye and the table filter apply to them unchanged.
  if (!m.getSource('parcel-labels')) {
    const labelFeatures = [];
    data.features.forEach((f, i) => {
      const p = f.properties;
      if (p.entity_type !== 'parcel' || p.label_lon == null || p.label_lat == null) return;
      const props = { entity_type: 'parcel', egrid: p.egrid || '',
                      label: p.erp_id ? p.egrid + '\n' + p.erp_id : (p.egrid || '') };
      labelFeatures.push({ type: 'Feature', id: f.id != null ? f.id : i,
        geometry: { type: 'Point', coordinates: [p.label_lon, p.label_lat] }, properties: props });
    });
    m.addSource('parcel-labels', { type: 'geojson', data: { type: 'FeatureCollection', features: labelFeatures } });
  }
  m.addLayer({
    id: 'parcel-label', type: 'symbol', source: 'parcel-labels',
    filter: baseLayerFilter('parcel-label'),
    minzoom: 16,
    layout: {
      'text-field': ['get', 'label'],
      'text-font': labelFont,
      'text-size': ['interpolate', ['linear'], ['zoom'], 16, 10, 19, 12],
      'text-line-height': 1.15,
      'text-justify': 'center',
      'text-anchor': 'center',
      'text-allow-overlap': false,
      'text-optional': true,
    },
    paint: {
      'text-color': ENTITY_COLORS.parcel.stroke,
      'text-halo-color': 'rgba(255,255,255,0.9)',
      'text-halo-width': 1.2,
    },
  });

  // Standort points — the only thing drawn below `detailMin`; large at low
  // zoom, smaller as you zoom in (feature-level detail takes over).  They and
  // their names are the topmost data layers: MapLibre places the labels of
  // upper layers first, so a Standort name wins over the parcel labels around
  // it — and it may move to any side of its point before it gives way.
  m.addLayer({
    id: 'site-location-circle', type: 'circle', source: 'features',
    filter: baseLayerFilter('site-location-circle'),
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 6, 13, 7, 17, 5, 20, 3],
      'circle-color': ENTITY_COLORS.site_location.fill,
      'circle-stroke-color': ENTITY_COLORS.site_location.stroke,
      'circle-stroke-width': 2,
      'circle-opacity': 0.95,
    },
  });
  m.addLayer({
    id: 'site-location-label', type: 'symbol', source: 'features',
    filter: baseLayerFilter('site-location-label'),
    layout: {
      'text-field': ['get', 'name'],
      'text-font': labelFont,
      'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 16, 13],
      'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
      'text-radial-offset': 0.9,
      'text-justify': 'auto',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': '#3a1010',
      'text-halo-color': 'rgba(255,255,255,0.92)',
      'text-halo-width': 1.2,
    },
    minzoom: 13,
  });

  // ── Selection overlays ───────────────────────────────────────────────
  const sel = TOKENS.mapSelection;
  m.addLayer({
    id: 'selection-fill', type: 'fill', source: 'features',
    filter: FILTER_NONE,
    paint: { 'fill-color': sel, 'fill-opacity': 0.25 },
  });
  m.addLayer({
    id: 'selection-line', type: 'line', source: 'features',
    filter: FILTER_NONE,
    paint: { 'line-color': sel, 'line-width': 3 },
  });
  m.addLayer({
    id: 'selection-circle', type: 'circle', source: 'features',
    filter: FILTER_NONE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 5, 18, 9],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': sel,
      'circle-stroke-width': 3,
    },
  });

  // ── Hover overlays ───────────────────────────────────────────────────
  m.addLayer({
    id: 'hover-line', type: 'line', source: 'features',
    filter: ['==', ['id'], -1],
    paint: { 'line-color': sel, 'line-width': 2.4 },
  });
  m.addLayer({
    id: 'hover-circle', type: 'circle', source: 'features',
    filter: ['==', ['id'], -1],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 18, 7],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': sel,
      'circle-stroke-width': 2.4,
    },
  });
}

// ── What is drawn: legend visibility + an optional extra constraint ───────
// Each layer keeps its base filter; the constraints are ANDed onto it.
//   hiddenKeys   Set of legend row keys that are switched off.  Layers
//                without profiles (Standort, Grundstücke, crowns) are one
//                row each, keyed by their entity_type.
//   hiddenCodes  { idPPy: [...], idPP: [...] } profile codes switched off
//   extra        further filter expression for every layer (the main map's
//                table filter), or null
function applyInventoryFilters(m, hiddenKeys, hiddenCodes, extra) {
  for (const id of ALL_LAYERS) {
    if (!m.getLayer(id)) continue;
    const ent = layerEntityType(id);
    if (hiddenKeys.has(ent)) { m.setFilter(id, FILTER_NONE); continue; }
    const parts = ['all', baseLayerFilter(id)];
    const codes = ent === 'area' ? hiddenCodes.idPPy
      : (ent === 'tree' || ent === 'point') ? hiddenCodes.idPP : null;
    if (codes && codes.length) {
      // Exclude features whose profile is switched off in the legend.
      parts.push(['!', ['in', ['get', 'fk_profil'], ['literal', codes]]]);
    }
    if (extra) parts.push(extra);
    m.setFilter(id, parts);
  }
  // The 3D tree cylinders follow the tree profiles.
  if (m.getLayer('tree-3d')) {
    m.setFilter('tree-3d', hiddenCodes.idPP.length
      ? ['!', ['in', ['get', 'fk_profil'], ['literal', hiddenCodes.idPP]]] : null);
  }
}

// ── Selection and hover overlays ──────────────────────────────────────────
// selection-circle / hover-circle are `circle` layers.  In MapLibre, circle
// layers paint at *every* coordinate of *every* matching feature regardless
// of geometry type — an id-only filter would draw a ring at every vertex of a
// polygon (looks like edit handles).  They are restricted to Point geometry,
// so a polygon shows only the fill + line affordance.
// A selected Standort or parcel is outlined only: a fill over the whole
// perimeter would tint every area inside it.
function setSelectionFilter(m, id) {
  const idMatch = id !== null && id !== undefined ? ['==', ['id'], id] : FILTER_NONE;
  const pointOnly = ['all', idMatch, ['==', ['geometry-type'], 'Point']];
  const elementOnly = ['all', idMatch, ['!', ['in', ['get', 'entity_type'], ['literal', ['site', 'parcel']]]]];
  const filters = { 'selection-fill': elementOnly, 'selection-circle': pointOnly };
  for (const lyr of MAP_LAYERS.selection) {
    if (m.getLayer(lyr)) m.setFilter(lyr, filters[lyr] || idMatch);
  }
}
function setHoverFilter(m, id) {
  const idMatch = id != null ? ['==', ['id'], id] : ['==', ['id'], -1];
  const pointOnly = ['all', idMatch, ['==', ['geometry-type'], 'Point']];
  if (m.getLayer('hover-line'))   m.setFilter('hover-line', idMatch);
  if (m.getLayer('hover-circle')) m.setFilter('hover-circle', pointOnly);
}

// The dots are small: hit-test a box around the pointer (larger for fingers).
function _dotHitBox(point) {
  const r = window.matchMedia('(pointer: coarse)').matches ? 10 : 4;
  return [[point.x - r, point.y - r], [point.x + r, point.y + r]];
}

// Features of ours under a screen point, in the order the feature card pages
// through them: points first (trees, point elements, the Standort marker),
// then areas by ascending size, then parcels, then Standort perimeters — the
// most specific object first, its context after.
//   features   the array the feature ids index into
//   resolve    optional: maps a hit to the feature it stands for (the
//              Standort marker → its Standort)
function featureStackAt(m, point, features, resolve) {
  const present = (ids) => ids.filter(l => m.getLayer(l));
  const polyLayers = present(['parcel-fill', 'site-fill', 'area-fill']);
  const dotLayers = present(['tree-circle', 'point-circle', 'site-location-circle']);
  const hits = [];
  if (dotLayers.length) hits.push(...m.queryRenderedFeatures(_dotHitBox(point), { layers: dotLayers }));
  if (polyLayers.length) hits.push(...m.queryRenderedFeatures(point, { layers: polyLayers }));

  const rank = {};                                  // feature index → sort rank
  for (const h of hits) {
    const et = h.properties.entity_type;
    // A hit on the Standort marker means the Standort — and puts it first.
    const idx = resolve ? resolve(Number(h.id)) : Number(h.id);
    const rk = (et === 'tree' || et === 'point' || et === 'site_location') ? 0
      : et === 'area' ? 1
      : et === 'parcel' ? 2 : 3;
    if (!(idx in rank) || rk < rank[idx]) rank[idx] = rk;
  }
  const area = (idx) => Number(features[idx].properties.area_m2) || 0;
  return Object.keys(rank).map(Number)
    .sort((a, b) => (rank[a] - rank[b]) || (area(a) - area(b)) || (a - b));
}

// Hover: pointer cursor + outline on everything that can be selected.
// MapLibre's layer-scoped listeners are keyed by layer id and survive
// setStyle(), so this is bound once per map.  `onHover(id | null)` draws the
// outline; `isBlocked()` suspends it (edit mode).
function bindFeatureHover(m, onHover, isBlocked) {
  let hovered = null;
  for (const lyr of INTERACTIVE_LAYERS) {
    m.on('mousemove', lyr, (e) => {
      if (isBlocked && isBlocked()) return;
      if (!e.features.length) return;
      m.getCanvas().style.cursor = 'pointer';
      const id = e.features[0].id;
      if (hovered !== id) { hovered = id; onHover(id); }
    });
    m.on('mouseleave', lyr, () => {
      if (isBlocked && isBlocked()) return;
      m.getCanvas().style.cursor = '';
      hovered = null;
      onHover(null);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3D LAYERS
// ───────────────────────────────────────────────────────────────────────────
//   - osm-buildings-3d   : OSM building footprints extruded by render_height
//                          (OpenFreeMap, free, no API key; OSM attribution
//                          declared on the source).  Buildings without
//                          height info fall back to BUILDING_DEFAULT_M.
//   - tree-3d            : per-tree cylinder built from each tree Point as a
//                          12-gon polygon at TREE_RADIUS_M, extruded to the
//                          tree's max_hoehe_m or TREE_DEFAULT_M.
// The flat tree markers are hidden meanwhile so they don't ghost-render at
// ground level beneath the cylinders.
// ═══════════════════════════════════════════════════════════════════════════
const BUILDING_DEFAULT_M = 8;       // single-storey + roof, conservative European default
const TREE_DEFAULT_M     = 8;       // urban shade tree height when no measurement exists
const TREE_RADIUS_M      = 1.2;     // crown radius for the cylinder approximation
const D3_PITCH           = 60;      // camera tilt in 3D mode

// One 12-gon per tree point.  ~1600 trees × 13 coords — negligible payload,
// no need to keep it in the pipeline output.  fk_profil is carried along so
// the legend can hide single tree profiles in 3D as well.
function buildTreeExtrusionData(features) {
  const out = [];
  const N_SIDES = 12;
  for (const t of features || []) {
    if (t.properties.entity_type !== 'tree' || !t.geometry || t.geometry.type !== 'Point') continue;
    const [lng, lat] = t.geometry.coordinates;
    // Convert metric radius to lat/lng degrees at this latitude.
    const dLat = TREE_RADIUS_M / 111320;
    const dLng = TREE_RADIUS_M / (111320 * Math.cos(lat * Math.PI / 180));
    const ring = [];
    for (let i = 0; i < N_SIDES; i++) {
      const a = (i / N_SIDES) * Math.PI * 2;
      ring.push([
        +(lng + Math.cos(a) * dLng).toFixed(7),
        +(lat + Math.sin(a) * dLat).toFixed(7),
      ]);
    }
    ring.push(ring[0]);
    out.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: {
        height: t.properties.max_hoehe_m || TREE_DEFAULT_M,
        baumart: t.properties.baumart || null,
        fk_profil: t.properties.fk_profil ?? null,
      },
    });
  }
  return { type: 'FeatureCollection', features: out };
}

function add3DLayers(m, treeData) {
  // ── Z-order for 3D mode ──────────────────────────────────────────
  //   1. ground fills and outlines
  //   2. fill-extrusion layers (osm-buildings-3d, tree-3d)   ← inserted here
  //   3. point markers (tree-circle, point-circle, site-location-*)
  //   4. selection / hover overlays
  //
  // Inserting extrusions *before* tree-circle puts them above every flat
  // fill but below the point markers.  Buildings then occlude any
  // overlapping area-fill (instead of area-fill bleeding onto the
  // building roof), and point markers + labels stay on top for clarity.
  //
  // fill-extrusion layers depth-test against each other via the WebGL
  // depth buffer (with opacity 1.0), so tree-3d and osm-buildings-3d
  // sort correctly regardless of which is declared first within this
  // group.
  const beforeId = m.getLayer('tree-circle') ? 'tree-circle' : undefined;

  // OSM buildings.
  if (!m.getSource('osm-buildings-3d')) {
    m.addSource('osm-buildings-3d', {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · ' +
                   '© <a href="https://openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    });
  }
  if (!m.getLayer('osm-buildings-3d')) {
    m.addLayer({
      id: 'osm-buildings-3d',
      source: 'osm-buildings-3d',
      'source-layer': 'building',
      type: 'fill-extrusion',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': ['coalesce', ['get', 'colour'], '#cdc4b0'],
        // Smooth grow-in between z14 and z15 to avoid visual pop-up.
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'],
          14, 0,
          15, ['coalesce', ['get', 'render_height'], BUILDING_DEFAULT_M],
        ],
        // Push the wall base 0.5 m BELOW ground.  This eliminates the
        // z-fight at the ground line where the building wall (z=0) meets
        // the semi-transparent area-fill polygons (also z=0) — without
        // the offset, MapLibre's translucent pass paints fills over the
        // building's lower wall pixels, and you see the green-area
        // polygons bleeding onto the building.  Rooftop annexes (with
        // an explicit `render_min_height`) shift down by the same 0.5 m;
        // visually invisible at typical zoom levels.
        'fill-extrusion-base': ['-', ['coalesce', ['get', 'render_min_height'], 0], 0.5],
        // Opaque buildings — translucency makes the 3D view read as a
        // ghost-render and users can't tell where the building actually is.
        'fill-extrusion-opacity': 1.0,
      },
    }, beforeId);
  }

  // Tree cylinders.  Same slot as the buildings - both are fill-extrusion
  // layers and depth-sort against each other.
  if (!m.getSource('tree-3d')) {
    m.addSource('tree-3d', { type: 'geojson', data: treeData });
  }
  if (!m.getLayer('tree-3d')) {
    m.addLayer({
      id: 'tree-3d',
      source: 'tree-3d',
      type: 'fill-extrusion',
      minzoom: 15,
      paint: {
        'fill-extrusion-color': '#4a7c2a',
        'fill-extrusion-height': ['coalesce', ['get', 'height'], TREE_DEFAULT_M],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 1.0,
      },
    }, beforeId);
  }

  // Hide the flat tree markers so they don't ghost-render through the
  // cylinders at ground level when the camera is tilted.
  if (m.getLayer('tree-circle')) m.setLayoutProperty('tree-circle', 'visibility', 'none');
}

function remove3DLayers(m) {
  for (const id of ['tree-3d', 'osm-buildings-3d']) {
    if (m.getLayer(id)) m.removeLayer(id);
  }
  // Sources retained so re-toggling 3D doesn't refetch tiles or rebuild
  // the tree polygon geometry.
  if (m.getLayer('tree-circle')) m.setLayoutProperty('tree-circle', 'visibility', 'visible');
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM MAP CONTROLS
// ───────────────────────────────────────────────────────────────────────────
// Single MapLibre IControl that hosts one or more buttons in a shared
// `.maplibregl-ctrl-group` div, matching the built-in zoom / compass buttons.
// Grouping is purely cosmetic — multiple buttons in one group render as a
// single rounded card.  Each button can be looked up by its `key` for later
// state updates.
// ═══════════════════════════════════════════════════════════════════════════
class IconCtrl {
  constructor(spec) {
    // A single `{ title, html, onClick }` makes one button; `{ buttons: [...] }`
    // makes a group.
    this._specs = Array.isArray(spec.buttons) ? spec.buttons : [spec];
    this._byKey = {};
  }
  onAdd(map) {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    for (const s of this._specs) {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = s.title || '';
      b.setAttribute('aria-label', s.title || '');
      b.innerHTML = s.html;
      b.addEventListener('click', (e) => s.onClick(e, b));
      this._container.appendChild(b);
      if (s.key) this._byKey[s.key] = b;
    }
    return this._container;
  }
  onRemove() {
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  }
  // Lookup helper for state updates after the control is mounted.
  getButton(key) { return this._byKey[key] || null; }
}

// Visual + label state of a 2D/3D toggle button.  The button shows the
// *destination* mode (Mapbox / Cesium convention): in 2D it reads "3D".
function set3DButtonState(btn, on) {
  if (!btn) return;
  btn.classList.toggle('ctrl-active', on);
  btn.innerHTML = on ? '2D' : '3D';
  btn.title = on ? 'Zur 2D-Ansicht wechseln' : 'Zur 3D-Ansicht wechseln';
  btn.setAttribute('aria-label', btn.title);
  btn.setAttribute('aria-pressed', String(on));
}

// ═══════════════════════════════════════════════════════════════════════════
// BASEMAP SWITCHER
// ───────────────────────────────────────────────────────────────────────────
// Wires the #basemap-switcher markup (#bm-panel, #bm-btn, #bm-current-thumb)
// to a map.  opts:
//   sourceIds()        ids of the sources to carry over into the new style
//   layerIds()         ids of the layers to carry over
//   onStyleRestored()  re-add whatever could not be carried over (idempotent)
// ═══════════════════════════════════════════════════════════════════════════
function initBasemapSwitcher(m, opts) {
  const panel = document.getElementById('bm-panel');
  const btn = document.getElementById('bm-btn');
  const thumb = document.getElementById('bm-current-thumb');
  if (!panel || !btn) return null;
  let current = (opts && opts.initial) || BASEMAPS[0].id;
  let open = false;

  function update() {
    const bm = BASEMAPS.find(b => b.id === current);
    if (thumb && bm) thumb.src = bm.thumb;
    panel.querySelectorAll('.bm-option').forEach(o => {
      const active = o.dataset.id === current;
      o.classList.toggle('active', active);
      o.setAttribute('aria-pressed', String(active));
    });
  }
  function setOpen(v) {
    open = v;
    panel.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  }

  BASEMAPS.forEach(bm => {
    const o = document.createElement('button');
    o.type = 'button';
    o.className = 'bm-option';
    o.dataset.id = bm.id;
    o.innerHTML =
      `<img src="${escapeHtml(bm.thumb)}" alt="">` +
      `<span class="bm-opt-label">${escapeHtml(bm.label)}</span>`;
    o.addEventListener('click', (e) => {
      e.stopPropagation();
      if (bm.id === current) { setOpen(false); return; }
      current = bm.id;
      update();
      // ── Preserve OUR sources + layers across the basemap swap ─────
      // Without this, setStyle() drops the `features` GeoJSON source
      // and MapLibre has to re-tile every feature in its worker before
      // they render at the proper zoom.  During the wait, lower-zoom
      // tiles get stretched (overzoomed) into the view — visible as
      // angular geometry, especially on the swisstopo aerial basemap
      // where high-contrast imagery makes the millimetre offsets pop.
      //
      // transformStyle merges OUR sources/layers into the incoming
      // style so the swap only changes the basemap underneath.  Layer-
      // bound event listeners survive the preservation, so click /
      // hover handlers don't need re-attaching.  Side benefit: basemap
      // switches feel instant.
      m.setStyle(bm.url, {
        diff: true,
        transformStyle: (prev, next) => {
          if (!prev) return next;
          const srcIds = new Set(opts.sourceIds());
          const lyrIds = new Set(opts.layerIds());
          const keptSources = {};
          for (const [id, src] of Object.entries(prev.sources || {})) {
            if (srcIds.has(id)) keptSources[id] = src;
          }
          // Our labels switch to a font the new style's glyph server has.
          const keptLayers = (prev.layers || []).filter(l => lyrIds.has(l.id))
            .map(l => withStyleLabelFont(l, next));
          return {
            ...next,
            sources: { ...next.sources, ...keptSources },
            layers: [...(next.layers || []), ...keptLayers],
          };
        },
      });
      // Safety net: if anything failed to preserve (first style change
      // edge cases, schema-incompatible sources, images added at runtime,
      // …), re-add it once the style is in.
      m.once('styledata', () => { if (opts.onStyleRestored) opts.onStyleRestored(); });
      setOpen(false);
    });
    panel.appendChild(o);
  });
  update();

  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!open); });
  document.addEventListener('click', () => { if (open) setOpen(false); });
  return { current: () => current, close: () => setOpen(false) };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT MENU HELPERS
// ═══════════════════════════════════════════════════════════════════════════
// Show `menu` at `point` (map pixels), measured and kept inside the map on
// every side (its width depends on the coordinate text and the touch rows).
function placeMenuAt(menu, mapEl, point) {
  menu.style.left = '0px'; menu.style.top = '0px';
  menu.classList.add('show');
  const M = 8, W = mapEl.clientWidth, H = mapEl.clientHeight;
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let x = point.x, y = point.y;
  if (x + mw > W - M) x -= mw;                      // open to the left
  if (y + mh > H - M) y -= mh;                      // open upwards
  menu.style.left = Math.max(M, Math.min(x, W - mw - M)) + 'px';
  menu.style.top  = Math.max(M, Math.min(y, H - mh - M)) + 'px';
}

// Touch: a long-press opens the context menu.  iOS Safari never fires
// `contextmenu` for a long-press, so the menu was unreachable on phones.
// (Android Chrome does fire it — opening twice at the same spot is harmless.)
// onLongPress(point, lngLat) receives map pixels and the geographic position.
function attachLongPress(m, mapEl, onLongPress) {
  const target = m.getCanvasContainer();
  const HOLD_MS = 550, SLOP_PX = 10, GHOST_MS = 250;
  let timer = null, start = null, fired = false, ghostUntil = 0;
  const cancel = () => { clearTimeout(timer); timer = null; };
  target.addEventListener('touchstart', (ev) => {
    cancel();
    fired = false;
    if (ev.touches.length !== 1) return;
    start = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
    timer = setTimeout(() => {
      timer = null;
      fired = true;
      const r = mapEl.getBoundingClientRect();
      const point = new maplibregl.Point(start.x - r.left, start.y - r.top);
      onLongPress(point, m.unproject(point));
    }, HOLD_MS);
  }, { passive: true });
  target.addEventListener('touchmove', (ev) => {
    if (!timer || !start || !ev.touches.length) return;
    const t = ev.touches[0];
    if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > SLOP_PX) cancel();
  }, { passive: true });
  target.addEventListener('touchend', () => {
    cancel();
    if (fired) { fired = false; ghostUntil = Date.now() + GHOST_MS; }
  }, { passive: true });
  target.addEventListener('touchcancel', cancel, { passive: true });
  // Some browsers follow a long-press with a synthetic click as the finger
  // lifts (it would land on the menu's first item, or select the feature
  // underneath).  Swallow only that one click — a deliberate tap on a menu
  // item comes later.
  mapEl.addEventListener('click', (ev) => {
    if (Date.now() < ghostUntil) { ghostUntil = 0; ev.stopPropagation(); ev.preventDefault(); }
  }, { capture: true });
}
