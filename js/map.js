// ═══════════════════════════════════════════════════════════════════════════
// MAP — MapLibre init, layers, legend, basemap switcher, edit mode, selection
// Depends on: config.js (LEGEND_GROUPS, ENTITY_COLORS, profilColor,
//              installAreaFillExpr, AREA_FILL_EXPR, GEOJSON_PATH, BASEMAPS)
// ═══════════════════════════════════════════════════════════════════════════

// ── MapLibre paint expression: per-profile fill colour for points ─────────
// Builds a `match` expression on fk_profil from a list of codes, looking
// up POINT_PROFILE_STYLE in config.js.  Used by tree-circle and point-
// circle layers so map colours match the legend exactly.
function pointProfileColorExpr(codes, defaultColor) {
  const stops = [];
  for (const c of codes) {
    const style = POINT_PROFILE_STYLE[c];
    if (style && style.fill) stops.push(c, style.fill);
  }
  if (stops.length === 0) return defaultColor;
  return ['match', ['get', 'fk_profil'], ...stops, defaultColor];
}

// ── HTML escape for safe interpolation into popup/legend innerHTML ─────────
// GDB attribute strings (Bemerkung, names, ...) are internal but a single
// '<' silently breaks popup layout.  Use this for every property value that
// gets templated into a string + assigned via innerHTML / setHTML.
const _ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(v) {
  if (v == null) return '';
  return String(v).replace(/[&<>"']/g, ch => _ESC_MAP[ch]);
}

// ── Group visibility state ─────────────────────────────────────────────────
const vis = {};
for (const g of LEGEND_GROUPS) vis[g.id] = true;

// Entity types where ALL legend groups are hidden (no profileCodes-aware
// groups that are still visible).  Used as the "fully hide this layer"
// shortcut.
function hiddenEntityTypes() {
  const byEntity = {};   // entity_type -> { total, hidden }
  for (const g of LEGEND_GROUPS) {
    if (!g.entity_type) continue;
    const e = g.entity_type;
    if (!byEntity[e]) byEntity[e] = { total: 0, hidden: 0 };
    byEntity[e].total += 1;
    if (!vis[g.id]) byEntity[e].hidden += 1;
  }
  return Object.entries(byEntity)
    .filter(([, b]) => b.total > 0 && b.hidden === b.total)
    .map(([e]) => e);
}

// Map of entity_type -> Set of profile codes whose group is hidden.
// Only considers groups WITH profileCodes (sub-grouped types).
function hiddenProfileCodesByEntity() {
  const out = {};
  for (const g of LEGEND_GROUPS) {
    if (!g.entity_type || !g.profileCodes) continue;
    if (vis[g.id]) continue;
    if (!out[g.entity_type]) out[g.entity_type] = new Set();
    for (const c of g.profileCodes) out[g.entity_type].add(c);
  }
  return out;
}

let tblActiveIds = null; // null = no table filter; array of feature indices
let selectedId   = null; // currently selected feature index (null = none)

// All map layers we add - kept in one place so filters/visibility/cleanup are simple.
const MAP_LAYERS = {
  polygons: ['site-fill', 'site-line', 'area-fill', 'area-line', 'canopy-fill'],
  points:   ['tree-circle', 'point-circle', 'site-location-circle', 'site-location-label'],
  selection:['selection-fill', 'selection-line', 'selection-circle'],
  hover:    ['hover-line', 'hover-circle'],
};
const ALL_LAYERS = [...MAP_LAYERS.polygons, ...MAP_LAYERS.points];

// Source / layer ID enumeration used by transformStyle when a basemap
// swap happens — every ID returned here is preserved across the swap,
// everything else (basemap layers) comes from the new style.
function collectOurSourceIds() {
  const ids = new Set([
    'features',         // local GeoJSON (sites / areas / trees / …)
    'osm-buildings-3d', // OpenFreeMap tiles for 3D extrusions
    'tree-3d',          // generated cylinders for trees in 3D mode
    'ext-highlight',    // identify-highlight feature
  ]);
  // External-layer sources added via the header search (one per active
  // swisstopo layer).  Keys live in the externalLayers state object.
  for (const bodId of Object.keys(externalLayers)) {
    ids.add(extSourceId(bodId));
  }
  return ids;
}

function collectOurLayerIds() {
  const ids = new Set([
    ...MAP_LAYERS.polygons,
    ...MAP_LAYERS.points,
    ...MAP_LAYERS.selection,
    ...MAP_LAYERS.hover,
    'osm-buildings-3d',
    'tree-3d',
    'ext-highlight-fill',
    'ext-highlight-line',
    'ext-highlight-circle',
  ]);
  for (const bodId of Object.keys(externalLayers)) {
    ids.add(extLayerId(bodId));
  }
  return ids;
}

function applyMapFilters() {
  const hidden = hiddenEntityTypes();
  const hiddenCodes = hiddenProfileCodesByEntity();
  const tableConstrained = tblActiveIds !== null;
  const tableIdFilter = !tableConstrained
    ? null
    : (tblActiveIds.length === 0
        ? ['literal', false]
        : ['in', ['id'], ['literal', tblActiveIds]]);

  // Per layer: combine entity_type match + (optional) hidden-profile-codes
  // exclusion + (optional) table-id filter.  Each layer's base filter
  // restricts to a single entity_type so we only need to AND in the
  // additional constraints here.
  const baseEntityFilters = {
    'site-fill':            ['==', ['get', 'entity_type'], 'site'],
    'site-line':            ['==', ['get', 'entity_type'], 'site'],
    'area-fill':            ['==', ['get', 'entity_type'], 'area'],
    'area-line':            ['==', ['get', 'entity_type'], 'area'],
    'canopy-fill':          ['==', ['get', 'entity_type'], 'tree_canopy'],
    'tree-circle':          ['==', ['get', 'entity_type'], 'tree'],
    'point-circle':         ['==', ['get', 'entity_type'], 'point'],
    'site-location-circle': ['==', ['get', 'entity_type'], 'site_location'],
    'site-location-label':  ['==', ['get', 'entity_type'], 'site_location'],
  };

  for (const id of ALL_LAYERS) {
    if (!map.getLayer(id)) continue;
    const entFilter = baseEntityFilters[id];
    const ent = entFilter[2];
    if (hidden.includes(ent)) {
      map.setFilter(id, ['==', ['literal', '0'], ['literal', '1']]); // hide layer
      continue;
    }
    const parts = ['all', entFilter];
    if (hiddenCodes[ent] && hiddenCodes[ent].size) {
      // Exclude features whose fk_profil falls in any hidden sub-group.
      parts.push(['!', ['in', ['get', 'fk_profil'], ['literal', [...hiddenCodes[ent]]]]]);
    }
    if (tableIdFilter) parts.push(tableIdFilter);
    map.setFilter(id, parts);
  }
}

// ── Map init ───────────────────────────────────────────────────────────────
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  center: [7.45, 46.95],   // Bern - actual bounds applied after data loads
  zoom: 12, maxZoom: 22,
  // Required for the header Print button: without preserveDrawingBuffer the
  // WebGL canvas is discarded between paints, and the browser captures a
  // blank canvas during print().  ~10-15% rendering cost vs default; an
  // acceptable trade for "print just works".
  preserveDrawingBuffer: true,
});
map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

// ── State ──────────────────────────────────────────────────────────────────
let offsetDeltaLon = 0, offsetDeltaLat = 0;
let editMode = false;
let editStartLngLat = null;
let originalCenter = null;
let geojsonData = null;

// ── Popup instance ─────────────────────────────────────────────────────────
const selPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '320px' });
let _suppressPopupClose = false;
selPopup.on('close', () => {
  if (_suppressPopupClose || selectedId === null) return;
  selectedId = null;
  applySelectedFilter();
  updateSelectionUrl();
  renderTable();
});

// ── Popup HTML — shows all defined fields for the feature ─────────────────
function popupHTML(p) {
  // Pick a swatch color matching the rendered map style.
  let swatch = '#aaa';
  switch (p.entity_type) {
    case 'site':          swatch = ENTITY_COLORS.site.fill; break;
    case 'site_location': swatch = ENTITY_COLORS.site_location.fill; break;
    case 'tree':          swatch = ENTITY_COLORS.tree.fill; break;
    case 'tree_canopy':   swatch = ENTITY_COLORS.tree_canopy.fill; break;
    case 'point':         swatch = ENTITY_COLORS.point.fill; break;
    case 'area':          swatch = profilColor(p.fk_profil); break;
  }

  // Field order: identity → site → measurements → care attributes → free-form.
  // Hide fields that are null/empty/zero-only-placeholder.
  const FIELD_GROUPS = [
    {
      title: 'Standort',
      keys: [
        ['site_name',         'Name'],
        ['site_objektnummer', 'Objekt-Nr.'],
        ['site_adresse',      'Adresse'],
        ['site_lose',         'Los'],
        // For Standort entities themselves, properties.name etc. are populated
        // (the same site_* key family is empty since it's the site itself):
        ['name',              'Name'],
        ['objektnummer',      'Objekt-Nr.'],
        ['adresse',           'Adresse'],
        ['lose',              'Los'],
        ['parzelle',          'Parzelle'],
        ['erstellungsjahr',   'Baujahr'],
        ['erfassungsdatum',   'Erfasst'],
      ],
    },
    {
      title: 'Klassifikation',
      // Prefer decoded labels (from GDB field domains) over raw fk_* codes;
      // raw codes are kept in the data for power-user access via the table
      // column toggle.
      keys: [
        ['baumart',             'Baumart'],
        ['baumnummer',          'Baum-Nr.'],
        ['profil_label',        'Profil'],
        ['aufwandsfaktor',      'Aufwandsfaktor'],
        ['pflegedurchfuehrung', 'Pflege durch'],
        ['pflegeklasse',        'Pflegeklasse'],
        ['eigentuemer',         'Eigentümer'],
        ['pflegeverantwortung', 'Pflegeverantw.'],
        ['winterdienst',        'Winterdienst'],
        ['bewaesserung_label',  'Bewässerung'],
        ['lauben',              'Lauben'],
        ['ausmass',             'Ausmass'],
        ['kontrolle',           'Kontrolle'],
        ['reinigung',           'Reinigung'],
      ],
    },
    {
      title: 'Geometrie',
      keys: [
        ['area_m2',           'Fläche m²',     v => fmtNum(v, 1)],
        ['shape_area_m2',     'Standort m²',   v => fmtNum(v, 1)],
        ['shape_length_m',    'Umfang m',      v => fmtNum(v, 1)],
        ['crown_diameter_m',  'Kronen-Ø m'],
        ['crown_radius_m',    'Kronen-Radius m'],
        ['max_hoehe_m',       'Max. Höhe m'],
        ['hoehe',             'Höhe'],
        ['lv95_east',         'LV95 Ost',      v => fmtNum(v, 0)],
        ['lv95_north',        'LV95 Nord',     v => fmtNum(v, 0)],
        ['lv95_east_centroid', 'LV95 Ost (Z.)', v => fmtNum(v, 0)],
        ['lv95_north_centroid','LV95 Nord (Z.)',v => fmtNum(v, 0)],
      ],
    },
    {
      title: 'Anderes',
      keys: [
        ['bemerkung',            'Bemerkung'],
        ['titel_objektblatt',    'Objektblatt'],
        ['titel_kalkulation',    'Kalkulation'],
        ['letzte_aenderung',     'Letzte Änderung'],
        ['source',               'Quelle'],
      ],
    },
  ];

  function isEmpty(v) {
    if (v === null || v === undefined) return true;
    if (v === '') return true;
    if (typeof v === 'string' && v.trim() === '') return true;
    if (typeof v === 'string' && v.trim() === '0') return true;
    if (v === 0) return true;
    return false;
  }

  let body = '';
  for (const grp of FIELD_GROUPS) {
    const rows = grp.keys
      .filter(([k]) => !isEmpty(p[k]))
      .map(([k, lbl, fmt]) => {
        // Formatters may return numeric/string already-formatted; escape
        // the result either way since the Bemerkung field is free text.
        const v = fmt ? fmt(p[k]) : p[k];
        return `<div class="pu-row"><span>${escapeHtml(lbl)}</span><strong>${escapeHtml(v)}</strong></div>`;
      });
    if (rows.length === 0) continue;
    body += `<div class="pu-section">${escapeHtml(grp.title)}</div>` + rows.join('');
  }

  return `
    <div class="pu-header">
      <div class="pu-swatch" style="background:${swatch}"></div>
      <div class="pu-titles">
        <div class="pu-type">${escapeHtml(p.feature_type || p.entity_type || '–')}</div>
        <div class="pu-sub">${escapeHtml(p.subtype || '')}</div>
      </div>
    </div>
    <div class="pu-body">${body}</div>
  `;
}

