// titlertest.mjs — the title tool of the dev server (src/dev/: titler.js, brandServer.js; key T on the page), driven
// with a real keyboard and mouse in headless Chromium, and its server side asked directly.
//   cd /tmp/tools && node titlertest.mjs [OUTDIR]     (the dev server must run on :5173, started on this machine)
//   DPR=1 in the environment: the film drawn at its full size, not at half of it (then about nine minutes, not three)
//   URL=http://localhost:5174: another dev server of the same checkout — one started without MEDIA_TOOL=remote also
//   gets the server's "read-only" refusals checked (with it they do not apply and are skipped)
// It makes its own test pictures (public/media/_test_*), writes its own settings into src/brand.js and, when it is done
// or has failed, puts src/brand.js back as it found it and removes the pictures it added. Frames it compared are left
// in OUTDIR (default /tmp/work/titlertest) for the eye.
// Checks: who may write; what may be written and into what kind of file; the title follows the typing without the page
// loading again, and is — pixel for pixel — the title a fresh page draws from the saved file; saving, taking back,
// a file changed by hand; a logo from the button, dropped, replaced under its name; what the tool warns about;
// keys typed into a field do not drive the film; the two tools do not get into each other's way; the panel stands
// beside the film, not over it. Without a GPU every frame takes its time: hence the film at half size.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';

const REPO = process.env.REPO || '/home/user/circle.animaation.proto-2';
const BRAND = `${REPO}/src/brand.js`, WINDOWS = `${REPO}/src/media.js`, MEDIA = `${REPO}/public/media`;
const HOST = (process.env.URL || 'http://localhost:5173').replace(/\/$/, '');
const OUT = process.argv[2] || '/tmp/work/titlertest';
const DPR = Number(process.env.DPR) || 0.5;
fs.mkdirSync(OUT, { recursive: true });
const original = fs.readFileSync(BRAND, 'utf8'), windowsWere = fs.readFileSync(WINDOWS, 'utf8'), hadFiles = new Set(fs.readdirSync(MEDIA));
const head = original.slice(0, original.indexOf('export default {'));
const fileNow = () => fs.readFileSync(BRAND, 'utf8');
const blockNow = () => fileNow().slice(head.length);
const exported = async (text) => (await import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`)).default;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0, checks = 0;
const check = (name, ok, info = '') => { checks++; if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? '  — ' + String(info).slice(0, 260) : ''}`); };
/** The file replaced in one step: written in place it is empty for a moment, and the dev server reports two changes. */
const put = (text) => { fs.writeFileSync(`${BRAND}.titlertest-tmp`, text); fs.renameSync(`${BRAND}.titlertest-tmp`, BRAND); };
/** … and the dev server serves it (it notices a change a moment later). */
const putServed = async (text) => {
  put(text);
  const want = text.slice(text.indexOf('export default {'), text.indexOf('export default {') + 60).split('\n')[1] ?? '';
  for (let i = 0; i < 100; i++) { if ((await (await fetch(`${HOST}/src/brand.js`)).text()).includes(want.trim().slice(0, 30))) return; await wait(100); }
  throw new Error('the dev server does not serve the new src/brand.js');
};
const brandText = (lines) => `${head}export default {\n${lines.map((l) => `  ${l}\n`).join('')}};\n`;

const LOGO = (fill, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200"${extra}><path fill="${fill}" d="M120 8 L228 192 H12 Z M120 70 L66 162 H174 Z"/><circle cx="120" cy="132" r="17" fill="${fill}"/></svg>`;
const DISC = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="96" fill="#2e86e2"/><rect x="60" y="60" width="80" height="80" fill="#e2452e"/></svg>';

const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: chromium.args, defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 } });
let page = await browser.newPage();
const msgs = [];
let loads = 0;
const listen = (p) => {
  p.on('console', (m) => { if (['error', 'warning', 'warn'].includes(m.type())) msgs.push(m.text().slice(0, 200)); });
  p.on('pageerror', (e) => msgs.push('PAGEERROR ' + (e.stack || e.message).slice(0, 300)));
  p.on('load', () => loads++);
};
listen(page);
const ready = async (p = page) => { await p.waitForFunction('window.__ready === true && !!window.__titler && !!window.__placer', { timeout: 120000 }); await p.evaluate(() => window.__titler.asked); await wait(300); };
const state = () => page.evaluate(() => window.__titler.state());
const film = () => page.evaluate(() => ({ frame: Math.round(window.__player.time * 24 + 1), playing: window.__player.playing, sound: window.__player.sound, bars: window.__stage.final.uniforms.uBars.value > 0, placer: window.__placer.state().open, tab: document.title }));
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await wait(100); } return false; };
/** the title on the screen is the one asked for last */
const settled = async () => { if (!(await until(async () => (await state()).settled))) throw new Error('the title did not follow'); await wait(60); };
const shot = (f = 1100, p = page) => p.evaluate((f) => { window.__player.renderAt(f); return document.getElementById('view').toDataURL('image/png'); }, f);
const save = (name, url) => fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
/**
 * two frames: the largest difference of a channel, how many pixels differ, the largest difference inside the box
 * [x0, y0, x1, y1] (in the film's own 1280×720 px, whatever size the frames have); a different size: most = 999
 */
