// ═══════════════════════════════════════════════════════════════════════════
// TABLE — widget, filtering, sorting, pagination, export, dropdowns
// Depends on: config.js (TABLE_COLS), map.js (selectedId, geojsonData, map,
//              applyMapFilters, selectFeature, clearSelection, tblActiveIds)
// ═══════════════════════════════════════════════════════════════════════════

let tableRows = [];
let tblSortCol = 'area_m2', tblSortDir = -1;
let tblSearch = '';
let tblFilterAttrs = {};
let tblPage = 0, tblPageSize = 25;

function buildTable() {
  if (!geojsonData) return;
  tableRows = geojsonData.features.map((f, i) => ({ ...f.properties, _idx: i }));
  buildColDropdown();
  buildFilterDropdown();
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
  for (const [field, val] of Object.entries(tblFilterAttrs)) {
    if (val !== '') rows = rows.filter(r => String(r[field] ?? '') === val);
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

// ── Filter dropdown ──────────────────────────────────────────────────────────
function buildFilterDropdown() {
  if (!tableRows.length) return;
  const dd = document.getElementById('tbl-filter-dd');
  const filterCols = ['feature_type', 'subtype', 'category', 'source'];
  dd.innerHTML = `<div class="dd-menu-label">Attribut filtern</div>` +
    filterCols.map(key => {
      const col = TABLE_COLS.find(c => c.key === key);
      const label = col ? col.label : key;
      const vals = [...new Set(tableRows.map(r => String(r[key] ?? '')).filter(Boolean))].sort();
      const cur = tblFilterAttrs[key] || '';
      return `<div class="filter-row">
        <span class="filter-label">${label}</span>
        <select data-field="${key}">
          <option value="">Alle</option>
          ${vals.map(v => `<option value="${v}"${cur === v ? ' selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>`;
    }).join('') +
    `<div class="filter-actions"><button id="tbl-filter-clear" class="filter-clear-btn">Filter zurücksetzen</button></div>`;

  dd.querySelectorAll('select').forEach(sel => {
    sel.addEventListener('change', () => {
      tblFilterAttrs[sel.dataset.field] = sel.value;
      tblPage = 0;
      updateFilterBadge();
      renderTable();
    });
  });
  const clr = dd.querySelector('#tbl-filter-clear');
  if (clr) clr.addEventListener('click', () => {
    tblFilterAttrs = {};
    tblPage = 0;
    buildFilterDropdown();
    updateFilterBadge();
    renderTable();
  });
}

function updateFilterBadge() {
  const n = Object.values(tblFilterAttrs).filter(v => v !== '').length;
  const badge = document.getElementById('tbl-filter-badge');
  badge.textContent = n > 0 ? n : '';
  badge.style.display = n > 0 ? 'inline-block' : 'none';
  document.getElementById('filter-dd-btn').classList.toggle('has-active', n > 0);
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
document.getElementById('tbl-search').addEventListener('input', (e) => {
  tblSearch = e.target.value;
  tblPage = 0;
  renderTable();
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
