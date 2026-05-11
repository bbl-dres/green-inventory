// ═══════════════════════════════════════════════════════════════════════════
// TABLE — widget, filtering, sorting, pagination, export, dropdowns
// Depends on: config.js (TABLE_COLS), map.js (selectedId, geojsonData, map,
//              applyMapFilters, selectFeature, clearSelection, tblActiveIds)
// ═══════════════════════════════════════════════════════════════════════════

let tableRows = [];
let tblSortCol = 'entity_type', tblSortDir = 1;
let tblSearch = '';
let tblFilterAttrs = {};          // { field: Set<string> }

// ── Tab scope ────────────────────────────────────────────────────────
// Two tab views over the data:
//   'sites'  → entity_type === 'site'           (Standorte)
//   'green'  → entity_type in {area, tree_canopy, tree, point}  (Grünflächen)
// site_location features (centroid markers) are hidden from BOTH tabs —
// they're a map-only affordance, not data.
let tblScope = 'sites';
const SCOPE_HIDDEN_FROM_TABLE = new Set(['site_location']);

function inScope(row, scope) {
  const e = row.entity_type;
  if (SCOPE_HIDDEN_FROM_TABLE.has(e)) return false;
  if (scope === 'sites') return e === 'site';
  return e !== 'site';            // 'green' = everything else
}

// Per-scope column visibility memory.  null = use TABLE_COL_DEFAULTS.
// Populated lazily: the first time a scope's visibility is touched (column
// toggle or scope-leave), the current state is snapshotted into here so
// subsequent re-entries restore the user's preferences for that tab.
const _scopeColMemory = { sites: null, green: null };

function applyColStateForScope(scope) {
  const saved = _scopeColMemory[scope];
  const keys = saved || (TABLE_COL_DEFAULTS && TABLE_COL_DEFAULTS[scope]) || [];
  const visible = new Set(keys);
  TABLE_COLS.forEach(c => { c.visible = visible.has(c.key); });
}

function rememberColStateForScope(scope) {
  _scopeColMemory[scope] = TABLE_COLS.filter(c => c.visible).map(c => c.key);
}

