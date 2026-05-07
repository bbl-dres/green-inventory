// ═══════════════════════════════════════════════════════════════════════════
// MAP — MapLibre init, layers, legend, basemap switcher, edit mode, selection
// Depends on: config.js (LEGEND_GROUPS, ENTITY_COLORS, profilColor,
//              installAreaFillExpr, AREA_FILL_EXPR, GEOJSON_PATH, BASEMAPS)
// ═══════════════════════════════════════════════════════════════════════════

// ── Group visibility state ─────────────────────────────────────────────────
const vis = {};
for (const g of LEGEND_GROUPS) vis[g.id] = true;

// Entity types that are hidden via the legend eye toggle.
function hiddenEntityTypes() {
  const out = [];
  for (const g of LEGEND_GROUPS) {
    if (!vis[g.id] && g.entity_type) out.push(g.entity_type);
  }
  return out;
}

let tblActiveIds = null; // null = no table filter; array of feature indices
let selectedId   = null; // currently selected feature index (null = none)

// All map layers we add - kept in one place so filters/visibility/cleanup are simple.
const MAP_LAYERS = {
  polygons: ['site-fill', 'site-line', 'area-fill', 'area-line', 'canopy-fill', 'canopy-line'],
  points:   ['tree-circle', 'point-circle', 'site-location-circle', 'site-location-label'],
  selection:['selection-fill', 'selection-line', 'selection-circle'],
  hover:    ['hover-line', 'hover-circle'],
};
const ALL_LAYERS = [...MAP_LAYERS.polygons, ...MAP_LAYERS.points];

function applyMapFilters() {
  const hidden = hiddenEntityTypes();
  const idFilter = tblActiveIds === null
    ? ['literal', true]
    : (tblActiveIds.length === 0 ? ['literal', false] : ['in', ['id'], ['literal', tblActiveIds]]);

  // Per layer: combine entity_type match + table id filter.  Each layer is
  // already restricted to a single entity_type via its filter at creation,
  // so we only need to AND in the visibility + table-id constraints.
  const baseEntityFilters = {
    'site-fill':            ['==', ['get', 'entity_type'], 'site'],
    'site-line':            ['==', ['get', 'entity_type'], 'site'],
    'area-fill':            ['==', ['get', 'entity_type'], 'area'],
    'area-line':            ['==', ['get', 'entity_type'], 'area'],
    'canopy-fill':          ['==', ['get', 'entity_type'], 'tree_canopy'],
    'canopy-line':          ['==', ['get', 'entity_type'], 'tree_canopy'],
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
      map.setFilter(id, ['==', ['literal', '0'], ['literal', '1']]); // hide
    } else {
      map.setFilter(id, ['all', entFilter, idFilter]);
    }
  }
}

// ── Map init ───────────────────────────────────────────────────────────────
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  center: [7.45, 46.95],   // Bern - actual bounds applied after data loads
  zoom: 12, maxZoom: 22,
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
      keys: [
        ['baumart',                'Baumart'],
        ['baumnummer',             'Baum-Nr.'],
        ['fk_baumart',             'fk_baumart'],
        ['profil_label',           'Profil'],
        ['fk_profil',              'fk_profil'],
        ['fk_pflegedurchfuehrung', 'fk_pflegedurchf.'],
        ['fk_pflegeklasse',        'fk_pflegeklasse'],
        ['pflegeklasse',           'Pflegeklasse'],
        ['eigentuemer',            'Eigentümer'],
        ['pflegeverantwortung',    'Pflegeverantw.'],
        ['fk_pflegeverantwortung', 'fk_pflegeverantw.'],
        ['fk_zustand',             'fk_zustand'],
        ['fk_winterdienst',        'fk_winterdienst'],
        ['fk_kostenstelle',        'fk_kostenstelle'],
        ['kostenstelle_name',      'Kostenstelle'],
        ['bewaesserung',           'Bewässerung'],
        ['lauben',                 'Lauben'],
        ['ausmass',                'Ausmass'],
        ['naturobjekt',            'Naturobjekt'],
        ['kontrolle',              'Kontrolle'],
        ['reinigung',              'Reinigung'],
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
        const v = fmt ? fmt(p[k]) : p[k];
        return `<div class="pu-row"><span>${lbl}</span><strong>${v}</strong></div>`;
      });
    if (rows.length === 0) continue;
    body += `<div class="pu-section">${grp.title}</div>` + rows.join('');
  }

  return `
    <div class="pu-header">
      <div class="pu-swatch" style="background:${swatch}"></div>
      <div class="pu-titles">
        <div class="pu-type">${p.feature_type || p.entity_type || '–'}</div>
        <div class="pu-sub">${p.subtype || ''}</div>
      </div>
    </div>
    <div class="pu-body">${body}</div>
  `;
}

