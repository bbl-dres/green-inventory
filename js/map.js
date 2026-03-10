// ═══════════════════════════════════════════════════════════════════════════
// MAP — MapLibre init, layers, legend, basemap switcher, edit mode, selection
// Depends on: config.js (LEGEND_GROUPS, fillExpr, lineColorExpr, lineWidthExpr,
//              GEOJSON_PATH, BASEMAPS)
// Cross-uses: buildTable, renderTable, getFilteredRows, getSortedRows, tblPage,
//             tblPageSize (table.js — safe because only called in event handlers)
// ═══════════════════════════════════════════════════════════════════════════

// ── Group visibility state ─────────────────────────────────────────────────
const vis = {};
for (const g of LEGEND_GROUPS) vis[g.id] = true;

function buildLegendFilter() {
  const onCats = LEGEND_GROUPS
    .filter(g => vis[g.id] && g.category)
    .map(g => g.category);
  if (onCats.length === 0) return ['==', '1', '0'];
  return ['in', ['get', 'category'], ['literal', onCats]];
}
// Keep alias for initial addLayers() call
function buildMapFilter() { return buildLegendFilter(); }

let tblActiveIds = null; // null = no table filter; array of feature indices
let selectedId   = null; // currently selected feature index (null = none)

function applyMapFilters() {
  if (!map.getLayer('features-fill')) return;
  const legendF = buildLegendFilter();
  let combined;
  if (tblActiveIds === null) {
    combined = legendF;
  } else if (tblActiveIds.length === 0) {
    combined = ['==', '1', '0'];
  } else {
    combined = ['all', legendF, ['in', ['id'], ['literal', tblActiveIds]]];
  }
  map.setFilter('features-fill', combined);
  map.setFilter('features-line', combined);
}

// ── Map init ───────────────────────────────────────────────────────────────
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  center: [7.4742, 46.9751],
  zoom: 16, maxZoom: 22,
});
map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

// ── GeoJSON offset (used by edit mode) ────────────────────────────────────
let offsetDeltaLon = 0, offsetDeltaLat = 0;
let editMode = false;
let editStartLngLat = null;
let originalCenter = null;
let geojsonData = null;

// ── Popup instance ─────────────────────────────────────────────────────────
const selPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '260px' });
// MapLibre calls remove() inside addTo() when the popup is already on the map,
// which fires 'close' synchronously. Guard against that with this flag so only
// genuine user-initiated closes (clicking the X) trigger deselection.
let _suppressPopupClose = false;
selPopup.on('close', () => {
  if (_suppressPopupClose || selectedId === null) return;
  selectedId = null;
  applySelectedFilter();
  updateSelectionUrl();
  renderTable();
});

// ── Popup HTML helper ──────────────────────────────────────────────────────
function popupHTML(p) {
  return `
    <div class="pu-type">${p.feature_type || p.category}</div>
    <div class="pu-sub">${p.subtype}</div>
    <div class="pu-row"><span>Fläche</span><strong>${p.area_m2 != null ? (+p.area_m2).toFixed(1) + ' m²' : '–'}</strong></div>
    <div class="pu-row"><span>Kategorie</span><strong>${p.category}</strong></div>
    <div class="pu-row"><span>Quelle</span><strong>${p.source}</strong></div>
  `;
}

// ── Selection helpers ──────────────────────────────────────────────────────
function applySelectedFilter() {
  if (!map.getLayer('features-selected-fill')) return;
  const f = selectedId !== null ? ['==', ['id'], selectedId] : ['==', '1', '0'];
  map.setFilter('features-selected-fill', f);
  map.setFilter('features-selected-line', f);
}

function updateSelectionUrl() {
  try {
    const url = new URL(location.href);
    if (selectedId !== null) url.searchParams.set('sel', selectedId);
    else url.searchParams.delete('sel');
    history.replaceState(null, '', url);
  } catch (_) { /* file:// protocol or sandboxed iframe — skip silently */ }
}