// ── Selection helpers ──────────────────────────────────────────────────────
function applySelectedFilter() {
  // selection-circle is a `circle` layer.  In MapLibre, circle layers paint
  // at *every* coordinate of *every* matching feature regardless of
  // geometry type - so an id-only filter would draw a ring at every vertex
  // of a selected polygon (looks like edit handles).  Restrict it to Point
  // geometry so polygon selection shows only the fill+line affordance.
  const idMatch = selectedId !== null
    ? ['==', ['id'], selectedId]
    : ['==', ['literal', '0'], ['literal', '1']];
  const pointOnly = ['all', idMatch, ['==', ['geometry-type'], 'Point']];
  for (const id of MAP_LAYERS.selection) {
    if (!map.getLayer(id)) continue;
    map.setFilter(id, id === 'selection-circle' ? pointOnly : idMatch);
  }
}

function updateSelectionUrl() {
  try {
    const url = new URL(location.href);
    if (selectedId !== null) url.searchParams.set('sel', selectedId);
    else url.searchParams.delete('sel');
    history.replaceState(null, '', url);
  } catch (_) { /* file:// or sandboxed iframe — skip silently */ }
}

// ── View URL sync (center, zoom) ──────────────────────────────────────────
// Same param names as the right-click Share action so links produced by
// either path are interchangeable.  Updates throttled to map idle so we
// don't thrash history.replaceState on every render frame.
let _viewUrlPending = false;
function syncViewUrl() {
  if (_viewUrlPending) return;
  _viewUrlPending = true;
  requestAnimationFrame(() => {
    _viewUrlPending = false;
    try {
      const c = map.getCenter();
      const z = map.getZoom();
      const url = new URL(location.href);
      url.searchParams.set('center', c.lng.toFixed(5) + ',' + c.lat.toFixed(5));
      url.searchParams.set('zoom', z.toFixed(2));
      history.replaceState(null, '', url);
    } catch (_) { /* file:// or sandboxed */ }
  });
}

// Returns true if a center+zoom was successfully applied from the URL.
function applyViewFromUrl() {
  try {
    const params = new URLSearchParams(location.search);
    const c = params.get('center');
    const z = params.get('zoom');
    if (!c) return false;
    const parts = c.split(',').map(Number);
    if (parts.length !== 2 || !isFinite(parts[0]) || !isFinite(parts[1])) return false;
    const zn = z != null ? Number(z) : null;
    map.jumpTo({
      center: [parts[0], parts[1]],
      zoom: (zn != null && isFinite(zn)) ? zn : map.getZoom(),
    });
    return true;
  } catch (_) {
    return false;
  }
}

function selectFeature(idx, lngLat) {
  // ── 1. Resolve site_location → underlying site polygon ───────────────
  // The dot is a map-only shortcut for the site.  The table tab only
  // knows about real entity types — redirect now so all downstream state
  // (selection, popup, URL, table scroll) lines up.
  let f = geojsonData.features[idx];
  if (f && f.properties.entity_type === 'site_location') {
    const siteOid = f.properties.site_oid;
    const siteFeature = geojsonData.features.find(
      g => g.properties.entity_type === 'site' && g.properties.objectid === siteOid
    );
    if (siteFeature && siteFeature.id != null) {
      idx = siteFeature.id;
      f = siteFeature;
    }
  }

  selectedId = Number(idx);
  applySelectedFilter();
  updateSelectionUrl();
  _suppressPopupClose = true;
  selPopup.setLngLat(lngLat).setHTML(popupHTML(f.properties)).addTo(map);
  _suppressPopupClose = false;

  if (!tableOpen) document.getElementById('tbl-toggle').click();

  // ── 2. Switch to the tab this feature belongs to ─────────────────────
  // `sites` ← entity_type === 'site'; everything else → `green`.
  // setScope() is a no-op when target === current; otherwise it rebuilds
  // the filter sidebar / col dropdown / pagination state and renders once.
  const targetScope = f.properties.entity_type === 'site' ? 'sites' : 'green';
  if (typeof setScope === 'function' && targetScope !== tblScope) {
    setScope(targetScope);
  }

  // ── 3. Page to the row + scroll it into view ─────────────────────────
  // Use the SCOPED row set — `tblPage` paginates the scoped+filtered list
  // in renderTable(), so the row-to-page math must operate on the same
  // basis or we land on the wrong page.
  const scoped = tableRows.filter(r => inScope(r, tblScope));
  let sorted = getSortedRows(getFilteredRows(scoped));
  if (sorted.findIndex(r => r._idx === idx) === -1) {
    // Row is hidden by search / sidebar filters — clear them so the
    // selection becomes visible in the table.
    const si = document.getElementById('tbl-search');
    const sx = document.getElementById('tbl-search-x');
    if (si && si.value) { si.value = ''; tblSearch = ''; if (sx) sx.style.display = 'none'; }
    for (const key of Object.keys(tblFilterAttrs)) tblFilterAttrs[key].clear();
    onFilterChange();
    sorted = getSortedRows(getFilteredRows(scoped));
  }

  const rowIdx = sorted.findIndex(r => r._idx === idx);
  if (rowIdx !== -1) tblPage = Math.floor(rowIdx / tblPageSize);
  renderTable();

  setTimeout(() => {
    const scroll = document.getElementById('table-scroll');
    const tr = document.querySelector('#tbl tbody tr.selected');
    if (scroll && tr) { scroll.scrollTop = 0; tr.scrollIntoView({ block: 'nearest' }); }
  }, 0);
}

function clearSelection() {
  if (selectedId === null) return;
  selectedId = null;
  applySelectedFilter();
  updateSelectionUrl();
  selPopup.remove();
  renderTable();
}

