// ═══════════════════════════════════════════════════════════════════════════
// MAP — MapLibre init, legend, feature card, selection, external layers,
//       identify, context menu + measure, header search
// Depends on: config.js (LEGEND_GROUPS + lookups, ENTITY_COLORS, TOKENS,
//               installAreaFillExpr, DATA_FILES, LAYER_METADATA, careProfile),
//             data.js (loadInventory, lv95ToWgs84),
//             util.js (escapeHtml, icon, swatches, dialog, toasts, geomBbox, …),
//             mapkit.js (inventory layers + filters, selection, hit-testing,
//               patterns, 3D, controls, basemaps),
//             mappanels.js (legend list, feature card)
// ═══════════════════════════════════════════════════════════════════════════

// ── Legend visibility state ────────────────────────────────────────────────
// The legend decides WHAT is drawn.  Every legend row — a profile, or a layer
// without profiles — has a key ('area:6', 'tree:1', 'point:9', 'site',
// 'parcel', …) and `hidden` holds the keys that are switched off.  A group's
// eye is derived from its rows (all on / some on / all off).  Attribute
// filters live in the filter sidebar (table.js) and are independent of this.
const legendState = {
  hidden: new Set(),      // row keys switched off; in the URL as ?hide=area:6,tree:1
  open: null,             // id of the expanded group (accordion: one at a time)
  inView: null,           // Set of row keys with features in the map view (null = not known yet)
  groupCounts: {},        // features in the map view per group id (phone quick chips)
  infoKey: null,          // row whose info dialog is open
};
// Resolved legend, built once the data is loaded (buildLegendModel):
// [{ id, label, items: [{ key, entity_type, code, domain, label, style | swatch, info, group }] }]
let LEGEND = [];
const _legendItemByKey = {};


let tblActiveIds = null; // null = no table filter; array of feature indices
let selectedId   = null; // currently selected feature index (null = none)

// Source / layer ID enumeration used when a basemap swap happens — every ID
// returned here is preserved across the swap, everything else (basemap
// layers) comes from the new style.
function collectOurSourceIds() {
  const ids = [...INVENTORY_SOURCE_IDS, 'ext-highlight', 'measure-line-src'];
  // External-layer sources added via the header search (one per active
  // swisstopo layer).  Keys live in the externalLayers state object.
  for (const bodId of Object.keys(externalLayers)) ids.push(extSourceId(bodId));
  return ids;
}

function collectOurLayerIds() {
  const ids = [...inventoryLayerIds(),
    'ext-highlight-fill', 'ext-highlight-line', 'ext-highlight-circle', 'measure-line'];
  for (const bodId of Object.keys(externalLayers)) ids.push(extLayerId(bodId));
  return ids;
}

// Apply what the legend (profiles / layers switched off) and the table
// (search + attribute filters) allow to be drawn (applyInventoryFilters,
// mapkit.js).
function applyMapFilters() {
  const tableIdFilter = tblActiveIds === null
    ? null
    : (tblActiveIds.length === 0
        ? ['literal', false]
        : ['in', ['id'], ['literal', tblActiveIds]]);
  applyInventoryFilters(map, legendState.hidden,
    legendHiddenCodes(legendState.hidden, _legendItemByKey), tableIdFilter);
  // What is drawn changed, so which legend rows have something in view may too.
  scheduleInViewUpdate();
}

// ── Data fetch starts immediately ──────────────────────────────────────────
// ~12 MB of GeoJSON: fetch it in parallel with the basemap style instead of
// after the map's 'load' event (on a phone connection the two waits used to
// add up).  The no-op catch only silences an early "unhandled rejection";
// the 'load' handler awaits the same promise and reports the error.
const inventoryPromise = loadInventory(DATA_FILES);
inventoryPromise.catch(() => {});

// ── Loading / error overlay ────────────────────────────────────────────────
function setLoadState(state, message) {
  const el = document.getElementById('map-loading');
  if (!el) return;
  el.dataset.state = state;                       // 'loading' | 'slow' | 'error' | 'ready'
  if (message) document.getElementById('map-loading-text').textContent = message;
  document.getElementById('map-loading-retry').hidden = state !== 'error';
}
setLoadState('loading');
const _slowLoadTimer = setTimeout(() => {
  const el = document.getElementById('map-loading');
  if (el && el.dataset.state === 'loading') setLoadState('slow', 'Daten werden geladen… (langsame Verbindung)');
}, 8000);
document.getElementById('map-loading-retry').addEventListener('click', () => location.reload());

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

// The map is constructed (above) before table.js runs _applyTableState(),
// so the canvas is sized while #table-panel still occupies its default
// --table-height (300px). When table.js then collapses the panel, #map grows
// to full height but the WebGL canvas keeps the stale, shorter size — leaving
// a white strip at the bottom. trackResize's ResizeObserver usually heals this
// but races first paint, so it only shows "sometimes". Force one explicit
// resize once layout has settled (rAF = after the collapse layout flush).
map.once('load', () => requestAnimationFrame(() => map.resize()));

// ── State ──────────────────────────────────────────────────────────────────
let editMode = false;       // «Bearbeiten» placeholder: suspends selection and hover
let geojsonData = null;

