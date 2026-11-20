// ═══════════════════════════════════════════════════════════════════════════
// TABLE — widget, attribute filters, sorting, pagination, export, dropdowns
// Depends on: config.js (TABLE_COLS, TABLE_COL_DEFAULTS*, FILTER_COLS_DEFAULT),
//             util.js (escapeHtml, featuresBbox, tableExportAoa, downloads),
//             map.js (selectedId, geojsonData, map, applyMapFilters, setHover,
//              selectFeature, clearSelection, tblActiveIds)
// ═══════════════════════════════════════════════════════════════════════════

let tableRows = [];
let tblSortCol = 'entity_type', tblSortDir = 1;
let tblSearch = '';
let tblFilterAttrs = {};          // { field: Set<string> }

// ── Tab scope ────────────────────────────────────────────────────────
// Three tab views over the data:
//   'sites'   → entity_type === 'site'           (Standorte)
//   'parcels' → entity_type === 'parcel'         (Grundstücke, Amtliche Vermessung)
//   'green'   → entity_type in {area, tree, point}  (Pflegeelemente)
// site_location features (centroid markers) are hidden from ALL tabs —
// they're a map-only affordance, not data.
let tblScope = 'sites';
const SCOPE_HIDDEN_FROM_TABLE = new Set(['site_location']);
const TABLE_SCOPES = ['sites', 'parcels', 'green'];

function inScope(row, scope) {
  const e = row.entity_type;
  if (SCOPE_HIDDEN_FROM_TABLE.has(e)) return false;
  if (scope === 'sites') return e === 'site';
  if (scope === 'parcels') return e === 'parcel';
  return e !== 'site' && e !== 'parcel';   // 'green' = the maintenance elements
}

// Per-scope column visibility memory.  null = use TABLE_COL_DEFAULTS.
// Populated lazily: the first time a scope's visibility is touched (column
// toggle or scope-leave), the current state is snapshotted into here so
// subsequent re-entries restore the user's preferences for that tab.
const _scopeColMemory = { sites: null, parcels: null, green: null };

function applyColStateForScope(scope) {
  const saved = _scopeColMemory[scope];
  // Phones get a shorter, name-first default set (see config.js).
  const defaults = isCompactLayout() ? TABLE_COL_DEFAULTS_COMPACT : TABLE_COL_DEFAULTS;
  const keys = saved || (defaults && defaults[scope]) || [];
  const visible = new Set(keys);
  TABLE_COLS.forEach(c => { c.visible = visible.has(c.key); });
}

function rememberColStateForScope(scope) {
  _scopeColMemory[scope] = TABLE_COLS.filter(c => c.visible).map(c => c.key);
}

// URL-param short keys for filter columns.  (The former ?ent= and ?pr= —
// Typ and Profil — are legend visibility now; map.js translates old links.)
const FILTER_URL_KEYS = {
  site_name: 'sn', site_lose: 'lo', pflegeklasse: 'pk', eigentuemer: 'eg',
  pflegeverantwortung: 'pv', municipality_name: 'gm', baumart: 'ba',
};
const FILTER_URL_KEYS_REV = Object.fromEntries(Object.entries(FILTER_URL_KEYS).map(([k, v]) => [v, k]));
let tblPage = 0, tblPageSize = 100;

function buildTable() {
  if (!geojsonData) return;
  // tableRows = FULL set (every feature including site_location).  Tab
  // scoping is applied later, on a per-render basis, so the map's
  // tblActiveIds stays comprehensive (the tab is a *table* filter, not
  // a global one).
  tableRows = geojsonData.features.map((f, i) => ({ ...f.properties, _idx: i }));
  restoreScopeFromUrl();
  restoreFiltersFromUrl();
  applyColStateForScope(tblScope);   // initial column visibility for active tab
  updateTabUI();
  updateTabCounts();
  buildColDropdown();
  buildFilterSidebar();
  updateFilterBadge();
  renderFilterPills();
  renderTable();
}

// Apply the search + sidebar filters to a row array.
function _applyFilters(rows) {
  if (tblSearch) {
    const q = tblSearch.toLowerCase();
    rows = rows.filter(r =>
      TABLE_COLS.some(c => String(r[c.key] ?? '').toLowerCase().includes(q))
    );
  }
  // AND between columns, OR within column
  for (const [field, vals] of Object.entries(tblFilterAttrs)) {
    if (vals.size) rows = rows.filter(r => vals.has(String(r[field] ?? '')));
  }
  return rows;
}

