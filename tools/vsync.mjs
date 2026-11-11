// vsync.mjs — does a video in window w08 stay on the film's clock? Needs a video set for w08 in src/media.js
// (any short clip; test files named public/media/_test_* are git-ignored). Plays from 21.6 s, prints the film frame, the
// time the video should show and the time it shows, every 0.3 s; then pauses and prints the same once more.
// VW / VH / DPR choose the page size: a small page (VW=128 VH=72 DPR=0.5) renders at the display rate — the normal
// case; 640×360 under the software renderer takes over 100 ms per frame, the film then runs slower than the wall
// clock, and the video must slow down with it instead of jumping back.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: [...chromium.args, '--autoplay-policy=no-user-gesture-required'], defaultViewport: { width: Number(process.env.VW || 320), height: Number(process.env.VH || 180), deviceScaleFactor: 1 } });
const page = await browser.newPage();
const msgs = [];
page.on('console', (m) => { if (['error', 'warning', 'warn'].includes(m.type())) msgs.push(m.text().slice(0, 160)); });
await page.goto('http://localhost:5173/?t=21.6&nowarm&dpr=' + (process.env.DPR || 1), { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
if (!(await page.evaluate(() => !!window.__slots.pylons.video))) { console.log('no video in w08: add one to src/media.js'); await browser.close(); process.exit(1); }
await page.evaluate(() => window.__player.play());
const rows = [];
for (let i = 0; i < 16; i++) {
  await new Promise((r) => setTimeout(r, 300));
  rows.push(await page.evaluate(() => { const p = window.__player, s = window.__slots.pylons, f = p.time * 24 + 1; return { f: +f.toFixed(1), want: +Math.max(0, (f - s.f0) / 24).toFixed(2), video: +s.video.currentTime.toFixed(2), paused: s.video.paused }; }));
}
await page.evaluate(() => window.__player.pause());
await new Promise((r) => setTimeout(r, 600));
const after = await page.evaluate(() => { const p = window.__player, s = window.__slots.pylons, f = p.time * 24 + 1; return { f: +f.toFixed(1), want: +Math.max(0, (f - s.f0) / 24).toFixed(2), video: +s.video.currentTime.toFixed(2), paused: s.video.paused }; });
console.log(rows.map((r) => `f${r.f} want ${r.want} video ${r.video}${r.paused ? ' (paused)' : ''}`).join('\n'));
console.log('after pause:', JSON.stringify(after), msgs.length ? 'MESSAGES ' + msgs.join(' | ') : '(no console messages)');
await browser.close();
