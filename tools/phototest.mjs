// phototest.mjs — do own photos reach the picture as they should? Headless Chromium against the dev server.
//   /tmp/tools/venv/bin/python tools/phototest.py /tmp/work/photo      (makes the test photos)
//   cd /tmp/tools && node phototest.mjs /tmp/work/photo
// Each photo is put into window w02 (it fills the picture at frame 215) and the frame is compared with the frame of a
// reference photo:
//   · tagged Adobe RGB  vs  the same picture converted to sRGB beforehand — the profile must be honoured;
//   · stored on its side with an EXIF turn  vs  stored upright — the turn must be honoured;
//   · before  vs  after a lost and restored WebGL context (on the screen, and drawn on request);
// and what the photo's texture still holds in memory once it is on the GPU.
// Puts src/media.js back as it found it and removes the photos from public/media/.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const REPO = process.env.REPO || '/home/user/circle.animaation.proto-2';
const SRC = process.argv[2] || '/tmp/work/photo', SETTINGS = `${REPO}/src/media.js`, MEDIA = `${REPO}/public/media`;
const FILES = ['_test_plain.png', '_test_adobe.png', '_test_adobe_ref.png', '_test_turned.jpg', '_test_turned_ref.jpg'];
const original = fs.readFileSync(SETTINGS, 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, info = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? '  — ' + info : ''}`); };
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: chromium.args, defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const msgs = [];
page.on('console', (m) => { if (['error', 'warning', 'warn'].includes(m.type())) msgs.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => msgs.push('PAGEERROR ' + e.message));
const ready = async () => { await page.waitForFunction('window.__ready === true', { timeout: 120000 }); await wait(400); };
const frame = () => page.evaluate(() => { window.__player.renderAt(215); return document.getElementById('view').toDataURL('image/png'); });
/** mean and largest difference of two frames over the middle of the picture (inside w02), 0…255 */
const diff = (a, b) => page.evaluate(async (a, b) => {
  const load = (url) => new Promise((res) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0); res(g.getImageData(320, 180, 640, 360).data); }; im.src = url; });
  const A = await load(a), B = await load(b);
  let sum = 0, max = 0;
  for (let i = 0; i < A.length; i += 4) for (let k = 0; k < 3; k++) { const d = Math.abs(A[i + k] - B[i + k]); sum += d; if (d > max) max = d; }
  return { mean: +(sum / (A.length * 0.75)).toFixed(2), max };
}, a, b);
/** the photo in w02: its shape as the film sees it, and what its texture still holds */
const photo = () => page.evaluate(() => {
  const r = window.__slots.closeup, seen = new Set(), held = [];
  window.__stage.scene.traverse((o) => {
    for (const u of Object.values(o.material?.uniforms || {})) {
      const t = u?.value;
      if (t?.isTexture && t.userData?.media?.kind === 'photo' && !seen.has(t)) { seen.add(t); held.push(`${t.image?.tagName || typeof t.image} ${t.image?.width}×${t.image?.height}`); }
    }
  });
  return { kind: r.kind, shape: r.shape && +r.shape.toFixed(4), held };
});
const shots = {}, info = {}, t0 = Date.now();
try {
  for (const f of FILES) fs.copyFileSync(`${SRC}/${f}`, `${MEDIA}/${f}`);
  for (const f of FILES) {
    const put = () => fs.writeFileSync(SETTINGS, original.replace(/export default \{[\s\S]*$/, `export default {\n  w02: { src: 'media/${f}' },\n};\n`));
    if (f === FILES[0]) {
      put();
      await wait(700);
      await page.goto('http://localhost:5173/?f=215&paused&dpr=1&nowarm', { waitUntil: 'load', timeout: 120000 });
    } else {
      // an open page loads itself again when its window gets another file
      const nav = page.waitForNavigation({ waitUntil: 'load', timeout: 120000 });
      put();
      await nav;
    }
    await ready();
    console.log(`     ${((Date.now() - t0) / 1000).toFixed(0)} s: ${f} is loaded`);
    await frame();
    await wait(200);
    shots[f] = await frame();
    info[f] = await photo();
    console.log(`     ${f}: ${JSON.stringify(info[f])}`);
  }
  let d = await diff(shots['_test_plain.png'], shots['_test_adobe.png']);
  check('the Adobe RGB tag changes the picture', d.mean > 3, `tagged vs untagged: mean ${d.mean}, max ${d.max}`);
  d = await diff(shots['_test_adobe.png'], shots['_test_adobe_ref.png']);
  check('… into what the colours mean in sRGB', d.mean < 1.5, `tagged vs converted beforehand: mean ${d.mean}, max ${d.max}`);
  d = await diff(shots['_test_turned.jpg'], shots['_test_turned_ref.jpg']);
  check('a photo with an EXIF turn shows upright', d.mean < 1.5 && info['_test_turned.jpg'].shape === 0.5625, `turned vs upright: mean ${d.mean}, max ${d.max}; shape ${info['_test_turned.jpg'].shape}`);
  check('the canvas a photo went through is emptied once it is on the GPU', info['_test_plain.png'].held.every((h) => /CANVAS 0×0/.test(h)), info['_test_plain.png'].held.join(', '));

  // the last page (the upright photo) loses its WebGL context and gets it back; the paused film must draw itself again
  const before = shots['_test_turned_ref.jpg'];
  const onScreen = () => page.screenshot({ clip: { x: 320, y: 180, width: 640, height: 360 }, encoding: 'base64', captureBeyondViewport: false });
  await wait(1000);
  const screen0 = await onScreen();
  const lost = await page.evaluate(async () => {
    const gl = window.__stage.renderer.getContext(), ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return null;
    ext.loseContext();
    await new Promise((r) => setTimeout(r, 500));
    const was = gl.isContextLost();
    ext.restoreContext();
    await new Promise((r) => setTimeout(r, 1500));
    return { was, now: gl.isContextLost() };
  });
  if (lost) {
    const screen1 = await onScreen();      // before anything asks the page to draw
    check('after a lost and restored WebGL context the paused film draws itself again', lost.was && !lost.now && screen0 === screen1, `${JSON.stringify(lost)}; the screen is ${screen0 === screen1 ? 'the same as before' : 'NOT what it was'}`);
    await frame(); await wait(300);
    d = await diff(before, await frame());
    check('… with the photo in it', d.mean < 1.5, `before vs after: mean ${d.mean}, max ${d.max}`);
    fs.writeFileSync('/tmp/work/photo_restored.png', Buffer.from((await frame()).split(',')[1], 'base64'));
  } else console.log('     (no WEBGL_lose_context here: skipped)');
  for (const [f, url] of Object.entries(shots)) fs.writeFileSync(`/tmp/work/photo_${f.replace(/\W/g, '_')}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log(msgs.length ? 'CONSOLE: ' + [...new Set(msgs)].join(' | ') : '(no console messages)');
} catch (e) {
  failed++;
  console.log('STOPPED:', e.message);
} finally {
  await browser.close();
  fs.writeFileSync(SETTINGS, original);
  for (const f of FILES) fs.rmSync(`${MEDIA}/${f}`, { force: true });
}
console.log(failed ? `${failed} check(s) FAILED` : 'all checks passed');
process.exit(failed ? 1 : 0);