// Every row that passes the search + sidebar filters, over ALL entity types
// (the tab is a table view, not a filter).  Computed once per filter state:
// a render caused by sorting, paging or a selection reuses it.
let _filterCache = { sig: null, rows: [] };
function getFilteredRows() {
  const sig = tblSearch + '\u0000' +
    JSON.stringify(Object.entries(tblFilterAttrs).map(([k, v]) => [k, [...v]]));
  if (_filterCache.sig !== sig || _filterCache.all !== tableRows) {
    _filterCache = { sig, all: tableRows, rows: _applyFilters(tableRows) };
  }
  return _filterCache.rows;
}
// The rows of the active tab, filtered — what the table shows.
function getScopedRows() {
  return getFilteredRows().filter(r => inScope(r, tblScope));
}
// The rows an export writes: never the Standort markers (`site_location`),
// which repeat every Standort as a point.
function exportableRows(rows) {
  return rows.filter(r => !SCOPE_HIDDEN_FROM_TABLE.has(r.entity_type));
}

// German collation, digits compared as numbers («Nr. 9» before «Nr. 10»).
const _tblCollator = new Intl.Collator('de', { numeric: true });
function getSortedRows(rows) {
  return [...rows].sort((a, b) => {
    const av = a[tblSortCol], bv = b[tblSortCol];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * tblSortDir;
    return _tblCollator.compare(String(av), String(bv)) * tblSortDir;
  });
}

// What the map may draw follows the filter state, not the table view: pushed
// to the map only when the filtered set actually changed.
let _mapFilterRows = null;
function syncMapToFilters() {
  const filtered = getFilteredRows();
  if (filtered === _mapFilterRows) return;
  _mapFilterRows = filtered;
  tblActiveIds = filtered.length < tableRows.length ? filtered.map(r => r._idx) : null;
  applyMapFilters();
}

function renderTable() {
  // Step 1: Map filter — search + sidebar filters over the FULL set, so the
  // map reflects them across all entity types.  The tab is intentionally NOT
  // applied: switching tabs shouldn't make features vanish from the map.
  syncMapToFilters();

  // Step 2: Table view — the active tab's rows, sorted.  This is what ends
  // up rendered into the <tbody>.
  const sorted = getSortedRows(getScopedRows());

  // Clamp page
  const totalPages = Math.max(1, Math.ceil(sorted.length / tblPageSize));
  if (tblPage >= totalPages) tblPage = totalPages - 1;
  const pageRows = sorted.slice(tblPage * tblPageSize, (tblPage + 1) * tblPageSize);

  // thead
  const visCols = TABLE_COLS.filter(c => c.visible);
  const thead = document.querySelector('#tbl thead');
  thead.innerHTML = '<tr>' + visCols.map(c =>
    `<th data-col="${c.key}" class="${tblSortCol === c.key ? 'sort-' + (tblSortDir > 0 ? 'asc' : 'desc') : ''}">${c.label}</th>`
  ).join('') + '</tr>';
  thead.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (tblSortCol === col) tblSortDir *= -1;
      else { tblSortCol = col; tblSortDir = -1; }
      tblPage = 0;
      renderTable();
    });
  });

  // tbody — current page only
  const tbody = document.querySelector('#tbl tbody');
  tbody.innerHTML = '';
  for (const row of pageRows) {
    const tr = document.createElement('tr');
    tr.dataset.idx = row._idx;
    if (row._idx === selectedId) tr.classList.add('selected');
    for (const c of visCols) {
      const td = document.createElement('td');
      td.textContent = c.fmt ? c.fmt(row[c.key]) : (row[c.key] ?? '–');
      tr.appendChild(td);
    }
    // Row hover outlines the feature on the map (map.js setHover).
    tr.addEventListener('mouseenter', () => { setHover(row._idx); });
    tr.addEventListener('mouseleave', () => { setHover(null); });
    tr.addEventListener('click', () => {
      if (!geojsonData.features[row._idx]) return;
      if (row._idx === selectedId) { clearSelection(); return; }
      selectFeature(row._idx);
    });
    tbody.appendChild(tr);
  }

  // Pagination controls
  renderPagination(sorted.length, totalPages);

  // Keep tab counts in sync with the filter state.
  updateTabCounts();
}

// Number of pages of the active tab (same basis as renderTable paginates).
function tablePageCount() {
  return Math.max(1, Math.ceil(getScopedRows().length / tblPageSize));
}