const differ = (a, b, box = [0, 0, 1280, 720]) => page.evaluate(async (a, b, box) => {
  const px = async (url) => { const img = new Image(); img.src = url; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height); };
  const A = await px(a), B = await px(b), k = A.width / 1280;
  if (A.width !== B.width || A.height !== B.height) return { most: 999, count: -1, inBox: 999, sizes: [A.width, A.height, B.width, B.height] };
  let most = 0, count = 0, inBox = 0;
  for (let y = 0; y < A.height; y++) for (let x = 0; x < A.width; x++) {
    const i = (y * A.width + x) * 4, d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
    if (d > most) most = d;
    if (d) count++;
    if (d > inBox && x >= box[0] * k && x < box[2] * k && y >= box[1] * k && y < box[3] * k) inBox = d;
  }
  return { most, count, inBox };
}, a, b, box);
const CAPTION = [200, 480, 1080, 600], EMBLEM = [545, 200, 745, 440];      // where the caption and the emblem stand at f1100
/**
 * the frames a page that has just been opened draws from the file as it is — with the tool open, as in the page under
 * test: the film is then the same size in both. -> { frame: picture }
 */
const fresh = async (frames = [1100]) => {
  const p = await browser.newPage();
  await p.goto(`${HOST}/?f=1100&paused&nowarm&dpr=${DPR}&title`, { waitUntil: 'load', timeout: 120000 });
  await ready(p);
  const out = {};
  for (const f of frames) out[f] = await shot(f, p);
  await p.close();
  return out;
};
const rect = (q) => page.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(Math.round); }, q);
const field = (a) => `#titler [data-a=${a}]`;
/** types `text` into a field in place of what it holds */
const type = async (a, text) => {
  await page.evaluate((q) => { const i = document.querySelector(q); i.focus(); i.select(); }, field(a));
  if (text) await page.keyboard.type(text, { delay: 8 }); else await page.keyboard.press('Backspace');
  await settled();
};
const slide = async (a, value) => {
  await page.evaluate((q, value) => { const s = document.querySelector(q); s.value = String(value); s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }, field(a), value);
  await settled();
};
const choose = async (a, value) => {
  await page.evaluate((q, value) => { const s = document.querySelector(q); s.value = value; s.dispatchEvent(new Event('change', { bubbles: true })); }, field(a), value);
  await settled();
};
const click = (a) => page.evaluate((q) => document.querySelector(q).click(), field(a));
const post = (path, body, headers = {}, host = HOST) => fetch(host + path, { method: 'POST', headers, body }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const send = (settings, headers = {}, host = HOST) => post('/__brand', JSON.stringify({ settings }), { 'Content-Type': 'application/json', ...headers }, host);
const drop = (bytes, name, type) => page.evaluate(async (b64, name, type) => {
  const dt = new DataTransfer();
  dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type }));
  const view = document.getElementById('view'), init = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: 400, clientY: 300 };
  const over = new DragEvent('dragover', init);
  view.dispatchEvent(over);
  const hot = document.getElementById('titler').classList.contains('hot');
  view.dispatchEvent(new DragEvent('drop', init));
  return { hot, taken: over.defaultPrevented };
}, Buffer.from(bytes).toString('base64'), name, type);

