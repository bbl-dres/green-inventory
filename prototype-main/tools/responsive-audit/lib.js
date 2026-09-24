// Shared helpers: browser / context setup, optional offline routing, and
// "app ready" waits.
//
// OFFLINE=1 serves the CDN libraries from node_modules, replaces the basemap
// styles with a plain background (fonts from tileserver-gl-styles) and mocks
// the geo.admin search, so the audit also runs where outbound CDNs are
// blocked.  UI chrome is unaffected; only the basemap looks different.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:8000/prototype-main/';
const OFFLINE = process.env.OFFLINE === '1';
const NM = path.join(__dirname, 'node_modules');

// --enable-unsafe-swiftshader: explicit software WebGL for GPU-less machines
// (CI, containers) — Chromium's automatic fallback is deprecated, and MapLibre
// needs WebGL.
function launch() {
  return chromium.launch({
    args: ['--enable-unsafe-swiftshader'],
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
}

async function newContext(browser, dev) {
  const ctx = await browser.newContext({
    viewport: { width: dev.w, height: dev.h },
    deviceScaleFactor: dev.dpr,
    isMobile: dev.group === 'phone',
    hasTouch: !!dev.touch,
    locale: 'de-CH',
  });
  if (OFFLINE) await installOfflineRoutes(ctx);
  return ctx;
}

const STYLE_BG = { 'positron': '#f4f3f0', 'dark-matter': '#262630', 'voyager': '#efe9dd', 'imagerybasemap': '#43503f' };
const offlineStyle = (bg) => JSON.stringify({
  version: 8, name: 'offline-standin',
  glyphs: 'https://offline.local/fonts/{fontstack}/{range}.pbf',
  sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': bg } }],
});
const thumbSvg = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${bg}"/></svg>`;

async function installOfflineRoutes(ctx) {
  const file = (route, f, type) => route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(f) });
  const fontDir = path.join(NM, 'tileserver-gl-styles/fonts/Noto Sans Regular');
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => {
    const url = route.request().url();
    if (/maplibre-gl@.*\.js$/.test(url)) return file(route, path.join(NM, 'maplibre-gl/dist/maplibre-gl.js'), 'application/javascript');
    if (/maplibre-gl@.*\.css$/.test(url)) return file(route, path.join(NM, 'maplibre-gl/dist/maplibre-gl.css'), 'text/css');
    if (/xlsx|jspdf/.test(url)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    if (url.endsWith('style.json')) {
      const key = Object.keys(STYLE_BG).find(k => url.includes(k)) || 'positron';
      return route.fulfill({ status: 200, contentType: 'application/json', body: offlineStyle(STYLE_BG[key]) });
    }
    if (url.startsWith('https://offline.local/fonts/')) {
      const f = path.join(fontDir, decodeURIComponent(url.split('/').pop()));
      return fs.existsSync(f) ? file(route, f, 'application/x-protobuf') : route.fulfill({ status: 404, body: '' });
    }
    if (/basemaps\.cartocdn\.com\/(light_all|dark_all|rastertiles)|wmts\.geo\.admin\.ch/.test(url)) {
      const bg = url.includes('dark_all') ? '#262630' : url.includes('voyager') ? '#efe9dd' : url.includes('geo.admin') ? '#4d5c3f' : '#f4f3f0';
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: thumbSvg(bg) });
    }
    if (url.includes('SearchServer') && url.includes('type=locations')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [
        { attrs: { label: '<b>Bern</b> (BE)', lat: 46.948, lon: 7.4474, zoomlevel: 12 } },
        { attrs: { label: '<b>Bern</b>strasse 12 3072 Ostermundigen', lat: 46.956, lon: 7.487, zoomlevel: 16 } },
      ] }) });
    }
    if (url.includes('SearchServer') && url.includes('type=layers')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [
        { attrs: { label: 'Amtliche Vermessung (Liegenschaften, Grundstücke)', layer: 'ch.swisstopo-vd.amtliche-vermessung' } },
      ] }) });
    }
    return route.abort('blockedbyclient');
  });
}

// Wait until data is joined, layers are added and the map has rendered.
async function waitForApp(page) {
  await page.waitForFunction(() =>
    typeof geojsonData !== 'undefined' && geojsonData &&
    typeof map !== 'undefined' && map.getLayer && map.getLayer('area-fill') &&
    document.querySelector('#tbl tbody tr'), null, { timeout: 90000 });
  await settle(page, 300);
}

async function settle(page, ms = 450) {
  await page.waitForTimeout(ms);
  await page.evaluate(() => new Promise(res => {
    try { map.once('idle', () => res()); map.triggerRepaint(); } catch (_) { res(); }
    setTimeout(res, 1500);
  }));
}

module.exports = { APP_URL, OFFLINE, launch, newContext, waitForApp, settle };
