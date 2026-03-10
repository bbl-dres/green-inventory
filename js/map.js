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
  const fill = SUBTYPE_FILL[p.subtype] || CAT_FILL[p.category] || '#aaa';
  return `
    <div class="pu-header">
      <div class="pu-swatch" style="background:${fill}"></div>
      <div class="pu-titles">
        <div class="pu-type">${p.feature_type || p.category}</div>
        <div class="pu-sub">${p.subtype || '–'}</div>
      </div>
    </div>
    <div class="pu-body">
      <div class="pu-row"><span>Fläche</span><strong>${p.area_m2 != null ? fmtNum(p.area_m2, 1) + ' m²' : '–'}</strong></div>
      <div class="pu-row"><span>Kategorie</span><strong>${p.category || '–'}</strong></div>
      <div class="pu-row"><span>Quelle</span><strong>${p.source || '–'}</strong></div>
    </div>
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

  // Open table panel if collapsed
  if (!tableOpen) document.getElementById('tbl-toggle').click();

  // If the row is hidden by filters/search, clear them so it becomes visible
  let sorted = getSortedRows(getFilteredRows());
  if (sorted.findIndex(r => r._idx === idx) === -1) {
    // Clear text search
    const si = document.getElementById('tbl-search');
    const sx = document.getElementById('tbl-search-x');
    if (si && si.value) { si.value = ''; tblSearch = ''; if (sx) sx.style.display = 'none'; }
    // Clear column filters
    for (const key of Object.keys(tblFilterAttrs)) tblFilterAttrs[key].clear();
    onFilterChange();
    sorted = getSortedRows(getFilteredRows());
  }

  // Navigate table to the selected row's page
  const rowIdx = sorted.findIndex(r => r._idx === idx);
  if (rowIdx !== -1) tblPage = Math.floor(rowIdx / tblPageSize);
  renderTable();

  // Scroll the row into view
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
    if (editMode || measureActive) return;
    const fid = Number(e.features[0].id);
    if (fid === selectedId) { clearSelection(); return; }
    selectFeature(fid, e.lngLat);
  });
  // Click on empty map area → clear selection
  map.on('click', (e) => {
    if (editMode || measureActive) return;
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
  document.getElementById('map').classList.remove('edit-active');
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

let measureActive = false; // shared flag — checked by feature click handlers

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
// MAP CONTEXT MENU
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

  // ── Show / hide ──────────────────────────────────────────────────────
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

  // ── Copy coordinates ─────────────────────────────────────────────────
  coordsItem.addEventListener('click', (e) => {
    e.stopPropagation();
    const txt = coordsText.textContent;
    navigator.clipboard.writeText(txt).then(() => {
      coordsItem.classList.add('copied');
      showToast('Koordinaten kopiert', 'success');
      setTimeout(hideMenu, 300);
    }).catch(() => showToast('Kopieren fehlgeschlagen', 'error'));
  });

  // ── Share ────────────────────────────────────────────────────────────
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

  // ── Print ────────────────────────────────────────────────────────────
  document.getElementById('context-menu-print').addEventListener('click', () => {
    hideMenu(); window.print();
  });

  // ── Report problem ───────────────────────────────────────────────────
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

  // ═════════════════════════════════════════════════════════════════════
  // MEASURE DISTANCE (Google Maps style)
  // ═════════════════════════════════════════════════════════════════════
  const ms = {
    active: false, points: [], markers: [], labels: [],
    srcId: 'measure-line-src', layerId: 'measure-line', closed: false
  };

  // Haversine
  function hav(lat1, lon1, lat2, lon2) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Shoelace area (m²)
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

  // Map click — add measure points (or normal behavior)
  map.on('click', (e) => {
    hideMenu();
    if (!ms.active) return;
    // Close polygon if near first point
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

    // 1. Local feature search
    const localMatches = [];
    if (geojsonData) {
      const q = term.toLowerCase();
      for (const f of geojsonData.features) {
        const p = f.properties;
        const hay = [p.name, p.feature_type, p.subtype, p.category, p.source]
          .filter(Boolean).join(' ').toLowerCase();
        if (hay.includes(q)) localMatches.push(f);
        if (localMatches.length >= 8) break;
      }
    }

    // 2. Swisstopo location search
    let locations = [];
    try {
      const url = 'https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=locations&limit=5&sr=4326&searchText=' + encodeURIComponent(term);
      const res = await fetch(url, { signal: sig });
      const data = await res.json();
      locations = data.results || [];
    } catch (e) { if (e.name !== 'AbortError') console.warn('Search error:', e); }

    // 3. Swisstopo layer search (placeholder display only)
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
      local.forEach((f, i) => {
        const p = f.properties;
        const title = p.name || p.feature_type || '–';
        const sub = [p.subtype, p.category].filter(Boolean).join(' · ');
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

    // Event delegation
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
      map.fitBounds(bbox, { padding: 80, maxZoom: 20 });
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
      // Placeholder — just show toast
      showToast('Kartenebene: ' + (item.dataset.layer || '–'));
    }
  }

  // geomBbox is defined in table.js — use it for local feature bounding
  // (It's available globally since table.js is a plain script)
})();
