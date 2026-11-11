// dumpposes.mjs OUT.json — the camera of every shot as actually flown (link splices included), per frame
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell', defaultViewport: { width: 640, height: 360 } });
const page = await browser.newPage();
await page.goto('http://localhost:5173/?paused&dpr=1&nowarm', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 170000 });
const out = await page.evaluate(() => {
  const p = window.__player, res = { shots: [], links: p.links.map((l) => ({ at: l.at, n: l.n, a: l.a.id, b: l.b.id, k: l.glue?.k ?? l.b.data?.link?.k ?? 1 })) };
  for (const s of p.shots) {
    if (!s.rig) { res.shots.push({ id: s.id, range: s.range }); continue; }
    const poses = [];
    for (let f = s.range[0] - 14; f <= s.range[1] + 14; f++) poses.push([f, ...s.rig.pose(f).map((v) => +v.toFixed(6)), s.rig.fovAt(f)]);
    res.shots.push({ id: s.id, range: s.range, poses });
  }
  return res;
});
fs.writeFileSync(process.argv[2] || '/tmp/work/poses_flown.json', JSON.stringify(out));
console.log(out.shots.map((s) => s.id + ':' + (s.poses ? s.poses.length : 0)).join(' '), JSON.stringify(out.links));
await browser.close();
