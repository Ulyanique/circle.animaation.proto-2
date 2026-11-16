// poses.mjs [step] [out.json] — camera pose of the three.js app at every (fractional) frame, without rendering.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const step = Number(process.argv[2] || 0.5);
const out = process.argv[3] || '/tmp/work/motion/poses.json';
const url = process.env.URL || 'http://localhost:5173/?paused&nowarm&dpr=1';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: chromium.args, defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
const rows = await page.evaluate((step) => {
  window.__manual = true;
  const P = window.__player, S = window.__stage, rows = [];
  for (let f = 1; f <= 1213.0001; f += step) {
    const shot = P.shotAt(f);
    S.resetFrame();
    shot.update(f, S, (f - 1) / 24);
    const c = S.camera, fl = S.flares;
    rows.push([+f.toFixed(4), shot.id, c.position.x, c.position.y, c.position.z, c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w, c.fov,
      fl[0].i > 0 ? fl[0].x : null, fl[0].i > 0 ? fl[0].y : null]);
  }
  return rows;
}, step);
fs.writeFileSync(out, JSON.stringify(rows));
console.log('poses', rows.length, '->', out, errors.length ? 'ERRORS: ' + [...new Set(errors)].slice(0, 5).join(' | ') : '');
await browser.close();