function renderPagination(total, totalPages) {
  const start = tblPage * tblPageSize + 1;
  const end   = Math.min((tblPage + 1) * tblPageSize, total);
  document.getElementById('pg-info').textContent =
    total === 0 ? 'Keine Einträge' : `${start}–${end} von ${total}`;

  document.getElementById('pg-first').disabled = tblPage === 0;
  document.getElementById('pg-prev').disabled  = tblPage === 0;
  document.getElementById('pg-next').disabled  = tblPage >= totalPages - 1;
  document.getElementById('pg-last').disabled  = tblPage >= totalPages - 1;

  const pagesEl = document.getElementById('pg-pages');
  pagesEl.innerHTML = '';
  const range = pageRange(tblPage, totalPages, 5);
  for (const p of range) {
    if (p === '…') {
      const sp = document.createElement('span');
      sp.textContent = '…'; sp.style.padding = '0 4px'; sp.style.color = 'var(--grey-500)';
      pagesEl.appendChild(sp);
    } else {
      const btn = document.createElement('button');
      btn.className = 'pg-btn' + (p === tblPage ? ' pg-active' : '');
      btn.textContent = p + 1;
      btn.addEventListener('click', () => { tblPage = p; renderTable(); });
      pagesEl.appendChild(btn);
    }
  }
}

function pageRange(current, total, window) {
  if (total <= window + 2) return Array.from({ length: total }, (_, i) => i);
  const half = Math.floor(window / 2);
  let start = Math.max(1, current - half);
  let end   = Math.min(total - 2, start + window - 1);
  if (end - start < window - 1) start = Math.max(1, end - window + 1);
  const pages = [0];
  if (start > 1) pages.push('…');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 2) pages.push('…');
  pages.push(total - 1);
  return pages;
}

// ── Column selector ─────────────────────────────────────────────────────────
function buildColDropdown() {
  const dd = document.getElementById('tbl-col-dd');
  dd.innerHTML = `<div class="dd-menu-label">Sichtbare Spalten</div>` +
    TABLE_COLS.map(c =>
      `<label class="col-check-item">
        <input type="checkbox" data-col="${c.key}" ${c.visible ? 'checked' : ''}>
        ${c.label}
      </label>`
    ).join('');
  dd.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const col = TABLE_COLS.find(c => c.key === cb.dataset.col);
      if (!col) return;
      col.visible = cb.checked;
      // Persist this toggle into the current tab's memory so switching
      // tabs and back doesn't undo the user's choice.
      rememberColStateForScope(tblScope);
      renderTable();
    });
  });
}

// ── Filter sidebar (checkbox groups) ─────────────────────────────────────────
// The attributes that can be filtered (config.js).
const FILTER_COLS = FILTER_COLS_DEFAULT;

