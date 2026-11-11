// seq.mjs F0 F1 STEP OUTDIR [W H] — renders a frame sequence of the three.js app with headless chromium (jpeg files r_<frame*100>.jpg).
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [f0, f1, step] = process.argv.slice(2, 5).map(Number);
const dir = process.argv[5];
const W = Number(process.argv[6] || 640), H = Number(process.argv[7] || 360);
fs.mkdirSync(dir, { recursive: true });
const url = process.env.URL || 'http://localhost:5173/?paused&nowarm&dpr=1';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: chromium.args, defaultViewport: { width: W, height: H, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.evaluateOnNewDocument(() => { window.__manual = true; });
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
const t0 = Date.now();
let n = 0;
for (let f = f0; f <= f1 + 1e-6; f += step) {
  const data = await page.evaluate((f) => { window.__player.renderAt(f); return document.getElementById('view').toDataURL('image/jpeg', 0.92); }, f);
  fs.writeFileSync(`${dir}/r_${String(Math.round(f * 100)).padStart(6, '0')}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
  n++;
  if (n % 100 === 0) console.log('frame', f.toFixed(2), ((Date.now() - t0) / n).toFixed(0), 'ms/frame');
}
console.log('rendered', n, 'frames in', ((Date.now() - t0) / 1000).toFixed(1), 's', errors.length ? 'ERRORS: ' + [...new Set(errors)].slice(0, 5).join(' | ') : '');
await browser.close();