// ── Add GeoJSON source + layers ────────────────────────────────────────────
function addLayers() {
  if (!geojsonData || map.getSource('features')) return;
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
  map.addSource('features', {
    type: 'geojson',
    data: geojsonData,
    tolerance: 0,
    maxzoom: 22,
  });

  // Site boundaries — bottom of stack, very subtle fill, visible stroke.
  map.addLayer({
    id: 'site-fill', type: 'fill', source: 'features',
    filter: ['==', ['get', 'entity_type'], 'site'],
    paint: { 'fill-color': ENTITY_COLORS.site.fill, 'fill-opacity': 0.10 },
  });
  map.addLayer({
    id: 'site-line', type: 'line', source: 'features',
    filter: ['==', ['get', 'entity_type'], 'site'],
    paint: {
      'line-color': ENTITY_COLORS.site.stroke,
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 16, 0.8, 20, 1.2],
      'line-opacity': 0.55,
    },
  });

  // Pflegeflächen (areas) — coloured by hashed fk_profil.
  map.addLayer({
    id: 'area-fill', type: 'fill', source: 'features',
    filter: ['==', ['get', 'entity_type'], 'area'],
    paint: { 'fill-color': AREA_FILL_EXPR, 'fill-opacity': 0.62 },
  });
  map.addLayer({
    id: 'area-line', type: 'line', source: 'features',
    filter: ['==', ['get', 'entity_type'], 'area'],
    paint: { 'line-color': 'rgba(0,0,0,0.35)', 'line-width': 0.5 },
  });

  // Tree-canopy circles.  No outline stroke - the outline made small
  // canopies on a feature edge look like polygon vertex handles.
  map.addLayer({
    id: 'canopy-fill', type: 'fill', source: 'features',
    filter: ['==', ['get', 'entity_type'], 'tree_canopy'],
    paint: { 'fill-color': ENTITY_COLORS.tree_canopy.fill, 'fill-opacity': 0.45 },
  });

  // Tree points - colour by fk_profil so the map matches the legend
  // (Laubbäume green, Strassenbäume teal, Nadelb. dark green, etc.).
  map.addLayer({
    id: 'tree-circle', type: 'circle', source: 'features',
    filter: ['==', ['get', 'entity_type'], 'tree'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 16, 3.5, 20, 6],
      'circle-color': pointProfileColorExpr([1, 2, 3, 4, 5, 6, 7, 8],
                                            ENTITY_COLORS.tree.fill),
      'circle-stroke-color': ENTITY_COLORS.tree.stroke,
      'circle-stroke-width': 0.8,
      'circle-opacity': 0.9,
    },
  });

  // Other points - colour by fk_profil through the same point catalog
  // (Pflanzgefäss Wechselflor magenta, Spielgerät orange, ...).
  map.addLayer({
    id: 'point-circle', type: 'circle', source: 'features',
    filter: ['==', ['get', 'entity_type'], 'point'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 1.2, 16, 3, 20, 5],
      'circle-color': pointProfileColorExpr([9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23],
                                            ENTITY_COLORS.point.fill),
      'circle-stroke-color': ENTITY_COLORS.point.stroke,
      'circle-stroke-width': 0.8,
      'circle-opacity': 0.9,
    },
  });

  // Standort dots — large at low zoom, smaller as you zoom in (feature-level
  // detail takes over).  Always visible — these are the "where are the
  // parcels?" markers the user asked for.
  map.addLayer({
    id: 'site-location-circle', type: 'circle', source: 'features',
    filter: ['==', ['get', 'entity_type'], 'site_location'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 6, 13, 7, 17, 5, 20, 3],
      'circle-color': ENTITY_COLORS.site_location.fill,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
      'circle-opacity': 0.95,
    },
  });
  map.addLayer({
    id: 'site-location-label', type: 'symbol', source: 'features',
    filter: ['==', ['get', 'entity_type'], 'site_location'],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 16, 13],
      'text-anchor': 'top',
      'text-offset': [0, 0.9],
      'text-allow-overlap': false,
      'text-optional': true,
    },
    paint: {
      'text-color': '#3a1010',
      'text-halo-color': 'rgba(255,255,255,0.92)',
      'text-halo-width': 1.2,
    },
    minzoom: 13,
  });

  // ── Selection overlays ───────────────────────────────────────────────
  map.addLayer({
    id: 'selection-fill', type: 'fill', source: 'features',
    filter: ['==', ['literal', '0'], ['literal', '1']],
    paint: { 'fill-color': '#005ea8', 'fill-opacity': 0.25 },
  });
  map.addLayer({
    id: 'selection-line', type: 'line', source: 'features',
    filter: ['==', ['literal', '0'], ['literal', '1']],
    paint: { 'line-color': '#005ea8', 'line-width': 3 },
  });
  map.addLayer({
    id: 'selection-circle', type: 'circle', source: 'features',
    filter: ['==', ['literal', '0'], ['literal', '1']],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 5, 18, 9],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': '#005ea8',
      'circle-stroke-width': 3,
    },
  });

  // ── Hover overlays ───────────────────────────────────────────────────
  map.addLayer({
    id: 'hover-line', type: 'line', source: 'features',
    filter: ['==', ['id'], -1],
    paint: { 'line-color': '#005ea8', 'line-width': 2.4 },
  });
  map.addLayer({
    id: 'hover-circle', type: 'circle', source: 'features',
    filter: ['==', ['id'], -1],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 18, 7],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': '#005ea8',
      'circle-stroke-width': 2.4,
    },
  });

  applySelectedFilter();
  applyMapFilters();
}

// All map layers that should be hit-tested for click / hover.
const INTERACTIVE_LAYERS = ['site-fill', 'area-fill', 'canopy-fill',
                             'tree-circle', 'point-circle', 'site-location-circle'];

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM MAP CONTROLS (Home + 2D/3D toggle)
// ───────────────────────────────────────────────────────────────────────────
// IconCtrl is a thin reusable wrapper that produces a single-button MapLibre
// IControl matching the visual style of the built-in zoom / compass buttons.
// ═══════════════════════════════════════════════════════════════════════════
// Single MapLibre IControl that hosts one or more buttons in a shared
// `.maplibregl-ctrl-group` div.  Grouping is purely cosmetic — multiple
// buttons in one group render as a single rounded card with one stack of
// shadows, instead of N cards with N shadows.  Each button can be looked
// up by its `key` for later state updates.
class IconCtrl {
  constructor(spec) {
    // Backwards-compat: a single `{ title, html, onClick }` makes one
    // button; passing `{ buttons: [...] }` makes a group.
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

const ICON_HOME = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
  <polyline points="9 22 9 12 15 12 15 22"/>
</svg>`;

function goHome() {
  const bbox = geojsonData && geojsonData.bbox;
  if (Array.isArray(bbox) && bbox.length === 4) {
    map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
                  { padding: 60, maxZoom: 14, pitch: 0, bearing: 0, duration: 600 });
  } else {
    map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
  }
}

// Home + 2D/3D live in the SAME control group so they share one card +
// one drop-shadow with each other — but are separate from MapLibre's
// native nav group (zoom +/−, compass), since those have their own
// internal stylesheet expectations.
const mapCtrls = new IconCtrl({
  buttons: [
    {
      key: 'home',
      title: 'Zur Übersicht',
      html: ICON_HOME,
      onClick: goHome,
    },
    {
      key: '3d',
      title: 'Zur 3D-Ansicht wechseln',
      html: '3D',
      onClick: () => set3D(!is3D),
    },
  ],
});
map.addControl(mapCtrls, 'top-right');

// ═══════════════════════════════════════════════════════════════════════════
// 2D / 3D TOGGLE
// ───────────────────────────────────────────────────────────────────────────
// 3D mode adds:
//   - osm-buildings-3d   : OSM building footprints extruded by render_height
//                          (OpenFreeMap, free, no API key; OSM attribution
//                          declared on the source).  Buildings without
//                          height info fall back to BUILDING_DEFAULT_M.
//   - tree-3d            : per-tree cylinder built from each tree Point as a
//                          12-gon polygon at TREE_RADIUS_M, extruded to the
//                          tree's max_hoehe_m or TREE_DEFAULT_M.
// And hides our flat tree/canopy markers so they don't ghost-render at
// ground level beneath the cylinders.
// ═══════════════════════════════════════════════════════════════════════════
const BUILDING_DEFAULT_M = 8;       // single-storey + roof, conservative European default
const TREE_DEFAULT_M     = 8;       // urban shade tree height when no measurement exists
const TREE_RADIUS_M      = 1.2;     // crown radius for the cylinder approximation
const D3_PITCH           = 60;      // camera tilt in 3D mode

let is3D = false;
let _treeExtrusionData = null;

function buildTreeExtrusionData() {
  // Generated once and cached.  1620 trees × 13 coords each = ~21k coords -
  // negligible payload, no need to keep in the conversion script output.
  if (_treeExtrusionData) return _treeExtrusionData;
  const features = [];
  const trees = geojsonData
    ? geojsonData.features.filter(f =>
        f.properties.entity_type === 'tree' &&
        f.geometry && f.geometry.type === 'Point')
    : [];
  const N_SIDES = 12;
  for (const t of trees) {
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
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: {
        height: t.properties.max_hoehe_m || TREE_DEFAULT_M,
        baumart: t.properties.baumart || null,
      },
    });
  }
  _treeExtrusionData = { type: 'FeatureCollection', features };
  return _treeExtrusionData;
}

function add3DLayers() {
  // ── Z-order for 3D mode ──────────────────────────────────────────
  //   1. ground fills (site-fill, area-fill, canopy-fill, site-line, area-line)
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
  const extrusionBeforeId = map.getLayer('tree-circle') ? 'tree-circle' : undefined;

  // OSM buildings.
  if (!map.getSource('osm-buildings-3d')) {
    map.addSource('osm-buildings-3d', {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · ' +
                   '© <a href="https://openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    });
  }
  if (!map.getLayer('osm-buildings-3d')) {
    const beforeId = extrusionBeforeId;
    map.addLayer({
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
        // The ground polygons below get correctly occluded at the
        // footprint, which matches real-world expectation.
        'fill-extrusion-opacity': 1.0,
      },
    }, beforeId);
  }

  // Tree cylinders.  Same slot as the buildings - both are fill-extrusion
  // layers and depth-sort against each other.
  if (!map.getSource('tree-3d')) {
    map.addSource('tree-3d', { type: 'geojson', data: buildTreeExtrusionData() });
  }
  if (!map.getLayer('tree-3d')) {
    const beforeId = extrusionBeforeId;
    map.addLayer({
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

  // Hide flat tree/canopy markers so they don't ghost-render through the
  // cylinders at ground level when the camera is tilted.
  for (const id of ['tree-circle', 'canopy-fill']) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
  }
}

function remove3DLayers() {
  for (const id of ['tree-3d', 'osm-buildings-3d']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  // Sources retained so re-toggling 3D doesn't refetch tiles or rebuild
  // the tree polygon geometry.
  for (const id of ['tree-circle', 'canopy-fill']) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
  }
}

function set3D(on) {
  is3D = on;
  // Update the 3D button visual + label.  Button shows the *destination*
  // mode (Mapbox / Cesium convention): in 2D it reads "3D" (tap to enter
  // 3D), in 3D it reads "2D".
  const btn = mapCtrls.getButton('3d');
  if (btn) {
    btn.classList.toggle('ctrl-active', on);
    btn.innerHTML = on ? '2D' : '3D';
    btn.title = on ? 'Zur 2D-Ansicht wechseln' : 'Zur 3D-Ansicht wechseln';
    btn.setAttribute('aria-label', btn.title);
  }
  if (on) {
    map.easeTo({ pitch: D3_PITCH, duration: 500 });
    add3DLayers();
  } else {
    map.easeTo({ pitch: 0, duration: 500 });
    remove3DLayers();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTERNAL LAYERS  (swisstopo / federal data via search → add to map)
// ───────────────────────────────────────────────────────────────────────────
// On click: identify-on-the-active-set, show htmlPopup, optionally highlight
// the returned geometry.  State survives basemap switches and URL reloads.
// ═══════════════════════════════════════════════════════════════════════════
const LAYERS_CONFIG_URL = 'https://api3.geo.admin.ch/rest/services/api/MapServer/layersConfig?lang=de';
const IDENTIFY_URL      = 'https://api3.geo.admin.ch/rest/services/all/MapServer/identify';
const HTMLPOPUP_URL     = 'https://api3.geo.admin.ch/rest/services/api/MapServer';

// bodId → { config, visible, opacity }
const externalLayers = {};
let layersConfigCache = null;
let layersConfigPromise = null;

async function getLayersConfig() {
  if (layersConfigCache) return layersConfigCache;
  if (!layersConfigPromise) {
    layersConfigPromise = fetch(LAYERS_CONFIG_URL).then(r => r.json())
      .then(d => { layersConfigCache = d; return d; });
  }
  return layersConfigPromise;
}

function extSourceId(bodId) { return 'ext-src-' + bodId; }
function extLayerId(bodId)  { return 'ext-lyr-' + bodId; }

// Build the MapLibre source spec for a layer entry.  Returns null if the
// type isn't supported.  WMTS uses the public xyz tile pattern; WMS uses a
// tiled GetMap call (works for both singleTile and tiled WMS layers in
// practice).  GeoJSON layers fetch a single static file.
function buildExternalSource(bodId, cfg) {
  const attribution = cfg.attribution
    ? `<a href="${cfg.attributionUrl || '#'}" target="_blank" rel="noopener">${cfg.attribution}</a>`
    : '';
  if (cfg.type === 'wmts') {
    const ts = (cfg.timestamps && cfg.timestamps[0]) || 'current';
    const format = cfg.format || 'png';
    const tiles = [0, 1, 2, 3, 4].map(i =>
      `https://wmts${i}.geo.admin.ch/1.0.0/${bodId}/default/${ts}/3857/{z}/{x}/{y}.${format}`);
    return { type: 'raster', tiles, tileSize: 256, attribution };
  }
  if (cfg.type === 'wms') {
    const wmsLayers = cfg.wmsLayers || bodId;
    const wmsUrl = (cfg.wmsUrl || 'https://wms.geo.admin.ch') +
      `?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${wmsLayers}` +
      `&STYLES=&FORMAT=image/${cfg.format === 'jpeg' ? 'jpeg' : 'png'}` +
      `&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`;
    return { type: 'raster', tiles: [wmsUrl], tileSize: 256, attribution };
  }
  if (cfg.type === 'geojson') {
    return { type: 'geojson', data: cfg.geojsonUrl || cfg.url, attribution };
  }
  return null;
}