// Render the filter groups into the right-side sidebar: collapsible groups
// of checkboxes bound to tblFilterAttrs.
function buildFilterSidebar() {
  if (!tableRows.length) return;
  const root = document.getElementById('filter-groups');
  if (!root) return;

  // Filter options reflect what's on the map (all features), not the
  // active table tab.  Keeping filters independent of tab scope avoids
  // confusing users who don't realise the two are linked.
  const collator = new Intl.Collator('de');
  root.innerHTML = FILTER_COLS.map(key => {
    const col = TABLE_COLS.find(c => c.key === key);
    const label = col ? col.label : key;
    const vals = [...new Set(tableRows.map(r => String(r[key] ?? '')).filter(Boolean))]
      .sort((a, b) => collator.compare(a, b));
    const checked = tblFilterAttrs[key] || new Set();
    const activeCount = checked.size;
    // First few groups expanded by default; rest collapsed.  Groups with
    // any active filter are forced expanded so the active picks are visible.
    const initiallyExpanded = activeCount > 0 || FILTER_COLS.indexOf(key) < 2;
    if (vals.length === 0) {
      return `<div class="filter-group collapsed" data-key="${key}">
        <button class="filter-group-head" type="button">
          <span class="filter-group-name">${label}</span>
          <svg class="filter-group-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="filter-group-body">
          <div class="filter-group-empty">Keine Werte</div>
        </div>
      </div>`;
    }
    return `<div class="filter-group${initiallyExpanded ? '' : ' collapsed'}" data-key="${key}">
      <button class="filter-group-head" type="button">
        <span class="filter-group-name">${label}</span>
        ${activeCount ? `<span class="filter-group-active">${activeCount}</span>` : ''}
        <svg class="filter-group-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="filter-group-body">
        ${vals.map(v => `<label class="filter-check-item">
          <input type="checkbox" data-field="${key}" value="${escapeHtml(v)}"${checked.has(v) ? ' checked' : ''}>
          <span class="filter-check-text" title="${escapeHtml(v)}">${escapeHtml(v)}</span>
        </label>`).join('')}
      </div>
    </div>`;
  }).join('');

  // ── Group collapse on header-tap ──
  root.querySelectorAll('.filter-group-head').forEach(head => {
    head.addEventListener('click', () => {
      head.parentElement.classList.toggle('collapsed');
    });
  });

  // ── Checkbox state ──
  root.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const field = cb.dataset.field;
      if (!tblFilterAttrs[field]) tblFilterAttrs[field] = new Set();
      if (cb.checked) tblFilterAttrs[field].add(cb.value);
      else tblFilterAttrs[field].delete(cb.value);
      if (!tblFilterAttrs[field].size) delete tblFilterAttrs[field];
      tblPage = 0;
      // Update the small "active" badge on this group's head without a
      // full rebuild (full rebuild would lose scroll position).
      const head = cb.closest('.filter-group').querySelector('.filter-group-head');
      let badge = head.querySelector('.filter-group-active');
      const n = tblFilterAttrs[field] ? tblFilterAttrs[field].size : 0;
      if (n > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'filter-group-active';
          head.querySelector('.filter-group-caret').before(badge);
        }
        badge.textContent = n;
      } else if (badge) {
        badge.remove();
      }
      onFilterChange();
    });
  });

  // ── Search within filter sidebar ──
  const searchInput = document.getElementById('filter-sidebar-search');
  const searchX = document.getElementById('filter-sidebar-search-x');
  if (searchInput && !searchInput._wired) {
    searchInput._wired = true;
    searchInput.addEventListener('input', () => filterSidebarSearch(searchInput.value));
    searchX.addEventListener('click', () => {
      searchInput.value = '';
      searchX.style.display = 'none';
      filterSidebarSearch('');
      searchInput.focus();
    });
  }

  // ── Clear-all link ──
  const clearAll = document.getElementById('filter-sidebar-clear');
  if (clearAll && !clearAll._wired) {
    clearAll._wired = true;
    clearAll.addEventListener('click', clearAllFilters);
  }
}

function filterSidebarSearch(query) {
  const root = document.getElementById('filter-groups');
  if (!root) return;
  const q = query.trim().toLowerCase();
  const xBtn = document.getElementById('filter-sidebar-search-x');
  if (xBtn) xBtn.style.display = q ? 'flex' : 'none';

  root.querySelectorAll('.filter-group').forEach(group => {
    let anyVisible = false;
    group.querySelectorAll('.filter-check-item').forEach(item => {
      const text = item.querySelector('.filter-check-text').textContent.toLowerCase();
      const show = !q || text.includes(q);
      item.style.display = show ? '' : 'none';
      if (show) anyVisible = true;
    });
    // While searching, force-expand groups that have visible items.
    if (q) {
      group.classList.toggle('collapsed', !anyVisible);
    }
  });
}

function onFilterChange(options = {}) {
  updateFilterBadge();
  renderFilterPills();
  syncFiltersToUrl();
  renderTable();
  if (options.zoom !== false) zoomToFilteredExtent();
}

// Fit the map to the bbox of currently filtered features.  When all filters
// are cleared, snap back to the full data extent.  Skipped when there are
// no matching features (avoids a jarring jump on a zero-result filter set).
function zoomToFilteredExtent() {
  if (!geojsonData || typeof map === 'undefined' || !map) return;
  if (countActiveFilters() === 0) {
    const bb = geojsonData.bbox;
    if (Array.isArray(bb) && bb.length === 4) {
      map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]],
        { padding: 60, maxZoom: 18, duration: 600 });
    }
    return;
  }
  // featuresBbox() pads a lone point to a small box, so fitBounds serves
  // every case.
  const bounds = featuresBbox(getFilteredRows().map(r => geojsonData.features[r._idx]).filter(Boolean));
  if (bounds) map.fitBounds(bounds, { padding: 80, maxZoom: 18, duration: 600 });
}

function countActiveFilters() {
  let n = 0;
  for (const vals of Object.values(tblFilterAttrs)) n += vals.size;
  return n;
}

