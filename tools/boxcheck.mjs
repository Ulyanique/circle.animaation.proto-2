// boxcheck.mjs — the invariant behind the window boxes (core/slots.js, seenPart in shots/shot.js): no point of a
// window that is inside the picture, at any frame its shot can be drawn with the picture showing, lies outside the
// window's box. Custom media covers exactly the box at zoom 1, so a violation would show as smeared edge texels.
// Run after any change of the shards, the cameras, the links or the reveal timings. Expected: "… ever in the picture 0"
// on every line. Pure geometry (shot data + camera rigs of the running page) — nothing is rendered.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: chromium.args, defaultViewport: { width: 320, height: 180, deviceScaleFactor: 1 } });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { window.__manual = true; });
await page.goto('http://localhost:5173/?paused&nowarm&dpr=1&card', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
const out = await page.evaluate(() => {
  const res = [];
  const inPoly = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const links = window.__player.links || [];
  for (const sh of window.__player.shots) {
    ((sh.data && sh.data.screens) || []).forEach((s, i) => {
      const O = s.o, U = s.u, V = s.v, uu = U[0] * U[0] + U[1] * U[1] + U[2] * U[2], vv = V[0] * V[0] + V[1] * V[1] + V[2] * V[2];
      const polys = sh.data.polys.filter((p) => p.screen === i + 1).map((p) => p.v.map((a) => { const q = [a[0] - O[0], a[1] - O[1], a[2] - O[2]]; return [(q[0] * U[0] + q[1] * U[1] + q[2] * U[2]) / uu, (q[0] * V[0] + q[1] * V[1] + q[2] * V[2]) / vv]; }));
      let u0 = 9, u1 = -9, v0 = 9, v1 = -9;
      for (const p of polys) for (const a of p) { u0 = Math.min(u0, a[0]); u1 = Math.max(u1, a[0]); v0 = Math.min(v0, a[1]); v1 = Math.max(v1, a[1]); }
      const slot = window.__slots[s.name], box = slot.box;
      // frames this shot can be drawn at: its range, widened by the dissolves at linked borders
      let f0 = sh.range[0], f1 = sh.range[1];
      for (const l of links) { const at = l.at ?? l.f ?? 0, n = l.n ?? 10; if (at === sh.range[0]) f0 -= n + 1; if (at === sh.range[1] + 1) f1 += n + 1; }
      // … and not before the picture starts to show in the window (until then the facet is plain gold)
      const rv = sh.def && sh.def.screens && sh.def.screens[s.name] && sh.def.screens[s.name].reveal;
      if (Array.isArray(rv) && rv[0][1] === 0) f0 = Math.max(f0, rv[0][0]);
      const o = {}; let bad = 0, worst = 0, n = 0; const N = 70;
      for (let iy = 0; iy <= N; iy++) for (let ix = 0; ix <= N; ix++) {
        const u = u0 + ((u1 - u0) * ix) / N, v = v0 + ((v1 - v0) * iy) / N;
        if (!polys.some((p) => inPoly(p, u, v))) continue;
        const over = Math.max(box[0] - u, u - box[1], box[2] - v, v - box[3]);
        if (over <= 0) continue;      // inside the box: fine whatever the camera does
        n++;
        const w = [O[0] + U[0] * u + V[0] * v, O[1] + U[1] * u + V[1] * v, O[2] + U[2] * u + V[2] * v];
        for (let f = f0; f <= f1; f += 0.5) { sh.rig.project(f, w, o); if (o.x >= 0 && o.x <= 1280 && o.y >= 0 && o.y <= 720) { bad++; worst = Math.max(worst, over); break; } }
      }
      res.push(`${sh.id} ${slot.id}: frames ${f0}…${f1}; window points outside the box ${n}, of them ever in the picture ${bad}${bad ? ' (up to ' + worst.toFixed(3) + ' uv)' : ''}`);
    });
  }
  return res;
});
console.log(out.join('\n'));
await browser.close();