// Insert external raster/geojson layers ABOVE the basemap but BELOW our data
// layers, so site dots / trees / popups render on top.  We use 'site-fill'
// (the bottom of the local data stack) as beforeId when present.
function _addExtLayerToMap(bodId) {
  const ext = externalLayers[bodId];
  if (!ext) return;
  const srcId = extSourceId(bodId);
  const lyrId = extLayerId(bodId);
  if (!map.getSource(srcId)) {
    const src = buildExternalSource(bodId, ext.config);
    if (!src) return;
    map.addSource(srcId, src);
  }
  if (!map.getLayer(lyrId)) {
    const beforeId = map.getLayer('site-fill') ? 'site-fill' : undefined;
    if (ext.config.type === 'geojson') {
      // Render GeoJSON layers as a thin outlined fill.
      map.addLayer({
        id: lyrId, type: 'fill', source: srcId,
        paint: { 'fill-color': '#005ea8', 'fill-opacity': ext.opacity * 0.4 },
        layout: { visibility: ext.visible ? 'visible' : 'none' },
      }, beforeId);
    } else {
      map.addLayer({
        id: lyrId, type: 'raster', source: srcId,
        paint: { 'raster-opacity': ext.opacity },
        layout: { visibility: ext.visible ? 'visible' : 'none' },
      }, beforeId);
    }
  }
}

async function addExternalLayer(bodId) {
  if (externalLayers[bodId]) {
    showToast('Ebene bereits aktiv', '');
    return;
  }
  const all = await getLayersConfig();
  const cfg = all[bodId];
  if (!cfg) {
    showToast('Ebene nicht im Katalog: ' + bodId, 'error');
    return;
  }
  externalLayers[bodId] = {
    config: cfg,
    visible: true,
    opacity: cfg.opacity != null ? cfg.opacity : 1.0,
  };
  _addExtLayerToMap(bodId);
  buildLegend(geojsonData ? geojsonData.features : []);
  syncExternalLayersUrl();
}

function removeExternalLayer(bodId) {
  const lyrId = extLayerId(bodId);
  const srcId = extSourceId(bodId);
  if (map.getLayer(lyrId)) map.removeLayer(lyrId);
  if (map.getSource(srcId)) map.removeSource(srcId);
  delete externalLayers[bodId];
  buildLegend(geojsonData ? geojsonData.features : []);
  syncExternalLayersUrl();
}

function setExternalVisibility(bodId, visible) {
  const ext = externalLayers[bodId];
  if (!ext) return;
  ext.visible = visible;
  const lyrId = extLayerId(bodId);
  if (map.getLayer(lyrId)) {
    map.setLayoutProperty(lyrId, 'visibility', visible ? 'visible' : 'none');
  }
}

function setExternalOpacity(bodId, opacity) {
  const ext = externalLayers[bodId];
  if (!ext) return;
  ext.opacity = opacity;
  const lyrId = extLayerId(bodId);
  if (map.getLayer(lyrId)) {
    const prop = ext.config.type === 'geojson' ? 'fill-opacity' : 'raster-opacity';
    const value = ext.config.type === 'geojson' ? opacity * 0.4 : opacity;
    map.setPaintProperty(lyrId, prop, value);
  }
}

// Re-add all known external layers after a basemap (style) change.
async function restoreExternalLayersOnStyle() {
  // sources/layers were dropped by setStyle; just re-create them.
  for (const bodId of Object.keys(externalLayers)) {
    _addExtLayerToMap(bodId);
  }
}

// URL sync: ?ext=bod1,bod2 — minimal; opacity/visibility not persisted.
function syncExternalLayersUrl() {
  try {
    const url = new URL(location.href);
    const ids = Object.keys(externalLayers);
    if (ids.length) url.searchParams.set('ext', ids.join(','));
    else url.searchParams.delete('ext');
    history.replaceState(null, '', url);
  } catch (_) { /* file:// or sandboxed */ }
}

async function restoreExternalLayersFromUrl() {
  try {
    const raw = new URLSearchParams(location.search).get('ext');
    if (!raw) return;
    for (const bodId of raw.split(',').filter(Boolean)) {
      await addExternalLayer(bodId);
    }
  } catch (_) { /* ignore */ }
}

// ── Identify ──────────────────────────────────────────────────────────────
// Triggered when at least one external layer is visible AND the click
// missed our local features.  We hand swisstopo every visible external
// layer (not just tooltip:true ones) - "tooltip" in layersConfig is the
// vendor's UI hint, not a contract.  Some layers without tooltip still
// return useful identify results.
const identifyPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '380px' });
let _suppressIdentifyClose = false;
identifyPopup.on('close', () => {
  if (_suppressIdentifyClose) return;
  clearIdentifyHighlight();
});

let _identifyAbort = null;

function visibleIdentifyTargets() {
  return Object.entries(externalLayers)
    .filter(([, ext]) => ext.visible)
    .map(([bodId]) => bodId);
}

// WGS84 <-> LV95 (CH1903+) closed-form approximation, swisstopo "Reframe".
// Sub-metre accurate inside Switzerland, which is all we care about for an
// identify call - the request fails outside Switzerland anyway because the
// layers have no data there.  Keeping these inline avoids a 30 KB proj4js
// dependency for two conversions.
function wgs84ToLv95(lon, lat) {
  const phiSec = lat * 3600;
  const lamSec = lon * 3600;
  const phip = (phiSec - 169028.66) / 10000;
  const lamp = (lamSec - 26782.5) / 10000;
  const E = 2600072.37
    + 211455.93 * lamp
    - 10938.51 * lamp * phip
    -     0.36 * lamp * phip * phip
    -    44.54 * Math.pow(lamp, 3);
  const N = 1200147.07
    + 308807.95 * phip
    +   3745.25 * Math.pow(lamp, 2)
    +     76.63 * Math.pow(phip, 2)
    -    194.56 * Math.pow(lamp, 2) * phip
    +    119.79 * Math.pow(phip, 3);
  return [E, N];
}

function lv95ToWgs84(E, N) {
  const yp = (E - 2600000) / 1000000;
  const xp = (N - 1200000) / 1000000;
  const lamSec = 2.6779094
    + 4.728982 * yp
    + 0.791484 * yp * xp
    + 0.1306   * yp * xp * xp
    - 0.0436   * Math.pow(yp, 3);
  const phiSec = 16.9023892
    + 3.238272 * xp
    - 0.270978 * yp * yp
    - 0.002528 * xp * xp
    - 0.0447   * yp * yp * xp
    - 0.0140   * Math.pow(xp, 3);
  // Convert from base*100/36 → decimal degrees
  return [lamSec * 100 / 36, phiSec * 100 / 36];
}

// Walk a GeoJSON coordinates tree and transform every (x, y) leaf with fn.
function transformGeomCoords(geom, fn) {
  if (!geom) return geom;
  function walk(c) {
    if (typeof c[0] === 'number') return fn(c[0], c[1]);
    return c.map(walk);
  }
  return { ...geom, coordinates: walk(geom.coordinates) };
}