function updateFilterBadge() {
  const n = countActiveFilters();
  // Two places now share the active-filter count: the header trigger
  // (#filter-toggle-badge) and the sidebar header (#filter-sidebar-badge).
  for (const id of ['filter-toggle-badge', 'filter-sidebar-badge']) {
    const b = document.getElementById(id);
    if (!b) continue;
    b.textContent = n > 0 ? n : '';
    b.style.display = n > 0 ? 'inline-block' : 'none';
  }
  const el = document.getElementById('filter-toggle');
  if (el) {
    el.classList.toggle('has-active', n > 0);
    // Icon-only on phones: the accessible name carries the count.
    el.setAttribute('aria-label', n > 0 ? `Filter (${n} aktiv)` : 'Filter');
  }
  // "Alle zurücksetzen" only when there is something to reset.
  const reset = document.getElementById('filter-sidebar-clear');
  if (reset) reset.hidden = n === 0;
}

// ── Filter pills ─────────────────────────────────────────────────────────────
// The active filters as removable pills, in two places: at the top of the
// filter sidebar (where they are set) and above the table (which they
// narrow, also while the sidebar is closed).
function renderFilterPills() {
  const n = countActiveFilters();
  let pills = '';
  for (const [field, vals] of Object.entries(tblFilterAttrs)) {
    const col = TABLE_COLS.find(c => c.key === field);
    const label = col ? col.label : field;
    for (const v of vals) {
      pills += `<span class="filter-pill" data-field="${escapeHtml(field)}" data-value="${escapeHtml(v)}">${escapeHtml(label)}: ${escapeHtml(v)}<button type="button" class="pill-x" aria-label="Filter entfernen: ${escapeHtml(label)} ${escapeHtml(v)}">&times;</button></span>`;
    }
  }
  const removePill = (pill) => {
    const { field, value } = pill.dataset;
    if (tblFilterAttrs[field]) {
      tblFilterAttrs[field].delete(value);
      if (!tblFilterAttrs[field].size) delete tblFilterAttrs[field];
    }
    tblPage = 0;
    buildFilterSidebar();   // sync checkboxes
    onFilterChange();
  };

  const bar = document.getElementById('tbl-filter-pills');
  if (bar) {
    bar.style.display = n > 0 ? 'flex' : 'none';
    bar.innerHTML = n ? pills + '<button type="button" class="filter-reset-link" id="tbl-filter-clear">Filter zurücksetzen</button>' : '';
    const clr = bar.querySelector('#tbl-filter-clear');
    if (clr) clr.addEventListener('click', clearAllFilters);
  }
  // Sidebar: pills only — its reset link sits in the sidebar header.
  const side = document.getElementById('filter-sidebar-pills');
  if (side) {
    side.hidden = n === 0;
    side.innerHTML = pills;
  }
  for (const host of [bar, side]) {
    if (!host) continue;
    host.querySelectorAll('.pill-x').forEach(btn => {
      btn.addEventListener('click', () => removePill(btn.closest('.filter-pill')));
    });
  }
}

function clearAllFilters() {
  tblFilterAttrs = {};
  tblPage = 0;
  buildFilterSidebar();
  onFilterChange();
}

// ── Filter URL sync ──────────────────────────────────────────────────────────
function syncFiltersToUrl() {
  try {
    const url = new URL(location.href);
    // Remove old filter params
    for (const short of Object.values(FILTER_URL_KEYS)) url.searchParams.delete(short);
    // Set active ones
    for (const [field, vals] of Object.entries(tblFilterAttrs)) {
      // Percent-encode each value before joining so a value that itself
      // contains a comma (addresses, some labels) survives the round-trip —
      // restoreFiltersFromUrl splits on ',' and decodes each part.
      if (vals.size && FILTER_URL_KEYS[field]) url.searchParams.set(FILTER_URL_KEYS[field], [...vals].map(encodeURIComponent).join(','));
    }
    history.replaceState(null, '', url);
  } catch (_) { /* file:// or sandboxed */ }
}

function restoreFiltersFromUrl() {
  try {
    const params = new URLSearchParams(location.search);
    for (const [short, field] of Object.entries(FILTER_URL_KEYS_REV)) {
      const raw = params.get(short);
      if (raw) {
        // Mirror syncFiltersToUrl's per-value encoding.  Decode defensively so
        // one malformed token (e.g. a bare '%' from an old-format link) can't
        // abort restoration of the other filters.
        const vals = raw.split(',').filter(Boolean).map(s => {
          try { return decodeURIComponent(s); } catch { return s; }
        });
        if (vals.length) tblFilterAttrs[field] = new Set(vals);
      }
    }
  } catch (_) { /* ignore */ }
}

