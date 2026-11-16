// placertest.mjs — the placement tool of the dev server (src/dev/: placer.js, mediaServer.js; key E on the page), driven
// with a real mouse in headless Chromium, and its server side asked directly.
//   cd /tmp/tools && node placertest.mjs          (the dev server must run on :5173, started on this machine)
// It makes its own test pictures (public/media/_test_*), writes its own lines into src/media.js and, when it is done or
// has failed, puts src/media.js back as it found it and removes the pictures it added.
// Checks: who may write; what may be written; a drag moves the picture exactly with the cursor (compared in pixels);
// wheel, sliders, `to` moves, fixed; saving without a reload; files from the list, from the button, dropped, shrunk.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';

const REPO = process.env.REPO || '/home/user/circle.animaation.proto-2';
const SETTINGS = `${REPO}/src/media.js`, MEDIA = `${REPO}/public/media`, HOST = 'http://localhost:5173';
const original = fs.readFileSync(SETTINGS, 'utf8'), hadFiles = new Set(fs.readdirSync(MEDIA));
const head = original.slice(0, original.indexOf('export default {'));
const settingsText = (lines) => `${head}export default {\n${lines.map((l) => `  ${l}\n`).join('')}};\n`;
const fileNow = () => fs.readFileSync(SETTINGS, 'utf8');
const tmp = fs.mkdtempSync(`${os.tmpdir()}/placertest-`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, info = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? '  — ' + String(info).slice(0, 170) : ''}`); };
const near = (a, b, tol) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
const fmt = (m) => `[${m.map((v) => v.toFixed(4)).join(', ')}]`;

const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: chromium.args, defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const msgs = [];
page.on('console', (m) => { if (['error', 'warning', 'warn'].includes(m.type())) msgs.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => msgs.push('PAGEERROR ' + e.message));
const ready = async () => { await page.waitForFunction('window.__ready === true && !!window.__placer', { timeout: 120000 }); await page.evaluate(() => window.__placer.asked); await wait(300); };
const probe = (x, y) => page.evaluate((x, y) => window.__placer.probe(x, y), x, y);
const state = () => page.evaluate(() => window.__placer.state());
const frameNow = () => page.evaluate(() => Math.round(window.__player.time * 24 + 1));
const seek = async (f) => { await page.evaluate((f) => { window.__player.pause(); window.__player.seek((f - 1) / 24); }, f); await wait(250); };
const shot = () => page.evaluate(() => { window.__player.renderAt(Math.round(window.__player.time * 24 + 1)); return document.getElementById('view').toDataURL('image/png'); });
const click = (sel) => page.evaluate((sel) => document.querySelector(sel).click(), sel);
const pick = (name) => page.evaluate((name) => window.__placer.select(name), name);
/** a picture point on window `id`, clear of the panel and the player's bar — the one nearest the middle; or null */
const spotOf = (id) => page.evaluate((id) => {
  let best = null, bd = Infinity;
  for (let y = 100; y <= 600; y += 20) {
    for (let x = 60; x <= 900; x += 20) {
      const d = (x - 480) ** 2 + (y - 360) ** 2;
      if (d >= bd) continue;
      // with room around it: the checks look at a patch of the picture and move the cursor
      if ([[0, 0], [-40, -40], [40, -40], [-40, 40], [40, 40]].every(([dx, dy]) => window.__placer.probe(x + dx, y + dy)?.id === id)) { bd = d; best = [x, y]; }
    }
  }
  return best;
}, id);
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await wait(100); } return false; };
const mark = () => page.evaluate(() => { window.__mark = 1; });
const marked = () => page.evaluate(() => window.__mark === 1);
/** runs `act`, which must make the page load again, and waits for the film to be ready */
const reloaded = async (act) => { const nav = page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }); await act(); await nav; await ready(); };
/** a test picture: a mosaic of random colours, as JPEG bytes */
const makeCard = async (w, h, block) => Buffer.from(await page.evaluate(async (w, h, block) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  let s = 12345;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  for (let y = 0; y < h; y += block) for (let x = 0; x < w; x += block) { g.fillStyle = `rgb(${(60 + rnd() * 180) | 0},${(60 + rnd() * 180) | 0},${(60 + rnd() * 180) | 0})`; g.fillRect(x, y, block, block); }
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92)), buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}, w, h, block), 'base64');
/** where the patch around point a of picture `before` is found around point b of picture `after`: offset [dx, dy] */
const match = (before, after, a, b) => page.evaluate(async (before, after, a, b) => {
  const load = (url) => new Promise((res) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0); res(g); }; im.src = url; });
  const A = await load(before), B = await load(after), R = 16, S = 12, wa = 2 * R + 1, wb = 2 * (R + S) + 1;
  const pa = A.getImageData(a[0] - R, a[1] - R, wa, wa).data, pb = B.getImageData(b[0] - R - S, b[1] - R - S, wb, wb).data;
  let mean = 0, dev = 0;
  for (let i = 0; i < pa.length; i += 4) mean += pa[i + 1];
  mean /= pa.length / 4;
  for (let i = 0; i < pa.length; i += 4) dev += Math.abs(pa[i + 1] - mean);
  let best = Infinity, at = null, zero = 0;
  for (let dy = -S; dy <= S; dy++) {
    for (let dx = -S; dx <= S; dx++) {
      let sad = 0;
      for (let y = 0; y < wa; y++) for (let x = 0; x < wa; x++) { const i = (y * wa + x) * 4, j = ((y + S + dy) * wb + x + S + dx) * 4; sad += Math.abs(pa[i] - pb[j]) + Math.abs(pa[i + 1] - pb[j + 1]) + Math.abs(pa[i + 2] - pb[j + 2]); }
      sad /= wa * wa * 3;
      if (!dx && !dy) zero = sad;
      if (sad < best) { best = sad; at = [dx, dy]; }
    }
  }
  return { at, best: +best.toFixed(1), zero: +zero.toFixed(1), contrast: +(dev / (pa.length / 4)).toFixed(1) };
}, before, after, a, b);
const post = (path, body, headers = {}, host = HOST) => fetch(host + path, { method: 'POST', headers, body }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const entries = (list, headers = {}, host = HOST) => post('/__media', JSON.stringify({ entries: list }), { 'Content-Type': 'application/json', ...headers }, host);

try {
  await page.goto(`${HOST}/?f=430&paused&edit&dpr=1&nowarm`, { waitUntil: 'load', timeout: 120000 });
  await ready();
  const card = await makeCard(1920, 1080, 20);
  // as a camera held upright writes it: 6400×3600 on its side, EXIF orientation 6 ("turn a quarter clockwise to show")
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0])]);
  const plainBig = await makeCard(6400, 3600, 80);
  const big = Buffer.concat([plainBig.subarray(0, 2), Buffer.from([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255]), exif, plainBig.subarray(2)]);
  fs.writeFileSync(`${tmp}/_test_pick.jpg`, card);

  // ---- the server side: what may be written, and by whom ------------------------------------------
  console.log('— server');
  let r = await post('/__media/file?name=_test_card.jpg', card);
  check('a picture is taken into public/media/', r.ok && r.name === '_test_card.jpg' && r.replaced === false && fs.statSync(`${MEDIA}/_test_card.jpg`).size === card.length, JSON.stringify(r));
  r = await post('/__media/file?name=_test_card.jpg', card);
  check('the same name again replaces the file, and says so', r.ok && r.replaced === true, JSON.stringify(r));
  r = await post(`/__media/file?name=${encodeURIComponent('../../_test_climb.jpg')}`, card);
  check('a name with folders lands in public/media/ all the same', r.ok && r.name === '_test_climb.jpg' && fs.existsSync(`${MEDIA}/_test_climb.jpg`) && !fs.existsSync(`${REPO}/_test_climb.jpg`), JSON.stringify(r));
  for (const name of ['evil.js', 'notes.txt', '.htaccess', 'a.jpg.php', '']) {
    r = await post(`/__media/file?name=${encodeURIComponent(name)}`, card);
    check(`refused as a file: "${name}"`, r.status === 400 && !fs.existsSync(`${MEDIA}/${name || 'x'}`), JSON.stringify(r));
  }
  r = await post('/__media/file?name=_test_empty.jpg', '');
  check('an empty file is refused and leaves nothing behind', r.status === 400 && !fs.readdirSync(MEDIA).some((n) => n.startsWith('.upload') || n === '_test_empty.jpg'), JSON.stringify(r));
  r = await new Promise((done) => {
    const q = http.request(`${HOST}/__media/file?name=_test_huge.mp4`, { method: 'POST', headers: { 'Content-Length': 2e9 } }, (res) => { done({ status: res.statusCode }); q.destroy(); });
    q.on('error', () => done({ status: 0 }));
    q.write('x');
  });
  check('a file over the limit is refused before it is sent', r.status === 413, JSON.stringify(r));
  r = await entries([{ id: 'w05', settings: { src: 'media/_test_card.jpg' } }], { Origin: 'https://evil.example' });
  check('a page of another site may not write (Origin)', r.status === 403, JSON.stringify(r));
  r = await entries([{ id: 'w05', settings: { src: 'media/_test_card.jpg' } }], { 'Sec-Fetch-Site': 'cross-site' });
  check('a page of another site may not write (Sec-Fetch-Site)', r.status === 403, JSON.stringify(r));
  // a dev server started with MEDIA_TOOL=remote lets other machines write: the read-only checks do not apply to it
  const remote = (await fetch(`${HOST}/__media`, { headers: { 'X-Forwarded-For': '203.0.113.7' } }).then((x) => x.json())).write === true;
  const ip = remote ? null : Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal)?.address;
  if (remote) console.log('     (the dev server runs with MEDIA_TOOL=remote: the read-only checks are skipped)');
  else {
    r = await entries([{ id: 'w05', settings: { src: 'media/_test_card.jpg' } }], { 'X-Forwarded-For': '203.0.113.7' });
    check('through a proxy the tool is read-only', r.status === 403 && r.error === 'read-only', JSON.stringify(r));
    // another site's name made to point at this machine: to the browser its page is "the same origin"
    r = await new Promise((done) => {
      const q = http.request(`${HOST}/__media`, { method: 'POST', headers: { Host: 'evil.example:5173', Origin: 'http://evil.example:5173', 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' } }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => done({ status: res.statusCode, body }));
      });
      q.on('error', (e) => done({ status: 0, body: e.message }));
      q.end(JSON.stringify({ entries: [{ id: 'w05', settings: { src: 'media/_test_card.jpg' } }] }));
    });
    check('under a host name that is not localhost the tool is read-only', r.status === 403 && /read-only/.test(r.body), JSON.stringify(r));
    if (ip) {
      r = await entries([{ id: 'w05', settings: { src: 'media/_test_card.jpg' } }], {}, `http://${ip}:5173`);
      const info = await fetch(`http://${ip}:5173/__media`).then((x) => x.json());
      check('from another address the tool is read-only', r.status === 403 && r.error === 'read-only' && info.write === false, `${ip}: ${JSON.stringify(r)}`);
    } else console.log('     (no second network address: the read-only check from another address is skipped)');
  }
  for (const [what, list] of [['a window that does not exist', [{ id: 'w12', settings: { src: 'media/_test_card.jpg' } }]], ['a file that is not in public/media/', [{ id: 'w05', settings: { src: 'media/_test_nothing.jpg' } }]],
    ['a file outside public/media/', [{ id: 'w05', settings: { src: '../src/main.js' } }]], ['an address', [{ id: 'w05', settings: { src: 'https://example.com/a.jpg' } }]],
    ['a number that is text', [{ id: 'w05', settings: { src: 'media/_test_card.jpg', x: '0.5; alert(1)' } }]], ['no entries', []]]) {
    r = await entries(list);
    check(`refused as a line: ${what}`, r.status === 400, JSON.stringify(r));
  }
  check('none of that touched src/media.js', fileNow() === original);

  // ---- the test settings ------------------------------------------------------------------------
  await reloaded(() => fs.writeFileSync(SETTINGS, settingsText([
    "w04: { src: 'media/_test_card.jpg' },", "w05: { src: 'media/_test_card.jpg' },",
    "w09: { src: 'media/_test_card.jpg', to: { zoom: 1.3 } },", "w10: { src: 'http://127.0.0.1:9/kept.jpg' },", "w11: { src: 'media/_test_card.jpg' },"])));
  r = await entries([{ id: 'w10', settings: { src: 'http://127.0.0.1:9/kept.jpg', x: 0.4 } }]);
  check('an address the line already has may stay', r.ok && fileNow().includes("  w10: { src: 'http://127.0.0.1:9/kept.jpg', x: 0.4 },\n"), JSON.stringify(r));
  await wait(600);

  // ---- placing --------------------------------------------------------------------------------
  console.log('— placing');
  let st = await state();
  check('the tool opens with ?edit, on the window that is on screen, and may write', st.open && st.sel === 'lineman' && st.write && st.files.includes('_test_card.jpg'), JSON.stringify(st));
  check('name tag on the window', await page.evaluate(() => [...document.querySelectorAll('#placer-tags span')].some((t) => !t.hidden && t.textContent === 'w05')));
  const A = [600, 380];
  await page.mouse.move(...A);
  const p0 = await probe(...A);
  check('w05 is under the cursor', p0 && p0.id === 'w05', JSON.stringify(p0));
  // the page's own loop: a paused film is drawn only when something has changed
  const renders = () => page.evaluate(() => window.__player.renders);
  const onScreen = () => page.screenshot({ clip: { x: 560, y: 300, width: 200, height: 200 }, encoding: 'base64', captureBeyondViewport: false });
  await wait(2500);
  const n0 = await renders();
  await wait(1500);
  const n1 = await renders();
  check('a paused film at rest is not drawn again', n1 === n0, `${n0} -> ${n1} frames drawn in 1.5 s`);
  const seen0 = await onScreen();
  await wait(1200);
  const n2 = await renders();
  await page.mouse.wheel({ deltaY: -400 });
  await wait(1500);
  const n3 = await renders(), seen1 = await onScreen();
  await wait(1200);
  const n4 = await renders();
  check('… and is drawn again when a picture is moved', n3 > n2 && n3 - n2 <= 8, `${n3 - n2} frames drawn after the wheel`);
  check('… which shows on the screen', seen0 !== seen1 && n4 === n3, `the screen ${seen0 === seen1 ? 'did not change' : 'changed'}; taking its picture drew ${n4 - n3} frames`);
  const p1 = await probe(...A);
  check('the wheel zooms in', p1.place.zoom > 1.5 && p1.place.zoom < 1.7, `zoom ${p0.place.zoom} -> ${p1.place.zoom}`);
  check('… about the cursor', near(p0.media, p1.media, 0.002), `${fmt(p0.media)} -> ${fmt(p1.media)}`);
  check('the film stays paused under the mouse', !(await page.evaluate(() => window.__player.playing)));

  const B = [A[0] + 70, A[1] - 45];
  let before = await shot();
  await page.mouse.down();
  await page.mouse.move(A[0] + 30, A[1] - 20, { steps: 4 });
  await page.mouse.move(...B, { steps: 4 });
  await page.mouse.up();
  await wait(100);
  let after = await shot();
  const p2 = await probe(...B);
  check('drag: the grabbed point is under the cursor', near(p1.media, p2.media, 0.002), `${fmt(p1.media)} -> ${fmt(p2.media)}`);
  let m = await match(before, after, A, B);
  check('drag: the picture moved with the cursor, in pixels', m.contrast > 8 && Math.abs(m.at[0]) <= 2 && Math.abs(m.at[1]) <= 2 && m.best < 10, JSON.stringify(m));
  m = await match(before, after, A, A);
  check('… and is no longer where it was', m.best > 6 || Math.hypot(...m.at) > 6, JSON.stringify(m));

  await page.keyboard.down('Alt');
  await page.mouse.wheel({ deltaY: 150 });
  await page.keyboard.up('Alt');
  await wait(100);
  const p3 = await probe(...B);
  check('Alt + wheel turns', Math.abs(p3.place.rotate - 3) < 0.05, `rotate ${p3.place.rotate}`);
  check('… about the cursor', near(p2.media, p3.media, 0.003), `${fmt(p2.media)} -> ${fmt(p3.media)}`);

  await page.mouse.down();
  await page.mouse.move(B[0] + 900, B[1] + 500, { steps: 6 });
  await page.mouse.up();
  await wait(100);
  const p4 = await probe(...A);
  check('a drag past the edge stops at the edge', p4.place.x === 0 && p4.place.y === 0, `x ${p4.place.x}, y ${p4.place.y}`);
  check('the picture still covers the window there', p4.media.every((v) => v >= -1e-6 && v <= 1 + 1e-6), fmt(p4.media));
  await page.mouse.move(...A);
  await page.mouse.down();
  await page.mouse.move(A[0] - 120, A[1] - 60, { steps: 5 });
  await page.mouse.up();
  await wait(100);

  // sliders
  await page.evaluate(() => { const s = document.querySelector('#placer [data-a=zoom]'); s.value = '500'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
  check('the zoom slider zooms', Math.abs((await probe(...A)).place.zoom - 2) < 0.01, `zoom ${(await probe(...A)).place.zoom}`);
  await page.evaluate(() => { const s = document.querySelector('#placer [data-a=turn]'); s.value = '-45'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
  check('the turn slider turns', (await probe(...A)).place.rotate === -4.5, `rotate ${(await probe(...A)).place.rotate}`);
  await page.screenshot({ path: '/tmp/work/placer_panel.png' });

  // ---- saving: no reload, the same picture --------------------------------------------------------
  console.log('— saving');
  st = await state();
  const line = st.line;
  check('the line shows the edit', /^w05: \{ src: 'media\/_test_card\.jpg', x: 0\.\d+, y: 0\.\d+, zoom: 2, rotate: -4\.5 \},$/.test(line) && st.unsaved.join() === 'w05', `${line}  unsaved: ${st.unsaved}`);
  before = await shot();
  await mark();
  await click('#placer [data-a=save]');
  check('saved: the file has the line', await until(() => fileNow().includes(`  ${line}\n`)), line);
  check('… the tool knows it', await until(async () => (await state()).unsaved.length === 0 && /Сохранено/.test((await state()).note)), JSON.stringify(await state()));
  await wait(1200);
  check('… the page was not loaded again', await marked());
  after = await shot();
  check('… and the picture is the same', before === after);
  st = await state();
  check('… with the same line, nothing left to save', st.line === line && (await page.evaluate(() => document.querySelector('#placer [data-a=save]').disabled)), st.line);
  // the file edited by hand: numbers are taken over at once
  fs.writeFileSync(SETTINGS, fileNow().replace(`  ${line}\n`, "  w05: { src: 'media/_test_card.jpg', x: 0.9, zoom: 1.2 },   // by hand\n"));
  check('an edit of the file by hand shows without a reload', await until(async () => (await state()).line === "w05: { src: 'media/_test_card.jpg', x: 0.9, zoom: 1.2 }," ) && (await marked()), (await state()).line);
  check('… in the picture too', (await shot()) !== after);
  await page.mouse.move(...A);
  await page.mouse.wheel({ deltaY: -100 });
  await wait(100);
  await click('#placer [data-a=save]');
  check('a comment after the line survives a save', await until(() => /  w05: \{ src: 'media\/_test_card\.jpg', [^}]*zoom: 1\.[3-9]\d* \},   \/\/ by hand\n/.test(fileNow())), fileNow().split('\n').find((l) => l.includes('w05')));

  // what is not saved yet survives news from the file: the echo of a save, and a line of another window edited by hand
  await page.mouse.move(...A);
  await page.mouse.wheel({ deltaY: -100 });
  await wait(100);
  await click('#placer [data-a=save]');
  await until(async () => (await state()).unsaved.length === 0);
  await page.mouse.wheel({ deltaY: -100 });      // moved on straight after the save
  await wait(100);
  const kept = (await state()).line;
  await wait(1500);
  st = await state();
  check('a move made right after a save is not undone by the save coming back', st.line === kept && st.unsaved.join() === 'w05', `${kept}  ->  ${st.line}`);
  fs.writeFileSync(SETTINGS, fileNow().replace("  w04: { src: 'media/_test_card.jpg' },\n", "  w04: { src: 'media/_test_card.jpg', x: 0.3 },\n"));
  check('another window edited by hand is taken over', await until(() => page.evaluate(() => window.__slots.substation.place.base.x === 0.3)));
  st = await state();
  check('… and the unsaved move stays, and stays unsaved', st.line === kept && st.unsaved.join() === 'w05' && (await marked()), `${st.line}  unsaved: ${st.unsaved}`);
  await click('#placer [data-a=undo]');
  await wait(100);

  // ---- a `to` move ------------------------------------------------------------------------------
  console.log('— move, fixed');
  await pick('cabinet');
  await click('#placer [data-a=end]');
  await wait(300);
  const fEnd = await frameNow();
  const C = (await spotOf('w09')) || [640, 400];
  await page.mouse.move(...C);
  const q0 = await probe(...C);
  check('«к концу» goes late into the window; w09 is under the cursor', fEnd > 630 && fEnd < 655 && q0 && q0.id === 'w09', `f${fEnd} at ${C}: ${JSON.stringify(q0)}`);
  await page.mouse.wheel({ deltaY: -200 });
  await wait(100);
  const q1 = await probe(...C);
  check('late in the window the end of the move is edited', q1.base.zoom === q0.base.zoom && q1.end.zoom > q0.end.zoom, `base ${q0.base.zoom} -> ${q1.base.zoom}, end ${q0.end.zoom} -> ${q1.end.zoom}`);
  check('… and the point under the cursor stays', near(q0.media, q1.media, 0.003), `${fmt(q0.media)} -> ${fmt(q1.media)}`);
  await click('#placer [data-a=start]');
  await wait(300);
  const fStart = await frameNow(), D = (await spotOf('w09')) || [80, 400];
  await page.mouse.move(...D);
  const q2a = await probe(...D);
  await page.mouse.wheel({ deltaY: -200 });
  await wait(100);
  const q2 = await probe(...D);
  check('«к началу» goes early into the window; there the start is edited', fStart < 575 && q2a?.id === 'w09' && q2.end.zoom === q1.end.zoom && q2.base.zoom > q1.base.zoom, `f${fStart} base ${q1.base.zoom} -> ${q2?.base?.zoom}, end ${q1.end.zoom} -> ${q2?.end?.zoom}`);
  check('the line carries the move', /to: \{ .*zoom: \d/.test((await state()).line), (await state()).line);
  await click('#placer [data-a=undo]');
  await wait(100);
  check('«Вернуть» brings back the line of the file', (await state()).line === "w09: { src: 'media/_test_card.jpg', to: { zoom: 1.3 } },", (await state()).line);
  await click('#placer [data-a=move]');
  await wait(100);
  check('the move can be switched off', (await state()).line === "w09: { src: 'media/_test_card.jpg' },", (await state()).line);
  await click('#placer [data-a=level]');
  await wait(100);
  check('«По горизонту» writes level', (await state()).line === "w09: { src: 'media/_test_card.jpg', rotate: 'level' },", (await state()).line);
  await click('#placer [data-a=reset]');
  await wait(100);
  check('«Сбросить» leaves the file name only', (await state()).line === "w09: { src: 'media/_test_card.jpg' },", (await state()).line);

  // ---- fixed ------------------------------------------------------------------------------------
  await seek(860);
  await pick('turbines');
  const E = (await spotOf('w11')) || [640, 360];
  await click('#placer [data-a=fixed]');
  await wait(150);
  const r1 = await probe(...E);
  check('fixed: a point of the picture shows the same point of the media', r1 && r1.fixed && near(r1.media, [E[0] / 1280, E[1] / 720], 0.002), r1 ? `${E}: ${fmt(r1.media)}` : 'w11 is not under the cursor');
  await page.mouse.move(...E);
  await page.mouse.wheel({ deltaY: -300 });
  await wait(100);
  before = await shot();
  const F = [E[0] - 60, E[1] + 40];
  await page.mouse.down();
  await page.mouse.move(...F, { steps: 5 });
  await page.mouse.up();
  await wait(100);
  after = await shot();
  m = await match(before, after, E, F);
  check('fixed: a drag moves the picture exactly with the cursor', m.contrast > 8 && Math.abs(m.at[0]) <= 1 && Math.abs(m.at[1]) <= 1 && m.best < 10, JSON.stringify(m));
  m = await match(before, after, E, E);
  check('… and is no longer where it was', m.best > 6 || Math.hypot(...m.at) > 6, JSON.stringify(m));
  check('the line says fixed', /fixed: true/.test((await state()).line), (await state()).line);
  st = await state();
  check('two windows wait to be saved', st.unsaved.join() === 'w09,w11' && (await page.evaluate(() => document.querySelector('#placer [data-a=save]').textContent)) === 'Сохранить в media.js (2)', st.unsaved.join());
  const line11 = st.line;
  await click('#placer [data-a=save]');
  check('one save writes both', await until(() => fileNow().includes(`  ${line11}\n`) && fileNow().includes("  w09: { src: 'media/_test_card.jpg' },\n")), fileNow().split('\n').filter((l) => /^ {2}w(09|11)/.test(l)).join(' | '));
  check('… without a reload', (await until(async () => (await state()).unsaved.length === 0)) && (await marked()));

  // ---- files ------------------------------------------------------------------------------------
  console.log('— files');
  await reloaded(() => page.evaluate(() => { const s = document.querySelector('#placer select'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); }));
  check('«заглушка» in the list takes the line out', !/^ {2}w11:/m.test(fileNow()));
  st = await state();
  check('… and the page comes back to the same frame with a placeholder in w11', st.sel === 'turbines' && st.line === null && (await frameNow()) === 860 && /заглушка/.test(st.note), JSON.stringify(st));
  await reloaded(() => page.evaluate(() => { const s = document.querySelector('#placer select'); s.value = 'media/_test_card.jpg'; s.dispatchEvent(new Event('change', { bubbles: true })); }));
  st = await state();
  check('a file from the list goes into the window', st.line === "w11: { src: 'media/_test_card.jpg' }," && fileNow().includes("  w11: { src: 'media/_test_card.jpg' },\n") && /в окне w11/.test(st.note), JSON.stringify(st));

  await seek(165);
  await pick('workers');
  await wait(100);
  st = await state();
  check('a window with a placeholder says what to do', st.line === null && /заглушка/.test(st.note) && /Перетащите/.test(st.note), st.note);
  const input = await page.$('#placer input[type=file]');
  await reloaded(() => input.uploadFile(`${tmp}/_test_pick.jpg`));
  st = await state();
  check('«Загрузить…»: the file is in public/media/ and in the window', fs.existsSync(`${MEDIA}/_test_pick.jpg`) && st.line === "w01: { src: 'media/_test_pick.jpg' }," && st.files.includes('_test_pick.jpg') && (await frameNow()) === 165, JSON.stringify(st));

  // dropped on a window: w02 at f215; a photo bigger than the film can use is scaled down on the way, upright
  await seek(215);
  const drop = (bytes, name, type, x, y) => page.evaluate(async (b64, name, type, x, y) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type }));
    const view = document.getElementById('view'), box = view.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: box.left + (x / 1280) * box.width, clientY: box.top + (y / 720) * box.height };
    view.dispatchEvent(new DragEvent('dragover', init));
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));      // the tags are drawn with the picture
    const hot = [...document.querySelectorAll('#placer-tags span')].find((t) => t.classList.contains('hot'));
    view.dispatchEvent(new DragEvent('drop', init));
    return hot ? hot.textContent : null;
  }, bytes.toString('base64'), name, type, x, y);
  const spot = await spotOf('w02');
  check('w02 is in the picture at f215', !!spot, JSON.stringify(spot));
  await drop(Buffer.from('not a picture'), 'notes.txt', 'text/plain', ...spot);
  await wait(300);
  st = await state();
  check('a file no window can show is refused with a reason', st.bad && /не поставить/.test(st.note) && !fs.existsSync(`${MEDIA}/notes.txt`), st.note);
  await drop(Buffer.from('x'), 'IMG_0001.HEIC', 'image/heic', ...spot);
  await wait(300);
  check('HEIC gets its own advice', /HEIC/.test((await state()).note), (await state()).note);
  await page.evaluate(() => { window.__placer.open(false); });
  let hot = null;
  await reloaded(async () => { hot = await drop(big, '_test_big photo #1.jpeg', 'image/jpeg', ...spot); });
  st = await state();
  const stored = `${MEDIA}/_test_big photo _1.jpg`;
  const size = fs.existsSync(stored) ? await page.evaluate(async (url) => { const im = new Image(); im.src = url; await im.decode(); return [im.naturalWidth, im.naturalHeight]; }, `${HOST}/media/${encodeURIComponent('_test_big photo _1.jpg')}`) : null;
  check('a dropped file opens the tool and lands in the window under the cursor', hot === 'w02' && st.open && st.sel === 'closeup' && st.line === "w02: { src: 'media/_test_big photo _1.jpg' },", `${hot} ${JSON.stringify(st)}`);
  check('a 24-megapixel photo taken upright is stored upright, 2304×4096', !!size && size[0] === 2304 && size[1] === 4096, `${size}`);
  check('… and the note says so', /уменьшен: 3600×6400 → 2304×4096/.test(st.note), st.note);
  check('… and it shows in the window', (await probe(...spot))?.media?.length === 2, JSON.stringify(await probe(...spot)));

  // ---- read-only page ---------------------------------------------------------------------------
  if (ip) {
    await page.goto('about:blank');
    await page.goto(`http://${ip}:5173/?f=430&paused&edit&dpr=1&nowarm`, { waitUntil: 'load', timeout: 120000 });
    await ready();
    await page.mouse.move(...A);
    await page.mouse.wheel({ deltaY: -200 });
    await wait(150);
    st = await state();
    const off = await page.evaluate(() => ['[data-a=save]', '[data-a=pick]', 'select'].map((q) => document.querySelector(`#placer ${q}`).disabled));
    check('opened from another address: pictures move, the line shows, nothing can be written', !st.write && st.unsaved.join() === 'w05' && /zoom: 1\.\d+/.test(st.line) && off.every(Boolean) && /Запись выключена/.test(st.note), `${JSON.stringify(off)} ${st.line} ${st.note}`);
    // the page itself was drawn by the paused film's own loop (nobody asked it to render): the window is not black
    await page.screenshot({ path: '/tmp/work/placer_readonly.png', captureBeyondViewport: false });
  }
  await page.keyboard.press('KeyE');
  await wait(100);
  check('E closes the tool', !(await state()).open && (await page.evaluate(() => document.getElementById('placer').hidden)));
  console.log(msgs.length ? 'CONSOLE: ' + [...new Set(msgs)].join(' | ') : '(no console messages)');
} catch (e) {
  failed++;
  console.log('STOPPED:', e.message);
} finally {
  await browser.close();
  fs.writeFileSync(SETTINGS, original);
  for (const n of fs.readdirSync(MEDIA)) if (!hadFiles.has(n)) fs.rmSync(`${MEDIA}/${n}`, { force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `${failed} check(s) FAILED` : 'all checks passed');
process.exit(failed ? 1 : 0);
