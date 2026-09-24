// In-page measurement function (self-contained: serialized into page.evaluate).
module.exports = function collectMetrics(opts) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const R = el => el.getBoundingClientRect();
  const rnd = v => Math.round(v * 10) / 10;

  function isShown(el) {
    if (!el || !el.isConnected) return false;
    const r = R(el);
    if (r.width < 0.5 || r.height < 0.5) return false;
    for (let a = el; a && a.nodeType === 1; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    }
    return visibleRect(el) !== null;
  }
  // Intersection of the element's rect with viewport + every clipping ancestor.
  function visibleRect(el) {
    let r = R(el);
    let x1 = Math.max(r.left, 0), y1 = Math.max(r.top, 0), x2 = Math.min(r.right, vw), y2 = Math.min(r.bottom, vh);
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.position === 'fixed') { /* fixed escapes nothing but viewport */ }
      if (/(hidden|clip|auto|scroll)/.test(cs.overflow + cs.overflowX + cs.overflowY)) {
        const ar = R(a);
        x1 = Math.max(x1, ar.left); y1 = Math.max(y1, ar.top);
        x2 = Math.min(x2, ar.right); y2 = Math.min(y2, ar.bottom);
      }
    }
    if (x2 - x1 < 0.5 || y2 - y1 < 0.5) return null;
    return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 };
  }
  function desc(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
    const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return t ? s + ' "' + t + '"' : s;
  }

  // ── Colour / contrast ──
  function parseColor(c) {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function lum({ r, g, b }) {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function blend(fg, bg, a) { return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) }; }
  function effectiveBg(el) {
    const layers = [];
    for (let a = el; a && a.nodeType === 1; a = a.parentElement) {
      const c = parseColor(getComputedStyle(a).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let bg = { r: 255, g: 255, b: 255 };
    for (let i = layers.length - 1; i >= 0; i--) bg = blend(layers[i], bg, layers[i].a);
    return bg;
  }
  function cumOpacity(el) { let o = 1; for (let a = el; a && a.nodeType === 1; a = a.parentElement) o *= +getComputedStyle(a).opacity; return o; }
  function contrastOf(el, colorStr) {
    const fg = parseColor(colorStr || getComputedStyle(el).color);
    if (!fg) return null;
    const bg = effectiveBg(el);
    const eff = blend(fg, bg, fg.a * cumOpacity(el));
    const L1 = lum(eff), L2 = lum(bg);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  }

  const out = { vw, vh, dpr: window.devicePixelRatio };
  out.pageOverflowX = document.documentElement.scrollWidth - vw;
  out.pageOverflowY = document.documentElement.scrollHeight - vh;

  const mapEl = document.getElementById('map');
  const mr = R(mapEl);
  const tp = document.getElementById('table-panel');
  const tr = R(tp);
  const hdr = R(document.getElementById('header'));
  const ftr = R(document.getElementById('footer'));
  const sb = document.getElementById('sidebar'), fsb = document.getElementById('filter-sidebar');
  out.layout = {
    header: rnd(hdr.height), footer: rnd(ftr.height), footerVisible: isShown(document.getElementById('footer')),
    map: { w: rnd(mr.width), h: rnd(mr.height) },
    mapShareOfViewport: rnd(100 * (mr.width * Math.max(0, mr.height)) / (vw * vh)),
    table: { h: rnd(tr.height), open: !tp.classList.contains('collapsed') },
    legend: { w: rnd(R(sb).width), shown: isShown(sb), overlay: getComputedStyle(sb).position === 'fixed' },
    filter: { w: rnd(R(fsb).width), shown: isShown(fsb), overlay: getComputedStyle(fsb).position === 'fixed' },
    resizeHandle: (() => { const h = document.getElementById('tbl-resize-handle'); return isShown(h) ? rnd(R(h).height) : 0; })(),
  };
  // canvas vs container (stale-size check)
  const cv = map.getCanvas();
  out.layout.canvasCss = { w: rnd(cv.clientWidth), h: rnd(cv.clientHeight) };

  // Header internals
  const si = document.getElementById('search-input');
  const header = document.getElementById('header');
  out.header = {
    searchInputW: isShown(si) ? rnd(R(si).width) : 0,
    searchBoxW: rnd(R(document.getElementById('search-container')).width),
    overflow: header.scrollWidth - header.clientWidth,
    titleW: rnd(R(document.querySelector('.header-title')).width),
    buttons: [...document.querySelectorAll('.header-right > *')].filter(isShown).map(b => ({ el: desc(b), w: rnd(R(b).width), h: rnd(R(b).height) })),
    hiddenButtons: [...document.querySelectorAll('.header-right > *')].filter(b => !isShown(b)).map(desc),
  };
  // Placeholder truncation: does the placeholder fit?
  if (isShown(si)) {
    const c = document.createElement('canvas').getContext('2d');
    const cs = getComputedStyle(si);
    c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    const need = c.measureText(si.placeholder).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    out.header.placeholderFits = need <= si.clientWidth;
    out.header.placeholderNeed = rnd(need);
  }

  // Table action bar
  const bar = document.getElementById('tbl-action-bar');
  if (!tp.classList.contains('collapsed')) {
    const barR = R(bar);
    out.actionBar = {
      h: rnd(barR.height), overflow: bar.scrollWidth - bar.clientWidth,
      clippedChildren: [...bar.querySelectorAll('#tbl-search-wrap, #tbl-tabs, .tbl-tab, .dd-btn')].filter(e => {
        const r = R(e); return r.right > Math.min(barR.right, vw) + 0.5 || r.left < barR.left - 0.5;
      }).map(desc),
      searchW: rnd(R(document.getElementById('tbl-search')).width),
    };
    const ts = document.getElementById('table-scroll');
    const tsr = R(ts);
    const rows = [...document.querySelectorAll('#tbl tbody tr')];
    out.tableBody = {
      scrollH: rnd(tsr.height),
      visibleRows: rows.filter(r => { const rr = R(r); return rr.top >= tsr.top - 1 && rr.bottom <= tsr.bottom + 1; }).length,
      rowH: rows[0] ? rnd(R(rows[0]).height) : 0,
      cols: document.querySelectorAll('#tbl thead th').length,
      fullyVisibleCols: [...document.querySelectorAll('#tbl thead th')].filter(th => R(th).right <= Math.min(tsr.right, vw) + 1 && R(th).left >= tsr.left - 1).length,
      tableW: rnd(R(document.getElementById('tbl')).width), scrollW: rnd(tsr.width),
    };
    const pg = document.getElementById('tbl-pagination');
    out.pagination = { h: rnd(R(pg).height), overflow: pg.scrollWidth - pg.clientWidth, shown: isShown(pg) };
  }

  // Floating map controls: visibility + pairwise overlaps
  const floats = {
    legendBtn: '#legend-toggle', banner: '#map-prototype-banner', ctrlTR: '.maplibregl-ctrl-top-right',
    basemap: '#basemap-switcher', tblToggle: '#tbl-toggle', scale: '.maplibregl-ctrl-scale',
    attrib: '.maplibregl-ctrl-attrib', measure: '.measure-distance-display', popup: '.maplibregl-popup',
  };
  const fr = {};
  for (const [k, sel] of Object.entries(floats)) {
    const el = document.querySelector(sel);
    if (el && isShown(el)) { const r = R(el); fr[k] = { x: rnd(r.left), y: rnd(r.top), w: rnd(r.width), h: rnd(r.height) }; }
  }
  // Empty nav group (buttons hidden but box still painted)
  const navGroups = [...document.querySelectorAll('.maplibregl-ctrl-top-right .maplibregl-ctrl-group')];
  out.emptyCtrlGroups = navGroups.filter(g => isShown(g) && ![...g.querySelectorAll('button')].some(isShown)).length;
  out.floats = fr;
  const overlaps = [];
  const ks = Object.keys(fr);
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const a = fr[ks[i]], b = fr[ks[j]];
    const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ix > 1 && iy > 1 && ks[i] !== 'popup' && ks[j] !== 'popup') overlaps.push(ks[i] + '×' + ks[j] + ' (' + rnd(ix) + '×' + rnd(iy) + ')');
  }
  out.floatOverlaps = overlaps;
  // Floats covered by the table panel (map chrome hidden behind the table)
  if (!tp.classList.contains('collapsed')) {
    out.floatsUnderTable = ks.filter(k => fr[k].y + fr[k].h > tr.top + 1 && k !== 'popup');
  }

  // Popup: how much of it is actually visible (not under the table/header, inside viewport)
  const pu = document.querySelector('.maplibregl-popup');
  if (pu) {
    const r = R(pu);
    const top = Math.max(r.top, mr.top), bottom = Math.min(r.bottom, tp.classList.contains('collapsed') ? mr.bottom : tr.top, vh);
    const left = Math.max(r.left, 0), right = Math.min(r.right, vw);
    const visA = Math.max(0, right - left) * Math.max(0, bottom - top);
    out.popup = { w: rnd(r.width), h: rnd(r.height), visiblePct: rnd(100 * visA / (r.width * r.height)) };
    const tip = pu.querySelector('.maplibregl-popup-tip');
    if (tip) { const t = R(tip); out.popup.anchorVisible = t.top >= mr.top && t.bottom <= (tp.classList.contains('collapsed') ? mr.bottom : tr.top); }
    const body = pu.querySelector('.pu-body');
    if (body) out.popup.bodyScrollable = body.scrollHeight > body.clientHeight + 1;
  }

  // Touch targets
  const TSEL = 'button, a[href], input, select, textarea, [role="tab"], label.filter-check-item, label.col-check-item, .dd-item, .context-menu-item, .search-item[data-action], #tbl th, #tbl tbody tr';
  const targets = [...document.querySelectorAll(TSEL)].filter(el => {
    if (!isShown(el)) return false;
    if (getComputedStyle(el).pointerEvents === 'none') return false;
    if (el.matches('input[type=checkbox]') && el.closest('label')) return false;  // label is the target
    if (el.closest('.maplibregl-ctrl-attrib-inner')) return false;                  // inline attribution links
    return true;
  });
  const small24 = [], small44 = [];
  for (const el of targets) {
    const r = R(el);
    const w = r.width, h = r.height;
    if (w < 24 || h < 24) small24.push(desc(el) + ' ' + rnd(w) + '×' + rnd(h));
    else if (w < 44 || h < 44) small44.push(desc(el) + ' ' + rnd(w) + '×' + rnd(h));
  }
  out.targets = { total: targets.length, under24: small24.length, under44: small44.length, under24List: small24.slice(0, 40), under44List: small44.slice(0, 40) };

  // Text sizes + contrast
  const sizeCount = {};
  const tiny = new Set();
  const lowContrast = [];
  const seen = new Set();
  const all = document.querySelectorAll('body *:not(script):not(style):not(svg *):not(canvas)');
  for (const el of all) {
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!hasText || !isShown(el)) continue;
    if (el.closest(':disabled')) continue;   // inactive controls are exempt (WCAG 1.4.3)
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    sizeCount[fs] = (sizeCount[fs] || 0) + 1;
    if (fs < 12) tiny.add(fs + 'px ' + desc(el).slice(0, 48));
    const cr = contrastOf(el);
    const large = fs >= 24 || (fs >= 18.66 && +cs.fontWeight >= 700);
    if (cr && cr < (large ? 3 : 4.5)) {
      const key = desc(el).slice(0, 40);
      if (!seen.has(key)) { seen.add(key); lowContrast.push(rnd(cr) + ':1 ' + fs + 'px ' + key); }
    }
  }
  out.text = { sizes: sizeCount, under12: tiny.size, under12List: [...tiny].slice(0, 30), lowContrast: lowContrast.slice(0, 40), lowContrastCount: lowContrast.length };
  // Placeholders
  out.placeholders = [...document.querySelectorAll('input[placeholder]')].filter(isShown).map(i =>
    desc(i).slice(0, 30) + ' ' + rnd(contrastOf(i, getComputedStyle(i, '::placeholder').color)) + ':1');
  // Inputs that trigger iOS focus-zoom (<16px)
  out.iosZoomInputs = [...document.querySelectorAll('input:not([type=checkbox]):not([type=range]), select, textarea')]
    .filter(isShown).filter(i => parseFloat(getComputedStyle(i).fontSize) < 16).map(i => desc(i).slice(0, 30) + ' ' + getComputedStyle(i).fontSize);

  // Search results panel
  const res = document.getElementById('search-results');
  if (res && res.classList.contains('active')) {
    const r = R(res);
    out.searchResults = { w: rnd(r.width), h: rnd(r.height), bottomOverflow: rnd(r.bottom - vh), rightOverflow: rnd(r.right - vw), left: rnd(r.left) };
  }
  // Open dropdown menus
  const dd = document.querySelector('.dd-wrap.open .dd-menu');
  if (dd) { const r = R(dd); out.dropdown = { w: rnd(r.width), h: rnd(r.height), x: rnd(r.left), y: rnd(r.top), offscreen: r.right > vw || r.bottom > vh || r.left < 0 || r.top < 0 }; }
  const cm = document.querySelector('#map-context-menu.show');
  if (cm) { const r = R(cm); out.contextMenu = { w: rnd(r.width), h: rnd(r.height), offscreen: r.right > vw || r.bottom > vh || r.left < 0 || r.top < 0 }; }
  // Drawer occlusion: is anything painted on top of an open drawer?
  out.drawerOcclusion = [];
  for (const id of ['sidebar', 'filter-sidebar']) {
    const d = document.getElementById(id);
    if (!isShown(d) || getComputedStyle(d).position !== 'fixed') continue;
    const r = R(d);
    for (let fx = 0.1; fx < 1; fx += 0.2) for (let fy = 0.02; fy < 0.3; fy += 0.06) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      const e = document.elementFromPoint(x, y);
      if (e && !d.contains(e)) { out.drawerOcclusion.push(id + ' covered by ' + desc(e).slice(0, 40)); break; }
    }
  }
  out.drawerOcclusion = [...new Set(out.drawerOcclusion)];
  // Basemap picker options inside the viewport?
  const bmp = document.getElementById('bm-panel');
  if (bmp && bmp.classList.contains('open')) {
    const opts = [...bmp.querySelectorAll('.bm-option')];
    out.basemapPanel = { options: opts.length, offscreen: opts.filter(o => { const r = R(o); return r.left < 0 || r.right > vw || r.top < 0 || r.bottom > vh; }).length };
  }
  // Header overflow menu
  const mw = document.getElementById('more-wrap');
  out.moreMenu = mw ? isShown(mw) : false;
  // Toasts overflowing
  out.toasts = [...document.querySelectorAll('.toast')].map(t => { const r = R(t); return { w: rnd(r.width), overflow: r.left < 0 || r.right > vw }; });
  return out;
};
