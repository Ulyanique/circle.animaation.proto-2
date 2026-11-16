// fittest.mjs — property test of fitMatrix (src/core/slots.js): for random windows, media shapes and settings the
// media must (1) cover the whole box — no uv outside 0…1, (2) not be distorted, (3) touch an edge of the box at zoom 1.
// Plain node, no browser:  node tools/fittest.mjs
import { existsSync } from 'node:fs';
const here = new URL('../src/core/slots.js', import.meta.url);
const { fitMatrix } = await import(existsSync(here) ? here.href : '/home/user/circle.animaation.proto-2/src/core/slots.js');
let worst = 0, bad = 0, n = 0, tight = 0;
const rnd = (a, b) => a + Math.random() * (b - a);
for (let k = 0; k < 200000; k++) {
  const W = rnd(0.3, 3), H = rnd(0.3, 3), aspect = rnd(0.4, 2.6);
  const p = { x: rnd(0, 1), y: rnd(0, 1), zoom: rnd(1, 3), rotate: rnd(-180, 180) };
  if (k % 4 === 0) p.rotate = 0;
  if (k % 8 === 0) p.zoom = 1;
  const m = fitMatrix(W, H, aspect, p);
  let lo = 9, hi = -9, ulo = 9, uhi = -9, vlo = 9, vhi = -9;
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const x = m[0] * u + m[1] * v + m[4], y = m[2] * u + m[3] * v + m[5];
    lo = Math.min(lo, x, y); hi = Math.max(hi, x, y);
    ulo = Math.min(ulo, x); uhi = Math.max(uhi, x); vlo = Math.min(vlo, y); vhi = Math.max(vhi, y);
  }
  n++;
  if (lo < -1e-9 || hi > 1 + 1e-9) { bad++; worst = Math.max(worst, -lo, hi - 1); }
  // at zoom 1 the media must touch the box in at least one direction (nothing wasted)
  if (p.zoom === 1 && Math.max(uhi - ulo, vhi - vlo) > 1 - 1e-9) tight++;
  // no distortion: a unit step in box x and in box y must have the same length in media pixels, and stay perpendicular
  const ax = [m[0] * aspect / W, m[2] / W], ay = [m[1] * aspect / H, m[3] / H];
  const lx = Math.hypot(...ax), ly = Math.hypot(...ay), dot = (ax[0] * ay[0] + ax[1] * ay[1]) / (lx * ly);
  if (Math.abs(lx / ly - 1) > 1e-9 || Math.abs(dot) > 1e-9) { console.log('DISTORTED', W, H, aspect, p); process.exit(1); }
}
console.log(`cases ${n}: outside the media ${bad} (worst ${worst.toExponential(2)}); zoom-1 cases that touch an edge: ${tight} of ${Math.ceil(n / 8)}`);
// x / y semantics without rotation: x = 0 shows the left edge, x = 1 the right edge
for (const [x, y] of [[0, 0], [1, 1], [0.5, 0.5]]) { const m = fitMatrix(1, 2, 16 / 9, { x, y, zoom: 1, rotate: 0 }); console.log(`tall window, 16:9 media, x ${x} y ${y}: media u ${m[4].toFixed(3)}…${(m[0] + m[4]).toFixed(3)}, v ${m[5].toFixed(3)}…${(m[3] + m[5]).toFixed(3)}`); }