function selectFeature(idx, lngLat) {
  selectedId = Number(idx); // coerce: MapLibre may return f.id as string
  applySelectedFilter();
  updateSelectionUrl();
  _suppressPopupClose = true;
  selPopup.setLngLat(lngLat).setHTML(popupHTML(geojsonData.features[idx].properties)).addTo(map);
  _suppressPopupClose = false;
  // Navigate table to the selected row's page
  const sorted = getSortedRows(getFilteredRows());
  const rowIdx = sorted.findIndex(r => r._idx === idx);
  if (rowIdx !== -1) tblPage = Math.floor(rowIdx / tblPageSize);
  renderTable();
  setTimeout(() => {
    document.querySelector('#tbl tbody tr.selected')?.scrollIntoView({ block: 'nearest' });
  }, 0);
}

function clearSelection() {
  if (selectedId === null) return;
  selectedId = null;
  applySelectedFilter();
  updateSelectionUrl();
  selPopup.remove(); // close event fires but guard above short-circuits it
  renderTable();
}

// ── Add GeoJSON source + layers (called on initial load and after style change) ─
function addLayers() {
  if (!geojsonData || map.getSource('features')) return;
  map.addSource('features', {
    type: 'geojson', data: geojsonData,
  });
  map.addLayer({
    id: 'features-fill', type: 'fill', source: 'features',
    paint: {
      'fill-color': fillExpr(),
      'fill-opacity': ['match', ['get', 'category'],
        'site_boundary', 0, 'building', 0.65, 0.78],
    },
  });
  map.addLayer({
    id: 'features-line', type: 'line', source: 'features',
    paint: { 'line-color': lineColorExpr(), 'line-width': lineWidthExpr() },
  });
  map.addLayer({
    id: 'features-hover', type: 'line', source: 'features',
    filter: ['==', ['id'], -1],
    paint: { 'line-color': '#005ea8', 'line-width': 2.5 },
  });
  map.addLayer({
    id: 'features-selected-fill', type: 'fill', source: 'features',
    filter: ['==', '1', '0'],
    paint: { 'fill-color': '#005ea8', 'fill-opacity': 0.22 },
  });
  map.addLayer({
    id: 'features-selected-line', type: 'line', source: 'features',
    filter: ['==', '1', '0'],
    paint: { 'line-color': '#005ea8', 'line-width': 3 },
  });
  applySelectedFilter(); // restore if selection persists across basemap change
  const f = buildMapFilter();
  map.setFilter('features-fill', f);
  map.setFilter('features-line', f);
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
  // Ensure every feature has a top-level integer id matching its array index.
  gj.features.forEach((f, i) => { if (f.id == null) f.id = i; });
  geojsonData = gj;

  addLayers();
  buildTable();

  // ── Hover ──────────────────────────────────────────────────────────────
  let hovId = null;

  map.on('mousemove', 'features-fill', (e) => {
    if (editMode) return;
    if (!e.features.length) return;
    map.getCanvas().style.cursor = 'pointer';
    const f = e.features[0];
    if (hovId !== f.id) {
      hovId = f.id;
      map.setFilter('features-hover', ['==', ['id'], hovId]);
    }
  });
  map.on('mouseleave', 'features-fill', () => {
    if (editMode) return;
    map.getCanvas().style.cursor = '';
    map.setFilter('features-hover', ['==', ['id'], -1]);
    hovId = null;
  });

  // ── Click: select / deselect feature ───────────────────────────────────
  map.on('click', 'features-fill', (e) => {
    if (editMode) return;
    const fid = Number(e.features[0].id);
    if (fid === selectedId) { clearSelection(); return; }
    selectFeature(fid, e.lngLat);
  });
  // Click on empty map area → clear selection
  map.on('click', (e) => {
    if (editMode) return;
    const hits = map.queryRenderedFeatures(e.point, { layers: ['features-fill'] });
    if (!hits.length) clearSelection();
  });

  // ── Fit to actual feature bounds ───────────────────────────────────────
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  function scanCoords(c) {
    if (typeof c[0] === 'number') {
      if (c[0] < minLon) minLon = c[0]; if (c[0] > maxLon) maxLon = c[0];
      if (c[1] < minLat) minLat = c[1]; if (c[1] > maxLat) maxLat = c[1];
    } else { c.forEach(scanCoords); }
  }
  gj.features.forEach(f => scanCoords(f.geometry.coordinates));
  map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 60, maxZoom: 19 });

  // ── Build legend ───────────────────────────────────────────────────────
  buildLegend(gj.features);

  // ── Restore selection from URL (?sel=<idx>) ────────────────────────────
  const urlSel = parseInt(new URLSearchParams(location.search).get('sel'));
  if (!isNaN(urlSel) && urlSel >= 0 && urlSel < gj.features.length) {
    const feat = gj.features[urlSel];
    const bbox = geomBbox(feat.geometry);
    const center = [(bbox[0][0] + bbox[1][0]) / 2, (bbox[0][1] + bbox[1][1]) / 2];
    selectFeature(urlSel, center);
  }
});

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
  const catCounts = {};
  for (const f of features) {
    const c = f.properties.category;
    catCounts[c] = (catCounts[c] || 0) + 1;
  }

  const el = document.getElementById('legend-scroll');
  el.innerHTML = '';

  for (const grp of LEGEND_GROUPS) {
    const hasData = grp.category && (catCounts[grp.category] || 0) > 0;

    const groupEl = document.createElement('div');
    groupEl.className = 'lg-group';
    groupEl.dataset.gid = grp.id;

    // Group header row
    const head = document.createElement('div');
    head.className = 'lg-group-head';

    const eyeBtn = document.createElement('button');
    eyeBtn.className = 'eye-btn';
    eyeBtn.title = 'Ebene ein-/ausblenden';
    eyeBtn.innerHTML = EYE_OPEN;
    eyeBtn.addEventListener('click', () => {
      if (!grp.category) return; // no map data, nothing to toggle
      vis[grp.id] = !vis[grp.id];
      eyeBtn.innerHTML = vis[grp.id] ? EYE_OPEN : EYE_CLOSED;
      eyeBtn.classList.toggle('hidden-eye', !vis[grp.id]);
      groupEl.classList.toggle('group-hidden', !vis[grp.id]);
      applyMapFilters();
    });
    if (!grp.category) {
      eyeBtn.style.opacity = '0.25';
      eyeBtn.style.cursor = 'default';
    }

    const title = document.createElement('span');
    title.className = 'lg-group-title';
    title.textContent = grp.label;
    if (hasData) {
      const cnt = document.createElement('span');
      cnt.style.cssText = 'font-size:10px;color:var(--grey-400);margin-left:4px;font-weight:400;text-transform:none;letter-spacing:0';
      cnt.textContent = catCounts[grp.category];
      title.appendChild(cnt);
    }

    head.append(eyeBtn, title);
    groupEl.appendChild(head);

    // Items
    const itemsEl = document.createElement('div');
    itemsEl.className = 'lg-items';

    for (const item of grp.items) {
      const row = document.createElement('div');
      row.className = 'lg-item' + (hasData ? '' : ' empty');

      const sw = document.createElement('span');
      sw.className = 'lg-swatch' + (item.swatchClass ? ' ' + item.swatchClass : '');
      if (item.fill && !item.swatchClass?.includes('sw-outline') &&
          !item.swatchClass?.includes('sw-triangle')) {
        sw.style.background = item.fill;
      }

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
  map.getCanvas().style.cursor = '';
});