async function runIdentify(lngLat) {
  const targets = visibleIdentifyTargets();
  if (targets.length === 0) return false;

  // Abort any prior in-flight identify (rapid clicks would otherwise race
  // and the wrong response could win).
  if (_identifyAbort) _identifyAbort.abort();
  _identifyAbort = new AbortController();
  const sig = _identifyAbort.signal;

  // Some layers (e.g. ch.swisstopo-vd.stand-oerebkataster) return zero hits
  // when queried in WGS84 but work in LV95.  Always send LV95 - swisstopo
  // accepts it for every queryable layer.
  const [px, py] = wgs84ToLv95(lngLat.lng, lngLat.lat);
  const b = map.getBounds();
  const [minE, minN] = wgs84ToLv95(b.getWest(),  b.getSouth());
  const [maxE, maxN] = wgs84ToLv95(b.getEast(),  b.getNorth());
  // Use CSS pixels, not the canvas backing-store size.  swisstopo derives
  // the pixel-tolerance from imageDisplay; passing 2× values on a HiDPI
  // display halves our effective tolerance.
  const cont = map.getContainer();
  const w = cont.clientWidth || 1024;
  const h = cont.clientHeight || 768;
  // Zoom-aware tolerance: identify tolerance is in pixels, but the value
  // gets converted to ground units server-side as `tol_px × extent_m / w_px`.
  // A fixed 8 px works well at z18 (~12 m) but is far too lenient at z14
  // (~75 m, picks up features blocks away) and too strict at z21 (~0.5 m,
  // misses anything not exactly under the click).  Anchor on a 3 m ground
  // tolerance and back-compute the pixel value for the current view.
  // Clamp to [4, 20] px so we never become unusably permissive or strict.
  const groundTolM = 3;
  const widthM = (maxE - minE);
  const tolPx = Math.max(4, Math.min(20, Math.round(groundTolM * w / widthM)));
  const params = new URLSearchParams({
    geometry: px.toFixed(2) + ',' + py.toFixed(2),
    geometryType: 'esriGeometryPoint',
    geometryFormat: 'geojson',
    sr: '2056',
    layers: 'all:' + targets.join(','),
    // swisstopo uses ESRI lng,lat ordering for `geometry` (not OGC lat,lng).
    mapExtent: [minE, minN, maxE, maxN].map(v => v.toFixed(2)).join(','),
    imageDisplay: w + ',' + h + ',96',
    tolerance: String(tolPx),
    lang: 'de',
    returnGeometry: 'true',
  });
  let results;
  try {
    const resp = await fetch(IDENTIFY_URL + '?' + params, { signal: sig });
    const data = await resp.json();
    results = data.results || [];
  } catch (e) {
    if (e.name !== 'AbortError') console.warn('identify failed:', e);
    return false;
  }
  if (!results.length) return false;

  // Combine htmlPopup snippets from each hit (one HTTP per hit, capped).
  const visibleHits = results.slice(0, 8);
  const blocks = await Promise.all(visibleHits.map(async r => {
    const id = r.featureId != null ? r.featureId : r.id;
    if (id == null) return '';
    try {
      const url = `${HTMLPOPUP_URL}/${r.layerBodId}/${encodeURIComponent(id)}/htmlPopup?lang=de`;
      const res = await fetch(url, { signal: sig });
      const html = await res.text();
      return `<div class="ext-popup-block">
        <div class="ext-popup-layer">${escapeHtml(r.layerName || r.layerBodId)}</div>
        ${html}
      </div>`;
    } catch (e) {
      if (e.name === 'AbortError') return '';
      const lbl = r.properties && r.properties.label ? r.properties.label : (r.layerName || r.layerBodId);
      return `<div class="ext-popup-block"><div class="ext-popup-layer">${escapeHtml(lbl)}</div></div>`;
    }
  }));

  if (sig.aborted) return false;

  // Order matters: addTo() calls remove() internally if the popup is
  // already on the map, which fires a synchronous 'close' event.  If the
  // close handler runs while the highlight source/layers exist, it drops
  // them - so the second identify call would lose its highlight.  Suppress
  // close, swap the popup contents, *then* paint the highlight.
  _suppressIdentifyClose = true;
  identifyPopup.setLngLat(lngLat).setHTML(
    `<div class="ext-popup">${blocks.join('')}</div>`
  ).addTo(map);
  _suppressIdentifyClose = false;

  // Response geometry is in LV95 because we queried in sr=2056.  Convert
  // back to WGS84 before feeding the highlight source - MapLibre's GeoJSON
  // source assumes WGS84.
  const first = results[0];
  if (first.geometry) {
    const wgsGeom = transformGeomCoords(first.geometry, lv95ToWgs84);
    showIdentifyHighlight(wgsGeom);
  }
  return true;
}

function showIdentifyHighlight(geom) {
  const data = { type: 'Feature', geometry: geom, properties: {} };
  if (map.getSource('ext-highlight')) {
    map.getSource('ext-highlight').setData(data);
    return;
  }
  map.addSource('ext-highlight', { type: 'geojson', data });
  // Fill (for polygon hits)
  map.addLayer({
    id: 'ext-highlight-fill', type: 'fill', source: 'ext-highlight',
    filter: ['in', '$type', 'Polygon'],
    paint: { 'fill-color': '#005ea8', 'fill-opacity': 0.18 },
  });
  // Stroke (polygon + linestring)
  map.addLayer({
    id: 'ext-highlight-line', type: 'line', source: 'ext-highlight',
    filter: ['in', '$type', 'Polygon', 'LineString'],
    paint: { 'line-color': '#005ea8', 'line-width': 3 },
  });
  // Marker (point)
  map.addLayer({
    id: 'ext-highlight-circle', type: 'circle', source: 'ext-highlight',
    filter: ['==', '$type', 'Point'],
    paint: {
      'circle-radius': 8, 'circle-color': '#005ea8',
      'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
    },
  });
}

function clearIdentifyHighlight() {
  for (const id of ['ext-highlight-fill', 'ext-highlight-line', 'ext-highlight-circle']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('ext-highlight')) map.removeSource('ext-highlight');
}

// Layer-scoped MapLibre listeners are torn down when setStyle() removes the
// layers, so we reattach them after every style change.  Tracked so the
// empty-map click handler can also be rebound (it isn't layer-scoped but
// keeping it idempotent keeps the model simple).
let _hovId = null;
function setHover(id) {
  _hovId = id;
  const idMatch = id != null ? ['==', ['id'], id] : ['==', ['id'], -1];
  // Same reason as applySelectedFilter: don't paint a ring at every vertex
  // of a hovered polygon.  Hover ring is a Point-only affordance.
  const pointOnly = ['all', idMatch, ['==', ['geometry-type'], 'Point']];
  if (map.getLayer('hover-line'))   map.setFilter('hover-line', idMatch);
  if (map.getLayer('hover-circle')) map.setFilter('hover-circle', pointOnly);
}

let _emptyClickBound = false;
function attachInteractionHandlers() {
  for (const lyr of INTERACTIVE_LAYERS) {
    if (!map.getLayer(lyr)) continue;
    map.on('mousemove', lyr, (e) => {
      if (editMode) return;
      if (!e.features.length) return;
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features[0];
      if (_hovId !== f.id) setHover(f.id);
    });
    map.on('mouseleave', lyr, () => {
      if (editMode) return;
      map.getCanvas().style.cursor = '';
      setHover(null);
    });
    map.on('click', lyr, (e) => {
      if (editMode || measureActive) return;
      const fid = Number(e.features[0].id);
      if (fid === selectedId) { clearSelection(); return; }
      selectFeature(fid, e.lngLat);
    });
  }
  // Background click → clear selection.  Bind exactly once - this listener
  // is global, not layer-scoped, so style changes don't drop it.
  if (!_emptyClickBound) {
    map.on('click', async (e) => {
      if (editMode || measureActive) return;
      const layers = INTERACTIVE_LAYERS.filter(l => map.getLayer(l));
      const hits = map.queryRenderedFeatures(e.point, { layers });
      if (hits.length) return;       // local feature click takes priority
      // Try identify on visible external layers; only clear selection if
      // there's nothing to show.
      const handled = await runIdentify(e.lngLat);
      if (!handled) clearSelection();
    });
    _emptyClickBound = true;
  }
}