// ── Feature card ───────────────────────────────────────────────────────────
// The selected feature is described in a card docked in the map's top-right
// corner (a bottom sheet on phones): a few facts in a fixed order and one
// primary action that leads to the Standort detail page.  Completeness lives
// on the detail page; the card stays compact.  When a click hits several
// features the card pages through them.  Contents and behaviour:
// createFeatureCard (mappanels.js) — the Situationsplan uses the same card.
const cardEl = document.getElementById('feature-card');
const featureCard = createFeatureCard({
  el: cardEl,
  mapEl: document.getElementById('map'),
  feature: (idx) => geojsonData.features[idx],
  // Primary action: the Standort detail page.  A new tab on desktop / tablet
  // (the map keeps its state); the same tab on phones, where the page links
  // back to the map as it was.
  detailLink: (p) => {
    const href = standortUrl(p.site_ref);
    return href ? { href, sameTab: isCompactLayout() } : null;
  },
  onPage: (idx, stack) => selectFeature(idx, { stack }),
  onClose: () => clearSelection(),
  onZoom: (idx) => zoomToFeature(idx),
  // Phones open the detail page in this tab: remember the map as it is, so
  // «Zur Karte» there can come back to it.
  onDetailClick: () => {
    if (!isCompactLayout()) return;
    try { sessionStorage.setItem('gi.mapUrl', location.href); } catch (_) { /* private mode */ }
  },
});

// Padding for camera moves, so a feature is framed in the part of the map
// that the floating legend and the card leave free.
function viewPadding(base = 60) {
  const box = map.getContainer();
  const w = box.clientWidth, h = box.clientHeight;
  if (isCompactLayout()) {
    const sheet = cardEl.hidden ? 0 : cardEl.offsetHeight;
    return { top: Math.min(base, h / 5), left: 24, right: 24, bottom: Math.min(sheet + 24, h * 0.6) };
  }
  // Only when the map is wide enough for both panels plus something to see.
  const roomy = w >= 900;
  const pad = Math.min(base, Math.floor(h / 5));
  return {
    top: pad, bottom: pad,
    left:  roomy && legendPanel.isOpen() ? document.getElementById('legend').offsetWidth + 36 : pad,
    right: roomy && !cardEl.hidden ? cardEl.offsetWidth + 80 : pad,
  };
}

// Frame a feature: the card's zoom button, and a link that opens the map on
// a Standort (?site=).  Selecting — on the map, in the table, from the
// search — never moves the map by itself.
// geomBbox() pads a point to a small box, so one fitBounds serves all types.
function zoomToFeature(idx, opts = {}) {
  const feat = geojsonData && geojsonData.features[idx];
  if (!feat || !feat.geometry) return;
  map.fitBounds(geomBbox(feat.geometry), {
    padding: viewPadding(), maxZoom: ZOOM_TO_MAX, ...opts,
  });
}

// ── Selection helpers ──────────────────────────────────────────────────────
function applySelectedFilter() { setSelectionFilter(map, selectedId); }

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

// The Standort marker (site_location) is a map-only shortcut for its
// Standort: selections always land on the real `site` feature, so selection,
// card, URL and table line up.
function resolveSelectable(idx) {
  const f = geojsonData.features[idx];
  if (f && f.properties.entity_type === 'site_location') {
    const siteOid = f.properties.site_oid;
    const site = geojsonData.features.find(
      g => g.properties.entity_type === 'site' && g.properties.objectid === siteOid);
    if (site && site.id != null) return Number(site.id);
  }
  return Number(idx);
}

// Select a feature: highlight it, show its card, sync the URL and the table.
//   opts.stack   feature indices under the click, to page through in the card
//                (default: just this feature)
function selectFeature(idx, opts = {}) {
  idx = resolveSelectable(idx);
  const f = geojsonData.features[idx];
  if (!f) return;

  selectedId = idx;
  applySelectedFilter();
  updateSelectionUrl();

  // The identify card of the external layers docks in the same corner.
  if (identifyPopup.isOpen()) identifyPopup.remove();
  // Phones show one bottom sheet at a time; on a narrow map the legend card
  // and the feature card would overlap — the legend steps aside (not stored).
  if (legendPanel.isOpen() &&
      (isCompactLayout() || map.getContainer().clientWidth < 700)) {
    legendPanel.close({ persist: false });
  }
  featureCard.show(idx, opts.stack);
  syncTableToSelection(idx);
}