// ── Export ──────────────────────────────────────────────────────────────────
// «Alle Daten» = every row of all three tabs; «Gefilterte Daten» = the rows
// that pass the search and the sidebar filters, again over all tabs (the tab
// is a view, not a filter).  Columns and formatters come from tableExportAoa()
// (js/util.js), which the Standort detail page uses for its Excel export too.
function exportCSV(rows) {
  const lines = tableExportAoa(rows).map(cells =>
    cells.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  downloadBlob(new Blob(['\ufeff' + lines.join('\n')],
    { type: 'text/csv;charset=utf-8' }), 'features.csv');
}

function exportGeoJSON(rows) {
  const idxSet = new Set(rows.map(r => r._idx));
  downloadGeoJSON(geojsonData.features.filter((_, i) => idxSet.has(i)), 'features.geojson');
}

function exportExcel(rows) {
  if (typeof XLSX === 'undefined') { showToast('Excel-Bibliothek nicht geladen', 'error'); return; }
  const ws = XLSX.utils.aoa_to_sheet(tableExportAoa(rows));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Features');
  XLSX.writeFile(wb, 'features.xlsx');
}

// The table panel and the filter sidebar slide in over --t-slow (tokens.css):
// the map takes its new size once that transition has ended.
const PANEL_TRANSITION_MS = 280;
function resizeMapAfterPanel() { setTimeout(() => map.resize(), PANEL_TRANSITION_MS); }

// ── Table toggle ─────────────────────────────────────────────────────────────
// Default collapsed on first page load; user expands via the toggle.
let tableOpen = false;
function _applyTableState() {
  document.getElementById('table-panel').classList.toggle('collapsed', !tableOpen);
  const toggle = document.getElementById('tbl-toggle');
  toggle.classList.toggle('collapsed', !tableOpen);
  toggle.setAttribute('aria-expanded', String(tableOpen));
  // Hides the resize handle while collapsed; lets the compact layout keep
  // bottom map controls clear of the home indicator (css).
  document.getElementById('main-content').classList.toggle('tbl-collapsed', !tableOpen);
}
_applyTableState();
document.getElementById('tbl-toggle').addEventListener('click', () => {
  tableOpen = !tableOpen;
  _applyTableState();
  // Phones: one bottom sheet at a time — the table replaces the legend sheet
  // (the feature card steps aside in CSS and returns when the table closes).
  if (tableOpen && isCompactLayout() && window.legendPanel && window.legendPanel.isOpen()) {
    window.legendPanel.close({ persist: false });
  }
  resizeMapAfterPanel();
});

// ── Search ────────────────────────────────────────────────────────────────────
const _tblSearchInput = document.getElementById('tbl-search');
const _tblSearchX = document.getElementById('tbl-search-x');
_tblSearchInput.addEventListener('input', () => {
  tblSearch = _tblSearchInput.value;
  _tblSearchX.style.display = tblSearch ? 'flex' : 'none';
  tblPage = 0;
  renderTable();
});
_tblSearchX.addEventListener('click', () => {
  _tblSearchInput.value = '';
  tblSearch = '';
  _tblSearchX.style.display = 'none';
  tblPage = 0;
  renderTable();
  _tblSearchInput.focus();
});

// ── Pagination buttons ────────────────────────────────────────────────────────
document.getElementById('pg-first').addEventListener('click', () => { tblPage = 0; renderTable(); });
document.getElementById('pg-prev').addEventListener('click',  () => { tblPage--; renderTable(); });
document.getElementById('pg-next').addEventListener('click',  () => { tblPage++; renderTable(); });
document.getElementById('pg-last').addEventListener('click',  () => {
  tblPage = tablePageCount() - 1;
  renderTable();
});
document.getElementById('pg-size-select').addEventListener('change', (e) => {
  tblPageSize = +e.target.value;
  tblPage = 0;
  renderTable();
});

// ── Dropdown toggle logic ────────────────────────────────────────────────────
// Filter is no longer a dropdown - it lives in the right-side sidebar (see
// #filter-sidebar wiring further down).  Only column- and export-pickers
// remain as dropdowns.
// Place a (position:fixed) dropdown menu relative to its trigger button,
// flipping it above the button when there isn't enough room below.  Fixed
// positioning means #table-panel's overflow:hidden can't clip it.
function positionDropdownMenu(wrap) {
  const btn  = wrap.querySelector('.dd-btn');
  const menu = wrap.querySelector('.dd-menu');
  if (!btn || !menu) return;
  menu.style.maxHeight = '';                          // measure natural size first
  const r = btn.getBoundingClientRect();
  const GAP = 5, EDGE = 8;
  const vw = window.innerWidth, vh = window.innerHeight;
  const menuW = menu.offsetWidth;
  let   menuH = menu.offsetHeight;

  // Horizontal: right-align to the button, clamped into the viewport.
  const left = Math.max(EDGE, Math.min(r.right - menuW, vw - menuW - EDGE));

  const below = vh - r.bottom - GAP;
  const above = r.top - GAP;
  let top;
  if (menuH <= below || below >= above) {
    top = r.bottom + GAP;                             // open downward
    if (menuH > below) menu.style.maxHeight = below + 'px';
  } else {
    if (menuH > above) { menu.style.maxHeight = above + 'px'; menuH = above; }
    top = r.top - GAP - menuH;                        // flip upward
  }
  menu.style.right = 'auto';
  menu.style.left  = left + 'px';
  menu.style.top   = Math.max(EDGE, top) + 'px';
}

['col-dd-wrap', 'export-dd-wrap'].forEach(wrapId => {
  const wrap = document.getElementById(wrapId);
  wrap.querySelector('.dd-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = wrap.classList.contains('open');
    document.querySelectorAll('.dd-wrap.open').forEach(el => el.classList.remove('open'));
    if (!isOpen) {
      wrap.classList.add('open');
      positionDropdownMenu(wrap);
    }
  });
  // Stop clicks inside the menu from bubbling to document — otherwise the
  // document handler closes the dropdown before <select> pickers can open.
  wrap.querySelector('.dd-menu').addEventListener('click', e => e.stopPropagation());
});
document.addEventListener('click', () => {
  document.querySelectorAll('.dd-wrap.open').forEach(el => el.classList.remove('open'));
});
// A fixed-position menu detaches from its button on resize — close it.
window.addEventListener('resize', () => {
  document.querySelectorAll('.dd-wrap.open').forEach(el => el.classList.remove('open'));
});

