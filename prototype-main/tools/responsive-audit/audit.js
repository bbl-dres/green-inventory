// Device × UI-state matrix: one screenshot + one metrics record per cell.
// usage: node audit.js <outDir> [deviceIds,comma] [stateIds,comma]
// env:   APP_URL (default http://127.0.0.1:8000/prototype-main/), OFFLINE=1
const fs = require('fs');
const path = require('path');
const { APP_URL, launch, newContext, waitForApp, settle } = require('./lib');
const DEVICES = require('./devices');
const collectMetrics = require('./metrics');

const outDir = path.resolve(process.argv[2] || 'out');
const devFilter = process.argv[3] ? process.argv[3].split(',') : null;
const stFilter = process.argv[4] ? process.argv[4].split(',') : null;
fs.mkdirSync(outDir, { recursive: true });

const isCompact = (page) => page.evaluate(() =>
  getComputedStyle(document.getElementById('sidebar')).position === 'fixed');

async function tapOrClick(page, dev, x, y) {
  if (dev.touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}
async function tapSel(page, dev, sel) {
  const el = await page.$(sel);
  if (!el) return false;
  const b = await el.boundingBox();
  if (!b) return false;
  await tapOrClick(page, dev, b.x + b.width / 2, b.y + b.height / 2);
  return true;
}

async function resetUi(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.dd-wrap.open').forEach(e => e.classList.remove('open'));
    document.getElementById('search-results').classList.remove('active');
    document.getElementById('map-context-menu').classList.remove('show');
    try { clearSelection(); } catch (_) {}
    if (typeof tableOpen !== 'undefined' && tableOpen) document.getElementById('tbl-toggle').click();
    const fsb = document.getElementById('filter-sidebar');
    if (!fsb.classList.contains('collapsed')) document.getElementById('filter-sidebar-close').click();
  });
}

async function fitDemoSite(page) {
  return page.evaluate(() => {
    const counts = {};
    for (const f of geojsonData.features) {
      const p = f.properties;
      if (p.entity_type === 'site' || p.entity_type === 'site_location' || p.site_oid == null) continue;
      counts[p.site_oid] = (counts[p.site_oid] || 0) + 1;
    }
    // Prefer a mid-sized site (dense but compact) for a readable zoomed view.
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const oid = Number((ranked[3] || ranked[0])[0]);
    const site = geojsonData.features.find(f => f.properties.entity_type === 'site' && f.properties.objectid === oid);
    const bb = geomBbox(site.geometry);
    map.fitBounds(bb, { padding: 30, animate: false, maxZoom: 19 });
    return { oid, name: site.properties.name, n: counts[oid], zoom: map.getZoom() };
  });
}

// Find a tree/point in the lower part of the visible map (where an
// auto-opening table would cover it) and return its viewport coordinates.
async function findLowerFeature(page) {
  return page.evaluate(() => {
    const mr = document.getElementById('map').getBoundingClientRect();
    const w = mr.width, h = mr.height;
    for (const frac of [0.72, 0.66, 0.78, 0.6, 0.55]) {
      const y = h * frac;
      const feats = map.queryRenderedFeatures([[w * 0.15, y - 30], [w * 0.85, y + 30]],
        { layers: ['tree-circle', 'point-circle', 'area-fill'].filter(l => map.getLayer(l)) });
      const f = feats.find(f => f.layer.id !== 'area-fill') || feats[0];
      if (!f) continue;
      let pt;
      if (f.geometry.type === 'Point') pt = map.project(f.geometry.coordinates);
      else pt = { x: w / 2, y };
      return { x: mr.left + pt.x, y: mr.top + pt.y, frac, id: f.id, layer: f.layer.id };
    }
    return null;
  });
}