map.on('load', async () => {
  let resp, gj;
  try {
    resp = await fetch(GEOJSON_PATH);
    gj = await resp.json();
  } catch (e) {
    console.error(e);
    return;
  }
  // Normalise feature ids to array index.
  gj.features.forEach((f, i) => { if (f.id == null) f.id = i; });
  geojsonData = gj;

  // Build the area fill expression from observed fk_profil values.
  const profileCodes = (gj.metadata && gj.metadata.fk_profil_values) ||
    [...new Set(gj.features.map(f => f.properties.fk_profil).filter(p => p != null))];
  installAreaFillExpr(profileCodes);

  // Populate items for every legend group that uses profileCodes.  Looks
  // up labels via the embedded codelists (idPPy for area, idPP for
  // tree/point) and counts via a single pass over the features.  Items
  // appear in profileCodes order so a curator can decide the visual
  // order via config.js, not data ordering.
  const idPPy = (gj.metadata && gj.metadata.codelists && gj.metadata.codelists.idPPy) || {};
  const idPP  = (gj.metadata && gj.metadata.codelists && gj.metadata.codelists.idPP)  || {};
  const counts = {};   // entity_type -> { profile_code: count }
  for (const f of gj.features) {
    const e = f.properties.entity_type;
    const c = f.properties.fk_profil;
    if (e == null || c == null) continue;
    if (!counts[e]) counts[e] = {};
    counts[e][c] = (counts[e][c] || 0) + 1;
  }
  for (const grp of LEGEND_GROUPS) {
    if (!grp.profileCodes) continue;
    const cl = grp.entity_type === 'area' ? idPPy : idPP;
    const ct = counts[grp.entity_type] || {};
    grp.items = grp.profileCodes
      .map(code => ({ code, label: cl[code] || cl[String(code)] || ('Profil ' + code), n: ct[code] || 0 }))
      .filter(x => x.n > 0)         // drop entries with zero features
      // Keep PDF order (the order in profileCodes) instead of count-sorting,
      // so Laubbäume always come before Strassenbäume etc. - surveyors
      // expect the printed-plan ordering.
      .map(x => {
        const style = profilStyle(grp.entity_type, x.code);
        return {
          label: `${x.label} · ${x.n}`,
          fill: style.fill,
          swatchClass: style.swatchClass,
        };
      });
  }

  addLayers();
  attachInteractionHandlers();
  buildTable();
  // Restore active external layers from ?ext= in URL.  Awaited so that the
  // legend section appears together with everything else.
  await restoreExternalLayersFromUrl();

  // ── View: prefer ?center & ?zoom; otherwise fit to data ────────────────
  // A shared link like /?center=7.45,46.95&zoom=14&sel=42 should land the
  // user where the sender was looking, not on the data-bbox fit.
  const viewFromUrl = applyViewFromUrl();
  if (!viewFromUrl) {
    // Use the FeatureCollection-level bbox (RFC 7946 §5) the conversion
    // script writes into the GeoJSON.  Falls back to walking every
    // coordinate of every feature if missing — a couple hundred ms saved
    // on cold load.
    if (Array.isArray(gj.bbox) && gj.bbox.length === 4) {
      map.fitBounds([[gj.bbox[0], gj.bbox[1]], [gj.bbox[2], gj.bbox[3]]],
                    { padding: 60, maxZoom: 14 });
    } else {
      let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
      function scanCoords(c) {
        if (typeof c[0] === 'number') {
          if (c[0] < minLon) minLon = c[0]; if (c[0] > maxLon) maxLon = c[0];
          if (c[1] < minLat) minLat = c[1]; if (c[1] > maxLat) maxLat = c[1];
        } else { c.forEach(scanCoords); }
      }
      gj.features.forEach(f => { if (f.geometry) scanCoords(f.geometry.coordinates); });
      if (isFinite(minLon)) map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 60, maxZoom: 14 });
    }
  }

  // Persist view changes to the URL on every settled view (debounced via rAF
  // inside syncViewUrl).  'moveend' covers pan, zoom, fly, fit.
  map.on('moveend', syncViewUrl);

  buildLegend(gj.features);

  // Restore selection from URL (?sel=<idx>)
  const urlSel = parseInt(new URLSearchParams(location.search).get('sel'));
  if (!isNaN(urlSel) && urlSel >= 0 && urlSel < gj.features.length) {
    const feat = gj.features[urlSel];
    const bbox = geomBbox(feat.geometry);
    const center = [(bbox[0][0] + bbox[1][0]) / 2, (bbox[0][1] + bbox[1][1]) / 2];
    selectFeature(urlSel, center);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR (LEGEND) TOGGLE
// ═══════════════════════════════════════════════════════════════════════════
(function initSidebarToggle() {
  const sidebar     = document.getElementById('sidebar');
  const closeBtn    = document.getElementById('sidebar-close');
  const legendBtn   = document.getElementById('legend-toggle');
  // matchMedia is more reliable than a one-shot innerWidth check (handles
  // device rotation, browser zoom, DevTools-driven viewport changes).
  const mqPhone = window.matchMedia('(max-width: 768px)');

  function openSidebar() {
    sidebar.classList.remove('collapsed');
    legendBtn.style.display = 'none';
    // On mobile the sidebar is fixed-position over the map, so we don't
    // need map.resize() — the canvas size doesn't change.
    if (!mqPhone.matches) setTimeout(() => map.resize(), 280);
  }
  function closeSidebar() {
    sidebar.classList.add('collapsed');
    legendBtn.style.display = 'flex';
    if (!mqPhone.matches) setTimeout(() => map.resize(), 280);
  }

  closeBtn.addEventListener('click', closeSidebar);
  legendBtn.addEventListener('click', openSidebar);

  // On phones, start with the sidebar collapsed so the map gets the full
  // viewport.  Done synchronously before first paint to avoid a flash of
  // open drawer on load.
  if (mqPhone.matches) closeSidebar();

  // If the user rotates from portrait→landscape (or resizes desktop window
  // below the breakpoint), re-evaluate the default state.
  mqPhone.addEventListener('change', (e) => {
    if (e.matches) closeSidebar(); else openSidebar();
  });

  // Tap the scrim to close.  The scrim is a CSS ::before pseudo-element on
  // #body, so it's not addressable from JS.  Instead: when a phone-mode
  // drawer is open, any click on the map canvas should close it.  We
  // listen on #main-content so the click on the table area closes it too.
  document.getElementById('main-content').addEventListener('click', () => {
    if (mqPhone.matches && !sidebar.classList.contains('collapsed')) {
      closeSidebar();
    }
  }, { capture: true });
})();

// ═══════════════════════════════════════════════════════════════════════════
// BASEMAP SWITCHER
// ═══════════════════════════════════════════════════════════════════════════
let currentBasemap = 'positron';
let bmPanelOpen = false;

(function initBasemapUI() {
  const panel = document.getElementById('bm-panel');
  BASEMAPS.forEach(bm => {
    const btn = document.createElement('button');
    btn.className = 'bm-option' + (bm.id === currentBasemap ? ' active' : '');
    btn.dataset.id = bm.id;
    btn.innerHTML =
      `<img src="${bm.thumb}" alt="${bm.label}">` +
      `<span class="bm-opt-label">${bm.label}</span>`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (bm.id === currentBasemap) { closeBmPanel(); return; }
      currentBasemap = bm.id;
      updateBmBtn();
      // ── Preserve OUR sources + layers across the basemap swap ─────
      // Without this, setStyle() drops the `features` GeoJSON source
      // and MapLibre has to re-tile all 6 164 features in its worker
      // before they render at the proper zoom.  During the wait, lower-
      // zoom tiles get stretched (overzoomed) into the view — visible
      // as angular geometry, especially on the swisstopo aerial basemap
      // where high-contrast imagery makes the millimetre offsets pop.
      //
      // transformStyle merges OUR sources/layers into the incoming
      // style so the swap only changes the basemap underneath.  Layer-
      // bound event listeners survive the preservation, so click /
      // hover handlers don't need re-attaching.  Side benefit: basemap
      // switches feel instant.
      map.setStyle(bm.url, {
        diff: true,
        transformStyle: (prev, next) => {
          if (!prev) return next;
          const ourSourceIds = collectOurSourceIds();
          const ourLayerIds  = collectOurLayerIds();
          const preservedSources = {};
          for (const [id, src] of Object.entries(prev.sources || {})) {
            if (ourSourceIds.has(id)) preservedSources[id] = src;
          }
          const preservedLayers = (prev.layers || []).filter(
            l => ourLayerIds.has(l.id)
          );
          return {
            ...next,
            sources: { ...next.sources, ...preservedSources },
            layers: [...(next.layers || []), ...preservedLayers],
          };
        },
      });
      // Safety net: if anything failed to preserve (first style change
      // edge cases, schema-incompatible sources, …), re-add on styledata.
      // The addLayers / add3DLayers / restoreExternalLayersOnStyle calls
      // are idempotent — they skip work if our source/layer already
      // exists.  Same with buildLegend.
      map.once('styledata', async () => {
        await restoreExternalLayersOnStyle();
        addLayers();
        if (is3D) add3DLayers();
        attachInteractionHandlers();
        if (geojsonData) buildLegend(geojsonData.features);
      });
      closeBmPanel();
    });
    panel.appendChild(btn);
  });
  updateBmBtn();
})();

function updateBmBtn() {
  const bm = BASEMAPS.find(b => b.id === currentBasemap);
  document.getElementById('bm-current-thumb').src = bm.thumb;
  document.querySelectorAll('.bm-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.id === currentBasemap);
  });
}
function closeBmPanel() {
  bmPanelOpen = false;
  document.getElementById('bm-panel').classList.remove('open');
}
document.getElementById('bm-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  bmPanelOpen = !bmPanelOpen;
  document.getElementById('bm-panel').classList.toggle('open', bmPanelOpen);
});
document.addEventListener('click', () => { if (bmPanelOpen) closeBmPanel(); });

// ── Coordinate display ─────────────────────────────────────────────────────
// Show both WGS84 and LV95 — the latter is the canonical Swiss reference
// surveyors and BBL staff actually work in, so showing it alongside makes
// the footer useful as a coordinate read-out instead of a curiosity.
const coordEl = document.getElementById('coordinates');
function fmtThousand(n) {
  // Swiss-style thousand separator (apostrophe), no decimals: 2'600'370
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '’');
}
map.on('mousemove', e => {
  const { lng, lat } = e.lngLat;
  // wgs84ToLv95 is defined further down for identify; use it here too.  It's
  // hoisted because it's a function declaration.
  const [E, N] = wgs84ToLv95(lng, lat);
  coordEl.textContent =
    `WGS 84  ${lat.toFixed(5)}, ${lng.toFixed(5)}   |   ` +
    `LV95  ${fmtThousand(E)} / ${fmtThousand(N)}`;
});
map.on('mouseout', () => { coordEl.textContent = 'WGS 84 | LV95 | Koordinaten: --'; });

// ═══════════════════════════════════════════════════════════════════════════
// LEGEND BUILDER
// ═══════════════════════════════════════════════════════════════════════════
const EYE_OPEN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
  <circle cx="12" cy="12" r="3"/>
</svg>`;
const EYE_CLOSED = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
  <line x1="1" y1="1" x2="23" y2="23"/>
</svg>`;

function buildLegend(features) {
  // Two-level counts:
  //   entityCounts[e]            = total features of that entity_type
  //   profileCounts[e][p]        = features by entity_type + profile code
  // Sub-grouped legend groups (those with profileCodes) display the SUM of
  // their codes' counts, not the entity_type total — so "Rasen" reads its
  // own ~250-feature count rather than the 3014-feature area total.
  const entityCounts = {};
  const profileCounts = {};
  for (const f of features) {
    const e = f.properties.entity_type;
    const c = f.properties.fk_profil;
    if (e == null) continue;
    entityCounts[e] = (entityCounts[e] || 0) + 1;
    if (c == null) continue;
    if (!profileCounts[e]) profileCounts[e] = {};
    profileCounts[e][c] = (profileCounts[e][c] || 0) + 1;
  }

  const el = document.getElementById('legend-scroll');
  el.innerHTML = '';

  for (const grp of LEGEND_GROUPS) {
    let cnt;
    if (grp.profileCodes && grp.entity_type) {
      const ct = profileCounts[grp.entity_type] || {};
      cnt = grp.profileCodes.reduce((s, c) => s + (ct[c] || 0), 0);
    } else {
      cnt = grp.entity_type ? (entityCounts[grp.entity_type] || 0) : 0;
    }
    const hasData = cnt > 0;

    const groupEl = document.createElement('div');
    groupEl.className = 'lg-group';
    groupEl.dataset.gid = grp.id;

    const head = document.createElement('div');
    head.className = 'lg-group-head';

    const eyeBtn = document.createElement('button');
    eyeBtn.className = 'eye-btn';
    eyeBtn.title = 'Ebene ein-/ausblenden';
    eyeBtn.innerHTML = EYE_OPEN;
    eyeBtn.addEventListener('click', () => {
      if (!grp.entity_type) return;
      vis[grp.id] = !vis[grp.id];
      eyeBtn.innerHTML = vis[grp.id] ? EYE_OPEN : EYE_CLOSED;
      eyeBtn.classList.toggle('hidden-eye', !vis[grp.id]);
      groupEl.classList.toggle('group-hidden', !vis[grp.id]);
      applyMapFilters();
    });
    if (!hasData) {
      eyeBtn.style.opacity = '0.25';
      eyeBtn.style.cursor = 'default';
    }

    const title = document.createElement('span');
    title.className = 'lg-group-title';
    title.textContent = grp.label;
    if (hasData) {
      const c = document.createElement('span');
      c.style.cssText = 'font-size:10px;color:var(--grey-400);margin-left:4px;font-weight:400;text-transform:none;letter-spacing:0';
      c.textContent = cnt;
      title.appendChild(c);
    }

    head.append(eyeBtn, title);
    groupEl.appendChild(head);

    const itemsEl = document.createElement('div');
    itemsEl.className = 'lg-items';

    for (const item of grp.items) {
      const row = document.createElement('div');
      row.className = 'lg-item' + (hasData ? '' : ' empty');

      const sw = document.createElement('span');
      sw.className = 'lg-swatch' + (item.swatchClass ? ' ' + item.swatchClass : '');
      if (item.fill) sw.style.background = item.fill;

      const lbl = document.createElement('span');
      lbl.className = 'lg-label';
      lbl.textContent = item.label;

      row.append(sw, lbl);
      itemsEl.appendChild(row);
    }

    groupEl.appendChild(itemsEl);
    el.appendChild(groupEl);
  }

  // ── External layers (added via header search) ────────────────────────
  const extIds = Object.keys(externalLayers);
  if (extIds.length === 0) return;

  const extGroup = document.createElement('div');
  extGroup.className = 'lg-group lg-group-external';
  const extHead = document.createElement('div');
  extHead.className = 'lg-group-head';
  const extTitle = document.createElement('span');
  extTitle.className = 'lg-group-title';
  extTitle.textContent = 'Externe Ebenen';
  const cnt = document.createElement('span');
  cnt.style.cssText = 'font-size:10px;color:var(--grey-400);margin-left:4px;font-weight:400;text-transform:none;letter-spacing:0';
  cnt.textContent = extIds.length;
  extTitle.appendChild(cnt);
  extHead.append(extTitle);
  extGroup.appendChild(extHead);

  const extItems = document.createElement('div');
  // Dedicated class - .lg-items adds 34px left padding which double-indents
  // the eye icon and breaks alignment with section-header eyes.
  extItems.className = 'lg-ext-items';
  for (const bodId of extIds) {
    const ext = externalLayers[bodId];
    const row = document.createElement('div');
    row.className = 'lg-ext-item';

    const eye = document.createElement('button');
    eye.className = 'eye-btn';
    eye.title = 'Ebene ein-/ausblenden';
    eye.innerHTML = ext.visible ? EYE_OPEN : EYE_CLOSED;
    if (!ext.visible) eye.classList.add('hidden-eye');
    eye.addEventListener('click', () => {
      setExternalVisibility(bodId, !ext.visible);
      eye.innerHTML = ext.visible ? EYE_OPEN : EYE_CLOSED;
      eye.classList.toggle('hidden-eye', !ext.visible);
      row.classList.toggle('group-hidden', !ext.visible);
    });

    const lbl = document.createElement('div');
    lbl.className = 'lg-ext-label';
    const labelText = ext.config.label || bodId;
    lbl.innerHTML = `<div class="lg-ext-title" title="${escapeHtml(bodId)}">${escapeHtml(labelText)}</div>` +
                    (ext.config.attribution
                      ? `<div class="lg-ext-attr">${escapeHtml(ext.config.attribution)}</div>` : '');

    const opa = document.createElement('input');
    opa.type = 'range';
    opa.min = 0; opa.max = 1; opa.step = 0.05;
    opa.value = ext.opacity;
    opa.title = 'Deckkraft';
    opa.className = 'lg-ext-opacity';
    opa.addEventListener('input', () => setExternalOpacity(bodId, Number(opa.value)));

    const rm = document.createElement('button');
    rm.className = 'lg-ext-remove';
    rm.title = 'Entfernen';
    rm.innerHTML = '&times;';
    rm.addEventListener('click', () => removeExternalLayer(bodId));

    row.append(eye, lbl, opa, rm);
    extItems.appendChild(row);
  }
  extGroup.appendChild(extItems);
  el.appendChild(extGroup);
}

