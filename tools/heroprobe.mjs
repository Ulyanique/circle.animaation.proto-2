// heroprobe.mjs [step] — the hero light as the player draws it, sampled every `step` film frames (default 0.4 = 60 Hz):
// head speed / acceleration / turn per step, and the tail polyline (length, sharpest bend, length of the hidden part).
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
const step = Number(process.argv[2] || 0.4);
const browser = await puppeteer.launch({ args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], executablePath: await chromium.executablePath(), headless: 'shell' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR ' + (e.stack || e.message).slice(0, 500)));
await page.goto((process.argv[3] || 'http://localhost:5173/') + '?paused&nowarm&dpr=1', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.__ready === true', { timeout: 60000 });
const rows = await page.evaluate((step) => {
  const h = window.__stage.hero, p = window.__player, out = [];
  for (let f = 9; f <= 962; f += step) {
    const t = h.tailAt(f);
    let len = 0, bend = 0, hidden = 0;
    const cum = [0];
    for (let k = 1; k < t.length; k++) { len += Math.hypot(t[k][0] - t[k - 1][0], t[k][1] - t[k - 1][1]); cum.push(len); }
    for (let k = 1; k < t.length - 1; k++) {
      if (cum[k] > 1000) break;
      const a = Math.atan2(t[k][1] - t[k - 1][1], t[k][0] - t[k - 1][0]), b = Math.atan2(t[k + 1][1] - t[k][1], t[k + 1][0] - t[k][0]);
      let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d;
      bend = Math.max(bend, d * 180 / Math.PI);
    }
    out.push([+f.toFixed(3), t[0][0], t[0][1], len, bend, p.shotAt(f).id]);
  }
  return out;
}, step);
await browser.close();
const by = new Map();
let worst = [];
for (let i = 2; i < rows.length; i++) {
  const [f, x, y, len, bend, id] = rows[i], a = rows[i - 1], b = rows[i - 2];
  const v = Math.hypot(x - a[1], y - a[2]) / step, v0 = Math.hypot(a[1] - b[1], a[2] - b[2]) / step;
  const acc = Math.hypot(x - 2 * a[1] + b[1], y - 2 * a[2] + b[2]) / (step * step);
  let turn = Math.abs(Math.atan2(y - a[2], x - a[1]) - Math.atan2(a[2] - b[2], a[1] - b[1])); if (turn > Math.PI) turn = 2 * Math.PI - turn;
  turn = turn * 180 / Math.PI / step;      // degrees per film frame
  const s = by.get(id) || { v: [], acc: 0, turn: 0, len: 1e9, bend: 0, dv: 0 };
  s.v.push(v); s.acc = Math.max(s.acc, acc); s.turn = Math.max(s.turn, turn); s.len = Math.min(s.len, len); s.bend = Math.max(s.bend, bend); s.dv = Math.max(s.dv, Math.abs(v - v0) / Math.max(v0, 1e-6));
  by.set(id, s);
  worst.push([acc, f]);
}
console.log('shot  | head px/f min/med/max | accel max px/f2 | speed change per step max % | turn max deg/f | tail length min px | sharpest joint deg');
for (const [id, s] of by) {
  const v = s.v.slice().sort((a, b) => a - b);
  console.log(`${id.padEnd(5)} | ${v[0].toFixed(1).padStart(5)} ${v[v.length >> 1].toFixed(1).padStart(5)} ${v[v.length - 1].toFixed(1).padStart(5)}     | ${s.acc.toFixed(2).padStart(6)}          | ${(s.dv * 100).toFixed(1).padStart(5)}                       | ${s.turn.toFixed(1).padStart(5)}          | ${s.len.toFixed(0).padStart(5)}              | ${s.bend.toFixed(0).padStart(4)}`);
}
worst.sort((a, b) => b[0] - a[0]);
console.log('largest accelerations at f:', worst.slice(0, 8).map((w) => `${w[1]} (${w[0].toFixed(1)})`).join(', '));