const STATES = {
  async initial(page, dev) { /* as loaded */ },
  async zoomed(page, dev, ctx) { await resetUi(page); ctx.site = await fitDemoSite(page); },
  async table(page, dev, ctx) {
    await resetUi(page); await fitDemoSite(page);
    await tapSel(page, dev, '#tbl-toggle');
    await page.waitForTimeout(400);
  },
  async tap(page, dev, ctx) {
    await resetUi(page); await fitDemoSite(page); await settle(page);
    const t = await findLowerFeature(page);
    ctx.tapTarget = t;
    if (t) await tapOrClick(page, dev, t.x, t.y);
    // table transition + resize + reveal pan all need to finish
    await page.waitForTimeout(1300);
  },
  async legend(page, dev) {
    await resetUi(page);
    // Open the legend wherever it starts closed (phones; tablets after the fix).
    const shown = await page.evaluate(() => getComputedStyle(document.getElementById('legend-toggle')).display !== 'none');
    if (shown) await tapSel(page, dev, '#legend-toggle');
    await page.waitForTimeout(450);
  },
  async basemap(page, dev) {
    await resetUi(page);
    await page.evaluate(() => { const sb = document.getElementById('sidebar');
      if (getComputedStyle(sb).position === 'fixed' && !sb.classList.contains('collapsed')) document.getElementById('sidebar-close').click(); });
    await page.waitForTimeout(300);
    await tapSel(page, dev, '#bm-btn');
    await page.waitForTimeout(300);
  },
  async filter(page, dev) {
    await resetUi(page);
    await page.evaluate(() => { const sb = document.getElementById('sidebar');
      if (getComputedStyle(sb).position === 'fixed' && !sb.classList.contains('collapsed')) document.getElementById('sidebar-close').click(); });
    await tapSel(page, dev, '#filter-toggle');
    await page.waitForTimeout(450);
  },
  async search(page, dev) {
    await resetUi(page);
    await page.evaluate(() => { const sb = document.getElementById('sidebar');
      if (getComputedStyle(sb).position === 'fixed' && !sb.classList.contains('collapsed')) document.getElementById('sidebar-close').click(); });
    await tapSel(page, dev, '#search-input');
    await page.keyboard.type('Bern', { delay: 20 });
    await page.waitForSelector('#search-results.active', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(200);
  },
  async columns(page, dev) {
    await resetUi(page); await fitDemoSite(page);
    await tapSel(page, dev, '#tbl-toggle');
    await page.waitForTimeout(400);
    await tapSel(page, dev, '#col-dd-btn');
    await page.waitForTimeout(200);
  },
  async context(page, dev) {
    await resetUi(page); await fitDemoSite(page);
    const mr = await page.evaluate(() => { const r = document.getElementById('map').getBoundingClientRect(); return { x: r.left + r.width * 0.8, y: r.top + r.height * 0.75 }; });
    if (!dev.touch) {
      await page.mouse.click(mr.x, mr.y, { button: 'right' });
    } else {
      // Long-press via CDP touch events (what a finger does on a phone)
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mr.x, y: mr.y }] });
      await page.waitForTimeout(900);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await page.waitForTimeout(300);
  },
};

(async () => {
  const browser = await launch();
  const devices = DEVICES.filter(d => !devFilter || devFilter.includes(d.id));
  const results = {};
  for (const dev of devices) {
    const ctx = await newContext(browser, dev);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const t0 = Date.now();
    await page.goto(APP_URL, { waitUntil: 'load' });
    await waitForApp(page);
    await settle(page);
    const r = results[dev.id] = { device: dev, loadMs: Date.now() - t0, states: {} };
    const sctx = {};
    for (const [sid, fn] of Object.entries(STATES)) {
      if (stFilter && !stFilter.includes(sid)) continue;
      try {
        await fn(page, dev, sctx);
        await settle(page, 250);
        const m = await page.evaluate(collectMetrics);
        if (sctx.tapTarget && sid === 'tap') m.tapTarget = sctx.tapTarget;
        if (sid === 'zoomed' && sctx.site) m.site = sctx.site;
        r.states[sid] = m;
        await page.screenshot({ path: path.join(outDir, `${dev.id}__${sid}.png`) });
      } catch (e) {
        r.states[sid] = { error: String(e && e.message || e) };
        console.error(dev.id, sid, e.message);
      }
    }
    r.errors = errors.filter(e => !/WebGL|GL Driver|swiftshader/i.test(e)).slice(0, 20);
    console.log(`${dev.id.padEnd(10)} ${dev.w}x${dev.h}@${dev.dpr}  load ${r.loadMs}ms  errors ${r.errors.length}`);
    await ctx.close();
  }
  fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(results, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