// URL-param short keys for filter columns
const FILTER_URL_KEYS = {
  entity_type: 'ent', site_lose: 'lo', pflegeklasse: 'pk',
  eigentuemer: 'eg', fk_profil: 'pr', baumart: 'ba', site_name: 'sn',
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

// Apply the same search + sidebar filters to an arbitrary row array.  Used
// twice per render: once on the full set (for the map's tblActiveIds) and
// once on the scoped set (for the table view).
function getFilteredRows(rows = tableRows) {
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

function getSortedRows(rows) {
  return [...rows].sort((a, b) => {
    const av = a[tblSortCol], bv = b[tblSortCol];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * tblSortDir;
    return String(av).localeCompare(String(bv)) * tblSortDir;
  });
}

function renderTable() {
  // Step 1: Map filter — applies search + sidebar filters to the FULL set
  // so the map reflects user intent across all entity types.  The tab is
  // intentionally NOT applied here: switching tabs shouldn't make features
  // vanish from the map.
  const globalFiltered = getFilteredRows(tableRows);
  tblActiveIds = globalFiltered.length < tableRows.length
    ? globalFiltered.map(r => r._idx)
    : null;
  applyMapFilters();

  // Step 2: Table view — apply scope first, then filters.  This is what
  // ends up rendered into the <tbody>.
  const scoped = tableRows.filter(r => inScope(r, tblScope));
  const filtered = getFilteredRows(scoped);
  const sorted = getSortedRows(filtered);

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
    // Reuse map.js's setHover so the same Point-only hover-circle filter +
    // hover-line filter apply.  The old code referenced a layer name
    // ('features-hover') that hasn't existed since the GDB rewrite.
    tr.addEventListener('mouseenter', () => { setHover(row._idx); });
    tr.addEventListener('mouseleave', () => { setHover(null); });
    tr.addEventListener('click', () => {
      const feat = geojsonData.features[row._idx];
      if (!feat) return;
      const bbox = geomBbox(feat.geometry);
      if (row._idx === selectedId) { clearSelection(); return; }
      const center = [(bbox[0][0] + bbox[1][0]) / 2, (bbox[0][1] + bbox[1][1]) / 2];
      selectFeature(row._idx, center);
      map.fitBounds(bbox, { padding: 80, maxZoom: 20 });
    });
    tbody.appendChild(tr);
  }

  // Pagination controls
  renderPagination(sorted.length, totalPages);
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
      sp.textContent = '…'; sp.style.padding = '0 4px'; sp.style.color = 'var(--grey-400)';
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

function geomBbox(geom) {
  let mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
  function scan(c) {
    if (typeof c[0] === 'number') {
      if (c[0] < mn[0]) mn[0] = c[0]; if (c[0] > mx[0]) mx[0] = c[0];
      if (c[1] < mn[1]) mn[1] = c[1]; if (c[1] > mx[1]) mx[1] = c[1];
    } else c.forEach(scan);
  }
  if (!geom || !geom.coordinates) return [[0, 0], [0, 0]];
  scan(geom.coordinates);
  // Point geometries leave min === max which makes fitBounds collapse.
  if (mn[0] === mx[0] && mn[1] === mx[1]) {
    const eps = 0.0001;
    mn = [mn[0] - eps, mn[1] - eps];
    mx = [mx[0] + eps, mx[1] + eps];
  }
  return [mn, mx];
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

// ── Filter dropdown (checkbox-based) ─────────────────────────────────────────
// FILTER_COLS_DEFAULT comes from config.js; copy here so we keep a stable
// reference even if config later toggles columns.
const FILTER_COLS = (typeof FILTER_COLS_DEFAULT !== 'undefined' && FILTER_COLS_DEFAULT)
  ? FILTER_COLS_DEFAULT.slice()
  : ['entity_type', 'subtype', 'site_name'];

// Render filter groups into the right-side sidebar.  Replaces the previous
// dropdown — same data binding (tblFilterAttrs), same change-event flow,
// just rendered in a permanent panel with collapsible groups.
function buildFilterSidebar() {
  if (!tableRows.length) return;
  const root = document.getElementById('filter-groups');
  if (!root) return;

  // Scope the filter options to what's actually visible in the current
  // tab — so "Baumart" doesn't show 137 species when you're viewing
  // Standorte (where every row's baumart is null).  Empty groups still
  // render but collapse with a "Keine Werte" placeholder.
  const scopedRows = tableRows.filter(r => inScope(r, tblScope));

  // For each filter column, collect distinct non-empty values from the
  // scoped row set.  Sort ascending by display value (German locale
  // collation - "Ä" sorts after "A", not after "Z").
  const collator = new Intl.Collator('de');
  root.innerHTML = FILTER_COLS.map(key => {
    const col = TABLE_COLS.find(c => c.key === key);
    const label = col ? col.label : key;
    const vals = [...new Set(scopedRows.map(r => String(r[key] ?? '')).filter(Boolean))]
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
          <span class="filter-group-count">0</span>
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
        <span class="filter-group-count">${vals.length}</span>
        <svg class="filter-group-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="filter-group-body">
        ${vals.map(v => `<label class="filter-check-item">
          <input type="checkbox" data-field="${key}" value="${escapeAttr(v)}"${checked.has(v) ? ' checked' : ''}>
          <span class="filter-check-text" title="${escapeAttr(v)}">${escapeHtmlSafe(v)}</span>
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
          head.querySelector('.filter-group-count').before(badge);
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

// Tiny html / attribute escapers.  buildLegend in map.js has its own
// escapeHtml; we don't import across files so duplicate the bare minimum
// here.
const _ESC_TBL = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtmlSafe(v) { return v == null ? '' : String(v).replace(/[&<>"']/g, ch => _ESC_TBL[ch]); }
function escapeAttr(v) { return escapeHtmlSafe(v); }

function onFilterChange() {
  updateFilterBadge();
  renderFilterPills();
  syncFiltersToUrl();
  renderTable();
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
  if (el) el.classList.toggle('has-active', n > 0);
}

// ── Filter pills ─────────────────────────────────────────────────────────────
function renderFilterPills() {
  const bar = document.getElementById('tbl-filter-pills');
  if (!bar) return;
  const n = countActiveFilters();
  bar.style.display = n > 0 ? 'flex' : 'none';
  if (!n) { bar.innerHTML = ''; return; }

  let html = '';
  for (const [field, vals] of Object.entries(tblFilterAttrs)) {
    const col = TABLE_COLS.find(c => c.key === field);
    const label = col ? col.label : field;
    for (const v of vals) {
      html += `<span class="filter-pill" data-field="${field}" data-value="${v}">${label}: ${v}<button class="pill-x" aria-label="Entfernen">&times;</button></span>`;
    }
  }
  html += `<button class="filter-reset-link" id="tbl-filter-clear">Filter zurücksetzen</button>`;
  bar.innerHTML = html;

  bar.querySelectorAll('.pill-x').forEach(btn => {
    btn.addEventListener('click', () => {
      const pill = btn.closest('.filter-pill');
      const { field, value } = pill.dataset;
      if (tblFilterAttrs[field]) {
        tblFilterAttrs[field].delete(value);
        if (!tblFilterAttrs[field].size) delete tblFilterAttrs[field];
      }
      tblPage = 0;
      buildFilterSidebar();   // sync checkboxes
      onFilterChange();
    });
  });
  const clr = bar.querySelector('#tbl-filter-clear');
  if (clr) clr.addEventListener('click', clearAllFilters);
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
      if (vals.size) url.searchParams.set(FILTER_URL_KEYS[field], [...vals].join(','));
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
        const vals = raw.split(',').filter(Boolean);
        if (vals.length) tblFilterAttrs[field] = new Set(vals);
      }
    }
  } catch (_) { /* ignore */ }
}

// ── Export ──────────────────────────────────────────────────────────────────
function exportCSV(rows) {
  const header = TABLE_COLS.map(c => `"${c.label}"`).join(',');
  const lines = rows.map(r =>
    TABLE_COLS.map(c => {
      const v = c.fmt ? c.fmt(r[c.key]) : (r[c.key] ?? '');
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(',')
  );
  downloadBlob(new Blob(['\ufeff' + [header, ...lines].join('\n')],
    { type: 'text/csv;charset=utf-8' }), 'features.csv');
}

function exportGeoJSON(rows) {
  const idxSet = new Set(rows.map(r => r._idx));
  const fc = {
    type: 'FeatureCollection',
    features: geojsonData.features.filter((_, i) => idxSet.has(i))
  };
  downloadBlob(new Blob([JSON.stringify(fc, null, 2)], { type: 'application/json' }),
    'features.geojson');
}

function exportExcel(rows) {
  const wsData = [
    TABLE_COLS.map(c => c.label),
    ...rows.map(r => TABLE_COLS.map(c => c.fmt ? c.fmt(r[c.key]) : (r[c.key] ?? '')))
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Features');
  XLSX.writeFile(wb, 'features.xlsx');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Table toggle ─────────────────────────────────────────────────────────────
// Default open on desktop, collapsed on phones.  matchMedia handles
// rotate/resize crossings cleanly so the state stays in sync.
const _mqPhoneTbl = window.matchMedia('(max-width: 768px)');
let tableOpen = !_mqPhoneTbl.matches;
function _applyTableState() {
  document.getElementById('table-panel').classList.toggle('collapsed', !tableOpen);
  document.getElementById('tbl-toggle').classList.toggle('collapsed', !tableOpen);
}
_applyTableState();
document.getElementById('tbl-toggle').addEventListener('click', () => {
  tableOpen = !tableOpen;
  _applyTableState();
  setTimeout(() => map.resize(), 280);
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
  const total = getSortedRows(getFilteredRows()).length;
  tblPage = Math.max(0, Math.ceil(total / tblPageSize) - 1);
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
['col-dd-wrap', 'export-dd-wrap'].forEach(wrapId => {
  const wrap = document.getElementById(wrapId);
  wrap.querySelector('.dd-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = wrap.classList.contains('open');
    document.querySelectorAll('.dd-wrap.open').forEach(el => el.classList.remove('open'));
    if (!isOpen) wrap.classList.add('open');
  });
  // Stop clicks inside the menu from bubbling to document — otherwise the
  // document handler closes the dropdown before <select> pickers can open.
  wrap.querySelector('.dd-menu').addEventListener('click', e => e.stopPropagation());
});
document.addEventListener('click', () => {
  document.querySelectorAll('.dd-wrap.open').forEach(el => el.classList.remove('open'));
});

// ── Tab strip (Standorte / Grünflächen) ─────────────────────────────────
function setScope(newScope) {
  if (newScope !== 'sites' && newScope !== 'green') return;
  if (newScope === tblScope) return;
  // Snapshot the leaving scope's column visibility so the user's edits
  // come back when they return to this tab.
  rememberColStateForScope(tblScope);
  tblScope = newScope;
  applyColStateForScope(newScope);
  tblPage = 0;
  updateTabUI();
  buildColDropdown();          // checkboxes reflect new visibility set
  buildFilterSidebar();         // filter-group values rebuilt for new scope
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
  let nSites = 0, nGreen = 0;
  for (const r of tableRows) {
    if (SCOPE_HIDDEN_FROM_TABLE.has(r.entity_type)) continue;
    if (r.entity_type === 'site') nSites++;
    else nGreen++;
  }
  const a = document.getElementById('tbl-tab-count-sites');
  const b = document.getElementById('tbl-tab-count-green');
  if (a) a.textContent = nSites;
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
    if (v === 'green' || v === 'sites') tblScope = v;
  } catch (_) { /* ignore */ }
}

document.querySelectorAll('.tbl-tab').forEach(btn => {
  btn.addEventListener('click', () => setScope(btn.dataset.scope));
});

// ── Filter sidebar open/close ──────────────────────────────────────────
// Two triggers (header button + table-bar button) toggle the same panel.
// Mobile mirrors the legend drawer behaviour.
(function initFilterSidebar() {
  const sidebar       = document.getElementById('filter-sidebar');
  const headerToggle  = document.getElementById('filter-toggle');
  const closeBtn      = document.getElementById('filter-sidebar-close');
  const mqPhone       = window.matchMedia('(max-width: 768px)');
  if (!sidebar) return;

  function open() {
    sidebar.classList.remove('collapsed');
    if (!mqPhone.matches) setTimeout(() => map.resize(), 280);
  }
  function close() {
    sidebar.classList.add('collapsed');
    if (!mqPhone.matches) setTimeout(() => map.resize(), 280);
  }
  function toggle() {
    sidebar.classList.contains('collapsed') ? open() : close();
  }

  if (headerToggle) headerToggle.addEventListener('click', toggle);
  if (closeBtn)     closeBtn.addEventListener('click',     close);

  // On rotate / resize across the breakpoint, force the drawer-style
  // panel closed so we don't end up with both legend and filter open and
  // covering the whole viewport.
  mqPhone.addEventListener('change', () => close());

  // Tap outside the panel to close (only in phone mode where the panel
  // overlays the map).  Capture phase so we beat the map's own click.
  document.getElementById('main-content').addEventListener('click', () => {
    if (mqPhone.matches && !sidebar.classList.contains('collapsed')) close();
  }, { capture: true });
})();

// ── Export buttons ────────────────────────────────────────────────────────────
document.getElementById('exp-csv').addEventListener('click', (e) => {
  e.stopPropagation(); exportCSV(tableRows); closeExportDd();
});
document.getElementById('exp-csv-f').addEventListener('click', () => {
  exportCSV(getSortedRows(getFilteredRows())); closeExportDd();
});
document.getElementById('exp-geojson').addEventListener('click', () => {
  exportGeoJSON(tableRows); closeExportDd();
});
document.getElementById('exp-geojson-f').addEventListener('click', () => {
  exportGeoJSON(getFilteredRows()); closeExportDd();
});
document.getElementById('exp-xlsx').addEventListener('click', () => {
  exportExcel(tableRows); closeExportDd();
});
document.getElementById('exp-xlsx-f').addEventListener('click', () => {
  exportExcel(getSortedRows(getFilteredRows())); closeExportDd();
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

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    startY = e.clientY;
    startH = panel.getBoundingClientRect().height;
    panel.classList.add('resizing');
    handle.classList.add('dragging');

    const onMove = (ev) => {
      const delta = startY - ev.clientY;          // drag up = grow
      const maxH  = window.innerHeight * MAX_FRAC;
      panel.style.height = Math.min(maxH, Math.max(MIN_H, startH + delta)) + 'px';
      map.resize();
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      panel.classList.remove('resizing');
      handle.classList.remove('dragging');
      map.resize();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  });
})();