try {
  // ============================== the dev server, asked directly ==============================
  console.log('— the dev server');
  let r = await fetch(`${HOST}/__brand`).then((x) => x.json());
  check('the server answers: may it write, and how big a file may be', r.write === true && Array.isArray(r.files) && r.max > 1e6, JSON.stringify(r));
  r = await send({ caption: 'Чужая страница' }, { 'Sec-Fetch-Site': 'cross-site' });
  check('a page of another site may not write (Sec-Fetch-Site)', r.status === 403 && r.error === 'cross-origin', JSON.stringify(r));
  r = await send({ caption: 'Чужая страница' }, { Origin: 'http://evil.example' });
  check('… nor one that names another origin', r.status === 403, JSON.stringify(r));
  // a dev server started with MEDIA_TOOL=remote lets other machines write: the read-only checks do not apply to it
  const remote = (await fetch(`${HOST}/__brand`, { headers: { 'X-Forwarded-For': '203.0.113.7' } }).then((x) => x.json())).write === true;
  if (remote) console.log('     (the dev server runs with MEDIA_TOOL=remote: the server\'s read-only checks are skipped)');
  else {
    r = await send({ caption: 'Через прокси' }, { 'X-Forwarded-For': '203.0.113.7' });
    check('through a proxy the tool is read-only', r.status === 403 && r.error === 'read-only', JSON.stringify(r));
    r = await new Promise((done) => {
      const q = http.request(`${HOST}/__brand`, { method: 'POST', headers: { Host: 'evil.example', Origin: 'http://evil.example', 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' } }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => done({ status: res.statusCode, body }));
      });
      q.on('error', (e) => done({ status: 0, body: e.message }));
      q.end(JSON.stringify({ settings: { caption: 'Чужое имя' } }));
    });
    check('under a host name that is not localhost the tool is read-only', r.status === 403 && /read-only/.test(r.body), JSON.stringify(r));
    const ip = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal)?.address;
    if (ip) {
      r = await send({ caption: 'С другого адреса' }, {}, `http://${ip}:${new URL(HOST).port || 80}`);
      check('from another address the tool is read-only', r.status === 403 && r.error === 'read-only', `${ip}: ${JSON.stringify(r)}`);
    }
  }
  for (const [what, settings] of [['a picture that is not in public/media/', { caption: 'x', emblem: 'media/_test_nothing.svg' }], ['a file outside public/media/', { caption: 'x', emblem: '../src/main.js' }],
    ['an address', { caption: 'x', emblem: 'https://example.com/logo.svg' }], ['a file that is no picture', { caption: 'x', emblem: 'media/.gitkeep' }],
    ['a caption that is a number', { caption: 7 }], ['a size that is text', { caption: 'x', size: '2; alert(1)' }], ['a size that is not a number', { caption: 'x', size: null }],
    ['a caption of 201 characters', { caption: 'я'.repeat(201) }], ['a ring that is text', { caption: 'x', ring: 'no' }], ['no settings', undefined]]) {
    r = await send(settings);
    check(`refused: ${what}`, r.status === 400 && !!r.error, JSON.stringify(r));
  }
  r = await post('/__brand', 'caption: x', { 'Content-Type': 'application/json' });
  check('refused: a body that is not JSON', r.status === 400 && r.error === 'not JSON', JSON.stringify(r));
  r = await post('/__brand/elsewhere', '{}', { 'Content-Type': 'application/json' });
  check('an address the tool does not have: 404', r.status === 404, JSON.stringify(r));
  check('none of that touched src/brand.js', fileNow() === original);

  // ---- pictures
  r = await post('/__brand/file?name=_test_logo.svg', LOGO('#000000'));
  check('an SVG is taken into public/media/', r.ok && r.name === '_test_logo.svg' && r.replaced === false && fs.readFileSync(`${MEDIA}/_test_logo.svg`, 'utf8') === LOGO('#000000'), JSON.stringify(r));
  r = await post(`/__brand/file?name=${encodeURIComponent('../../src/_test_climb.svg')}`, DISC);
  check('a name with folders lands in public/media/ all the same', r.ok && r.name === '_test_climb.svg' && fs.existsSync(`${MEDIA}/_test_climb.svg`) && !fs.existsSync(`${REPO}/src/_test_climb.svg`), JSON.stringify(r));
  for (const name of ['_test_film.mp4', '_test_page.html', '_test_script.js', '_test_logo.svg.exe', '.svg']) {
    r = await post(`/__brand/file?name=${encodeURIComponent(name)}`, 'x');
    check(`refused as a picture for the emblem: ${name}`, r.status === 400 && !fs.existsSync(`${MEDIA}/${name}`), JSON.stringify(r));
  }
  r = await post('/__brand/file?name=_test_empty.png', '');
  check('an empty file is refused and leaves nothing behind', r.status === 400 && !fs.readdirSync(MEDIA).some((n) => n.startsWith('.upload') || n === '_test_empty.png'), JSON.stringify(r));
  r = await post('/__media/file?name=_test_window.svg', DISC);
  check('the windows\' side still takes no SVG', r.status === 400 && !fs.existsSync(`${MEDIA}/_test_window.svg`), JSON.stringify(r));
  r = await fetch(`${HOST}/__brand`).then((x) => x.json());
  const windowFiles = (await fetch(`${HOST}/__media`).then((x) => x.json())).files.map((f) => f.name);
  check('the list has the pictures; the windows\' list has no SVG', r.files.some((f) => f.name === '_test_logo.svg' && f.size === LOGO('#000000').length) && !windowFiles.some((n) => /\.svg$/.test(n)), JSON.stringify(r.files));
  r = await fetch(`${HOST}/media/_test_logo.svg`);
  check('an SVG of public/media/, opened by its address, may run no script', /script-src 'none'/.test(r.headers.get('content-security-policy') || '') && /svg/.test(r.headers.get('content-type') || ''), `${r.headers.get('content-security-policy')}; ${r.headers.get('content-type')}`);

  // ---- the lines
  put(brandText(["caption: 'Янтарный циркуль',", "// tagline: 'архитектурное бюро',", "// emblem: 'media/logo.svg',"]));
  const plain = fileNow();
  r = await send({ caption: "Д'Артаньян \\ Ко", tagline: '  три   мушкетёра ', size: 1.2504, emblem: 'media/_test_logo.svg', emblemSize: 1.4, emblemGold: false, ring: false, name: 'Проба' });
  check('settings are written as lines; the comments above and the examples stay', r.ok && r.changed && fileNow() === brandText(["caption: 'Д\\'Артаньян \\\\ Ко',", "tagline: 'три мушкетёра',", "// tagline: 'архитектурное бюро',",
    'size: 1.25,', "emblem: 'media/_test_logo.svg',", "// emblem: 'media/logo.svg',", 'emblemSize: 1.4,', 'emblemGold: false,', 'ring: false,', "name: 'Проба',"]), blockNow());
  check('… and the file, read as a module, says exactly that', JSON.stringify(await exported(fileNow())) === JSON.stringify({ caption: "Д'Артаньян \\ Ко", tagline: 'три мушкетёра', size: 1.25, emblem: 'media/_test_logo.svg', emblemSize: 1.4, emblemGold: false, ring: false, name: 'Проба' }), JSON.stringify(await exported(fileNow())));
  r = await send({ caption: "Д'Артаньян \\ Ко", tagline: 'три мушкетёра', size: 1.25, emblem: 'media/_test_logo.svg', emblemSize: 1.4, emblemGold: false, ring: false, name: 'Проба' });
  check('the same settings again change nothing', r.ok && r.changed === false, JSON.stringify(r));
  r = await send({ caption: 'Янтарный циркуль', emblem: 'compass', emblemSize: 1.4, emblemGold: true });
  check('back to the defaults: the file is what it was, byte for byte (a picture\'s size without a picture is not written)', r.ok && fileNow() === plain, blockNow());
  put(brandText(["caption: 'Старое',   // название", "emblem: 'https://127.0.0.1:9/kept.svg',", '', '// своё примечание', 'size: 2,']));
  r = await send({ caption: 'Новое', emblem: 'https://127.0.0.1:9/kept.svg', tagline: 'строка' });
  check('an address the file names already may stay; a comment after a line and the user\'s own lines stay', r.ok && fileNow() === brandText(["caption: 'Новое',   // название", "tagline: 'строка',", "emblem: 'https://127.0.0.1:9/kept.svg',", '', '// своё примечание']), blockNow());
  put(brandText(["caption: 'Старое',", "emblem: 'media/_test_logo.svg',"]).replace(/\n/g, '\r\n'));
  r = await send({ caption: 'Новое', emblem: 'media/_test_logo.svg', ring: false });
  check('a file with Windows line ends keeps them', r.ok && fileNow() === brandText(["caption: 'Новое',", "emblem: 'media/_test_logo.svg',", 'ring: false,']).replace(/\n/g, '\r\n'), JSON.stringify(blockNow()));
  put(`${head}const NAME = 'Имя из переменной';\nexport default {\n  caption: NAME,\n  size: 1.5,\n};\n`);
  r = await send({ caption: 'Имя словами', size: 1.5 });
  check('a value that was an expression becomes the plain value', r.ok && fileNow() === `${head}const NAME = 'Имя из переменной';\nexport default {\n  caption: 'Имя словами',\n  size: 1.5,\n};\n`, blockNow());
  for (const [what, text, error] of [
    ['two settings on one line', brandText(["caption: 'Раз', size: 2,"]), /line of caption is not a plain/],
    ['a setting that takes several lines', brandText(["caption: 'Раз'", "  + ' и два',"]), /cannot be read as a module/],
    ['the same setting twice', brandText(["caption: 'Раз',", "caption: 'Два',"]), /two lines of caption/],
    ['settings kept in a variable', `${head}const brand = { caption: 'Раз' };\nexport default brand;\n`, /no "export default \{" line/],
    ['settings spread from elsewhere', `${head}const base = { tagline: 'из другого места' };\nexport default {\n  ...base,\n  caption: 'Раз',\n};\n`, /written in a way the tool cannot change/],
    ['a file that is not a module', brandText(["caption: 'Раз' 'Два',"]), /line of caption is not a plain|cannot be read as a module/],
    ['a file with a mistake elsewhere', `${head}const x = ;\nexport default {\n  caption: 'Раз',\n};\n`, /cannot be read as a module/],
  ]) {
    put(text);
    r = await send({ caption: 'Новое', size: 1.5 });
    check(`a file the tool does not understand is left alone: ${what}`, r.status === 400 && error.test(r.error) && fileNow() === text, JSON.stringify(r));
  }
  check('no temporary file is left in src/', !fs.readdirSync(`${REPO}/src`).some((n) => /tmp/.test(n)), fs.readdirSync(`${REPO}/src`).join(' '));

  // ============================== the page ==============================
  console.log('— the page');
  await putServed(plain);
  await page.goto(`${HOST}/?f=300&paused&dpr=${DPR}&nowarm`, { waitUntil: 'load', timeout: 120000 });
  await ready();
  loads = 0;
  let st = await state();
  check('the tool is there, closed; its button is in the player\'s bar', !st.open && (await page.evaluate(() => document.getElementById('titler').hidden && !!document.querySelector('#hud #titler-open'))), JSON.stringify(st.open));
  check('… and the film fills the window', JSON.stringify(await rect('#view')) === '[0,0,1280,720]', JSON.stringify(await rect('#view')));
  await page.keyboard.press('KeyT');
  await wait(300);
  st = await state();
  let fm = await film();
  check('T opens it and brings the finished title onto the screen, paused', st.open && fm.frame === 1100 && !fm.playing && !(await page.evaluate(() => document.getElementById('titler').hidden)), JSON.stringify(fm));
  let view = await rect('#view'), panel = await rect('#titler');
  check('the panel stands beside the film, not over it: the whole title is to be seen', view[0] === 0 && view[2] === 922 && view[3] - view[1] === 519 && panel[0] >= view[2] && panel[2] <= 1280 && panel[3] <= 720, `film ${view}, panel ${panel}`);
  const compass = await shot();
  check('… with the file\'s settings, nothing to save, and it may write', !st.unsaved && st.write && st.now.caption === 'Янтарный циркуль' && st.block === "export default {\n  caption: 'Янтарный циркуль',\n};" && st.files.includes('_test_logo.svg')
    && (await page.evaluate(() => document.querySelector('#titler [data-a=save]').disabled && document.querySelector('#titler [data-a=undo]').disabled)), JSON.stringify(st));
  await page.keyboard.press('KeyE');
  await wait(200);
  check('E opens the placement tool, and this one closes; the film fills the window again', !(await state()).open && (await film()).placer && JSON.stringify(await rect('#view')) === '[0,0,1280,720]', JSON.stringify(await rect('#view')));
  await page.keyboard.press('KeyT');
  await wait(200);
  check('T opens this one again, and the placement tool closes', (await state()).open && !(await film()).placer && (await page.evaluate(() => document.getElementById('placer').hidden)));
  await page.evaluate(() => document.querySelector('#hud #titler-open').click());
  await wait(100);
  const closedByButton = !(await state()).open;
  await page.evaluate(() => document.querySelector('#hud #titler-open').click());
  await wait(100);
  check('the button in the player\'s bar closes and opens it', closedByButton && (await state()).open);

  // ---- typing
  await type('caption', 'Северный ветер');
  st = await state();
  fm = await film();
  const typed = await shot();
  let d = await differ(compass, typed, CAPTION);
  check('a caption is typed: the film shows it', st.now.caption === 'Северный ветер' && d.inBox > 60, JSON.stringify(d));
  check('… the tab is named after it, the block shows the line, there is something to save', fm.tab === 'Северный ветер — three.js' && st.block === "export default {\n  caption: 'Северный ветер',\n};" && st.unsaved
    && (await page.evaluate(() => !document.querySelector('#titler [data-a=save]').disabled && /не сохранено/.test(document.querySelector('#titler header').textContent))), st.block);
  check('… and the page was not loaded again, nor the file touched', loads === 0 && fileNow() === plain, `${loads} loads`);
  // letters that are the player's and the tools' keys, a space, arrows — typed into the field
  await page.evaluate((q) => { const i = document.querySelector(q); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, field('tagline'));
  await page.keyboard.type('meet b', { delay: 8 });
  for (const key of ['ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowRight', 'Space', 'KeyT', 'KeyM', 'KeyE', 'KeyB']) await page.keyboard.press(key);
  await settled();
  st = await state();
  fm = await film();
  check('keys typed into a field are text: the film stays where it is, silent, without bars; the tools stay as they are', st.now.tagline === 'meet b tmeb' && st.open && fm.frame === 1100 && !fm.playing && !fm.sound && !fm.bars && !fm.placer, `${JSON.stringify(st.now.tagline)} ${JSON.stringify(fm)}`);
  await page.keyboard.press('Enter');
  check('Enter leaves the field', await page.evaluate(() => document.activeElement === document.body));
  await type('tagline', '  архитектурное   бюро ');
  await page.keyboard.press('Enter');
  await wait(100);
  check('a field that is left shows the text as it will be written', (await page.evaluate((q) => document.querySelector(q).value, field('tagline'))) === 'архитектурное бюро' && (await state()).block.includes("  tagline: 'архитектурное бюро',\n"));

  // ---- what is typed is what a fresh page draws from the saved file
  const tool = await shot();
  save('typed_in_the_tool', tool);
  await click('save');
  await until(async () => /Сохранено/.test((await state()).note));
  st = await state();
  check('«Сохранить» writes the lines', fileNow() === brandText(["caption: 'Северный ветер',", "tagline: 'архитектурное бюро',", "// tagline: 'архитектурное бюро',", "// emblem: 'media/logo.svg',"]) && st.note === 'Сохранено в src/brand.js.' && !st.bad, blockNow());
  await wait(1500);      // (the file's change has come back to the page by now)
  st = await state();
  fm = await film();
  check('… nothing is left to save, the page was not loaded again and stays on its frame', !st.unsaved && loads === 0 && fm.frame === 1100 && !fm.playing && st.now.caption === 'Северный ветер' && st.note === 'Сохранено в src/brand.js.', `${loads} loads; ${JSON.stringify(st.now)}`);
  let f = await fresh([1100, 990, 1010, 1040, 1212]);
  save('fresh_page', f[1100]);
  d = await differ(tool, f[1100]);
  check('the title built under the typing is, pixel for pixel, the one a fresh page draws from the saved file', d.most === 0, JSON.stringify(d));
  d = await differ(await shot(), f[1100]);
  check('… and still is after the save has come back', d.most === 0, JSON.stringify(d));
  for (const [frame, what] of [[990, 'the emblem appearing'], [1010, 'the circle being drawn'], [1040, 'the caption rising'], [1212, 'the end']]) {
    d = await differ(await shot(frame), f[frame]);
    check(`… at frame ${frame} too (${what})`, d.most === 0, JSON.stringify(d));
  }

  // ---- taking back; the file changed by hand
  await type('caption', 'Совсем другое');
  check('typing after a save: something to save again', (await state()).unsaved);
  await click('undo');
  await settled();
  st = await state();
  d = await differ(await shot(), tool);
  check('«Вернуть» brings the file\'s settings back, on the screen too', !st.unsaved && st.now.caption === 'Северный ветер' && d.most === 0 && (await page.evaluate((q) => document.querySelector(q).value, field('caption'))) === 'Северный ветер', JSON.stringify(d));
  await type('caption', 'Не сохранённое');
  put(brandText(["caption: 'Из редактора',", 'size: 1.3333333,', 'ring: false,']));
  await until(async () => (await state()).now.caption === 'Из редактора');
  await settled();
  st = await state();
  fm = await film();
  check('the file is saved in an editor: the panel and the title follow it, the page is not loaded again', st.now.caption === 'Из редактора' && st.now.size === 1.333 && st.now.ring === false && !st.unsaved && /показано то, что в файле/.test(st.note) && loads === 0 && fm.frame === 1100 && fm.tab === 'Из редактора — three.js', JSON.stringify(st.now));
  f = await fresh();
  d = await differ(await shot(), f[1100]);
  check('… and the title is the one a fresh page draws from that file', d.most === 0, JSON.stringify(d));
  // a file written in a way the tool cannot rewrite
  const odd = brandText(["caption: 'Раз', size: 2,"]);
  put(odd);
  await until(async () => (await state()).now.caption === 'Раз');
  await settled();
  await type('caption', 'Два');
  const refused = msgs.length;
  await click('save');
  await until(async () => /не удалось/.test((await state()).note));
  st = await state();
  check('a file the tool cannot rewrite: it is shown all the same; saving is refused with advice, and the file stays', st.now.size === 2 && st.bad && st.unsaved && fileNow() === odd
    && /^Сохранить не удалось \(src\/brand\.js написан не так, как его умеет менять инструмент: каждая настройка должна стоять на своей строке\)\. Блок можно скопировать/.test(st.note), st.note);
  check('… the console has the browser\'s own notice of the refused request and nothing else', msgs.slice(refused).every((m) => /Failed to load resource: the server responded with a status of 400/.test(m)), msgs.slice(refused).join(' | '));
  msgs.length = refused;

  // ---- sliders, the circle
  await putServed(plain);
  await until(async () => (await state()).now.caption === 'Янтарный циркуль');
  await settled();
  d = await differ(await shot(), compass);
  check('the placeholder is back when the file says so: the frame the page first drew', d.most === 0, JSON.stringify(d));
  await slide('size', 1.45);
  await click('ring');
  await settled();
  st = await state();
  check('the size slider and the circle\'s box', st.now.size === 1.45 && st.now.ring === false && st.block === "export default {\n  caption: 'Янтарный циркуль',\n  size: 1.45,\n  ring: false,\n};" && (await page.evaluate(() => document.querySelector('#titler [data-a=size]').nextElementSibling.textContent)) === '1.45', st.block);
  check('with the compass the picture\'s own settings are not offered', await page.evaluate(() => document.querySelector('#titler .pic').hidden));
  // a slider that has the keyboard: the arrows are its own, the other keys are the film's
  await page.evaluate((q) => document.querySelector(q).focus(), field('size'));
  await page.keyboard.press('ArrowRight');
  await settled();
  st = await state(); fm = await film();
  check('an arrow pressed on a slider moves the slider, not the film', st.now.size === 1.5 && fm.frame === 1100 && !fm.playing, `${st.now.size} ${JSON.stringify(fm)}`);
  await page.keyboard.press('Space');
  await wait(400);
  fm = await film();
  check('… Space pressed on it plays the film', fm.playing && fm.frame > 1100, JSON.stringify(fm));
  await page.keyboard.press('Space');
  await page.keyboard.press('KeyB');
  await wait(200);
  fm = await film();
  check('… and pauses it; B turns the bars on', !fm.playing && fm.bars, JSON.stringify(fm));
  await page.keyboard.press('KeyB');
  await click('still');
  await wait(200);
  await slide('size', 2.2);
  st = await state();
  check('letters above 1.6 under an emblem: the tool says they grow no further', /не растут дальше 1\.6/.test(st.warn), st.warn);
  await choose('emblem', 'none');
  st = await state();
  check('… with neither emblem nor circle they do, and nothing is said', st.now.emblem === 'none' && st.warn === '' && st.info.emblem === 'none', st.warn);
  await click('undo');
  await settled();

  // ---- what the font cannot draw
  const before = msgs.length;
  await type('caption', 'Αθήνα 東京 ok');
  st = await state();
  check('characters the font lacks are named', /В шрифте титра нет знаков Α θ ή ν α 東 京 — в титре их не будет\./.test(st.warn) && msgs.slice(before).filter((m) => /no glyphs for Α θ ή ν α 東 京/.test(m)).length === 1, `${st.warn} | ${msgs.slice(before).join(' | ')}`);
  await type('caption', 'Цена 5 ₽');
  st = await state();
  check('… one character: said in the singular', /нет знака ₽ — в титре его не будет/.test(st.warn), st.warn);
  await type('caption', '');
  st = await state();
  check('no caption: the line says so, the tab is named three.js', st.block.includes("  caption: '',\n") && st.warn === '' && (await film()).tab === 'three.js' && st.info.caption === null, st.block);
  await type('name', 'Сайт бюро');
  check('the tab\'s own name', (await film()).tab === 'Сайт бюро' && (await state()).block.includes("  name: 'Сайт бюро',\n"));
  await click('undo');
  await settled();
  msgs.length = before;      // (the warnings just asked for)

  // ---- a logo
  console.log('— a logo');
  fs.writeFileSync(`${OUT}/_test_mark.svg`, LOGO('#000000'));
  const input = await page.$('#titler input[type=file]');
  await input.uploadFile(`${OUT}/_test_mark.svg`);
  await until(async () => /эмблема титра/.test((await state()).note));
  await settled();
  st = await state();
  const black = await shot();
  save('logo_black', black);
  d = await differ(compass, black, EMBLEM);
  check('«Загрузить…»: the file is in public/media/, in the list and in the title', fs.existsSync(`${MEDIA}/_test_mark.svg`) && st.now.emblem === 'media/_test_mark.svg' && st.files.includes('_test_mark.svg') && st.info.emblem === 'image' && !st.info.pictureMissing && d.inBox > 60
    && st.note === '_test_mark.svg — эмблема титра.' && st.unsaved && fileNow() === plain, `${st.note} ${JSON.stringify(d)}`);
  check('… a picture has its size and colour to set', await page.evaluate(() => !document.querySelector('#titler .pic').hidden && document.querySelector('#titler [data-a=gold]').value === 'auto'));
  await choose('gold', 'own');
  const own = await shot();
  d = await differ(black, own, EMBLEM);
  check('«свои цвета»: the black mark is black now, not gold', (await state()).block.includes('  emblemGold: false,\n') && d.inBox > 60, JSON.stringify(d));
  await choose('gold', 'auto');
  d = await differ(black, await shot());
  check('… and gold again when the title decides', d.most === 0 && !(await state()).block.includes('emblemGold'), JSON.stringify(d));
  await slide('emblemSize', 0.6);
  d = await differ(black, await shot(), EMBLEM);
  check('the picture\'s size', (await state()).block.includes('  emblemSize: 0.6,\n') && d.inBox > 60, JSON.stringify(d));
  await slide('emblemSize', 1);
  // the same name, another picture
  fs.writeFileSync(`${OUT}/_test_mark.svg`, DISC);
  await input.uploadFile(`${OUT}/_test_mark.svg`);
  await until(async () => /заменил прежний файл/.test((await state()).note));
  await settled();
  const disc = await shot();
  save('logo_replaced', disc);
  d = await differ(black, disc, EMBLEM);
  check('another picture under the same name: the title shows the new one', fs.readFileSync(`${MEDIA}/_test_mark.svg`, 'utf8') === DISC && d.inBox > 60 && (await state()).note === '_test_mark.svg — эмблема титра (заменил прежний файл с этим именем).', JSON.stringify(d));
  await click('save');
  await until(async () => /Сохранено/.test((await state()).note));
  await wait(1200);
  f = await fresh();
  d = await differ(disc, f[1100]);
  check('saved: the lines name the picture, and a fresh page draws the same frame', fileNow() === brandText(["caption: 'Янтарный циркуль',", "// tagline: 'архитектурное бюро',", "emblem: 'media/_test_mark.svg',", "// emblem: 'media/logo.svg',"]) && d.most === 0 && loads === 0, `${blockNow()} ${JSON.stringify(d)}`);
  // dropped on the page
  const mediaWas = fs.readFileSync(WINDOWS, 'utf8');
  r = await drop(LOGO('#ffffff', ' width="120" height="100"'), '_test_drop #1.svg', 'image/svg+xml');
  await until(async () => /_test_drop _1\.svg — эмблема титра/.test((await state()).note));
  await settled();
  st = await state();
  fm = await film();
  check('a file dropped on the page while this tool is open is the title\'s logo — not a window\'s picture', r.taken && r.hot && fs.existsSync(`${MEDIA}/_test_drop _1.svg`) && st.now.emblem === 'media/_test_drop _1.svg' && st.open && !fm.placer && fs.readFileSync(WINDOWS, 'utf8') === mediaWas && loads === 0, `${JSON.stringify(r)} ${st.note}`);
  r = await drop('not a picture', '_test_clip.mp4', 'video/mp4');
  await wait(300);
  st = await state();
  check('a file that cannot be an emblem is refused with a reason', st.bad && /эмблемой не поставить/.test(st.note) && !fs.existsSync(`${MEDIA}/_test_clip.mp4`) && st.now.emblem === 'media/_test_drop _1.svg', st.note);
  // a picture that is gone
  fs.rmSync(`${MEDIA}/_test_drop _1.svg`);
  const gone = msgs.length;
  await choose('emblem', 'compass');
  await choose('emblem', 'media/_test_drop _1.svg');
  st = await state();
  d = await differ(compass, await shot(), EMBLEM);
  check('a picture that does not open: the compass stands in, and the tool says so', st.info.pictureMissing && /Картинка media\/_test_drop _1\.svg не открылась или пуста — вместо неё циркуль/.test(st.warn) && d.inBox === 0, `${st.warn} ${JSON.stringify(d)}`);
  msgs.length = gone;      // (the browser's and the film's notices about the missing file)
  await click('undo');
  await settled();

  // ---- the 2.39:1 bars
  await type('tagline', 'архитектурное бюро');
  await page.keyboard.press('Enter');
  await slide('size', 1.5);
  check('without the bars nothing is said about them', (await state()).warn === '');
  await page.keyboard.press('KeyB');
  await wait(300);
  st = await state();
  check('B outside a field turns the bars on; a second line that ends under the bar is named', (await film()).bars && /уходит под полосу/.test(st.warn), st.warn);
  save('bars_size_1.5_end', await shot(1212));
  await slide('size', 1);
  check('… at size 1 it stays above the bar: nothing is said', (await state()).warn === '', (await state()).warn);
  await page.keyboard.press('KeyB');
  await click('undo');
  await settled();

  // ---- the film's buttons
  await click('intro');
  await wait(700);
  fm = await film();
  check('«показать появление» plays the title from its first frame', fm.playing && fm.frame >= 963 && fm.frame < 1040, JSON.stringify(fm));
  await click('still');
  await wait(200);
  fm = await film();
  check('«готовый титр»: frame 1100, paused', !fm.playing && fm.frame === 1100, JSON.stringify(fm));
  // a button pressed with the mouse does not keep the keyboard
  const still = await rect(field('still'));
  await page.mouse.click((still[0] + still[2]) / 2, (still[1] + still[3]) / 2);
  await wait(200);
  await page.keyboard.press('Space');
  await wait(500);
  fm = await film();
  check('after a click on a button of the panel, Space is the film\'s key again: it plays', fm.playing && fm.frame > 1100, JSON.stringify(fm));
  await page.keyboard.press('Space');
  await wait(200);
  check('… and pauses', !(await film()).playing);
  await click('still');
  await wait(200);

  // ---- what is not saved lives through a page that loads again
  await type('caption', 'Не сохранено пока');
  await slide('emblemSize', 1.3);
  const unsaved = await shot();
  await wait(400);      // (the paused frame reaches the address a moment later)
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await ready();
  await settled();
  st = await state();
  fm = await film();
  d = await differ(unsaved, await shot());
  check('the page loads again: the tool is open, the unsaved settings are there and on the screen, on the same frame', st.open && st.unsaved && st.now.caption === 'Не сохранено пока' && st.now.emblemSize === 1.3 && fm.frame === 1100 && !fm.playing && d.most === 0 && fm.tab === 'Не сохранено пока — three.js', `${JSON.stringify(st.now)} ${JSON.stringify(d)}`);
  put(brandText(["caption: 'Файл новее',"]));
  await until(async () => (await state()).now.caption === 'Файл новее');
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await ready();
  st = await state();
  check('… but not once the file has changed: then the file is right', !st.unsaved && st.now.caption === 'Файл новее' && st.now.emblem === 'compass', JSON.stringify(st.now));

  // ---- many titles in a row: nothing piles up on the GPU
  const gpu = () => page.evaluate(() => ({ geometries: window.__stage.renderer.info.memory.geometries, textures: window.__stage.renderer.info.memory.textures, programs: window.__stage.renderer.info.programs.length }));
  await type('caption', 'Первая проба');
  await choose('emblem', 'media/_test_mark.svg');
  await shot();
  await shot();
  const gpu0 = await gpu();
  for (let i = 0; i < 8; i++) {
    await type('caption', `Проба номер ${i}`);
    await choose('emblem', i % 2 ? 'media/_test_mark.svg' : 'media/_test_logo.svg');
    await shot();
  }
  await type('caption', 'Первая проба');
  await choose('emblem', 'media/_test_mark.svg');
  await shot();
  await shot();
  const gpu1 = await gpu();
  check('a dozen and a half titles later the GPU holds what it held', JSON.stringify(gpu0) === JSON.stringify(gpu1), `${JSON.stringify(gpu0)} -> ${JSON.stringify(gpu1)}`);
  await click('undo');
  await settled();

  // ---- a page that may not write
  console.log('— a page that may not write');
  const ro = await browser.newPage();
  listen(ro);
  await ro.setRequestInterception(true);
  ro.on('request', (q) => {
    if (!/\/__brand/.test(q.url())) return q.continue();
    if (q.method() === 'GET') return q.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ name: '_test_logo.svg', size: 172 }], write: false, max: 99614720 }) });
    return q.respond({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'read-only' }) });
  });
  await ro.goto(`${HOST}/?dpr=${DPR}&nowarm&title`, { waitUntil: 'load', timeout: 120000 });
  await ready(ro);
  const main = page;
  page = ro;
  fm = await film();
  check('?title opens the tool and brings the title onto the screen', (await state()).open && fm.frame === 1100 && !fm.playing, JSON.stringify(fm));
  await type('caption', 'Только чтение');
  await choose('emblem', 'media/_test_logo.svg');
  st = await state();
  const off = await page.evaluate(() => ['[data-a=save]', '[data-a=pick]'].map((q) => document.querySelector(`#titler ${q}`).disabled));
  check('the title follows the typing and the list; nothing can be written, and the tool says where it can', !st.write && st.unsaved && off.every(Boolean) && /Запись выключена/.test(st.note) && st.info.emblem === 'image' && st.block.includes("  emblem: 'media/_test_logo.svg',\n"), `${JSON.stringify(off)} ${st.note}`);
  await click('copy');
  await wait(300);
  st = await state();
  check('«Скопировать» gives the block for src/brand.js', /Блок скопирован|Блок выделен/.test(st.note), st.note);
  r = await drop(DISC, '_test_ro.svg', 'image/svg+xml');
  await wait(300);
  check('a dropped file is not taken', (await state()).bad && /Запись выключена/.test((await state()).note) && !fs.existsSync(`${MEDIA}/_test_ro.svg`), (await state()).note);
  await page.screenshot({ path: `${OUT}/read_only.png` });
  await ro.close();
  page = main;

  // ---- a window too narrow to give the panel room of its own
  await page.setViewport({ width: 700, height: 500, deviceScaleFactor: 1 });
  await wait(400);
  view = await rect('#view'); panel = await rect('#titler');
  check('in a narrow window the panel stands over the film\'s corner, inside the window', view[0] === 0 && view[2] === 700 && panel[0] < view[2] && panel[0] >= 0 && panel[2] <= 700 && panel[3] <= 500, `film ${view}, panel ${panel}`);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await wait(400);
  view = await rect('#view'); panel = await rect('#titler');
  check('… and beside it again when the window is wide', view[2] === 922 && panel[0] >= view[2], `film ${view}, panel ${panel}`);

  await type('caption', 'Пока не сохранено');
  await page.keyboard.press('Escape');
  check('Esc leaves a field too', await page.evaluate(() => document.activeElement === document.body));
  await page.keyboard.press('KeyT');
  await wait(300);
  check('T closes the tool, and the film fills the window', !(await state()).open && (await page.evaluate(() => document.getElementById('titler').hidden)) && JSON.stringify(await rect('#view')) === '[0,0,1280,720]', JSON.stringify(await rect('#view')));
  const button = () => page.evaluate(() => { const b = document.getElementById('titler-open'); return { unsaved: b.classList.contains('unsaved'), tip: b.title }; });
  check('… while its button tells that the film shows what is not saved', (await button()).unsaved && /есть несохранённые изменения/.test((await button()).tip) && (await film()).tab === 'Пока не сохранено — three.js', JSON.stringify(await button()));
  await page.keyboard.press('KeyT');
  await click('undo');
  await settled();
  await page.keyboard.press('KeyT');
  await wait(300);
  check('… and no longer once that was taken back', !(await button()).unsaved && !(await state()).open && (await film()).tab === 'Файл новее — three.js', JSON.stringify(await button()));
  check('the page said nothing but what it was asked to say', msgs.length === 0, [...new Set(msgs)].join(' | '));
} catch (e) {
  failed++;
  console.log('STOPPED:', e.stack || e.message);
} finally {
  await browser.close();
  put(original);
  fs.writeFileSync(WINDOWS, windowsWere);
  for (const n of fs.readdirSync(MEDIA)) if (!hadFiles.has(n)) fs.rmSync(`${MEDIA}/${n}`, { force: true });
}
console.log(failed ? `${failed} of ${checks} checks FAILED` : `all ${checks} checks passed`);
process.exit(failed ? 1 : 0);