// ── Tab strip (Standorte / Pflegeelemente) ──────────────────────────────
function setScope(newScope) {
  if (!TABLE_SCOPES.includes(newScope)) return;
  if (newScope === tblScope) return;
  // Snapshot the leaving scope's column visibility so the user's edits
  // come back when they return to this tab.
  rememberColStateForScope(tblScope);
  tblScope = newScope;
  applyColStateForScope(newScope);
  tblPage = 0;
  updateTabUI();
  buildColDropdown();          // checkboxes reflect new visibility set
  updateFilterBadge();
  renderFilterPills();
  renderTable();
  syncScopeUrl();
}

function updateTabUI() {
  document.querySelectorAll('.tbl-tab').forEach(t => {
    const active = t.dataset.scope === tblScope;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
  });
}

function updateTabCounts() {
  // Counts reflect the filtered row set so the tab number matches what's
  // actually rendered in the table body for that scope.
  const filtered = getFilteredRows();
  let nSites = 0, nParcels = 0, nGreen = 0;
  for (const r of filtered) {
    if (SCOPE_HIDDEN_FROM_TABLE.has(r.entity_type)) continue;
    if (r.entity_type === 'site') nSites++;
    else if (r.entity_type === 'parcel') nParcels++;
    else nGreen++;
  }
  const a = document.getElementById('tbl-tab-count-sites');
  const p = document.getElementById('tbl-tab-count-parcels');
  const b = document.getElementById('tbl-tab-count-green');
  if (a) a.textContent = nSites;
  if (p) p.textContent = nParcels;
  if (b) b.textContent = nGreen;
}

function syncScopeUrl() {
  try {
    const url = new URL(location.href);
    if (tblScope === 'sites') url.searchParams.delete('scope');
    else url.searchParams.set('scope', tblScope);
    history.replaceState(null, '', url);
  } catch (_) { /* file:// or sandboxed */ }
}

function restoreScopeFromUrl() {
  try {
    const v = new URLSearchParams(location.search).get('scope');
    if (TABLE_SCOPES.includes(v)) tblScope = v;
  } catch (_) { /* ignore */ }
}

document.querySelectorAll('.tbl-tab').forEach(btn => {
  btn.addEventListener('click', () => setScope(btn.dataset.scope));
});