// ── Selection helpers ──────────────────────────────────────────────────────
function applySelectedFilter() {
  const f = selectedId !== null ? ['==', ['id'], selectedId] : ['==', ['literal', '0'], ['literal', '1']];
  for (const id of MAP_LAYERS.selection) {
    if (map.getLayer(id)) map.setFilter(id, f);
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

function selectFeature(idx, lngLat) {
  selectedId = Number(idx);
  applySelectedFilter();
  updateSelectionUrl();
  _suppressPopupClose = true;
  selPopup.setLngLat(lngLat).setHTML(popupHTML(geojsonData.features[idx].properties)).addTo(map);
  _suppressPopupClose = false;

  if (!tableOpen) document.getElementById('tbl-toggle').click();

  let sorted = getSortedRows(getFilteredRows());
  if (sorted.findIndex(r => r._idx === idx) === -1) {
    const si = document.getElementById('tbl-search');
    const sx = document.getElementById('tbl-search-x');
    if (si && si.value) { si.value = ''; tblSearch = ''; if (sx) sx.style.display = 'none'; }
    for (const key of Object.keys(tblFilterAttrs)) tblFilterAttrs[key].clear();
    onFilterChange();
    sorted = getSortedRows(getFilteredRows());
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
  map.addSource('features', { type: 'geojson', data: geojsonData });

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
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 16, 1.4, 20, 2.0],
      'line-dasharray': [3, 2],
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

  // Tree-canopy circles.
  map.addLayer({
    id: 'canopy-fill', type: 'fill', source: 'features',
    filter: ['==', ['get', 'entity_type'], 'tree_canopy'],
    paint: { 'fill-color': ENTITY_COLORS.tree_canopy.fill, 'fill-opacity': 0.30 },
  });
  map.addLayer({
    id: 'canopy-line', type: 'line', source: 'features',
    filter: ['==', ['get', 'entity_type'], 'tree_canopy'],
    paint: { 'line-color': ENTITY_COLORS.tree_canopy.stroke, 'line-width': 0.8 },
  });

  // Tree points.
  map.addLayer({
    id: 'tree-circle', type: 'circle', source: 'features',
    filter: ['==', ['get', 'entity_type'], 'tree'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 16, 3.5, 20, 6],
      'circle-color': ENTITY_COLORS.tree.fill,
      'circle-stroke-color': ENTITY_COLORS.tree.stroke,
      'circle-stroke-width': 0.8,
      'circle-opacity': 0.9,
    },
  });

  // Other points.
  map.addLayer({
    id: 'point-circle', type: 'circle', source: 'features',
    filter: ['==', ['get', 'entity_type'], 'point'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 1.2, 16, 3, 20, 5],
      'circle-color': ENTITY_COLORS.point.fill,
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

  // Pre-populate the dynamic Pflegeflächen legend items (top profiles by area count).
  const areaCounts = (gj.metadata && gj.metadata.fk_profil_area_counts) || {};
  const sortedProfiles = Object.entries(areaCounts).sort((a, b) => b[1] - a[1]);
  const areaGroup = LEGEND_GROUPS.find(g => g.id === 'area');
  if (areaGroup) {
    areaGroup.items = sortedProfiles.slice(0, 12).map(([p, n]) => ({
      label: `Profil ${p} · ${n}`,
      fill: profilColor(Number(p)),
    }));
    if (sortedProfiles.length > 12) {
      const rest = sortedProfiles.slice(12).reduce((s, [, n]) => s + n, 0);
      areaGroup.items.push({ label: `… ${sortedProfiles.length - 12} weitere Profile · ${rest}`, fill: '#bbbbbb' });
    }
  }

  addLayers();
  buildTable();

  // ── Hover ──────────────────────────────────────────────────────────────
  let hovId = null;
  function setHover(id) {
    hovId = id;
    const filt = id != null ? ['==', ['id'], id] : ['==', ['id'], -1];
    if (map.getLayer('hover-line')) map.setFilter('hover-line', filt);
    if (map.getLayer('hover-circle')) map.setFilter('hover-circle', filt);
  }

  for (const lyr of INTERACTIVE_LAYERS) {
    map.on('mousemove', lyr, (e) => {
      if (editMode) return;
      if (!e.features.length) return;
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features[0];
      if (hovId !== f.id) setHover(f.id);
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
      // Use the actual click point for popup placement when feature is large.
      selectFeature(fid, e.lngLat);
    });
  }
  // Click on empty map → clear
  map.on('click', (e) => {
    if (editMode || measureActive) return;
    const hits = map.queryRenderedFeatures(e.point, { layers: INTERACTIVE_LAYERS });
    if (!hits.length) clearSelection();
  });

  // ── Fit to data ────────────────────────────────────────────────────────
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  function scanCoords(c) {
    if (typeof c[0] === 'number') {
      if (c[0] < minLon) minLon = c[0]; if (c[0] > maxLon) maxLon = c[0];
      if (c[1] < minLat) minLat = c[1]; if (c[1] > maxLat) maxLat = c[1];
    } else { c.forEach(scanCoords); }
  }
  gj.features.forEach(f => { if (f.geometry) scanCoords(f.geometry.coordinates); });
  if (isFinite(minLon)) map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 60, maxZoom: 14 });

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

  closeBtn.addEventListener('click', () => {
    sidebar.classList.add('collapsed');
    legendBtn.style.display = 'flex';
    setTimeout(() => map.resize(), 280);
  });
  legendBtn.addEventListener('click', () => {
    sidebar.classList.remove('collapsed');
    legendBtn.style.display = 'none';
    setTimeout(() => map.resize(), 280);
  });
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
      map.setStyle(bm.url);
      map.once('idle', addLayers);
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
const coordEl = document.getElementById('coordinates');
map.on('mousemove', e => {
  const { lng, lat } = e.lngLat;
  coordEl.textContent = `WGS 84 | ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
});
map.on('mouseout', () => { coordEl.textContent = 'WGS 84 | Koordinaten: --'; });

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
  const entityCounts = {};
  for (const f of features) {
    const e = f.properties.entity_type;
    entityCounts[e] = (entityCounts[e] || 0) + 1;
  }

  const el = document.getElementById('legend-scroll');
  el.innerHTML = '';

  for (const grp of LEGEND_GROUPS) {
    const cnt = grp.entity_type ? (entityCounts[grp.entity_type] || 0) : 0;
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
}

// ═══════════════════════════════════════════════════════════════════════════
// EDIT MODE  — drag to reposition entire GeoJSON layer
// ═══════════════════════════════════════════════════════════════════════════
const editToggleBtn = document.getElementById('edit-toggle');
const editBanner    = document.getElementById('edit-banner');
const saveBanner    = document.getElementById('save-banner');
const offsetLabel   = document.getElementById('offset-label');

let dragStart = null;
let pendingDelta = { lon: 0, lat: 0 };

editToggleBtn.addEventListener('click', () => {
  editMode = !editMode;
  editToggleBtn.classList.toggle('active', editMode);
  editBanner.classList.toggle('visible', editMode);
  saveBanner.classList.toggle('visible', editMode);
  document.getElementById('map').classList.toggle('edit-active', editMode);
  map.getCanvas().style.cursor = editMode ? 'grab' : '';
  if (!editMode) { pendingDelta = { lon: 0, lat: 0 }; }
});

document.getElementById('cancel-offset').addEventListener('click', () => {
  applyDelta(-pendingDelta.lon, -pendingDelta.lat);
  pendingDelta = { lon: 0, lat: 0 };
  editMode = false;
  editToggleBtn.classList.remove('active');
  editBanner.classList.remove('visible');
  saveBanner.classList.remove('visible');
  document.getElementById('map').classList.remove('edit-active');
  map.getCanvas().style.cursor = '';
});

document.getElementById('save-offset').addEventListener('click', async () => {
  if (!geojsonData) return;
  if (!geojsonData.metadata) geojsonData.metadata = {};
  const prev = geojsonData.metadata.offset_m || [0, 0];
  const dLon = prev[0] + pendingDelta.lon * 73500;
  const dLat = prev[1] + pendingDelta.lat * 111320;
  geojsonData.metadata.offset_m = [Math.round(dLon * 10) / 10, Math.round(dLat * 10) / 10];

  applyDeltaPermanent(pendingDelta.lon, pendingDelta.lat);
  pendingDelta = { lon: 0, lat: 0 };

  const blob = new Blob([JSON.stringify(geojsonData, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'data.geojson';
  a.click();
  URL.revokeObjectURL(url);

  editMode = false;
  editToggleBtn.classList.remove('active');
  editBanner.classList.remove('visible');
  saveBanner.classList.remove('visible');
  document.getElementById('map').classList.remove('edit-active');
  map.getCanvas().style.cursor = '';
});

map.on('mousedown', (e) => {
  if (!editMode) return;
  dragStart = { lng: e.lngLat.lng, lat: e.lngLat.lat };
  map.getCanvas().style.cursor = 'grabbing';
  map.dragPan.disable();
  e.preventDefault();
});

map.on('mousemove', (e) => {
  if (!editMode || !dragStart) return;
  const dLon = e.lngLat.lng - dragStart.lng;
  const dLat = e.lngLat.lat - dragStart.lat;
  applyDelta(dLon, dLat);
  pendingDelta.lon += dLon;
  pendingDelta.lat += dLat;
  dragStart = { lng: e.lngLat.lng, lat: e.lngLat.lat };

  const mEast  = Math.round(pendingDelta.lon * 73500);
  const mNorth = Math.round(pendingDelta.lat * 111320);
  offsetLabel.textContent = `Verschiebung: ${mEast > 0 ? '+' : ''}${mEast} m O, ${mNorth > 0 ? '+' : ''}${mNorth} m N`;
});

map.on('mouseup', () => {
  if (!editMode || !dragStart) return;
  dragStart = null;
  map.getCanvas().style.cursor = 'grab';
  map.dragPan.enable();
});

function shiftCoord(coord, dLon, dLat) {
  if (typeof coord[0] === 'number') return [coord[0] + dLon, coord[1] + dLat];
  return coord.map(c => shiftCoord(c, dLon, dLat));
}

function applyDelta(dLon, dLat) {
  if (!geojsonData) return;
  for (const f of geojsonData.features) {
    if (f.geometry) f.geometry.coordinates = shiftCoord(f.geometry.coordinates, dLon, dLat);
  }
  map.getSource('features').setData(geojsonData);
}

function applyDeltaPermanent(dLon, dLat) {
  // Already applied incrementally during drag — nothing extra to do.
}

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
    coordsText.textContent = ctxLngLat.lat.toFixed(5) + ', ' + ctxLngLat.lng.toFixed(5);
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

    // Local feature search across the most identifying fields.
    const localMatches = [];
    if (geojsonData) {
      const q = term.toLowerCase();
      for (const f of geojsonData.features) {
        const p = f.properties;
        const hay = [p.name, p.site_name, p.adresse, p.site_adresse,
                     p.objektnummer, p.site_objektnummer, p.baumart,
                     p.feature_type, p.subtype, p.entity_type]
          .filter(Boolean).join(' ').toLowerCase();
        if (hay.includes(q)) localMatches.push(f);
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
      local.forEach((f) => {
        const p = f.properties;
        const title = p.name || p.site_name || p.baumart || p.feature_type || '–';
        const sub = [p.subtype, p.adresse || p.site_adresse, p.entity_type].filter(Boolean).join(' · ');
        html += `<div class="search-item" data-action="local" data-idx="${geojsonData.features.indexOf(f)}">
          <div class="search-item-title">${title}</div>
          ${sub ? `<div class="search-item-subtitle">${sub}</div>` : ''}
        </div>`;
      });
    }

    if (locations.length) {
      html += '<div class="search-section-header">Orte</div>';
      locations.forEach(r => {
        const a = r.attrs;
        html += `<div class="search-item" data-action="location" data-lat="${a.lat}" data-lon="${a.lon}" data-zoom="${a.zoomlevel || 14}">
          <div class="search-item-title">${a.label}</div>
        </div>`;
      });
    }

    if (layers.length) {
      html += '<div class="search-section-header">Karten</div>';
      layers.forEach(r => {
        const a = r.attrs;
        html += `<div class="search-item" data-action="layer" data-layer="${a.layer || ''}">
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
      showToast('Kartenebene: ' + (item.dataset.layer || '–'));
    }
  }
})();
