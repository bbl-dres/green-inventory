// ═══════════════════════════════════════════════════════════════════════════
// TABLE — widget, filtering, sorting, pagination, export, dropdowns
// Depends on: config.js (TABLE_COLS), map.js (selectedId, geojsonData, map,
//              applyMapFilters, selectFeature, clearSelection, tblActiveIds)
// ═══════════════════════════════════════════════════════════════════════════

let tableRows = [];
let tblSortCol = 'area_m2', tblSortDir = -1;
let tblSearch = '';
let tblFilterAttrs = {};          // { field: Set<string> }

// URL-param short keys for filter columns
const FILTER_URL_KEYS = { feature_type: 'ft', subtype: 'st', category: 'cat', source: 'src' };
const FILTER_URL_KEYS_REV = Object.fromEntries(Object.entries(FILTER_URL_KEYS).map(([k, v]) => [v, k]));
let tblPage = 0, tblPageSize = 25;

function buildTable() {
  if (!geojsonData) return;
  tableRows = geojsonData.features.map((f, i) => ({ ...f.properties, _idx: i }));
  restoreFiltersFromUrl();
  buildColDropdown();
  buildFilterDropdown();
  updateFilterBadge();
  renderFilterPills();
  renderTable();
}

function getFilteredRows() {
  let rows = tableRows;
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
  const filtered = getFilteredRows();
  const sorted = getSortedRows(filtered);

  // Clamp page
  const totalPages = Math.max(1, Math.ceil(sorted.length / tblPageSize));
  if (tblPage >= totalPages) tblPage = totalPages - 1;
  const pageRows = sorted.slice(tblPage * tblPageSize, (tblPage + 1) * tblPageSize);

  // Sync table filter to map
  tblActiveIds = filtered.length < tableRows.length ? filtered.map(r => r._idx) : null;
  applyMapFilters();

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
    tr.addEventListener('mouseenter', () => {
      if (map.getLayer('features-hover'))
        map.setFilter('features-hover', ['==', ['id'], row._idx]);
    });
    tr.addEventListener('mouseleave', () => {
      if (map.getLayer('features-hover'))
        map.setFilter('features-hover', ['==', ['id'], -1]);
    });
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
  scan(geom.coordinates);
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
      if (col) { col.visible = cb.checked; renderTable(); }
    });
  });
}

// ── Filter dropdown (checkbox-based) ─────────────────────────────────────────
const FILTER_COLS = ['feature_type', 'subtype', 'category', 'source'];

function buildFilterDropdown() {
  if (!tableRows.length) return;
  const dd = document.getElementById('tbl-filter-dd');
  dd.innerHTML =
    `<div class="filter-search-wrap">
      <input type="text" class="filter-search" id="filter-dd-search" placeholder="Suche…">
      <button class="input-clear-x" id="filter-dd-search-x" aria-label="Eingabe löschen" style="display:none">&times;</button>
    </div>` +
    FILTER_COLS.map(key => {
      const col = TABLE_COLS.find(c => c.key === key);
      const label = col ? col.label : key;
      const vals = [...new Set(tableRows.map(r => String(r[key] ?? '')).filter(Boolean))].sort();
      const checked = tblFilterAttrs[key] || new Set();
      return `<div class="filter-group">
        <div class="filter-group-label">${label}</div>
        ${vals.map(v => `<label class="filter-check-item">
          <input type="checkbox" data-field="${key}" value="${v}"${checked.has(v) ? ' checked' : ''}>
          <span class="filter-check-text">${v}</span>
        </label>`).join('')}
      </div>`;
    }).join('');

  // Checkbox change → update filter state
  dd.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const field = cb.dataset.field;
      if (!tblFilterAttrs[field]) tblFilterAttrs[field] = new Set();
      if (cb.checked) tblFilterAttrs[field].add(cb.value);
      else tblFilterAttrs[field].delete(cb.value);
      if (!tblFilterAttrs[field].size) delete tblFilterAttrs[field];
      tblPage = 0;
      onFilterChange();
    });
  });

  // Search within filter dropdown
  const searchInput = dd.querySelector('#filter-dd-search');
  const searchX = dd.querySelector('#filter-dd-search-x');
  searchInput.addEventListener('input', () => filterDropdownSearch(searchInput.value));
  searchX.addEventListener('click', () => {
    searchInput.value = '';
    searchX.style.display = 'none';
    filterDropdownSearch('');
    searchInput.focus();
  });
}

function filterDropdownSearch(query) {
  const dd = document.getElementById('tbl-filter-dd');
  const q = query.trim().toLowerCase();
  dd.querySelector('#filter-dd-search-x').style.display = q ? 'flex' : 'none';

  dd.querySelectorAll('.filter-group').forEach(group => {
    let anyVisible = false;
    group.querySelectorAll('.filter-check-item').forEach(item => {
      const text = item.querySelector('.filter-check-text').textContent.toLowerCase();
      const show = !q || text.includes(q);
      item.style.display = show ? '' : 'none';
      if (show) anyVisible = true;
    });
    group.style.display = anyVisible ? '' : 'none';
  });
}

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
  const badge = document.getElementById('tbl-filter-badge');
  badge.textContent = n > 0 ? n : '';
  badge.style.display = n > 0 ? 'inline-block' : 'none';
  document.getElementById('filter-dd-btn').classList.toggle('has-active', n > 0);
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
      buildFilterDropdown();   // sync checkboxes
      onFilterChange();
    });
  });
  const clr = bar.querySelector('#tbl-filter-clear');
  if (clr) clr.addEventListener('click', clearAllFilters);
}

function clearAllFilters() {
  tblFilterAttrs = {};
  tblPage = 0;
  buildFilterDropdown();
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
let tableOpen = true;
document.getElementById('tbl-toggle').addEventListener('click', () => {
  tableOpen = !tableOpen;
  document.getElementById('table-panel').classList.toggle('collapsed', !tableOpen);
  document.getElementById('tbl-toggle').classList.toggle('collapsed', !tableOpen);
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
['col-dd-wrap', 'filter-dd-wrap', 'export-dd-wrap'].forEach(wrapId => {
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