// Keep the table on the selected feature: switch to its tab, page to its row
// and scroll it into view.  The table is not opened for this — the card is
// the place for details; the row is waiting when the user opens the table.
function syncTableToSelection(idx) {
  const f = geojsonData.features[idx];
  // `sites` ← 'site', `parcels` ← 'parcel'; everything else → `green`.
  // setScope() is a no-op when target === current; otherwise it rebuilds
  // the column dropdown / pagination state and renders once.
  const et = f.properties.entity_type;
  const targetScope = et === 'site' ? 'sites' : et === 'parcel' ? 'parcels' : 'green';
  if (typeof setScope === 'function' && targetScope !== tblScope) {
    setScope(targetScope);
  }

  // Use the SCOPED row set — `tblPage` paginates the scoped+filtered list
  // in renderTable(), so the row-to-page math must operate on the same
  // basis or we land on the wrong page.
  let sorted = getSortedRows(getScopedRows());
  if (sorted.findIndex(r => r._idx === idx) === -1) {
    // Row is hidden by search / sidebar filters — clear them so the
    // selection becomes visible in the table.
    const si = document.getElementById('tbl-search');
    const sx = document.getElementById('tbl-search-x');
    if (si && si.value) { si.value = ''; tblSearch = ''; if (sx) sx.style.display = 'none'; }
    for (const key of Object.keys(tblFilterAttrs)) tblFilterAttrs[key].clear();
    buildFilterSidebar();
    onFilterChange({ zoom: false });
    sorted = getSortedRows(getScopedRows());
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
  featureCard.hide();
  renderTable();
}

// ── Add the inventory source + layers (definitions: mapkit.js) ─────────────
function addLayers() {
  if (!geojsonData || map.getSource('features')) return;
  addInventoryLayers(map, geojsonData);
  applySelectedFilter();
  applyMapFilters();
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
// 3D mode tilts the camera and adds extruded OSM buildings and one cylinder
// per tree; the layers themselves are defined in mapkit.js (the detail page's
// Situationsplan uses the same ones).
// ═══════════════════════════════════════════════════════════════════════════
let is3D = false;
let _treeExtrusionData = null;

// Generated once and cached.
function treeExtrusionData() {
  if (!_treeExtrusionData) {
    _treeExtrusionData = buildTreeExtrusionData(geojsonData ? geojsonData.features : []);
  }
  return _treeExtrusionData;
}

function set3D(on) {
  is3D = on;
  set3DButtonState(mapCtrls.getButton('3d'), on);
  if (on) {
    map.easeTo({ pitch: D3_PITCH, duration: 500 });
    add3DLayers(map, treeExtrusionData());
    applyMapFilters();          // tree cylinders follow the legend
  } else {
    map.easeTo({ pitch: 0, duration: 500 });
    remove3DLayers(map);
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
    const beforeId = map.getLayer('parcel-fill') ? 'parcel-fill' : undefined;
    if (ext.config.type === 'geojson') {
      // Render GeoJSON layers as a thin outlined fill.
      map.addLayer({
        id: lyrId, type: 'fill', source: srcId,
        paint: { 'fill-color': TOKENS.primary, 'fill-opacity': ext.opacity * 0.4 },
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
  renderLegend();
  syncExternalLayersUrl();
}

function removeExternalLayer(bodId) {
  const lyrId = extLayerId(bodId);
  const srcId = extSourceId(bodId);
  if (map.getLayer(lyrId)) map.removeLayer(lyrId);
  if (map.getSource(srcId)) map.removeSource(srcId);
  delete externalLayers[bodId];
  renderLegend();
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
// The identify card docks in the map's top-right corner like the feature
// card (css: .maplibregl-popup.docked); only one of the two is open at a time.
const identifyPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '380px', className: 'identify-popup docked' });
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

// wgs84ToLv95() lives in js/util.js, its inverse lv95ToWgs84() in js/data.js
// (both loaded before this file).  runIdentify queries swisstopo in LV95 and
// reprojects the returned geometry for the highlight.

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
  // The identify card takes the corner the feature card docks in.
  clearSelection();

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
    paint: { 'fill-color': TOKENS.mapSelection, 'fill-opacity': 0.18 },
  });
  // Stroke (polygon + linestring)
  map.addLayer({
    id: 'ext-highlight-line', type: 'line', source: 'ext-highlight',
    filter: ['in', '$type', 'Polygon', 'LineString'],
    paint: { 'line-color': TOKENS.mapSelection, 'line-width': 3 },
  });
  // Marker (point)
  map.addLayer({
    id: 'ext-highlight-circle', type: 'circle', source: 'ext-highlight',
    filter: ['==', '$type', 'Point'],
    paint: {
      'circle-radius': 8, 'circle-color': TOKENS.mapSelection,
      'circle-stroke-color': TOKENS.white, 'circle-stroke-width': 2,
    },
  });
}

function clearIdentifyHighlight() {
  for (const id of ['ext-highlight-fill', 'ext-highlight-line', 'ext-highlight-circle']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('ext-highlight')) map.removeSource('ext-highlight');
}

// MapLibre delegated (layer-scoped) listeners are keyed by layer-ID string and
// are NOT dropped by setStyle() — and our data layers are preserved across
// basemap swaps anyway.  So the hover / click handlers below are bound exactly
// once (see attachInteractionHandlers); re-binding them on every style change
// used to stack duplicate handlers, which made a feature click
// select-then-clear after the first basemap switch.
// Hover outline — from the map (bindFeatureHover) and from the table rows.
function setHover(id) { setHoverFilter(map, id); }

let _handlersBound = false;
function attachInteractionHandlers() {
  if (_handlersBound) return;
  _handlersBound = true;
  // Hover: pointer cursor + outline.
  bindFeatureHover(map, setHover, () => editMode);
  // One click handler for the whole map: everything of ours under the
  // pointer goes into the card's stack (featureStackAt, mapkit.js); an empty
  // spot asks the visible external layers (identify); nothing at all clears
  // the selection.
  map.on('click', async (e) => {
    if (editMode || measureActive) return;
    const stack = featureStackAt(map, e.point, geojsonData.features, resolveSelectable);
    if (stack.length) {
      // A second click on the selected feature deselects it.
      if (stack[0] === selectedId) { clearSelection(); return; }
      // Selecting never moves the map; the card's zoom button does.
      selectFeature(stack[0], { stack });
      return;
    }
    const handled = await runIdentify(e.lngLat);
    if (!handled) clearSelection();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGEND MODEL
// ═══════════════════════════════════════════════════════════════════════════
// Resolve LEGEND_GROUPS (config.js) against the loaded data: profile rows get
// their label from the codelists and their style from care_profiles.json;
// rows without a single feature are left out.  The order is the curated one
// from config.js (the printed plan's), not a count ranking.
function buildLegendModel(gj) {
  LEGEND = buildLegendGroups(gj.features, gj.metadata && gj.metadata.codelists);
  Object.assign(_legendItemByKey, legendItemsByKey(LEGEND));
}

// ── "ausserhalb": which legend rows have something in the map view ────────
// Tested against the data (one bounding box per feature), not against the
// rendered tiles: a row that is switched off, or a tree hidden by the 3D
// mode, still counts as being in view.  ~6 000 box tests per settled view.
let _featBoxes = null;   // per feature index: [minLng, minLat, maxLng, maxLat, legendKey] | null
function indexFeatureBoxes() {
  _featBoxes = geojsonData.features.map((f) => {
    const key = legendKeyFor(f.properties.entity_type, f.properties.fk_profil);
    if (!key || !f.geometry) return null;
    const b = geomBbox(f.geometry);
    return [b[0][0], b[0][1], b[1][0], b[1][1], key];
  });
}
function updateInView() {
  if (!_featBoxes || !LEGEND.length) return;
  const b = map.getBounds();
  const w = b.getWest(), s = b.getSouth(), e = b.getEast(), n = b.getNorth();
  // Features removed by the table's search / attribute filters are not drawn.
  const active = tblActiveIds === null ? null : new Set(tblActiveIds);
  const seen = new Set();
  const counts = {};
  for (let i = 0; i < _featBoxes.length; i++) {
    const fb = _featBoxes[i];
    if (!fb || fb[2] < w || fb[0] > e || fb[3] < s || fb[1] > n) continue;
    if (active && !active.has(i)) continue;
    seen.add(fb[4]);
    const it = _legendItemByKey[fb[4]];
    if (it) counts[it.group.id] = (counts[it.group.id] || 0) + 1;
  }
  legendState.inView = seen;
  legendState.groupCounts = counts;
  markLegendInView();
  renderLegendChips();
}
let _inViewTimer = null;
function scheduleInViewUpdate() {
  clearTimeout(_inViewTimer);
  _inViewTimer = setTimeout(updateInView, 200);
}
map.on('load', async () => {
  let gj;
  try {
    // Load the normalized per-entity files and join them into one in-memory
    // FeatureCollection (js/data.js).  data.geojson is no longer fetched.
    gj = await inventoryPromise;
  } catch (e) {
    console.error(e);
    clearTimeout(_slowLoadTimer);
    setLoadState('error', 'Die Inventardaten konnten nicht geladen werden.');
    return;
  }
  // Normalise feature ids to array index.
  gj.features.forEach((f, i) => { if (f.id == null) f.id = i; });
  geojsonData = gj;

  // Build the area fill expression from observed fk_profil values.
  const profileCodes = (gj.metadata && gj.metadata.fk_profil_values) ||
    [...new Set(gj.features.map(f => f.properties.fk_profil).filter(p => p != null))];
  installAreaFillExpr(profileCodes);

  // Legend first: its visibility state (?hide=…) is part of the layer filters.
  buildLegendModel(gj);
  indexFeatureBoxes();
  restoreLegendStateFromUrl();

  installPatternImages(map);
  addLayers();
  attachInteractionHandlers();
  buildTable();
  // Restore active external layers from ?ext= in URL.  Awaited so that the
  // legend section appears together with everything else.
  await restoreExternalLayersFromUrl();

  // ── View ─────────────────────────────────────────────────────────────────
  // ?site=<Objektnummer> / ?site_fid=<fid> (links from the detail page) open
  // the map on that Standort.  Otherwise prefer ?center & ?zoom — a shared
  // link should land where the sender was looking — and fall back to the
  // whole inventory (the FeatureCollection bbox, RFC 7946 §5).
  const params = new URLSearchParams(location.search);
  const linkedSite = (params.has('site') || params.has('site_fid'))
    ? findSiteFeature(gj.features, params) : null;
  if (!linkedSite && !applyViewFromUrl()) {
    const bb = Array.isArray(gj.bbox) && gj.bbox.length === 4
      ? [[gj.bbox[0], gj.bbox[1]], [gj.bbox[2], gj.bbox[3]]]
      : featuresBbox(gj.features);
    if (bb) map.fitBounds(bb, { padding: 60, maxZoom: 14 });
  }

  // Persist view changes to the URL on every settled view (debounced via rAF
  // inside syncViewUrl).  'moveend' covers pan, zoom, fly, fit.
  map.on('moveend', syncViewUrl);
  map.on('moveend', scheduleInViewUpdate);

  renderLegend();
  updateInView();
  clearTimeout(_slowLoadTimer);
  setLoadState('ready');

  if (linkedSite) {
    selectFeature(linkedSite.id);
    zoomToFeature(linkedSite.id, { duration: 0 });
    // From here on the selection is carried by ?sel= like any other.
    try {
      const url = new URL(location.href);
      url.searchParams.delete('site');
      url.searchParams.delete('site_fid');
      history.replaceState(null, '', url);
    } catch (_) { /* file:// or sandboxed */ }
    return;
  }
  // Restore selection from URL (?sel=<idx>)
  const urlSel = parseInt(params.get('sel'));
  if (!isNaN(urlSel) && urlSel >= 0 && urlSel < gj.features.length) selectFeature(urlSel);
});

// ═══════════════════════════════════════════════════════════════════════════
// LEGEND PANEL — floating card ⇄ pill (phones: bottom sheet)
// ───────────────────────────────────────────────────────────────────────────
// The legend floats over the map's top-left corner, so the map always uses
// the full width.  Collapsed it is a pill.  State: the tier default (open on
// wide screens, closed below — map first), overridden by ?lg=1 / ?lg=0, which
// is written whenever the user's choice differs from that default.  Phones
// open it as a bottom sheet; that is never stored.
// ═══════════════════════════════════════════════════════════════════════════
const legendPanel = (() => {
  const mapEl = document.getElementById('map');
  const card = document.getElementById('legend');
  const pill = document.getElementById('legend-toggle');
  let expanded = false;

  const tierDefault = () => allowsTwoPanels();
  function urlPreference() {
    try {
      const v = new URLSearchParams(location.search).get('lg');
      return v === '1' ? true : v === '0' ? false : null;
    } catch (_) { return null; }
  }
  function syncUrl() {
    try {
      const url = new URL(location.href);
      if (expanded === tierDefault()) url.searchParams.delete('lg');
      else url.searchParams.set('lg', expanded ? '1' : '0');
      history.replaceState(null, '', url);
    } catch (_) { /* file:// or sandboxed */ }
  }
  function apply(v) {
    expanded = v;
    card.hidden = !v;
    mapEl.classList.toggle('legend-open', v);
    pill.setAttribute('aria-expanded', String(v));
  }
  // opts.persist === false: a transient change the URL should not remember.
  function open(opts = {}) {
    if (isCompactLayout()) {
      // Phones: one bottom sheet at a time (table, feature card, legend).
      if (typeof tableOpen !== 'undefined' && tableOpen) document.getElementById('tbl-toggle').click();
      clearSelection();
    }
    // Medium / compact: the docked filter panel and the legend card do not
    // fit side by side on the remaining map.
    if (!allowsTwoPanels() && window.filterPanel && window.filterPanel.isOpen()) window.filterPanel.close();
    apply(true);
    if (opts.persist !== false && !isCompactLayout()) syncUrl();
    if (opts.focus) document.getElementById('legend-close').focus();
  }
  function close(opts = {}) {
    apply(false);
    if (opts.persist !== false && !isCompactLayout()) syncUrl();
    if (opts.focus) pill.focus();
  }

  pill.addEventListener('click', () => { if (expanded) close(); else open({ focus: true }); });
  document.getElementById('legend-close').addEventListener('click', () => close({ focus: true }));

  // Initial state, set synchronously before first paint.
  const pref = urlPreference();
  apply(isCompactLayout() ? false : (pref !== null ? pref : tierDefault()));

  // Re-evaluate on rotation / window resize across a tier boundary.
  function onTierChange() {
    const p = urlPreference();
    apply(isCompactLayout() ? false : (p !== null ? p : tierDefault()));
    renderLegendChips();
    featureCard.refresh();                   // link target differs per tier
  }
  LAYOUT_MQ.compact.addEventListener('change', onTierChange);
  LAYOUT_MQ.medium.addEventListener('change', onTierChange);

  return { open, close, isOpen: () => expanded };
})();
window.legendPanel = legendPanel;

// A tap on the drawer scrim closes the filter drawer (phones).  The scrim is
// a CSS pseudo-element of #body, so the event targets #body itself.
document.getElementById('body').addEventListener('click', (e) => {
  if (e.target !== e.currentTarget || !isCompactLayout()) return;
  if (window.filterPanel) window.filterPanel.close();
});

// ── Header overflow menu (compact layout) ──────────────────────────────────
(function initMoreMenu() {
  const wrap = document.getElementById('more-wrap');
  const btn  = document.getElementById('more-toggle');
  const menu = document.getElementById('more-menu');
  if (!wrap || !btn || !menu) return;
  function setOpen(open) {
    wrap.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  }
  btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!wrap.classList.contains('open')); });
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.more-item');
    if (!item) return;
    setOpen(false);
    // Reuse the (hidden) header buttons so there is one implementation.
    if (item.dataset.action === 'share') document.getElementById('share-toggle').click();
    else if (item.dataset.action === 'print') document.getElementById('print-toggle').click();
  });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) setOpen(false); });
  window.moreMenu = { close: () => setOpen(false), isOpen: () => wrap.classList.contains('open') };
})();

