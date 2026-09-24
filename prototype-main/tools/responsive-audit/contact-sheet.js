// Contact sheet from screenshots.
// usage: node contact-sheet.js out.jpg <columnWidthPx> <columns> "Caption|path.png" ...
const fs = require('fs');
const { launch } = require('./lib');

(async () => {
  const [outFile, colW, cols, ...items] = process.argv.slice(2);
  const cells = items.map((s) => {
    const [cap, p] = s.split('|');
    const b64 = fs.readFileSync(p).toString('base64');
    return `<figure><img src="data:image/png;base64,${b64}"><figcaption>${cap}</figcaption></figure>`;
  }).join('');
  const html = `<html><body style="margin:0;background:#d9dde1;font:600 13px system-ui">
    <div style="display:grid;grid-template-columns:repeat(${cols},${colW}px);gap:10px;padding:10px;align-items:start">${cells}</div>
    <style>figure{margin:0;background:#fff;padding:4px}img{width:100%;display:block;border:1px solid #333}
    figcaption{padding:4px 2px 0;color:#111}</style></body></html>`;
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 10 + cols * (+colW + 10), height: 400 } });
  await page.setContent(html);
  await page.waitForTimeout(200);
  const jpg = /\.jpe?g$/i.test(outFile);
  await page.screenshot({ path: outFile, fullPage: true, ...(jpg ? { type: 'jpeg', quality: 80 } : {}) });
  await browser.close();
})();
