// ═══════════════════════════════════════════════════════════════════════════
// STANDORT — detail page of one Standort (standort.html?id=<Objektnummer>,
// fallback ?fid=<feature id>): KPI tiles, Situationsplan (a live map limited
// to this Standort), Stammdaten, Pflegekalender and the exports.
//
// The page is the complete view; the map's feature card is the compact one
// and links here.  It loads the same per-entity files as the map (data.js)
// and filters them to the Standort — there is no server to ask for less.
// Depends on: config.js, data.js (loadInventory), util.js, mapkit.js,
//   report.js (buildStandortReport), SheetJS (CDN)
// ═══════════════════════════════════════════════════════════════════════════

(async function initStandortPage() {
  const $ = (id) => document.getElementById(id);
  const stateEl = $('site-state');
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
                  'August', 'September', 'Oktober', 'November', 'Dezember'];

  // Friendly empty / error state instead of a blank page.
  function showState(title, text) {
    stateEl.classList.add('pg-state-msg');
    stateEl.innerHTML =
      `<h1 class="pg-state-title">${escapeHtml(title)}</h1>` +
      `<p>${escapeHtml(text)}</p>` +
      `<a class="btn btn-primary" href="index.html">${icon('arrowLeft', 16)}Zur Karte</a>`;
  }

  let params;
  try { params = new URLSearchParams(location.search); } catch (_) { params = new URLSearchParams(''); }

  let inv;
  try {
    inv = await loadInventory(DATA_FILES);
  } catch (e) {
    console.error(e);
    showState('Daten nicht verfügbar', 'Die Inventardaten konnten nicht geladen werden. Bitte laden Sie die Seite neu.');
    return;
  }
  // Same feature ids as on the map: the array index.
  inv.features.forEach((f, i) => { if (f.id == null) f.id = i; });

  const site = findSiteFeature(inv.features, params);
  if (!site) {
    const asked = params.get('id') || params.get('fid');
    showState('Standort nicht gefunden',
      asked ? `Zum Standort «${asked}» gibt es keinen Eintrag im Inventar.`
            : 'Die Adresse dieser Seite nennt keinen Standort.');
    return;
  }

  const sp = site.properties;
  const children = siteChildren(inv.features, sp.objectid);
  const parcels = parcelsOf(inv.features, children);
  const rows = careProfileRows(children);
  const md = inv.metadata || {};
  const fileStem = 'Standort_' + String(sp.objektnummer || sp.objectid).replace(/[^\w.-]+/g, '_') + '_' + todayIso();

  // ── Title + navigation ────────────────────────────────────────────────────
  document.title = `${sp.name || 'Standort'} – Standort – Grünflächen Inventar`;
  $('site-title').textContent = sp.name || '–';
  // «Zur Karte»: phones open this page in the map's tab and leave the map's
  // address behind (map.js) — go back to exactly that view.  Otherwise open
  // the map on this Standort.
  let backUrl = mapUrlForSite(sp.site_ref);
  try {
    const stored = sessionStorage.getItem('gi.mapUrl');
    if (stored && new URL(stored, location.href).origin === location.origin) backUrl = stored;
  } catch (_) { /* private mode */ }
  $('back-to-map').href = backUrl;

  // ── KPI tiles ─────────────────────────────────────────────────────────────
  // Pflegefläche = Σ area of the polygon elements; Bäume = points with a tree
  // profile (with or without a species) plus trees the survey left unprofiled.
  const areaTotal = rows.reduce((s, r) => s + r.area, 0);
  const treeCount = children.filter(f => {
    const p = f.properties;
    if (profileDomain(p.entity_type) !== 'idPP') return false;
    const group = legendGroupOfProfile(p.entity_type, p.fk_profil);
    return group ? group.id === 'baum' : p.entity_type === 'tree';
  }).length;
  $('kpis').innerHTML = [
    ['Pflegefläche', fmtNum(areaTotal, 0), 'm²'],
    ['Pflegeelemente', fmtNum(children.length, 0), ''],
    ['Bäume', fmtNum(treeCount, 0), ''],
  ].map(([label, value, unit]) => `
    <div class="kpi">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}${unit ? `<span class="kpi-unit">${unit}</span>` : ''}</div>
    </div>`).join('');

  // ── Stammdaten ────────────────────────────────────────────────────────────
  // All relevant attributes of the Standort (DATAMODEL.md §3.1) plus the
  // parcel references derived through its elements.  Empty values show «–»;
  // the name is not repeated (it is the page title).
  const uniq = (list) => [...new Set(list.filter(v => v != null && v !== ''))];
  const dash = (v) => isUnset(v) ? '–' : v;
  const erpIds = uniq(parcels.map(f => f.properties.erp_id));
  const egrids = uniq(parcels.map(f => f.properties.egrid));
  const cantons = uniq(parcels.map(f => f.properties.canton));
  const munis = uniq(parcels.map(f => f.properties.municipality_name));
  // The portfolio is worldwide: cadastral parcels, or a representative point
  // inside the Swiss grid, mean Switzerland; otherwise the country is unknown.
  const E = sp.lv95_east_centroid, N = sp.lv95_north_centroid;
  const inSwissGrid = E != null && N != null && E > 2480000 && E < 2840000 && N > 1070000 && N < 1300000;
  const land = sp.land || ((parcels.length || inSwissGrid) ? 'Schweiz' : null);
  const region = sp.region || cantons.map(c => CANTON_NAMES[c] ? `${CANTON_NAMES[c]} (${c})` : c).join(', ');
  const plzOrt = [sp.plz, munis.join(', ')].filter(Boolean).join(' ');
  const jaNein = (isUnset(sp.kontrolle) && isUnset(sp.reinigung)) ? null
    : dash(sp.kontrolle) + ' / ' + dash(sp.reinigung);
  const stamm = [
    { title: 'Identifikation', rows: [
      ['ID', sp.objektnummer],
      ['Grundstück ERP', erpIds.join(', ')],
      ['Grundstück AV', egrids.join(', ')],
      ['Adresse', sp.adresse],
      ['Land', land],
      ['Region / Kanton', region],
      ['PLZ / Gemeinde', plzOrt],
      ['Fläche', fmtAreaM2(sp.area_m2, 0)],
    ] },
    { title: 'Zuständigkeit und Pflege', rows: [
      ['Pflegeklasse (Vorgabe)', sp.pflegeklasse],
      ['Verantwortlich', sp.pflegeverantwortung],
      ['Los', sp.lose],
      ['Kontrolle / Reinigung', jaNein],
    ] },
    { title: 'Erfassung', rows: [
      ['Erfasst', fmtDate(sp.erfassungsdatum)],
      // The survey keeps no change date per Standort (and none on its elements).
      ['Letzte Änderung', null],
      ['Bemerkung', sp.bemerkung],
    ] },
  ];
  // Two cards: identification left; responsibility / care and survey right.
  const stammGroup = (g) => `
    <h2 class="card-title">${g.title}</h2>
    <dl class="dl-grid">${g.rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(dash(v))}</dd>`).join('')}</dl>`;
  $('stamm-left').innerHTML = stammGroup(stamm[0]);
  $('stamm-right').innerHTML = stammGroup(stamm[1]) + stammGroup(stamm[2]);

  // ── Pflegekalender ────────────────────────────────────────────────────────
  // One row per profile (largest area first, then the point profiles); a
  // click expands its care tasks, one profile at a time.  Month cells: solid =
  // stated in the BBL Standard, hatched = estimated.  Below ~900 px card width
  // the months and the tasks are hidden by CSS (container query).
  let openRow = null;
  const calEl = $('cal');
  const monthCells = (states) => states.map((st, i) =>
    `<td class="cal-m"><span class="cal-cell s${st}"></span><span class="sr-only">${st ? MONTHS[i] + (st === 1 ? ' (geschätzt)' : '') : ''}</span></td>`
  ).join('');
  function renderCalendar() {
    let body = '';
    for (const r of rows) {
      const cat = careProfile(r.entity_type, r.code);
      const tasks = (cat && cat.tasks) || [];
      const open = openRow === r.key && tasks.length > 0;
      const key = escapeHtml(r.key);
      const name = escapeHtml(r.label);
      body += `
        <tr class="cal-row${open ? ' open' : ''}">
          <td class="cal-code"><span class="cal-code-in">${swatchHtml(profilStyle(r.entity_type, r.code))}<span class="cal-code-text">${escapeHtml(cat && cat.code ? cat.code : '–')}</span></span></td>
          <td class="cal-profil">${tasks.length
            ? `<button type="button" class="cal-toggle" data-key="${key}" aria-expanded="${open}"><span class="cal-chev">${icon('chevRight', 14)}</span><span class="cal-name">${name}</span></button>`
            : `<span class="cal-toggle is-static"><span class="cal-chev"></span><span class="cal-name">${name}</span></span>`}</td>
          <td class="cal-num">${fmtNum(r.count, 0)}</td>
          <td class="cal-num">${r.domain === 'idPPy' ? fmtNum(r.area, 1) : '–'}</td>
          ${monthCells(monthStates(tasks))}
        </tr>`;
      if (open) {
        for (const t of tasks) {
          body += `
        <tr class="cal-task">
          <td></td>
          <td class="cal-task-name">${escapeHtml(t.m)}</td>
          <td colspan="2"></td>
          ${monthCells(monthStates([t]))}
        </tr>`;
        }
      }
    }
    if (!rows.length) {
      body = '<tr><td colspan="16" class="cal-empty">Keine Pflegeelemente erfasst.</td></tr>';
    }
    calEl.innerHTML = `
      <thead><tr>
        <th class="cal-code" scope="col"><span class="cal-wide">Code</span></th>
        <th class="cal-profil" scope="col"><span class="cal-wide">Profil / Massnahme</span><span class="cal-narrow">Profil</span></th>
        <th class="cal-num" scope="col">Anzahl</th>
        <th class="cal-num" scope="col">Fläche m²</th>
        ${MONTHS.map(m => `<th class="cal-m" scope="col"><abbr title="${m}">${m[0]}</abbr></th>`).join('')}
      </tr></thead>
      <tbody>${body}</tbody>
      ${rows.length ? `<tfoot><tr>
        <td colspan="2">Total</td>
        <td class="cal-num">${fmtNum(children.length, 0)}</td>
        <td class="cal-num">${fmtNum(areaTotal, 1)}</td>
        <td class="cal-m" colspan="12"></td>
      </tr></tfoot>` : ''}`;
  }
  calEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button.cal-toggle');
    if (!btn) return;
    // Narrow layout: tasks and months are hidden, there is nothing to expand.
    if (getComputedStyle(btn.querySelector('.cal-chev')).display === 'none') return;
    const key = btn.dataset.key;
    openRow = openRow === key ? null : key;
    renderCalendar();
    const again = calEl.querySelector(`button.cal-toggle[data-key="${CSS.escape(key)}"]`);
    if (again) again.focus();
  });
  renderCalendar();

  // ── Show the page ─────────────────────────────────────────────────────────
  stateEl.hidden = true;
  $('site-titlebar').hidden = false;
  $('site-main').hidden = false;

  // ═════════════════════════════════════════════════════════════════════════
  // SITUATIONSPLAN — a MapLibre map limited to this Standort: perimeter,
  // its parcels and its elements, drawn by the same layers as the main map,
  // with the same legend (collapsed until asked for) and the same feature
  // card.  Phones: the card and a plain legend key sit below the map.
  // ═════════════════════════════════════════════════════════════════════════
  const mapFeatures = [site, ...parcels, ...children];
  const fc = { type: 'FeatureCollection', metadata: md, features: mapFeatures };
  // The view is fitted to the Standort and its elements, like the report's
  // map — not to the parcels: one neighbouring street or railway parcel
  // would shrink the Standort to a corner of the plan.
  const bounds = featuresBbox([site, ...children]);
  installAreaFillExpr(md.fk_profil_values || []);

  const geoUrl = (typeof rptGeoAdminUrl === 'function') ? rptGeoAdminUrl(sp) : null;
  if (geoUrl) { $('geoadmin-link').href = geoUrl; $('geoadmin-link').hidden = false; }

  const mapEl = $('map');
  const FIT = { padding: 32, maxZoom: ZOOM_TO_MAX };
  const m = new maplibregl.Map({
    container: 'map',
    style: BASEMAPS[0].url,
    bounds: bounds || undefined,
    fitBoundsOptions: FIT,
    maxZoom: 22,
    // Printing captures the WebGL canvas (see index.html's map).
    preserveDrawingBuffer: true,
    attributionControl: false,   // added below, compact (as on the main map)
    // The map sits in a scrolling page: the wheel and one finger scroll the
    // page; Ctrl/⌘ + wheel or two fingers move the map.
    cooperativeGestures: true,
    locale: {
      'CooperativeGesturesHandler.WindowsHelpText': 'Strg + Scrollen, um die Karte zu zoomen',
      'CooperativeGesturesHandler.MacHelpText': '⌘ + Scrollen, um die Karte zu zoomen',
      'CooperativeGesturesHandler.MobileHelpText': 'Karte mit zwei Fingern verschieben',
    },
  });
  // Same controls as the main map: zoom / north, home (= this Standort), 3D,
  // scale bar, basemap selector.  No fullscreen button.
  m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  m.addControl(new maplibregl.NavigationControl(), 'top-right');
  m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  let is3D = false;
  let treeData = null;
  const fitSite = () => { if (bounds) m.fitBounds(bounds, { ...FIT, pitch: is3D ? D3_PITCH : 0, bearing: 0, duration: 500 }); };
  const ctrls = new IconCtrl({
    buttons: [
      { key: 'home', title: 'Auf Standort zoomen', html: icon('home', 18), onClick: fitSite },
      { key: '3d', title: 'Zur 3D-Ansicht wechseln', html: '3D', onClick: () => set3D(!is3D) },
    ],
  });
  m.addControl(ctrls, 'top-right');
  function set3D(on) {
    is3D = on;
    set3DButtonState(ctrls.getButton('3d'), on);
    if (on) {
      if (!treeData) treeData = buildTreeExtrusionData(children);
      m.easeTo({ pitch: D3_PITCH, duration: 500 });
      add3DLayers(m, treeData);
      applyLegendFilters();
    } else {
      m.easeTo({ pitch: 0, duration: 500 });
      remove3DLayers(m);
    }
  }

  // ── Legend ────────────────────────────────────────────────────────────────
  // The main map's legend, limited to what this Standort has: groups that
  // open one at a time, an eye per group and per row.  Nothing is stored —
  // every visit starts with everything visible and the card collapsed.
  const legendGroups = buildLegendGroups(mapFeatures, md.codelists);
  const legendByKey = legendItemsByKey(legendGroups);
  const legendState = { hidden: new Set(), open: null, infoKey: null };
  const legendEl = $('legend');
  const legendPill = $('legend-toggle');
  const legendScroll = $('legend-scroll');
  const keyToggle = $('plan-key-toggle');
  const keyBody = $('plan-key-body');
  let legendOpen = false;

  function applyLegendFilters() {
    applyInventoryFilters(m, legendState.hidden, legendHiddenCodes(legendState.hidden, legendByKey), null);
  }
  function renderLegend() {
    const active = document.activeElement;
    const focusKey = active && legendScroll.contains(active) ? active.dataset.focus : null;
    legendScroll.innerHTML = legendListHtml(legendGroups, legendState);
    if (focusKey) {
      const again = legendScroll.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`);
      if (again) again.focus();
    }
    updateLegendSummary(legendGroups, legendState.hidden, legendByKey);
    // The plain key below the map (phones, print) lists the same rows.
    keyBody.innerHTML = legendKeyHtml(legendGroups, legendState.hidden);
  }
  function setLegendOpen(open, focus) {
    legendOpen = open;
    legendEl.hidden = !open;
    mapEl.classList.toggle('legend-open', open);
    legendPill.setAttribute('aria-expanded', String(open));
    if (focus) (open ? $('legend-close') : legendPill).focus();
  }
  legendPill.addEventListener('click', () => {
    // A narrow map has room for one panel: the legend or the feature card.
    if (!legendOpen && mapEl.clientWidth < 700) clearSelection();
    setLegendOpen(!legendOpen, true);
  });
  $('legend-close').addEventListener('click', () => setLegendOpen(false, true));
  legendScroll.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const hidden = legendState.hidden;
    switch (btn.dataset.act) {
      case 'group-eye': {
        const g = legendGroups.find(x => x.id === btn.dataset.gid);
        if (!g) return;
        toggleLegendGroupKeys(g, hidden);
        applyLegendFilters();
        break;
      }
      case 'item-eye': {
        const key = btn.dataset.key;
        if (!legendByKey[key]) return;
        if (hidden.has(key)) hidden.delete(key); else hidden.add(key);
        applyLegendFilters();
        break;
      }
      case 'group-open':
        legendState.open = legendState.open === btn.dataset.gid ? null : btn.dataset.gid;
        break;
      default: return;
    }
    renderLegend();
  });
  $('legend-show-all').addEventListener('click', () => {
    legendState.hidden.clear();
    applyLegendFilters();
    renderLegend();
  });
  $('plan-key-count').textContent = String(legendGroups.reduce((n, g) => n + g.items.length, 0));
  keyToggle.addEventListener('click', () => {
    const open = keyBody.hidden;
    keyBody.hidden = !open;
    keyToggle.setAttribute('aria-expanded', String(open));
  });
  renderLegend();

  // ── Selection + feature card ──────────────────────────────────────────────
  // A click selects what is under the pointer — the same card, facts and
  // pager as on the main map (mappanels.js).  There is no «Standort-Details»
  // link here: this page is it.
  const cardEl = $('feature-card');
  let selectedId = null;
  // Phones: the card sits below the map instead of covering it.
  function placeCard() {
    const host = isCompactLayout() ? $('plan-card-slot') : mapEl;
    if (cardEl.parentElement !== host) host.appendChild(cardEl);
  }
  const featureCard = createFeatureCard({
    el: cardEl,
    mapEl,
    feature: (idx) => inv.features[idx],
    onPage: (idx, stack) => selectFeature(idx, stack),
    onClose: () => clearSelection(),
    onZoom: (idx) => zoomToFeature(idx),
  });
  function selectFeature(idx, stack) {
    if (!inv.features[idx]) return;
    selectedId = idx;
    setSelectionFilter(m, idx);
    if (legendOpen && mapEl.clientWidth < 700) setLegendOpen(false);
    featureCard.show(idx, stack);
    if (isCompactLayout()) cardEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function clearSelection() {
    if (selectedId === null) return;
    selectedId = null;
    setSelectionFilter(m, null);
    featureCard.hide();
  }
  // Padding for camera moves, so a feature is framed in the part of the map
  // that the legend and the card leave free.
  function viewPadding() {
    const w = mapEl.clientWidth, h = mapEl.clientHeight;
    const pad = Math.min(48, Math.floor(h / 6));
    if (isCompactLayout() || w < 900) return pad;
    return {
      top: pad, bottom: pad,
      left: legendOpen ? legendEl.offsetWidth + 36 : pad,
      right: cardEl.hidden ? pad : cardEl.offsetWidth + 80,
    };
  }
  function zoomToFeature(idx) {
    const f = inv.features[idx];
    if (!f || !f.geometry) return;
    m.fitBounds(geomBbox(f.geometry), { padding: viewPadding(), maxZoom: ZOOM_TO_MAX });
    // Phones: the button is below the map — bring the map back into view.
    if (isCompactLayout()) mapEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  bindFeatureHover(m, (id) => setHoverFilter(m, id));
  m.on('click', (e) => {
    const stack = featureStackAt(m, e.point, inv.features);
    // An empty spot, or a second click on the selected feature, deselects.
    if (!stack.length || stack[0] === selectedId) { clearSelection(); return; }
    selectFeature(stack[0], stack);
  });
  placeCard();
  LAYOUT_MQ.compact.addEventListener('change', () => {
    placeCard();
    if (isCompactLayout()) setLegendOpen(false);
  });

  // ── Layers ────────────────────────────────────────────────────────────────
  // This map shows one Standort: its elements are drawn at every zoom (the
  // main map draws Standorte as points only when zoomed out).
  const addLayers = () => {
    addInventoryLayers(m, fc, { detailMinZoom: 0 });
    applyLegendFilters();
    setSelectionFilter(m, selectedId);
  };
  installPatternImages(m);
  m.on('load', () => {
    addLayers();
    m.resize();
  });
  initBasemapSwitcher(m, {
    sourceIds: () => INVENTORY_SOURCE_IDS,
    layerIds: inventoryLayerIds,
    onStyleRestored: () => {
      ensurePatternImages(m);
      addLayers();
      if (is3D) add3DLayers(m, treeData || (treeData = buildTreeExtrusionData(children)));
    },
  });
  // The map's height follows the window: keep the canvas in step.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => m.resize()).observe(mapEl);
  }
  // Handle for the browser console and the UI tests.
  window.__planMap = m;

  // Context menu: the clicked point in LV95 and WGS 84, a click copies a row.
  (function initCoordMenu() {
    const menu = $('map-context-menu');
    const lv95Text = $('context-menu-lv95-text');
    const wgs84Text = $('context-menu-wgs84-text');
    const hide = () => menu.classList.remove('show');
    const open = (point, lngLat) => {
      const c = coordTexts(lngLat);
      lv95Text.textContent = c.lv95;
      wgs84Text.textContent = c.wgs84;
      placeMenuAt(menu, mapEl, point);
    };
    m.on('contextmenu', (e) => { e.preventDefault(); open(e.point, e.lngLat); });
    attachLongPress(m, mapEl, open);
    m.on('click', hide);
    m.on('movestart', hide);
    document.addEventListener('click', hide);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    for (const textEl of [lv95Text, wgs84Text]) {
      textEl.closest('.context-menu-coord').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (await copyText(textEl.textContent)) setTimeout(hide, 300);
      });
    }
  })();

  // ═════════════════════════════════════════════════════════════════════════
  // ACTIONS — Teilen, Exportieren (PDF · Excel · GeoJSON · Drucken)
  // ═════════════════════════════════════════════════════════════════════════
  $('share-btn').addEventListener('click', () => shareUrl(location.href, document.title));

  const exportWrap = $('export-wrap');
  const exportBtn = $('export-btn');
  const exportMenu = $('export-menu');
  function setExportOpen(open) {
    exportMenu.hidden = !open;
    exportBtn.setAttribute('aria-expanded', String(open));
    if (open) exportMenu.querySelector('.menu-item').focus();
  }
  exportBtn.addEventListener('click', (e) => { e.stopPropagation(); setExportOpen(exportMenu.hidden); });
  document.addEventListener('click', (e) => { if (!exportWrap.contains(e.target)) setExportOpen(false); });
  exportWrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !exportMenu.hidden) { setExportOpen(false); exportBtn.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...exportMenu.querySelectorAll('.menu-item')];
    const i = items.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
  });

  // Excel: Stammdaten · Pflegeelemente (the table's columns) · Pflegekalender
  // (with frequency and material per task).
  function exportExcel() {
    if (typeof XLSX === 'undefined') { showToast('Excel-Bibliothek nicht geladen', 'error'); return; }
    const wb = XLSX.utils.book_new();
    const stammAoa = [['Gruppe', 'Attribut', 'Wert'], ['Standort', 'Name', sp.name || '']];
    for (const g of stamm) for (const [k, v] of g.rows) stammAoa.push([g.title, k, isUnset(v) ? '' : v]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stammAoa), 'Stammdaten');

    const elementRows = children.map(f => ({ ...f.properties, _idx: f.id }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tableExportAoa(elementRows)), 'Pflegeelemente');

    // Months: x = stated in the BBL Standard, (x) = estimated.
    const mark = (states) => states.map(st => st === 2 ? 'x' : st === 1 ? '(x)' : '');
    const calAoa = [['Code', 'Profil', 'Massnahme', 'Bemerkung', 'Häufigkeit pro Jahr', 'Material (geschätzt)',
                     'Anzahl', 'Fläche m²', ...MONTHS]];
    for (const r of rows) {
      const cat = careProfile(r.entity_type, r.code);
      const tasks = (cat && cat.tasks) || [];
      calAoa.push([cat && cat.code ? cat.code : '', r.label, '', '', '', '',
                   r.count, r.domain === 'idPPy' ? Math.round(r.area * 10) / 10 : '', ...mark(monthStates(tasks))]);
      for (const t of tasks) {
        calAoa.push(['', '', t.m || '', t.b || '', t.h || '', t.mat || '', '', '', ...mark(monthStates([t]))]);
      }
    }
    calAoa.push(['', 'Total', '', '', '', '', children.length, Math.round(areaTotal * 10) / 10]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(calAoa), 'Pflegekalender');
    XLSX.writeFile(wb, fileStem + '.xlsx');
  }

  exportMenu.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-export]');
    if (!item || item.dataset.busy === '1') return;
    const kind = item.dataset.export;
    if (kind === 'pdf') {
      // The report captures two basemaps: give feedback while it runs.
      item.dataset.busy = '1';
      item.classList.add('is-busy');
      try {
        await buildStandortReport(sp.objectid, { features: inv.features, notify: showToast });
      } catch (err) {
        console.error(err);
        showToast('Bericht konnte nicht erstellt werden', 'error');
      } finally {
        item.dataset.busy = '';
        item.classList.remove('is-busy');
      }
    } else if (kind === 'xlsx') {
      try { exportExcel(); } catch (err) { console.error(err); showToast('Excel-Export fehlgeschlagen', 'error'); }
    } else if (kind === 'geojson') {
      // The perimeter and every maintenance element, WGS 84 (RFC 7946).
      downloadGeoJSON([site, ...children], fileStem + '.geojson');
    } else if (kind === 'print') {
      setExportOpen(false);
      m.triggerRepaint();
      setTimeout(() => window.print(), 50);
      return;
    }
    setExportOpen(false);
    exportBtn.focus();
  });
})();