// ── Escape closes the topmost transient UI ────────────────────────────────
// (An open info dialog handles Esc itself, before this listener — util.js.)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (window.moreMenu && window.moreMenu.isOpen()) { window.moreMenu.close(); return; }
  if (isCompactLayout()) {
    if (window.filterPanel && window.filterPanel.isOpen()) { window.filterPanel.close(); return; }
    if (legendPanel.isOpen()) { legendPanel.close({ focus: true }); return; }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// BASEMAP SWITCHER (markup: #basemap-switcher; logic: mapkit.js)
// ═══════════════════════════════════════════════════════════════════════════
initBasemapSwitcher(map, {
  initial: 'positron',
  sourceIds: collectOurSourceIds,
  layerIds: collectOurLayerIds,
  // Safety net after a swap: everything below is idempotent — it skips work
  // when our source / layer / image already exists.
  onStyleRestored: async () => {
    ensurePatternImages(map);
    await restoreExternalLayersOnStyle();
    addLayers();
    if (is3D) add3DLayers(map, treeExtrusionData());
    attachInteractionHandlers();
    applyMapFilters();
  },
});

// ── Coordinate display ─────────────────────────────────────────────────────
// Show both WGS84 and LV95 — the latter is the canonical Swiss reference
// surveyors and BBL staff actually work in, so showing it alongside makes
// the footer useful as a coordinate read-out instead of a curiosity.
const coordEl = document.getElementById('coordinates');
map.on('mousemove', e => {
  const { lng, lat } = e.lngLat;
  const [E, N] = wgs84ToLv95(lng, lat);        // util.js
  coordEl.textContent =
    `WGS 84  ${lat.toFixed(5)}, ${lng.toFixed(5)}   |   ` +
    `LV95  ${fmtThousand(E)} / ${fmtThousand(N)}`;
});
map.on('mouseout', () => { coordEl.textContent = 'WGS 84 | LV95 | Koordinaten: --'; });

// ═══════════════════════════════════════════════════════════════════════════
// LEGEND — rows, visibility, quick chips, info dialog
// ───────────────────────────────────────────────────────────────────────────
// Group row:   eye (all on · some on · all off) · up to three mini swatches ·
//              label · chevron.  One group is open at a time.
// Profile row: eye · swatch · label (one line) · ⓘ.  No counts anywhere.
// Rows with nothing in the map view are greyed and tagged «ausserhalb»; the
// list itself never reorders while the map moves.
// ═══════════════════════════════════════════════════════════════════════════
function renderLegend() {
  const root = document.getElementById('legend-scroll');
  if (!root) return;
  const active = document.activeElement;
  const focusKey = active && root.contains(active) ? active.dataset.focus : null;

  root.innerHTML = legendListHtml(LEGEND, legendState, { info: true, outTag: true });
  renderExternalLegend(root);

  if (focusKey) {
    const again = root.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`);
    if (again) again.focus();
  }
  markLegendInView();
  updateLegendSummary(LEGEND, legendState.hidden, _legendItemByKey);
  renderLegendChips();
}

// Grey out the rows (and groups) without features in the map view.  Only
// classes change here — the DOM order stays put while the user pans.
function markLegendInView() {
  const root = document.getElementById('legend-scroll');
  const seen = legendState.inView;
  if (!root || !seen) return;
  root.querySelectorAll('.lg-item[data-key]').forEach(row => {
    row.classList.toggle('out', !seen.has(row.dataset.key));
  });
  for (const g of LEGEND) {
    const el = root.querySelector(`.lg-group[data-gid="${CSS.escape(g.id)}"]`);
    if (el) el.classList.toggle('out', !g.items.some(it => seen.has(it.key)));
  }
}

// Phones: quick toggles for the three groups with the most features in view.
function renderLegendChips() {
  const host = document.getElementById('legend-chips');
  if (!host) return;
  if (!isCompactLayout() || !LEGEND.length) { host.innerHTML = ''; return; }
  const counts = legendState.groupCounts || {};
  const top = LEGEND
    .filter(g => g.id !== 'standort' && counts[g.id] > 0)
    .sort((a, b) => counts[b.id] - counts[a.id])
    .slice(0, 3);
  host.innerHTML = top.map(g => {
    const on = legendGroupState(g, legendState.hidden) !== 'off';
    const label = escapeHtml(g.label);
    return `<button type="button" class="lg-chip" data-gid="${escapeHtml(g.id)}" aria-pressed="${on}"
      aria-label="${on ? 'Ausblenden' : 'Einblenden'}: ${label}">${legendItemSwatch(g.items[0], false)}${label}</button>`;
  }).join('');
}

// ── Visibility changes ────────────────────────────────────────────────────
function _legendChanged() {
  applyMapFilters();
  syncLegendUrl();
  renderLegend();
}
// Group eye: anything visible → hide the whole group; all hidden → show all.
function toggleLegendGroup(gid) {
  const g = LEGEND.find(x => x.id === gid);
  if (!g) return;
  toggleLegendGroupKeys(g, legendState.hidden);
  _legendChanged();
}
// Row eye: one profile.  Showing a row in a fully hidden group shows only
// that row; hiding the last visible row leaves the group "all hidden".
function toggleLegendItem(key) {
  if (!_legendItemByKey[key]) return;
  if (legendState.hidden.has(key)) legendState.hidden.delete(key); else legendState.hidden.add(key);
  _legendChanged();
}
function showAllLegendItems() {
  legendState.hidden.clear();
  _legendChanged();
}

document.getElementById('legend-scroll').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  switch (btn.dataset.act) {
    case 'group-eye':  toggleLegendGroup(btn.dataset.gid); break;
    case 'item-eye':   toggleLegendItem(btn.dataset.key); break;
    case 'item-info':  openLegendInfo(btn.dataset.key); break;
    case 'group-open':
      legendState.open = legendState.open === btn.dataset.gid ? null : btn.dataset.gid;
      renderLegend();
      break;
  }
});
document.getElementById('legend-show-all').addEventListener('click', showAllLegendItems);
document.getElementById('legend-chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.lg-chip');
  if (chip) toggleLegendGroup(chip.dataset.gid);
});

// ── URL state: ?hide=area:6,area:7,tree:1,parcel ──────────────────────────
function syncLegendUrl() {
  try {
    const url = new URL(location.href);
    if (legendState.hidden.size) url.searchParams.set('hide', [...legendState.hidden].join(','));
    else url.searchParams.delete('hide');
    history.replaceState(null, '', url);
  } catch (_) { /* file:// or sandboxed */ }
}
// Needs the legend model.  Also reads the former filter parameters ?ent=
// (entity types to show) and ?pr= (profile codes to show): Typ and Profil
// used to be attribute filters, old links keep working as legend visibility.
function restoreLegendStateFromUrl() {
  let params;
  try { params = new URLSearchParams(location.search); } catch (_) { return; }
  const list = (name) => (params.get(name) || '').split(',').map(s => {
    try { return decodeURIComponent(s.trim()); } catch (_) { return s.trim(); }
  }).filter(Boolean);

  const hidden = new Set();
  for (let key of list('hide')) {
    // 'tree:N' and 'point:N' name the same code list; accept either spelling.
    if (!_legendItemByKey[key]) {
      const m = /^(tree|point):(\d+)$/.exec(key);
      if (m) key = (m[1] === 'tree' ? 'point' : 'tree') + ':' + m[2];
    }
    if (_legendItemByKey[key]) hidden.add(key);
  }

  const ent = list('ent'), pr = list('pr');
  if (ent.length || pr.length) {
    const showEnt = new Set(ent);
    const showCode = new Set(pr.map(Number));
    for (const g of LEGEND) {
      for (const it of g.items) {
        // A point without species is entity 'point' even with a tree profile.
        const ets = it.entity_type === 'tree' || it.entity_type === 'point' ? ['tree', 'point'] : [it.entity_type];
        if (ent.length && !ets.some(e => showEnt.has(e))) hidden.add(it.key);
        if (pr.length && it.code != null && !showCode.has(it.code)) hidden.add(it.key);
      }
    }
  }
  legendState.hidden = hidden;
  if (ent.length || pr.length) {
    try {
      const url = new URL(location.href);
      url.searchParams.delete('ent');
      url.searchParams.delete('pr');
      history.replaceState(null, '', url);
    } catch (_) { /* file:// or sandboxed */ }
    syncLegendUrl();
  }
}

// ── Info dialog (ⓘ) ───────────────────────────────────────────────────────
// What a legend row is, how it is drawn, and where its data comes from: the
// six metadata rows follow the geocat.ch profile (LAYER_METADATA, config.js).
// No counts and no care tasks here — those live on the Standort detail page.
function openLegendInfo(key) {
  const it = _legendItemByKey[key];
  const scrim = document.getElementById('info-modal');
  if (!it || !scrim) return;

  const isAv = it.entity_type === 'parcel';
  const meta = LAYER_METADATA[isAv ? 'av' : 'inventory'];
  const md = (geojsonData && geojsonData.metadata) || {};
  const cat = it.code != null ? careProfile(it.entity_type, it.code) : null;
  const prof = (it.code != null && typeof PROFILE_INFO !== 'undefined' && PROFILE_INFO[it.domain])
    ? PROFILE_INFO[it.domain][it.code] : null;

  const subtitle = [cat && cat.code ? 'Profil ' + cat.code : null, it.group.label].filter(Boolean).join(' · ');
  const desc = [
    prof && prof.description,
    it.info,
    cat && cat.quelle ? 'Profil gemäss BBL Standard Grünflächenunterhalt 2020, ' + cat.quelle + '.' : null,
  ].filter(Boolean).join(' ');

  const isPoint = it.entity_type === 'tree' || it.entity_type === 'point' || it.entity_type === 'site_location';
  const stand = fmtDate(isAv ? (md.parcels && md.parcels.fetched_at) : md.source_extracted_at);
  const link = (l) => l.url
    ? `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label)}</a>`
    : '<span class="muted">Noch nicht verfügbar</span>';
  const rows = [
    ['Quelle', escapeHtml(meta.quelle)],
    ['Format', 'GeoJSON (' + (isPoint ? 'Punkt' : 'Polygon') + ')'],
    ['Metadaten', link(meta.metadaten)],
    ['Datenbezug', link(meta.datenbezug)],
    ['Thematisches Geoportal', link(meta.geoportal)],
    ['Datenstand', stand ? escapeHtml(stand) : '–'],
  ];

  scrim.querySelector('.modal').innerHTML = `
    <div class="modal-head">
      <div class="modal-titles">
        <h2 class="modal-title" id="info-title">${escapeHtml(it.label)}</h2>
        <div class="modal-sub">${escapeHtml(subtitle)}</div>
      </div>
      <button type="button" class="modal-close" data-dialog-close aria-label="Schliessen">${icon('close', 16)}</button>
    </div>
    ${desc ? `<div class="modal-desc">${escapeHtml(desc)}</div>` : ''}
    <h3 class="modal-h3">Legende</h3>
    <div class="modal-group-label">${escapeHtml(it.group.label)}</div>
    <div class="modal-legend-row">${legendItemSwatch(it, false)}${escapeHtml(it.label)}</div>
    <h3 class="modal-h3">Informationen</h3>
    <dl class="modal-meta">${rows.map(([k, v]) => `<div class="modal-meta-row"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

  legendState.infoKey = key;
  renderLegend();
  openDialog(scrim,
    // The legend re-renders its buttons: look the opener up again on close.
    () => document.querySelector(`.lg-info[data-key="${CSS.escape(key)}"]`),
    () => { legendState.infoKey = null; renderLegend(); });
}

// ── External layers (added via header search) ─────────────────────────────
function renderExternalLegend(root) {
  const extIds = Object.keys(externalLayers);
  if (extIds.length === 0) return;

  const extGroup = document.createElement('div');
  extGroup.className = 'lg-group-external';
  const extHead = document.createElement('div');
  extHead.className = 'lg-ext-head';
  extHead.textContent = 'Externe Ebenen';
  extGroup.appendChild(extHead);

  const extItems = document.createElement('div');
  extItems.className = 'lg-ext-items';
  for (const bodId of extIds) {
    const ext = externalLayers[bodId];
    const row = document.createElement('div');
    row.className = 'lg-ext-item';
    if (!ext.visible) row.classList.add('group-hidden');
    const labelText = ext.config.label || bodId;

    const eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'lg-eye';
    eye.setAttribute('aria-pressed', String(ext.visible));
    eye.setAttribute('aria-label', (ext.visible ? 'Ausblenden: ' : 'Einblenden: ') + labelText);
    eye.innerHTML = icon(ext.visible ? 'eye' : 'eyeOff', 16);
    eye.addEventListener('click', () => {
      setExternalVisibility(bodId, !ext.visible);
      eye.innerHTML = icon(ext.visible ? 'eye' : 'eyeOff', 16);
      eye.setAttribute('aria-pressed', String(ext.visible));
      eye.setAttribute('aria-label', (ext.visible ? 'Ausblenden: ' : 'Einblenden: ') + labelText);
      row.classList.toggle('group-hidden', !ext.visible);
    });

    const lbl = document.createElement('div');
    lbl.className = 'lg-ext-label';
    lbl.innerHTML = `<div class="lg-ext-title" title="${escapeHtml(bodId)}">${escapeHtml(labelText)}</div>` +
                    (ext.config.attribution
                      ? `<div class="lg-ext-attr">${escapeHtml(ext.config.attribution)}</div>` : '');

    const opa = document.createElement('input');
    opa.type = 'range';
    opa.min = 0; opa.max = 1; opa.step = 0.05;
    opa.value = ext.opacity;
    opa.title = 'Deckkraft';
    opa.setAttribute('aria-label', 'Deckkraft: ' + labelText);
    opa.className = 'lg-ext-opacity';
    opa.addEventListener('input', () => setExternalOpacity(bodId, Number(opa.value)));

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'lg-ext-remove';
    rm.title = 'Entfernen';
    rm.setAttribute('aria-label', 'Entfernen: ' + labelText);
    rm.innerHTML = icon('close', 14);
    rm.addEventListener('click', () => removeExternalLayer(bodId));

    row.append(eye, lbl, opa, rm);
    extItems.appendChild(row);
  }
  extGroup.appendChild(extItems);
  root.appendChild(extGroup);
}
// ═══════════════════════════════════════════════════════════════════════════
// EDIT MODE — placeholder
// ───────────────────────────────────────────────────────────────────────────
// The toggle and its banner keep the place for the coming edit flow (vertex
// and attribute editing).  While it is on, selection and hover are suspended
// (the flag `editMode`), so a click does not select features.
// ═══════════════════════════════════════════════════════════════════════════
const editToggleBtn = document.getElementById('edit-toggle');
const editBanner    = document.getElementById('edit-banner');

// ── Header: Share & Print ──────────────────────────────────────────────
// The current URL is auto-synced via syncViewUrl() (center/zoom on moveend)
// + sel/ext/scope params, so `location.href` is already a deep-link to the
// view the user is sharing.  Use the system share sheet when available,
// fall back to clipboard.
(function initShareButton() {
  const btn = document.getElementById('share-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => shareUrl(location.href, 'Grünflächen Inventar'));
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
// MAP CONTEXT MENU + MEASURE  (unchanged from previous version)
// ═══════════════════════════════════════════════════════════════════════════
(() => {
  const menu = document.getElementById('map-context-menu');
  const lv95Text = document.getElementById('context-menu-lv95-text');
  const wgs84Text = document.getElementById('context-menu-wgs84-text');
  const measureBtn = document.getElementById('context-menu-measure');
  const measureText = document.getElementById('context-menu-measure-text');
  const measureDisplay = document.getElementById('measure-distance-display');
  const measureClose = document.getElementById('measure-distance-close');
  const measureTotalDist = document.getElementById('measure-total-distance');
  const measureTotalArea = document.getElementById('measure-total-area');
  const measureAreaRow = document.getElementById('measure-area-row');

  let ctxLngLat = null;

  function hideMenu() { menu.classList.remove('show'); }

  const mapEl = document.getElementById('map');

  // The menu leads with the clicked point in both notations (LV95 and
  // WGS 84), one row each; a click copies that row.  Coordinates are
  // therefore not an attribute of the feature card.
  function openContextMenu(point, lngLat) {
    ctxLngLat = lngLat;
    const c = coordTexts(lngLat);
    lv95Text.textContent = c.lv95;
    wgs84Text.textContent = c.wgs84;
    measureText.textContent = ms.active ? 'Messung löschen' : 'Distanz messen';
    measureBtn.classList.toggle('measure-active', ms.active);
    placeMenuAt(menu, mapEl, point);
  }

  map.on('contextmenu', (e) => {
    e.preventDefault();
    openContextMenu(e.point, e.lngLat);
  });
  // Touch: long-press opens the same menu (mapkit.js).
  attachLongPress(map, mapEl, openContextMenu);

  document.addEventListener('click', hideMenu);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideMenu(); if (ms.active) clearMeasure(); }
  });

  for (const textEl of [lv95Text, wgs84Text]) {
    textEl.closest('.context-menu-coord').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (await copyText(textEl.textContent)) setTimeout(hideMenu, 300);
    });
  }

  document.getElementById('context-menu-share').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!ctxLngLat) return;
    hideMenu();
    const url = new URL(location.href);
    url.searchParams.set('center', ctxLngLat.lng.toFixed(5) + ',' + ctxLngLat.lat.toFixed(5));
    url.searchParams.set('zoom', Math.round(map.getZoom()));
    shareUrl(url.toString(), 'Grünflächen Inventar – Standort');
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
        // Skip the centroid render-aid: its parent site polygon carries the
        // same name/Objekt-Nr., so listing both would duplicate the result.
        if (p.entity_type === 'site_location') continue;
        const hay = [p.name, p.site_name, p.adresse, p.site_adresse,
                     p.objektnummer, p.site_objektnummer, p.baumart,
                     p.egrid, p.parcel_number, p.municipality_name,
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

    // A newer keystroke may have aborted this search; if so, don't clobber
    // the in-flight newer results (or hide its spinner) with our stale set.
    if (sig.aborted) return;
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
      selectFeature(idx);
      input.value = item.querySelector('.search-item-title').textContent;
      clearBtn.style.display = 'flex';

    } else if (action === 'location') {
      const lat = +item.dataset.lat, lon = +item.dataset.lon, zoom = +item.dataset.zoom;
      if (searchMarker) searchMarker.remove();
      searchMarker = new maplibregl.Marker({ color: TOKENS.red })
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
