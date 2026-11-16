// slotinfo.mjs — the numbers behind the table of windows in the README («Свои фото и видео в окнах»).
// For every window: frames and seconds on screen, shape of the part of it the picture ever shows, how much of a
// horizontal 16:9 frame that part takes, how much of the picture the window covers, its tilt, and how wide a 16:9
// photo must be to be shown 1:1 on a 1920 px wide picture (median over the window's frames / at its closest).
// Pure geometry (shot data + camera rigs of the running page) — nothing is rendered.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: chromium.args, defaultViewport: { width: 320, height: 180, deviceScaleFactor: 1 } });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { window.__manual = true; });
await page.goto('http://localhost:5173/?paused&nowarm&dpr=1&card', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
const rows = await page.evaluate(() => {
  const inPoly = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const A = 16 / 9, out = {};
  for (const sh of window.__player.shots) {
    ((sh.data && sh.data.screens) || []).forEach((s, i) => {
      const O = s.o, U = s.u, V = s.v, lu = Math.hypot(...U), lv = Math.hypot(...V);
      const polys = sh.data.polys.filter((p) => p.screen === i + 1).map((p) => p.v.map((a) => { const q = [a[0] - O[0], a[1] - O[1], a[2] - O[2]]; return [(q[0] * U[0] + q[1] * U[1] + q[2] * U[2]) / (lu * lu), (q[0] * V[0] + q[1] * V[1] + q[2] * V[2]) / (lv * lv)]; }));
      const nrm = [U[1] * V[2] - U[2] * V[1], U[2] * V[0] - U[0] * V[2], U[0] * V[1] - U[1] * V[0]];
      const slot = window.__slots[s.name], b = slot.box;
      const W = (b[1] - b[0]) * lu, H = (b[3] - b[2]) * lv, Wm = Math.max(W, H * A);      // a 16:9 media covering the box
      const at = (u, v) => [O[0] + U[0] * u + V[0] * v, O[1] + U[1] * u + V[1] * v, O[2] + U[2] * u + V[2] * v];
      const f0 = Math.max(sh.range[0], slot.f0), f1 = Math.min(sh.range[1], slot.f1);
      const need = [], cover = [], p0 = {}, p1 = {}, p2 = {}, N = 14, e = 0.01;
      for (let f = f0; f <= f1; f++) {
        let best = 0;
        for (let iy = 0; iy <= N; iy++) for (let ix = 0; ix <= N; ix++) {
          const u = b[0] + ((b[1] - b[0]) * ix) / N, v = b[2] + ((b[3] - b[2]) * iy) / N;
          if (!polys.some((p) => inPoly(p, u, v))) continue;
          sh.rig.project(f, at(u, v), p0);
          if (p0.x < 0 || p0.x > 1280 || p0.y < 0 || p0.y > 720) continue;
          sh.rig.project(f, at(u + e, v), p1); sh.rig.project(f, at(u, v + e), p2);
          best = Math.max(best, (Math.hypot(p1.x - p0.x, p1.y - p0.y) / (e * lu)) * Wm, (Math.hypot(p2.x - p0.x, p2.y - p0.y) / (e * lv)) * Wm);
        }
        if (best > 0) need.push(best * 1.5);      // px of a 1920 px wide picture spanned by the full width of the media
        const c = sh.rig.pose(f); let hit = 0, n = 0;
        for (let y = 20; y < 720; y += 40) for (let x = 20; x < 1280; x += 40) {
          n++;
          const w = sh.rig.unproject(f, x, y, 1), d = [w.x - c[0], w.y - c[1], w.z - c[2]];
          const den = d[0] * nrm[0] + d[1] * nrm[1] + d[2] * nrm[2];
          if (Math.abs(den) < 1e-9) continue;
          const t = ((O[0] - c[0]) * nrm[0] + (O[1] - c[1]) * nrm[1] + (O[2] - c[2]) * nrm[2]) / den;
          if (t <= 0) continue;
          const q = [c[0] + d[0] * t - O[0], c[1] + d[1] * t - O[1], c[2] + d[2] * t - O[2]];
          if (polys.some((p) => inPoly(p, (q[0] * U[0] + q[1] * U[1] + q[2] * U[2]) / (lu * lu), (q[0] * V[0] + q[1] * V[1] + q[2] * V[2]) / (lv * lv)))) hit++;
        }
        cover.push(hit / n);
      }
      const r = out[slot.id] || (out[slot.id] = { id: slot.id, placeholder: s.name, frames: `${slot.f0}–${slot.f1}`, seconds: +((slot.f1 - slot.f0 + 1) / 24).toFixed(1), aspect: +slot.aspect.toFixed(2), tilt: Math.round(slot.tilt), fixed: !!slot.fixed, need: [], cover: [] });
      r.need.push(...need); r.cover.push(...cover);
    });
  }
  return Object.values(out).sort((a, b) => a.id.localeCompare(b.id)).map((r) => {
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
    const A = 16 / 9;
    return {
      id: r.id, placeholder: r.placeholder, frames: r.frames, seconds: r.seconds, aspect: r.aspect,
      'of a 16:9 frame, width x height %': `${Math.round(100 * Math.min(1, r.aspect / A))} x ${Math.round(100 * Math.min(1, A / r.aspect))}`,
      'covers the picture %': Math.round(100 * med(r.cover)), tilt: r.tilt,
      '16:9 photo width for 1:1 at 1920 (median / closest)': `${Math.round(med(r.need) / 10) * 10} / ${Math.round(Math.max(...r.need) / 10) * 10}`,
      fixed: r.fixed ? 'yes (then 1920 is 1:1)' : '',
    };
  });
});
console.table(rows);
await browser.close();