// ═══════════════════════════════════════════════════════════════════════════
// EDIT MODE — placeholder
// ───────────────────────────────────────────────────────────────────────────
// The previous implementation dragged the whole GeoJSON to apply a coarse
// georeferencing offset (it was useful when data came from PDF extraction).
// With proper LV03 source data this is no longer needed.  Keep the toggle
// button + banner so the UI affordance stays for the upcoming real edit
// flow (vertex editing, attribute editing, etc.).  The flag itself is still
// referenced by selection / hover handlers - they short-circuit when
// editMode is true so accidental clicks don't select features.
// ═══════════════════════════════════════════════════════════════════════════
const editToggleBtn = document.getElementById('edit-toggle');
const editBanner    = document.getElementById('edit-banner');
const saveBanner    = document.getElementById('save-banner');

// Override the previous banner copy so it's clear what state the user is in.
if (editBanner) editBanner.textContent = 'Bearbeitungs-Modus (in Entwicklung) – Funktionen folgen.';
// Save banner has no purpose without the offset workflow; never shown.
if (saveBanner) saveBanner.classList.remove('visible');

// ── Header: Share & Print ──────────────────────────────────────────────
// The current URL is auto-synced via syncViewUrl() (center/zoom on moveend)
// + sel/ext/scope params, so `location.href` is already a deep-link to the
// view the user is sharing.  Use the system share sheet when available,
// fall back to clipboard.
(function initShareButton() {
  const btn = document.getElementById('share-toggle');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const url = location.href;
    const title = 'Grünflächen Inventar';
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;                                  // success — system sheet handled it
      } catch (err) {
        if (err.name === 'AbortError') return;   // user cancelled the sheet
        // fall through to clipboard fallback
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link kopiert', 'success');
    } catch {
      showToast('Teilen fehlgeschlagen', 'error');
    }
  });
})();

(function initPrintButton() {
  const btn = document.getElementById('print-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    // Trigger a fresh repaint so preserveDrawingBuffer has up-to-date
    // pixels for the print engine to capture.  The print dialog opens on
    // the next tick, after the canvas is rendered.
    map.triggerRepaint();
    setTimeout(() => window.print(), 50);
  });
})();

editToggleBtn.addEventListener('click', () => {
  editMode = !editMode;
  editToggleBtn.classList.toggle('active', editMode);
  if (editBanner) editBanner.classList.toggle('visible', editMode);
  document.getElementById('map').classList.toggle('edit-active', editMode);
});

let measureActive = false;

// ═══════════════════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════
function showToast(msg, type = '') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAP CONTEXT MENU + MEASURE  (unchanged from previous version)
// ═══════════════════════════════════════════════════════════════════════════
(() => {
  const menu = document.getElementById('map-context-menu');
  const coordsItem = document.getElementById('context-menu-coords');
  const coordsText = document.getElementById('context-menu-coords-text');
  const measureBtn = document.getElementById('context-menu-measure');
  const measureText = document.getElementById('context-menu-measure-text');
  const measureDisplay = document.getElementById('measure-distance-display');
  const measureClose = document.getElementById('measure-distance-close');
  const measureTotalDist = document.getElementById('measure-total-distance');
  const measureTotalArea = document.getElementById('measure-total-area');
  const measureAreaRow = document.getElementById('measure-area-row');

  let ctxLngLat = null;

  function hideMenu() { menu.classList.remove('show'); }

  map.on('contextmenu', (e) => {
    e.preventDefault();
    ctxLngLat = e.lngLat;
    const [E, N] = wgs84ToLv95(ctxLngLat.lng, ctxLngLat.lat);
    coordsText.textContent =
      ctxLngLat.lat.toFixed(5) + ', ' + ctxLngLat.lng.toFixed(5) +
      '  |  LV95  ' + fmtThousand(E) + ' / ' + fmtThousand(N);
    coordsItem.classList.remove('copied');
    measureText.textContent = ms.active ? 'Messung löschen' : 'Distanz messen';
    measureBtn.classList.toggle('measure-active', ms.active);

    const mapEl = document.getElementById('map');
    const rect = mapEl.getBoundingClientRect();
    const x = e.point.x, y = e.point.y;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.classList.toggle('flip-h', x + 200 > rect.width);
    menu.classList.toggle('flip-v', y + 180 > rect.height);
    menu.classList.add('show');
  });

  document.addEventListener('click', hideMenu);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideMenu(); if (ms.active) clearMeasure(); }
  });

  coordsItem.addEventListener('click', (e) => {
    e.stopPropagation();
    const txt = coordsText.textContent;
    navigator.clipboard.writeText(txt).then(() => {
      coordsItem.classList.add('copied');
      showToast('Koordinaten kopiert', 'success');
      setTimeout(hideMenu, 300);
    }).catch(() => showToast('Kopieren fehlgeschlagen', 'error'));
  });

  document.getElementById('context-menu-share').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!ctxLngLat) return;
    hideMenu();
    const url = new URL(location.href);
    url.searchParams.set('center', ctxLngLat.lng.toFixed(5) + ',' + ctxLngLat.lat.toFixed(5));
    url.searchParams.set('zoom', Math.round(map.getZoom()));
    const shareUrl = url.toString();

    if (navigator.share) {
      navigator.share({ title: 'Grünflächen Inventar – Standort', url: shareUrl })
        .catch(err => {
          if (err.name !== 'AbortError')
            navigator.clipboard.writeText(shareUrl).then(() => showToast('Link kopiert', 'success'));
        });
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => showToast('Link kopiert', 'success'));
    }
  });

  document.getElementById('context-menu-print').addEventListener('click', () => {
    hideMenu(); window.print();
  });

  document.getElementById('context-menu-report').addEventListener('click', () => {
    hideMenu();
    if (!ctxLngLat) return;
    const coords = ctxLngLat.lat.toFixed(5) + ', ' + ctxLngLat.lng.toFixed(5);
    const subj = encodeURIComponent('Problem melden - Grünflächen Inventar');
    const body = encodeURIComponent(
      'Problembeschreibung:\n\n\n\n---\nKoordinaten: ' + coords + '\nURL: ' + location.href
    );
    location.href = 'mailto:info@gis-immo.ch?subject=' + subj + '&body=' + body;
  });

  const ms = {
    active: false, points: [], markers: [], labels: [],
    srcId: 'measure-line-src', layerId: 'measure-line', closed: false
  };

  function hav(lat1, lon1, lat2, lon2) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function polyArea(pts) {
    if (pts.length < 3) return 0;
    const n = pts.length;
    const avgLat = pts.reduce((s, p) => s + p[1], 0) / n;
    const latS = 111320, lonS = 111320 * Math.cos(avgLat * Math.PI / 180);
    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += pts[i][0] * lonS * pts[j][1] * latS;
      area -= pts[j][0] * lonS * pts[i][1] * latS;
    }
    return Math.abs(area / 2);
  }

  function fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m'; }
  function fmtArea(a) {
    if (a >= 1e6) return (a / 1e6).toFixed(2) + ' km²';
    if (a >= 1e4) return (a / 1e4).toFixed(2) + ' ha';
    return Math.round(a) + ' m²';
  }

  function addMeasurePoint(lngLat, idx) {
    const pt = [lngLat.lng, lngLat.lat];
    if (idx === undefined) { ms.points.push(pt); idx = ms.points.length - 1; }
    else ms.points[idx] = pt;

    if (idx >= ms.markers.length) {
      const el = document.createElement('div'); el.className = 'measure-marker';
      const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' })
        .setLngLat(pt).addTo(map);
      marker._mIdx = idx;
      marker.on('drag', () => {
        const p = marker.getLngLat();
        ms.points[marker._mIdx] = [p.lng, p.lat];
        updateLine(); updateLabels(); updateDisplay();
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (marker._mIdx === 0 && ms.points.length >= 3 && !ms.closed) {
          ms.closed = true; updateLine(); updateLabels(); updateDisplay(); return;
        }
        removeMeasurePoint(marker._mIdx);
      });
      ms.markers.push(marker);
    } else {
      ms.markers[idx].setLngLat(pt);
    }
    updateLine(); updateLabels(); updateDisplay();
  }

  function removeMeasurePoint(idx) {
    if (ms.points.length <= 1) { clearMeasure(); return; }
    ms.points.splice(idx, 1);
    ms.markers[idx].remove(); ms.markers.splice(idx, 1);
    ms.markers.forEach((m, i) => m._mIdx = i);
    if (ms.closed && ms.points.length < 3) ms.closed = false;
    updateLine(); updateLabels(); updateDisplay();
  }

  function updateLine() {
    const coords = ms.points.slice();
    if (ms.closed && coords.length >= 3) coords.push(coords[0]);
    if (map.getLayer(ms.layerId)) map.removeLayer(ms.layerId);
    if (map.getSource(ms.srcId)) map.removeSource(ms.srcId);
    if (coords.length < 2) return;
    map.addSource(ms.srcId, {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
    });
    map.addLayer({
      id: ms.layerId, type: 'line', source: ms.srcId,
      paint: { 'line-color': '#000', 'line-width': 2 }
    });
  }

  function updateLabels() {
    ms.labels.forEach(m => m.remove()); ms.labels = [];
    const pts = ms.points;
    if (pts.length < 2) return;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = hav(pts[i][1], pts[i][0], pts[i + 1][1], pts[i + 1][0]);
      const el = document.createElement('div'); el.className = 'measure-label'; el.textContent = fmtDist(d);
      ms.labels.push(new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2]).addTo(map));
    }
    if (ms.closed && pts.length >= 3) {
      const p0 = pts[0], pN = pts[pts.length - 1];
      const d = hav(pN[1], pN[0], p0[1], p0[0]);
      const el = document.createElement('div'); el.className = 'measure-label'; el.textContent = fmtDist(d);
      ms.labels.push(new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([(pN[0] + p0[0]) / 2, (pN[1] + p0[1]) / 2]).addTo(map));
    }
  }

  function updateDisplay() {
    const pts = ms.points;
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++)
      total += hav(pts[i][1], pts[i][0], pts[i + 1][1], pts[i + 1][0]);
    if (ms.closed && pts.length >= 3)
      total += hav(pts[pts.length - 1][1], pts[pts.length - 1][0], pts[0][1], pts[0][0]);
    measureTotalDist.textContent = fmtDist(total);
    if (ms.closed && pts.length >= 3) {
      measureTotalArea.textContent = fmtArea(polyArea(pts));
      measureAreaRow.style.display = 'flex';
    } else {
      measureAreaRow.style.display = 'none';
    }
  }

  function startMeasure() {
    ms.active = true; measureActive = true;
    ms.points = []; ms.markers = []; ms.labels = []; ms.closed = false;
    measureDisplay.classList.add('show');
    measureTotalDist.textContent = '0 m';
    measureAreaRow.style.display = 'none';
    map.getCanvas().style.cursor = 'crosshair';
  }

  function clearMeasure() {
    ms.active = false; measureActive = false; ms.closed = false;
    ms.markers.forEach(m => m.remove()); ms.markers = [];
    ms.labels.forEach(m => m.remove()); ms.labels = [];
    ms.points = [];
    if (map.getLayer(ms.layerId)) map.removeLayer(ms.layerId);
    if (map.getSource(ms.srcId)) map.removeSource(ms.srcId);
    measureDisplay.classList.remove('show');
    map.getCanvas().style.cursor = '';
  }

  measureBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideMenu();
    if (ms.active) clearMeasure(); else startMeasure();
  });

  measureClose.addEventListener('click', () => clearMeasure());

  map.on('click', (e) => {
    hideMenu();
    if (!ms.active) return;
    if (ms.points.length >= 3 && !ms.closed) {
      const fp = ms.points[0];
      const px = map.project(e.lngLat).dist(map.project({ lng: fp[0], lat: fp[1] }));
      if (px < 15) { ms.closed = true; updateLine(); updateLabels(); updateDisplay(); return; }
    }
    if (ms.closed) return;
    addMeasurePoint(e.lngLat);
  });
})();