// ── Filter sidebar open/close ──────────────────────────────────────────
// Two triggers (header button + table-bar button) toggle the same panel.
// Phones: a drawer over the map with a scrim (css, compact tier).
(function initFilterSidebar() {
  const sidebar       = document.getElementById('filter-sidebar');
  const headerToggle  = document.getElementById('filter-toggle');
  const closeBtn      = document.getElementById('filter-sidebar-close');
  if (!sidebar) return;

  function open() {
    sidebar.classList.remove('collapsed');
    if (headerToggle) {
      headerToggle.classList.add('active');   // mirror "Bearbeiten"
      headerToggle.setAttribute('aria-expanded', 'true');
    }
    // Medium / compact layout: the docked filter and the floating legend do
    // not fit on the remaining map together (see legendPanel in map.js).
    if (!allowsTwoPanels() && window.legendPanel && window.legendPanel.isOpen()) window.legendPanel.close({ persist: false });
    if (!isCompactLayout()) resizeMapAfterPanel();
  }
  function close() {
    sidebar.classList.add('collapsed');
    if (headerToggle) {
      headerToggle.classList.remove('active');
      headerToggle.setAttribute('aria-expanded', 'false');
    }
    if (!isCompactLayout()) resizeMapAfterPanel();
  }
  function toggle() {
    sidebar.classList.contains('collapsed') ? open() : close();
  }
  window.filterPanel = { open, close, isOpen: () => !sidebar.classList.contains('collapsed') };

  if (headerToggle) headerToggle.addEventListener('click', toggle);
  if (closeBtn)     closeBtn.addEventListener('click',     close);

  // Entering the compact layout (rotation / resize): close the drawer so we
  // don't end up with legend and filter covering the whole viewport.
  LAYOUT_MQ.compact.addEventListener('change', (e) => { if (e.matches) close(); });

  // Tap outside the panel to close (only in the compact layout, where the
  // panel overlays the map).  Capture phase so we beat the map's own click.
  document.getElementById('main-content').addEventListener('click', () => {
    if (isCompactLayout() && !sidebar.classList.contains('collapsed')) close();
  }, { capture: true });
})();

// ── Export buttons ────────────────────────────────────────────────────────────
document.getElementById('exp-csv').addEventListener('click', (e) => {
  e.stopPropagation(); exportCSV(exportableRows(tableRows)); closeExportDd();
});
document.getElementById('exp-csv-f').addEventListener('click', () => {
  exportCSV(getSortedRows(exportableRows(getFilteredRows()))); closeExportDd();
});
document.getElementById('exp-geojson').addEventListener('click', () => {
  exportGeoJSON(exportableRows(tableRows)); closeExportDd();
});
document.getElementById('exp-geojson-f').addEventListener('click', () => {
  exportGeoJSON(exportableRows(getFilteredRows())); closeExportDd();
});
document.getElementById('exp-xlsx').addEventListener('click', () => {
  exportExcel(exportableRows(tableRows)); closeExportDd();
});
document.getElementById('exp-xlsx-f').addEventListener('click', () => {
  exportExcel(getSortedRows(exportableRows(getFilteredRows()))); closeExportDd();
});
function closeExportDd() {
  document.getElementById('export-dd-wrap').classList.remove('open');
}

// ── Table panel resize by dragging top edge ──────────────────────────────────
(() => {
  const handle = document.getElementById('tbl-resize-handle');
  const panel  = document.getElementById('table-panel');
  const MIN_H = 120, MAX_FRAC = 0.75;
  let startY, startH;

  // Drive the resize through the --table-height CSS variable rather than
  // an inline `height`.  An inline height would beat the stylesheet's
  // `#table-panel.collapsed { height: 0 }` rule (inline > class), leaving
  // the toggle unable to collapse the panel after a resize.  Setting the
  // variable keeps the collapse rule winning by specificity, and the
  // resized height is remembered across collapse/expand.
  function setTableHeight(px) {
    const maxH = window.innerHeight * MAX_FRAC;
    panel.style.setProperty('--table-height', Math.min(maxH, Math.max(MIN_H, px)) + 'px');
    map.resize();
  }

  // Keyboard: the handle is a focusable separator — arrows resize.  Being
  // focusable also keeps it a tap target for browsers' touch adjustment,
  // which otherwise snaps a finger on this thin bar to the map canvas.
  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const h = panel.getBoundingClientRect().height;
    setTableHeight(h + (e.key === 'ArrowUp' ? 40 : -40));
  });

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    startY = e.clientY;
    startH = panel.getBoundingClientRect().height;
    panel.classList.add('resizing');
    handle.classList.add('dragging');

    const onMove = (ev) => {
      const delta = startY - ev.clientY;          // drag up = grow
      setTableHeight(startH + delta);
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      panel.classList.remove('resizing');
      handle.classList.remove('dragging');
      map.resize();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  });
})();