document.getElementById('save-offset').addEventListener('click', async () => {
  if (!geojsonData) return;
  const dLon = (geojsonData.metadata.offset_m?.[0] || 0) + pendingDelta.lon * 73500;
  const dLat = (geojsonData.metadata.offset_m?.[1] || 0) + pendingDelta.lat * 111320;
  geojsonData.metadata.offset_m = [Math.round(dLon * 10) / 10, Math.round(dLat * 10) / 10];
  geojsonData.metadata.total_features = geojsonData.features.length;

  applyDeltaPermanent(pendingDelta.lon, pendingDelta.lat);
  pendingDelta = { lon: 0, lat: 0 };

  const blob = new Blob([JSON.stringify(geojsonData, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = '[838147959] 1602.GR_Mühlestrasse 2+4+6+8Grünflächenpflege.geojson';
  a.click();
  URL.revokeObjectURL(url);

  editMode = false;
  editToggleBtn.classList.remove('active');
  editBanner.classList.remove('visible');
  saveBanner.classList.remove('visible');
  map.getCanvas().style.cursor = '';
});

// Drag handlers
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
    f.geometry.coordinates = shiftCoord(f.geometry.coordinates, dLon, dLat);
  }
  map.getSource('features').setData(geojsonData);
}

function applyDeltaPermanent(dLon, dLat) {
  // Already applied incrementally during drag — nothing extra to do.
}