// ═══════════════════════════════════════════════════════════════════════════
// HEADER SEARCH — swisstopo geocoding + local features
// ═══════════════════════════════════════════════════════════════════════════
(() => {
  const input   = document.getElementById('search-input');
  const results  = document.getElementById('search-results');
  const spinner  = document.getElementById('search-spinner');
  const clearBtn = document.getElementById('search-clear-btn');
  let debounce = null, abortCtrl = null, searchMarker = null;

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const val = input.value.trim();
    clearBtn.style.display = val ? 'flex' : 'none';
    if (val.length < 2) { results.classList.remove('active'); spinner.style.display = 'none'; return; }
    spinner.style.display = 'block';
    debounce = setTimeout(() => doSearch(val), 300);
  });

  clearBtn.addEventListener('click', () => {
    input.value = ''; clearBtn.style.display = 'none';
    results.classList.remove('active'); input.focus();
    if (searchMarker) { searchMarker.remove(); searchMarker = null; }
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('search-wrapper').contains(e.target))
      results.classList.remove('active');
  });

  async function doSearch(term) {
    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();
    const sig = abortCtrl.signal;

    // Local feature search across the most identifying fields.  Capture
    // the index alongside the feature so the rendering doesn't have to
    // run `geojsonData.features.indexOf(f)` (O(n) per match) afterwards.
    const localMatches = [];
    if (geojsonData) {
      const q = term.toLowerCase();
      for (let i = 0; i < geojsonData.features.length; i++) {
        const f = geojsonData.features[i];
        const p = f.properties;
        const hay = [p.name, p.site_name, p.adresse, p.site_adresse,
                     p.objektnummer, p.site_objektnummer, p.baumart,
                     p.feature_type, p.subtype, p.entity_type]
          .filter(Boolean).join(' ').toLowerCase();
        if (hay.includes(q)) localMatches.push({ idx: i, feat: f });
        if (localMatches.length >= 8) break;
      }
    }

    let locations = [];
    try {
      const url = 'https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=locations&limit=5&sr=4326&searchText=' + encodeURIComponent(term);
      const res = await fetch(url, { signal: sig });
      const data = await res.json();
      locations = data.results || [];
    } catch (e) { if (e.name !== 'AbortError') console.warn('Search error:', e); }

    let layers = [];
    try {
      const url = 'https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=layers&limit=5&lang=de&searchText=' + encodeURIComponent(term);
      const res = await fetch(url, { signal: sig });
      const data = await res.json();
      layers = data.results || [];
    } catch (e) { /* ignore */ }

    spinner.style.display = 'none';
    renderResults(localMatches, locations, layers);
  }

  function renderResults(local, locations, layers) {
    let html = '';

    if (local.length) {
      html += '<div class="search-section-header">Objekte</div>';
      local.forEach((m) => {
        const p = m.feat.properties;
        const title = p.name || p.site_name || p.baumart || p.feature_type || '–';
        const sub = [p.subtype, p.adresse || p.site_adresse, p.entity_type].filter(Boolean).join(' · ');
        html += `<div class="search-item" data-action="local" data-idx="${m.idx}">
          <div class="search-item-title">${escapeHtml(title)}</div>
          ${sub ? `<div class="search-item-subtitle">${escapeHtml(sub)}</div>` : ''}
        </div>`;
      });
    }

    if (locations.length) {
      html += '<div class="search-section-header">Orte</div>';
      locations.forEach(r => {
        const a = r.attrs;
        // a.label from swisstopo is already HTML (contains <b>match</b>) - leave as-is.
        html += `<div class="search-item" data-action="location" data-lat="${a.lat}" data-lon="${a.lon}" data-zoom="${a.zoomlevel || 14}">
          <div class="search-item-title">${a.label}</div>
        </div>`;
      });
    }

    if (layers.length) {
      html += '<div class="search-section-header">Karten</div>';
      layers.forEach(r => {
        const a = r.attrs;
        // a.label is HTML from swisstopo; a.layer (BodId) is safe but escape defensively.
        html += `<div class="search-item" data-action="layer" data-layer="${escapeHtml(a.layer || '')}">
          <div class="search-item-title">${a.label}</div>
        </div>`;
      });
    }

    if (!html) html = '<div class="search-item" style="cursor:default"><div class="search-item-subtitle">Keine Resultate</div></div>';

    results.innerHTML = html;
    results.classList.add('active');

    results.querySelectorAll('.search-item[data-action]').forEach(item => {
      item.addEventListener('click', () => handleClick(item));
    });
  }

  function handleClick(item) {
    results.classList.remove('active');
    const action = item.dataset.action;

    if (action === 'local') {
      const idx = +item.dataset.idx;
      const feat = geojsonData.features[idx];
      if (!feat) return;
      if (searchMarker) { searchMarker.remove(); searchMarker = null; }
      const bbox = geomBbox(feat.geometry);
      const center = [(bbox[0][0] + bbox[1][0]) / 2, (bbox[0][1] + bbox[1][1]) / 2];
      selectFeature(idx, center);
      // For points, fitBounds with same min=max collapses; use flyTo instead.
      if (bbox[0][0] === bbox[1][0] && bbox[0][1] === bbox[1][1]) {
        map.flyTo({ center, zoom: 18 });
      } else {
        map.fitBounds(bbox, { padding: 80, maxZoom: 20 });
      }
      input.value = item.querySelector('.search-item-title').textContent;
      clearBtn.style.display = 'flex';

    } else if (action === 'location') {
      const lat = +item.dataset.lat, lon = +item.dataset.lon, zoom = +item.dataset.zoom;
      if (searchMarker) searchMarker.remove();
      searchMarker = new maplibregl.Marker({ color: '#cc0000' })
        .setLngLat([lon, lat]).addTo(map);
      map.flyTo({ center: [lon, lat], zoom });
      input.value = item.querySelector('.search-item-title').textContent;
      clearBtn.style.display = 'flex';

    } else if (action === 'layer') {
      const bodId = item.dataset.layer;
      if (!bodId) { showToast('Ebene ohne ID', 'error'); return; }
      addExternalLayer(bodId).then(() => {
        showToast('Ebene hinzugefügt: ' + (item.querySelector('.search-item-title').textContent || bodId), 'success');
      });
    }
  }
})();
