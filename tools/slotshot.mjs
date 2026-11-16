// slotshot.mjs F1,F2,.. OUTDIR [W H] — like seq.mjs for single frames, but waits for videos in the windows: a paused
// video shows the right frame only after its seek has finished, so every frame is rendered, given 400 ms, and
// rendered again. Also prints window.__slots (the table of windows: frames, shape, tilt, box, what they show).
// QUERY=card node slotshot.mjs …  adds `&card` to the address: the 16:9 test card in every window.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const frames = process.argv[2].split(',').map(Number);
const dir = process.argv[3];
const W = Number(process.argv[4] || 1280), H = Number(process.argv[5] || 720);
fs.mkdirSync(dir, { recursive: true });
const url = 'http://localhost:5173/?paused&nowarm&dpr=1' + (process.env.QUERY ? '&' + process.env.QUERY : '');
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: [...chromium.args, '--autoplay-policy=no-user-gesture-required'], defaultViewport: { width: W, height: H, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const msgs = [];
page.on('console', (m) => { if (['error', 'warning', 'warn'].includes(m.type())) msgs.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => msgs.push('PAGEERROR ' + e.message));
await page.evaluateOnNewDocument(() => { window.__manual = true; });
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
for (const f of frames) {
  await page.evaluate((f) => window.__player.renderAt(f), f);
  await new Promise((r) => setTimeout(r, 400));
  const data = await page.evaluate((f) => { window.__player.renderAt(f); return document.getElementById('view').toDataURL('image/jpeg', 0.92); }, f);
  fs.writeFileSync(`${dir}/r_${String(Math.round(f * 100)).padStart(6, '0')}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
}
const slots = await page.evaluate(() => Object.values(window.__slots || {}).map((s) => ({ id: s.id, name: s.name, frames: `${s.f0}-${s.f1}`, aspect: +s.aspect.toFixed(2), tilt: Math.round(s.tilt), box: s.box.map((v) => +v.toFixed(2)).join(' '), shows: s.kind + (s.src ? ' ' + s.src : '') + (s.fixed ? ' (fixed)' : ''), videoTime: s.video ? +s.video.currentTime.toFixed(2) : undefined })));
console.log(JSON.stringify(slots.sort((a, b) => a.id.localeCompare(b.id))).replace(/},/g, '},\n'));
console.log('rendered', frames.length, 'frames', msgs.length ? 'MESSAGES: ' + [...new Set(msgs)].slice(0, 6).join(' | ') : '(no console messages)');
await browser.close();
