// soundtest.mjs — the sound tool of the dev server (src/dev/: sounder.js, soundServer.js; key S on the page), driven
// with a real keyboard and mouse in headless Chromium, its server side asked directly, and the page's soundtrack
// (src/core/soundtrack.js) watched while the film runs.
//   /tmp/tools/venv/bin/python tools/soundtest.py /tmp/work/sound/files     (makes the test sounds, once)
//   cd /tmp/tools && node soundtest.mjs [FILES]      (the dev server must run on :5173, started on this machine)
//   URL=http://localhost:5174: another dev server of the same checkout — one started without MEDIA_TOOL=remote also
//   gets the server's "read-only" refusals checked (with it they do not apply and are skipped)
//   ONLY=server,panel,strips,keys,upload,drop,readonly,live: some of the parts
// It copies its test sounds into public/media/ (_test_*), writes its own settings into src/sound.js and, when it is
// done or has failed, puts src/sound.js back as it found it and removes the files it added.
// Checks: who may write; what may be written and into what kind of file; the page's player follows the panel — which
// file, from which second, how loud — without the page loading again; the two strips and what the mouse does on
// them; saving, taking back, a file changed by hand, settings that are not saved yet and a page that loads again;
// music from the button, dropped, replaced under its name; keys typed into a field do not drive the film; the tools do
// not get into each other's way; and, with the film running in real time: the music comes in and goes out where the
// settings say, follows the film's clock, and is as loud as they say.
// What it cannot check is what comes out of a loudspeaker: it reads where the <audio> element stands and what volume
// it has. (What the same settings do to the sound of a video file is measured in the file: exporttest.mjs, part music.)
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';

const REPO = process.env.REPO || '/home/user/circle.animaation.proto-2';
const SOUND = `${REPO}/src/sound.js`, MEDIA = `${REPO}/public/media`;
const HOST = (process.env.URL || 'http://localhost:5173').replace(/\/$/, '');
const FILES = process.argv[2] || '/tmp/work/sound/files';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const DPR = Number(process.env.DPR) || 0.25;
const FILM_END = 1213 / 24;
for (const f of ['_test_clicks.mp3', '_test_clicks.ogg', '_test_short.mp3']) if (!fs.existsSync(`${FILES}/${f}`)) { console.error(`no ${FILES}/${f}: run tools/soundtest.py ${FILES} first`); process.exit(1); }
const original = fs.readFileSync(SOUND, 'utf8'), hadFiles = new Set(fs.readdirSync(MEDIA));
const head = original.slice(0, original.indexOf('export default {'));
const fileNow = () => fs.readFileSync(SOUND, 'utf8');
const exported = async (text) => (await import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`)).default;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0, checks = 0;
const check = (name, ok, info = '') => { checks++; if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? '  — ' + String(info).slice(0, 300) : ''}`); };
/**
 * Is this part of the checks wanted? Each one starts as in a tab just opened: no page that could still answer a change
 * of the file, and nothing remembered — a tool that was open stays open through a page that loads again.
 */
const part = async (name, title) => {
  if (ONLY.length && !ONLY.includes(name)) return false;
  console.log(`— ${title}`);
  if (page.url().startsWith(HOST)) await page.evaluate(() => sessionStorage.clear());
  await page.goto('about:blank');
  return true;
};
const near = (a, b, by) => Math.abs(a - b) <= by;
/** The file replaced in one step: written in place it is empty for a moment, and the dev server reports two changes. */
const put = (text) => { fs.writeFileSync(`${SOUND}.soundtest-tmp`, text); fs.renameSync(`${SOUND}.soundtest-tmp`, SOUND); };
const soundText = (lines) => `${head}export default {\n${lines.map((l) => `  ${l}\n`).join('')}};\n`;
const EXAMPLES = ["// src: 'media/music.mp3',", '// start: 12.5,', '// fadeOut: 2,'];
const PLAIN = soundText(EXAMPLES);
const OWN = { src: 'audio.m4a', start: 0, volume: 1, fadeIn: 0, fadeOut: 0 };
const gain = (t, s) => {
  let g = s.volume ?? 1;
  if (s.fadeIn > 0) g *= Math.min(1, Math.max(0, t / s.fadeIn)) ** 2;
  if (s.fadeOut > 0) g *= Math.min(1, Math.max(0, (FILM_END - t) / s.fadeOut)) ** 2;
  return g;
};
const bytes = (name) => fs.readFileSync(`${FILES}/${name}`);

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(), headless: 'shell', args: chromium.args, defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
  env: { ...process.env, LC_ALL: 'C.utf8' },      // the browser finds a file with Cyrillic in its name only under a UTF-8 locale
});
let page = await browser.newPage();
const msgs = [], refused = [], uploads = [];      // what the page wrote into its console; what the server refused it; the music files it sent
let loads = 0;
const listen = (p) => {
  p.on('console', (m) => { if (['error', 'warning', 'warn'].includes(m.type())) msgs.push(m.text().slice(0, 200)); });
  p.on('pageerror', (e) => msgs.push('PAGEERROR ' + (e.stack || e.message).slice(0, 300)));
  p.on('request', (r) => { if (r.method() === 'POST' && /\/__sound\/file\?name=/.test(r.url())) uploads.push(decodeURIComponent(r.url().split('name=')[1])); });
  p.on('response', (r) => { if (r.status() >= 400) refused.push(`${r.status()} ${r.request().method()} ${decodeURIComponent(r.url().replace(HOST, ''))}`); });
  p.on('load', () => { if (p.url().startsWith(HOST)) loads++; });      // (the film's page; not the empty one between the parts)
};
listen(page);
const ready = async (p = page) => {
  await p.waitForFunction('window.__ready === true && !!window.__sounder && !!window.__placer && !!window.__titler && !!window.__exporter', { timeout: 120000 });
  await p.evaluate(() => window.__sounder.asked);
  // what the element does on its own is counted: a seek, a file read anew
  await p.evaluate(() => { const a = window.__player.audio; if (!a.__n) { a.__n = { seeking: 0, loadstart: 0 }; for (const k of Object.keys(a.__n)) a.addEventListener(k, () => a.__n[k]++); } });
  await wait(300);
};
const open = async (query) => { await page.goto(`${HOST}/?${query}&dpr=${DPR}`, { waitUntil: 'load', timeout: 120000 }); await ready(); };
const state = () => page.evaluate(() => window.__sounder.state());
const audio = () => page.evaluate(() => { const a = window.__player.audio; return { src: decodeURIComponent(new URL(a.src).pathname), t: a.currentTime, paused: a.paused, volume: a.volume, muted: a.muted, length: a.duration, error: !!a.error, rate: a.playbackRate, ...a.__n }; });
const film = () => page.evaluate(() => ({ time: window.__player.time, frame: Math.round(window.__player.time * 24 + 1), playing: window.__player.playing, sound: window.__player.sound }));
const tools = () => page.evaluate(() => ({ sounder: window.__sounder.state().open, placer: window.__placer.state().open, titler: window.__titler.state().open, exporter: window.__exporter.state().open }));
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await wait(80); } return false; };
/** the picture of the music is there (or could not be made), and the element knows the music's length */
const heard = async () => {
  if (!(await until(async () => { const s = await state(), a = await audio(); return s.wave && s.wave !== 'reading' && (a.error || Number.isFinite(a.length)); }, 30000))) throw new Error('the music was not read');
  await wait(150);
};
const rect = (q) => page.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, q);
const field = (a) => `#sounder [data-a=${a}]`;
const slide = async (a, value) => {
  await page.evaluate((q, value) => { const s = document.querySelector(q); s.value = String(value); s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }, field(a), value);
  await wait(60);
};
const choose = async (value) => { await page.select(field('src'), value); await heard(); };
const click = async (a) => { await page.evaluate((q) => document.querySelector(q).click(), field(a)); await wait(120); };
/** types a number into the field of the music's second, in place of what it holds; Enter leaves the field */
const typeStart = async (text, leave = true) => {
  await page.evaluate((q) => { const i = document.querySelector(q); i.focus(); i.select(); }, field('start'));
  await page.keyboard.type(text, { delay: 10 });
  if (leave) await page.keyboard.press('Enter');
  await wait(120);
};
const seek = async (t) => { await page.evaluate((t) => window.__player.seek(t), t); await wait(120); };
const set = async (values) => { await page.evaluate((v) => window.__sounder.set(v), values); await wait(120); };
const post = (path, body, headers = {}, host = HOST) => fetch(host + path, { method: 'POST', headers, body }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const send = (settings, headers = {}, host = HOST) => post('/__sound', JSON.stringify({ settings }), { 'Content-Type': 'application/json', ...headers }, host);
/** the file is what the page plays by: the dev server has told the page */
const followed = async (want) => {
  const key = JSON.stringify(want);
  if (!(await until(async () => JSON.stringify((await state()).file) === key))) throw new Error(`the page did not follow the file: ${JSON.stringify((await state()).file)}`);
  await wait(150);
};
/** a file dragged from the computer over the page and dropped on it */
const drop = (data, name, type, target = '#view') => page.evaluate(async (b64, name, type, target) => {
  const dt = new DataTransfer();
  dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type }));
  const node = document.querySelector(target), init = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: 400, clientY: 300 };
  const over = new DragEvent('dragover', init);
  node.dispatchEvent(over);
  const hot = document.getElementById('sounder').classList.contains('hot'), opened = window.__sounder.state().open;
  const dropped = new DragEvent('drop', init);
  node.dispatchEvent(dropped);
  return { hot, opened, taken: over.defaultPrevented, kept: dropped.defaultPrevented };
}, Buffer.from(data).toString('base64'), name, type, target);
/** a copy of the strips' picture, to be read at leisure (reading the panel's own canvas over and over makes the browser remark on it) */
const strips = () => page.evaluate(() => {
  const c = document.querySelector('#sounder canvas'), copy = Object.assign(document.createElement('canvas'), { width: c.width, height: c.height });
  const g = copy.getContext('2d', { willReadFrequently: true });
  g.drawImage(c, 0, 0);
  window.__strips = { g, k: c.width / c.clientWidth };
});
/** its colours at a place given in CSS px from the strips' corner: [r, g, b, a] */
const pixel = (x, y) => page.evaluate((x, y) => { const { g, k } = window.__strips; return [...g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data]; }, x, y);
/**
 * how tall the waveform is in the column at `x`, between rows y0 and y1: [px drawn at all — the largest sample, px drawn
 * bright — the level]. (The strips' ground is black at 45 %: anything drawn on it is more opaque.)
 */
const tall = (x, y0, y1) => page.evaluate((x, y0, y1) => {
  const { g, k } = window.__strips, d = g.getImageData(Math.round(x * k), Math.round(y0 * k), 1, Math.round((y1 - y0) * k)).data;
  let n = 0, bright = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 150) n++; if (d[i + 3] > 240 && d[i] > 200) bright++; }
  return [n / k, bright / k];
}, x, y0, y1);

try {
  // ============================== the dev server, asked directly ==============================
  if (await part('server', 'the dev server')) {
    put(PLAIN);
    let r = await fetch(`${HOST}/__sound`).then((x) => x.json());
    check('the server answers: may it write, and how big a file may be', r.write === true && Array.isArray(r.files) && r.max > 1e6, JSON.stringify(r).slice(0, 200));
    r = await send({ volume: 0.5 }, { 'Sec-Fetch-Site': 'cross-site' });
    check('a page of another site may not write (Sec-Fetch-Site)', r.status === 403 && r.error === 'cross-origin', JSON.stringify(r));
    r = await send({ volume: 0.5 }, { Origin: 'http://evil.example' });
    check('… nor one that names another origin', r.status === 403, JSON.stringify(r));
    // a dev server started with MEDIA_TOOL=remote lets other machines write: the read-only checks do not apply to it
    const remote = (await fetch(`${HOST}/__sound`, { headers: { 'X-Forwarded-For': '203.0.113.7' } }).then((x) => x.json())).write === true;
    if (remote) console.log('     (the dev server runs with MEDIA_TOOL=remote: the server\'s read-only checks are skipped)');
    else {
      r = await send({ volume: 0.5 }, { 'X-Forwarded-For': '203.0.113.7' });
      check('through a proxy the tool is read-only', r.status === 403 && r.error === 'read-only', JSON.stringify(r));
      r = await new Promise((done) => {
        const q = http.request(`${HOST}/__sound`, { method: 'POST', headers: { Host: 'evil.example', Origin: 'http://evil.example', 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' } }, (res) => {
          let body = '';
          res.on('data', (c) => { body += c; });
          res.on('end', () => done({ status: res.statusCode, body }));
        });
        q.on('error', (e) => done({ status: 0, body: e.message }));
        q.end(JSON.stringify({ settings: { volume: 0.5 } }));
      });
      check('under a host name that is not localhost the tool is read-only', r.status === 403 && /read-only/.test(r.body), JSON.stringify(r));
      const ip = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal)?.address;
      if (ip) {
        r = await send({ volume: 0.5 }, {}, `http://${ip}:${new URL(HOST).port || 80}`);
        check('from another address the tool is read-only', r.status === 403 && r.error === 'read-only', `${ip}: ${JSON.stringify(r)}`);
      }
    }
    for (const [what, settings] of [['music that is not in public/media/', { src: 'media/_test_nothing.mp3' }], ['a file outside public/media/', { src: '../src/main.js' }], ['a file of the site that is no music of the user\'s', { src: 'footage/helmet.jpg' }],
      ['an address', { src: 'https://example.com/a.mp3' }], ['a file of public/media/ that is no music', { src: 'media/.gitkeep' }], ['a src that is a number', { src: 7 }], ['a start that is text', { start: '2; alert(1)' }],
      ['a volume that is not a number', { volume: null }], ['a fade that is infinite', { fadeOut: 1e999 }], ['a src with a line break', { src: 'media/a.mp3\n};' }], ['no settings', undefined]]) {
      r = await send(settings);
      check(`refused: ${what}`, r.status === 400 && !!r.error, JSON.stringify(r));
    }
    r = await post('/__sound', 'volume: 1', { 'Content-Type': 'application/json' });
    check('refused: a body that is not JSON', r.status === 400 && r.error === 'not JSON', JSON.stringify(r));
    r = await post('/__sound/elsewhere', '{}', { 'Content-Type': 'application/json' });
    check('an address the tool does not have: 404', r.status === 404, JSON.stringify(r));
    check('none of that touched src/sound.js', fileNow() === PLAIN);

    // ---- music files
    r = await post('/__sound/file?name=_test_a.mp3', bytes('_test_short.mp3'));
    check('an MP3 is taken into public/media/', r.ok && r.name === '_test_a.mp3' && r.replaced === false && fs.readFileSync(`${MEDIA}/_test_a.mp3`).equals(bytes('_test_short.mp3')), JSON.stringify(r));
    r = await post('/__sound/file?name=_test_a.mp3', bytes('_test_short.mp3'));
    check('the same name again: the file is replaced, and the answer says so', r.ok && r.replaced === true, JSON.stringify(r));
    r = await post(`/__sound/file?name=${encodeURIComponent('../../src/_test_climb.ogg')}`, bytes('_test_clicks.ogg'));
    check('a name with folders lands in public/media/ all the same', r.ok && r.name === '_test_climb.ogg' && fs.existsSync(`${MEDIA}/_test_climb.ogg`) && !fs.existsSync(`${REPO}/src/_test_climb.ogg`), JSON.stringify(r));
    for (const name of ['_test_film.mp4', '_test_page.html', '_test_script.js', '_test_song.mp3.exe', '_test_logo.svg', '.mp3']) {
      r = await post(`/__sound/file?name=${encodeURIComponent(name)}`, 'x');
      check(`refused as music: ${name}`, r.status === 400 && !fs.existsSync(`${MEDIA}/${name}`), JSON.stringify(r));
    }
    r = await post('/__sound/file?name=_test_empty.mp3', '');
    check('an empty file is refused and leaves nothing behind', r.status === 400 && !fs.readdirSync(MEDIA).some((n) => n.startsWith('.upload') || n === '_test_empty.mp3'), JSON.stringify(r));
    r = await post('/__media/file?name=_test_window.mp3', bytes('_test_short.mp3'));
    const r2 = await post('/__brand/file?name=_test_logo.mp3', bytes('_test_short.mp3'));
    check('the windows\' side and the title\'s side take no music', r.status === 400 && r2.status === 400 && !fs.existsSync(`${MEDIA}/_test_window.mp3`) && !fs.existsSync(`${MEDIA}/_test_logo.mp3`), `${JSON.stringify(r)} ${JSON.stringify(r2)}`);
    r = await fetch(`${HOST}/__sound`).then((x) => x.json());
    const others = [...(await fetch(`${HOST}/__media`).then((x) => x.json())).files, ...(await fetch(`${HOST}/__brand`).then((x) => x.json())).files].map((f) => f.name);
    check('the list has the music with its size; the other tools\' lists have none of it', r.files.some((f) => f.name === '_test_a.mp3' && f.size === bytes('_test_short.mp3').length) && r.files.some((f) => f.name === '_test_climb.ogg') && !others.some((n) => /\.(mp3|ogg)$/.test(n)),
      JSON.stringify(r.files.map((f) => f.name)));
    r = await fetch(`${HOST}/media/_test_a.mp3`, { headers: { Range: 'bytes=1000-1999' } });
    check('the dev server hands out a piece of a music file (a browser asks for that when the film is put elsewhere)', r.status === 206 && (await r.arrayBuffer()).byteLength === 1000, `status ${r.status}, ${r.headers.get('content-range')}`);

    // ---- the lines
    r = await send({ src: 'media/_test_a.mp3', start: 12.3456, volume: 0.8049, fadeIn: 0.5, fadeOut: 2 });
    check('settings are written as lines, rounded; the comments above and the examples stay', r.ok && r.changed && fileNow() === soundText(["src: 'media/_test_a.mp3',", "// src: 'media/music.mp3',", 'start: 12.346,', '// start: 12.5,', 'volume: 0.8,', 'fadeIn: 0.5,', 'fadeOut: 2,', '// fadeOut: 2,']), fileNow().slice(head.length));
    check('… and the file, read as a module, says exactly that', JSON.stringify(await exported(fileNow())) === JSON.stringify({ src: 'media/_test_a.mp3', start: 12.346, volume: 0.8, fadeIn: 0.5, fadeOut: 2 }), JSON.stringify(await exported(fileNow())));
    r = await send({ src: 'media/_test_a.mp3', start: 12.346, volume: 0.8, fadeIn: 0.5, fadeOut: 2 });
    check('the same settings again change nothing', r.ok && r.changed === false, JSON.stringify(r));
    r = await send({ src: 'media/_test_a.mp3', start: 99999, volume: 7, fadeIn: -3, fadeOut: 500 });
    check('values out of range are brought into it', r.ok && JSON.stringify(await exported(fileNow())) === JSON.stringify({ src: 'media/_test_a.mp3', start: 3600, fadeOut: 20 }), JSON.stringify(await exported(fileNow())));
    r = await send({ volume: 0.5, evil: 'x', loop: true });
    check('keys the tool does not know are not written; the film\'s own sound needs no src', r.ok && fileNow() === soundText([EXAMPLES[0], EXAMPLES[1], 'volume: 0.5,', EXAMPLES[2]]), fileNow().slice(head.length));
    r = await send({});
    check('back to the film\'s own sound, untouched: the file is what it was', r.ok && r.changed && fileNow() === PLAIN, fileNow().slice(head.length));
    put(soundText(["src: 'https://example.com/music.mp3',   // так пока"]));
    r = await send({ src: 'https://example.com/music.mp3', volume: 0.7 });
    check('an address the file names already may stay: the tool changes the other lines', r.ok && fileNow() === soundText(["src: 'https://example.com/music.mp3',   // так пока", 'volume: 0.7,']), JSON.stringify(r));
    for (const [what, text] of [['two settings on one line', soundText(["src: 'media/_test_a.mp3', start: 2,"])], ['a value that is computed', soundText(['start: 60 + 12.5,'])], ['no export of its own', `${head}const sound = {\n  volume: 1,\n};\nexport default sound;\n`],
      ['that cannot be read', `${head}export default {\n  volume: ,\n};\n`]]) {
      put(text);
      r = await send({ src: 'media/_test_a.mp3', start: 5 });
      check(`a file with ${what} is left alone, and the answer says why`, r.status === 400 && /^src\/sound\.js/.test(r.error || '') && fileNow() === text, JSON.stringify(r));
    }
    put(PLAIN);
  }

  // ============================== the page ==============================
  put(PLAIN);
  for (const f of ['_test_clicks.mp3', '_test_clicks.ogg', '_test_short.mp3']) fs.copyFileSync(`${FILES}/${f}`, `${MEDIA}/${f}`);
  let st, a, fm, r;
  const W = () => rect('#sounder .strips');

  if (await part('panel', 'the panel')) {
    await open('f=250&paused');
    st = await state(); a = await audio(); fm = await film();
    check('the page starts with the tool closed, its button in the bar, the sound off', !st.open && (await page.evaluate(() => document.getElementById('sounder').hidden && !!document.querySelector('#hud #sounder-open'))) && !fm.sound && a.muted && a.src === '/audio.m4a', JSON.stringify({ ...fm, src: a.src, muted: a.muted }));
    await page.keyboard.press('KeyS');
    await heard();
    st = await state(); a = await audio(); fm = await film();
    check('S opens the tool and turns the sound on; the film stays where it was', st.open && fm.sound && !a.muted && fm.frame === 250 && !fm.playing && (await page.evaluate(() => document.getElementById('sounder-open').classList.contains('on'))), JSON.stringify(fm));
    check('it shows the film\'s own sound, as the empty file says', JSON.stringify(st.now) === JSON.stringify(OWN) && !st.unsaved && st.block === 'export default {\n};' && st.write && /^музыка 50,6 с$/.test(st.vals), `${JSON.stringify(st.now)}; «${st.vals}»`);
    check('… has read it for its picture', st.wave.values === 5059 && near(st.wave.seconds, 50.581, 0.01) && st.wave.most > 0.5, JSON.stringify(st.wave));
    check('… knows the film\'s cuts and its flash', JSON.stringify(st.cuts) === '[48,70,142,188,232,308,388,522,533,902,963]' && st.flash === 974, JSON.stringify(st.cuts));
    const off = await page.evaluate(() => ['save', 'undo', 'copy', 'pick'].map((k) => document.querySelector(`#sounder [data-a=${k}]`).disabled));
    check('… and has nothing to save or to take back', JSON.stringify(off) === '[true,true,false,false]', JSON.stringify(off));
    const list = await page.evaluate(() => [...document.querySelector('#sounder [data-a=src]').options].map((o) => `${o.value}|${o.textContent}`));
    check('the list offers the film\'s own sound and the music of public/media/', list[0] === 'audio.m4a|звук исходного ролика' && list.includes('media/_test_clicks.mp3|_test_clicks.mp3 · 1,6 МБ') && list.some((l) => l.startsWith('media/_test_short.mp3|')), list.join('; '));

    // ---- another music
    const before = (await audio()).loadstart, loaded = loads;
    await choose('media/_test_clicks.mp3');
    st = await state(); a = await audio();
    check('music chosen from the list sounds at once, from its beginning, under the frame on the screen', st.now.src === 'media/_test_clicks.mp3' && st.now.start === 0 && a.src === '/media/_test_clicks.mp3' && a.loadstart === before + 1 && near(a.t, 249 / 24, 0.01) && near(a.length, 70, 0.1) && !a.error && loads === loaded,
      `${a.src} at ${a.t.toFixed(3)} s of ${a.length?.toFixed(2)}; page loads: ${loads - loaded}`);
    check('… the panel says it is not saved, and shows the lines', st.unsaved && st.block === "export default {\n  src: 'media/_test_clicks.mp3',\n};" && /не сохранено/.test(await page.evaluate(() => document.querySelector('#sounder header b').textContent)) && /^музыка 1:10,0$/.test(st.vals), `«${st.vals}» ${JSON.stringify(st.block)}`);
    check('… and has read the music for its picture', near(st.wave.seconds, 70, 0.1) && st.wave.values === 7000 && st.wave.most > 0.75 && st.wave.most < 1, JSON.stringify(st.wave));

    // ---- from which second
    let seeks = (await audio()).seeking;
    await typeStart('12.5');
    st = await state(); a = await audio();
    check('a second typed into the field: the music is put there', st.now.start === 12.5 && near(a.t, 249 / 24 + 12.5, 0.01) && a.seeking > seeks && st.block.includes('  start: 12.5,\n') && /в ролике — с 12,5 с по 1:03,0$/.test(st.vals), `music at ${a.t.toFixed(3)} s; «${st.vals}»`);
    await typeStart('-3');
    st = await state(); a = await audio();
    check('a negative one: the music comes in later', st.now.start === -3 && near(a.t, 249 / 24 - 3, 0.01) && /вступает на 3,0 с ролика/.test(st.vals), `music at ${a.t.toFixed(3)} s; «${st.vals}»`);
    await typeStart('9999');
    st = await state();
    const shown = await page.evaluate(() => document.querySelector('#sounder [data-a=start]').value);
    check('too far: a second of the music stays under the film, and the field shows what will be written', near(st.now.start, 69, 0.01) && near(Number(shown), 69, 0.01) && /кончается на 1,0 с ролика/.test(st.vals), `start ${st.now.start}, the field «${shown}», «${st.vals}»`);
    await typeStart('-60');
    st = await state();
    check('… and too late as well', near(st.now.start, 1 - FILM_END, 0.001) && /вступает на 49,5 с ролика/.test(st.vals), `start ${st.now.start}; «${st.vals}»`);
    await typeStart('2');

    // ---- how loud
    seeks = (await audio()).seeking;
    await slide('volume', 0.6);
    st = await state(); a = await audio();
    check('the loudness slider: the element is that loud, and is not moved for it', st.now.volume === 0.6 && near(a.volume, 0.6, 1e-6) && a.seeking === seeks && st.block.includes('  volume: 0.6,\n'), `volume ${a.volume}; seeks ${a.seeking - seeks}`);
    await slide('fadeIn', 4);
    await slide('fadeOut', 5);
    const levels = [];
    for (const t of [0, 1, 2, 3.9, 4, 20, FILM_END - 5, FILM_END - 2.5, FILM_END - 1, 50.5]) { await seek(t); levels.push([t, (await audio()).volume]); }
    st = await state();
    check('the fades: at every place of the film the element is as loud as the settings say', st.now.fadeIn === 4 && st.now.fadeOut === 5 && levels.every(([t, v]) => near(v, gain(t, st.now), 1e-6)) && levels[0][1] === 0 && near(levels[5][1], 0.6, 1e-9) && levels[9][1] < 0.001,
      levels.map(([t, v]) => `${t.toFixed(1)}: ${v.toFixed(3)}`).join('  '));
    await seek(249 / 24);

    // ---- save
    const n0 = (await audio()).loadstart;
    await click('save');
    await until(async () => !(await state()).unsaved);
    st = await state(); a = await audio();
    const want = { src: 'media/_test_clicks.mp3', start: 2, volume: 0.6, fadeIn: 4, fadeOut: 5 };
    check('«Сохранить» writes the lines into src/sound.js', fileNow() === soundText(["src: 'media/_test_clicks.mp3',", EXAMPLES[0], 'start: 2,', EXAMPLES[1], 'volume: 0.6,', 'fadeIn: 4,', 'fadeOut: 5,', EXAMPLES[2]]) && /^Сохранено в src\/sound\.js\.$/.test(st.note) && !st.unsaved, `«${st.note}» ${fileNow().slice(head.length)}`);
    await followed(want);
    a = await audio();
    check('… the page does not load again for it, and the music is not read anew', loads === loaded && a.loadstart === n0 && near(a.t, 249 / 24 + 2, 0.01), `page loads ${loads - loaded}; the element read its file ${a.loadstart - n0} more times`);

    // ---- a file changed by hand
    put(fileNow().replace('  volume: 0.6,\n', '  volume: 0.35,\n').replace('  start: 2,\n', '  start: 7.25,\n'));
    await followed({ ...want, volume: 0.35, start: 7.25 });
    st = await state(); a = await audio();
    check('the file changed by hand: the sound and the panel follow it, the page stays', st.now.volume === 0.35 && st.now.start === 7.25 && !st.unsaved && near(a.volume, 0.35, 1e-6) && near(a.t, 249 / 24 + 7.25, 0.01) && loads === loaded && /src\/sound\.js изменился/.test(st.note), `«${st.note}»; volume ${a.volume}, music at ${a.t.toFixed(3)} s`);
    await slide('volume', 0.9);
    put(fileNow().replace('  start: 7.25,\n', '  start: 1,\n'));
    await followed({ ...want, volume: 0.35, start: 1 });
    st = await state(); a = await audio();
    check('… also over settings that were not saved: the file is right', st.now.volume === 0.35 && st.now.start === 1 && !st.unsaved && near(a.volume, 0.35, 1e-6), JSON.stringify(st.now));
    // ---- taking back
    await slide('volume', 0.1);
    await typeStart('30');
    await click('undo');
    st = await state(); a = await audio();
    check('«Вернуть» puts everything back as the file has it', st.now.volume === 0.35 && st.now.start === 1 && !st.unsaved && near(a.volume, 0.35, 1e-6) && near(a.t, 249 / 24 + 1, 0.01) && /Возвращено как в файле/.test(st.note), `«${st.note}»`);

    // ---- what is not saved yet, and a page that loads again
    await typeStart('18.5');
    await slide('fadeOut', 3);
    await page.reload({ waitUntil: 'load' });
    await ready();
    await heard();
    st = await state(); a = await audio(); fm = await film();
    check('settings that were not saved live through a page that loads again: the panel is open with them, the page plays by them', st.open && st.unsaved && st.now.start === 18.5 && st.now.fadeOut === 3 && st.file.start === 1 && a.src === '/media/_test_clicks.mp3' && near(a.t, fm.time + 18.5, 0.01),
      `${JSON.stringify(st.now)}; music at ${a.t.toFixed(3)} s, film at ${fm.time.toFixed(3)} s`);
    await page.keyboard.press('KeyS');
    await wait(200);
    const button = () => page.evaluate(() => { const b = document.getElementById('sounder-open'); return { unsaved: b.classList.contains('unsaved'), tip: b.title, on: b.classList.contains('on') }; });
    check('S closes the tool; its button tells that the film sounds as the file does not say', !(await state()).open && (await page.evaluate(() => document.getElementById('sounder').hidden)) && (await button()).unsaved && /есть несохранённые изменения/.test((await button()).tip) && !(await button()).on, JSON.stringify(await button()));
    await page.goto('about:blank');
    put(fileNow().replace('  start: 1,\n', '  start: 4,\n'));
    await wait(400);
    await open('f=250&paused');
    st = await state(); a = await audio();
    check('… but not through a file that changed meanwhile: then the file is right', !st.unsaved && st.now.start === 4 && st.now.fadeOut === 5 && near(a.t, 249 / 24 + 4, 0.01) && !(await button()).unsaved, JSON.stringify(st.now));
  }

  if (await part('strips', 'the two strips')) {
    put(soundText(["src: 'media/_test_clicks.mp3',"]));
    await open('f=250&paused&sound');
    await heard();
    const loaded = loads;
    st = await state();
    check('?sound opens the tool (the sound stays off: nobody has touched the page)', st.open && !(await film()).sound && /Звук выключен — клавиша M\./.test(st.note), `«${st.note}»`);
    const box = await W();
    check('the strips have their place in the panel', box.w > 250 && box.h === 92, JSON.stringify(box));
    // the upper strip: the film; a cut is a white line, the flash a gold one with a head
    const xOf = (frame) => ((frame - 1) / 24 / FILM_END) * box.w;
    await strips();
    const cut = await pixel(xOf(388) + 0.5, 1), beside = await pixel(xOf(388) + 6, 1), flash = await pixel(xOf(974) + 0.5, 20), headOf = await pixel(xOf(974) - 2, 1);
    check('the film\'s strip marks a cut in white and the flash in gold', cut[0] > 140 && cut[2] > 140 && beside[0] < 60 && flash[0] > 200 && flash[1] > 150 && flash[2] < 150 && headOf[0] > 200 && headOf[2] < 150, `cut ${cut}, beside it ${beside}, flash ${flash}, its head ${headOf}`);
    // the music's picture: a click of the test music stands out of the quiet tone — in the film's strip at its moment, in the music's strip at its place
    // (a column of the picture begins at a whole px: the click at 12 s is in the column that holds 12 s)
    const col = (seconds, of) => Math.floor((seconds / of) * box.w);
    const click12 = await tall(col(12, FILM_END), 0, 58), quiet = await tall(col(14, FILM_END), 0, 58), below12 = await tall(col(12, 70), 66, 92), belowQuiet = await tall(col(14, 70), 66, 92);
    check('the music is drawn under the film: a click of the test music stands tall at its second, in both strips — its largest sample dim, its level bright', click12[0] > 40 && quiet[0] <= 8 && click12[1] <= 8 && quiet[1] >= 2 && below12[0] > 2 * belowQuiet[0],
      `film's strip: ${click12[0]} px (${click12[1]} bright) at 12 s, ${quiet[0]} px (${quiet[1]} bright) at 14 s; music's strip: ${below12[0]} and ${belowQuiet[0]} px`);
    // the frame of the film on the music: from 0 to 50.54 s of 70
    const inFrame = await pixel((25 / 70) * box.w, 60), edge = await pixel((FILM_END / 70) * box.w - 1, 75), outside = await pixel((60 / 70) * box.w, 60);
    check('the music\'s strip frames what the film takes', edge[0] > 200 && edge[3] > 200 && inFrame[0] < 80 && outside[0] < 80, `edge ${edge}, inside ${inFrame}, outside ${outside}`);
    const hands = () => page.evaluate(() => ['i.film', 'i.music'].map((q) => parseFloat(document.querySelector(`#sounder ${q}`).style.left)));
    let h = await hands();
    check('a hand on each strip shows where the film is', near(h[0], ((249 / 24) / FILM_END) * box.w, 0.2) && near(h[1], ((249 / 24) / 70) * box.w, 0.2), h.join(' and '));

    // ---- the upper strip: the music is dragged under the film
    const y1 = box.y + 30, x1 = box.x + box.w / 2;
    await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x1 - 45, y1, { steps: 5 }); await page.mouse.up();
    await wait(150);
    st = await state(); a = await audio(); fm = await film();
    check('dragged to the left, the music comes earlier: the film begins further into it', near(st.now.start, (45 / box.w) * FILM_END, 0.002) && near(a.t, fm.time + st.now.start, 0.01) && fm.frame === 250, `45 px of ${box.w} → start ${st.now.start}`);
    const s1 = st.now.start;
    await page.keyboard.down('Shift');
    await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x1 + 60, y1, { steps: 5 }); await page.mouse.up();
    await page.keyboard.up('Shift');
    await wait(150);
    st = await state();
    check('with Shift the same way moves it a tenth as far', near(st.now.start, s1 - (60 / box.w) * FILM_END * 0.1, 0.002), `start ${s1} → ${st.now.start}`);
    await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x1 + 400, y1, { steps: 8 }); await page.mouse.up();
    await wait(150);
    st = await state(); a = await audio();
    check('dragged far to the right, it comes in late — but a second of it stays under the film; where the music is not, the element rests', near(st.now.start, 1 - FILM_END, 0.001) && a.paused, `start ${st.now.start}`);
    h = await hands();
    check('… and the music\'s strip grows to show the film before the music', near(h[1], ((249 / 24) / (70 + FILM_END - 1)) * box.w, 0.3), `hand at ${h[1]} px`);
    await typeStart('0');
    const s2 = (await state()).now.start;
    await page.mouse.click(box.x + box.w * 0.25, y1);
    await wait(150);
    fm = await film(); st = await state(); a = await audio();
    check('a click on the film\'s strip puts the film there; the music stays as it lies', near(fm.time, 0.25 * FILM_END, 0.02) && st.now.start === s2 && near(a.t, fm.time + s2, 0.01), `film at ${fm.time.toFixed(3)} s`);
    await page.mouse.click(box.x + box.w - 0.05, y1);
    await wait(150);
    fm = await film();
    check('… and its right edge is the film\'s last frame, not a moment after it', fm.frame === 1213 && near(fm.time, 50.5, 1e-9), `frame ${fm.frame}, ${fm.time} s`);
    await seek(249 / 24);

    // ---- the lower strip: the film's frame is put on the music
    const y2 = box.y + 58 + 8 + 13;
    await page.mouse.click(box.x + box.w * 0.9, y2);
    await wait(150);
    st = await state();
    check('a click on the music beside the frame brings the frame there (as far as the music goes)', near(st.now.start, Math.min(69, 0.9 * 70 - FILM_END / 2), 0.15), `start ${st.now.start}`);
    const s3 = st.now.start, span = Math.max(70, s3 + FILM_END), mid = box.x + ((s3 + FILM_END / 2) / span) * box.w;
    await page.mouse.move(mid, y2); await page.mouse.down(); await page.mouse.move(mid - 30, y2, { steps: 5 }); await page.mouse.up();
    await wait(150);
    st = await state(); a = await audio();
    check('the frame is dragged along the music', near(st.now.start, s3 - (30 / box.w) * span, 0.02) && near(a.t, 249 / 24 + st.now.start, 0.01), `start ${s3} → ${st.now.start}`);
    await page.mouse.move(mid, y2); await page.mouse.down(); await page.mouse.move(box.x - 300, y2, { steps: 8 }); await page.mouse.up();
    await wait(150);
    st = await state();
    check('… and stops where a second of the music is left under the film', near(st.now.start, 1 - FILM_END, 0.001), `start ${st.now.start}`);
    check('none of this was saved or loaded the page again', (await state()).unsaved && fileNow() === soundText(["src: 'media/_test_clicks.mp3',"]) && loads === loaded, `page loads: ${loads - loaded}`);
    await click('undo');
  }

  if (await part('keys', 'keys, and the other tools')) {
    put(soundText(["src: 'media/_test_clicks.mp3',"]));
    await open('f=250&paused');
    await page.keyboard.press('KeyS');
    await heard();
    await typeStart('5', false);
    await page.keyboard.type('s');
    await page.keyboard.press('Space');
    await page.keyboard.press('KeyM');
    await page.keyboard.press('KeyT');
    await wait(200);
    st = await state(); fm = await film();
    check('keys typed into the field are the field\'s: the tool stays open, the film does not start, the sound stays on', st.open && !fm.playing && fm.sound && fm.frame === 250 && st.now.start === 5 && !(await tools()).titler, JSON.stringify({ ...fm, start: st.now.start }));
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowRight');
    await wait(150);
    st = await state(); fm = await film();
    check('an arrow in the field moves the music by a twentieth of a second, not the film by a frame', near(st.now.start, 5.1, 1e-9) && fm.frame === 250, `start ${st.now.start}, frame ${fm.frame}`);
    await page.keyboard.press('Escape');
    await wait(100);
    check('Esc leaves the field', await page.evaluate(() => document.activeElement === document.body), await page.evaluate(() => document.activeElement.tagName));
    await page.keyboard.press('ArrowRight');
    await wait(150);
    fm = await film();
    check('… and the keys are the film\'s again: → is a second of it', fm.frame === 274, `frame ${fm.frame}`);
    await page.keyboard.press('ArrowLeft');
    // a button clicked with the mouse does not keep the keyboard
    const b = await rect('#sounder [data-a=copy]');
    await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
    await wait(200);
    await page.keyboard.press('Space');
    await wait(400);
    fm = await film(); a = await audio();
    check('after a click on a button of the panel, Space starts the film — and the music with it', fm.playing && !a.paused && !a.muted, JSON.stringify({ playing: fm.playing, music: !a.paused }));
    await page.keyboard.press('Space');
    await wait(200);
    await seek(249 / 24);
    // the listening buttons
    await page.keyboard.press('KeyM');
    await wait(100);
    st = await state();
    check('M turns the sound off, and the panel says so', !(await film()).sound && /Звук выключен — клавиша M\./.test(st.note), `«${st.note}»`);
    await slide('fadeOut', 6);
    await click('tail');
    await wait(500);
    fm = await film(); a = await audio();
    check('«конец ролика» plays the last seconds — the fade and two more — with the sound on', fm.playing && fm.sound && !a.paused && fm.time > 42.4 && fm.time < 44.5, `film at ${fm.time.toFixed(2)} s`);
    await click('head');
    await wait(500);
    fm = await film();
    check('«с начала» plays the film from its first frame', fm.playing && fm.time < 1.5, `film at ${fm.time.toFixed(2)} s`);
    await page.evaluate(() => window.__player.pause());
    await click('undo');

    // ---- one tool at a time
    await page.keyboard.press('KeyT');
    await wait(400);
    check('T opens the title tool and closes this one', JSON.stringify(await tools()) === JSON.stringify({ sounder: false, placer: false, titler: true, exporter: false }), JSON.stringify(await tools()));
    await page.keyboard.press('KeyS');
    await wait(300);
    check('S opens this one and closes that', JSON.stringify(await tools()) === JSON.stringify({ sounder: true, placer: false, titler: false, exporter: false }), JSON.stringify(await tools()));
    await page.keyboard.press('KeyE');
    await wait(300);
    check('E: the placement tool', JSON.stringify(await tools()) === JSON.stringify({ sounder: false, placer: true, titler: false, exporter: false }), JSON.stringify(await tools()));
    await page.keyboard.press('KeyS');
    await page.keyboard.press('KeyV');
    await wait(300);
    check('V: the video tool', JSON.stringify(await tools()) === JSON.stringify({ sounder: false, placer: false, titler: false, exporter: true }), JSON.stringify(await tools()));
    await page.click('#sounder-open');
    await wait(300);
    check('the button in the bar opens the sound tool', JSON.stringify(await tools()) === JSON.stringify({ sounder: true, placer: false, titler: false, exporter: false }), JSON.stringify(await tools()));
    await page.keyboard.down('Control'); await page.keyboard.press('KeyS'); await page.keyboard.up('Control');
    await wait(200);
    check('Ctrl + S is not the tool\'s key', (await tools()).sounder, JSON.stringify(await tools()));
    await page.click('#sounder [data-a=close]');
    await wait(200);
    check('× closes it', !(await tools()).sounder, JSON.stringify(await tools()));
  }

  if (await part('upload', 'music from the computer: the button')) {
    put(PLAIN);
    await open('f=250&paused');
    await page.keyboard.press('KeyS');
    await heard();
    fs.copyFileSync(`${FILES}/_test_short.mp3`, '/tmp/_test_Моя музыка (1).mp3');
    const input = await page.$('#sounder input[type=file]');
    await input.uploadFile('/tmp/_test_Моя музыка (1).mp3');
    await until(async () => (await state()).now.src !== 'audio.m4a');
    await heard();
    st = await state(); a = await audio();
    const NAME = '_test_Моя музыка (1).mp3';
    check('a file picked with «Загрузить…» lands in public/media/ under its name and is the music at once', st.now.src === `media/${NAME}` && fs.existsSync(`${MEDIA}/${NAME}`) && a.src === `/media/${NAME}` && near(a.length, 8, 0.1) && near(st.wave.seconds, 8, 0.1) && st.files.includes(NAME) && st.unsaved,
      `«${st.note}»; ${a.src}, ${a.length?.toFixed(2)} s`);
    check('… the panel tells where it lies under the film', /^музыка 8,0 с · кончается на 8,0 с ролика$/.test(st.vals) && /— музыка ролика\.$/.test(st.note), `«${st.vals}»; «${st.note}»`);
    await typeStart('3');
    // the same name, another music
    fs.copyFileSync(`${FILES}/_test_clicks.mp3`, '/tmp/_test_Моя музыка (1).mp3');
    const n0 = (await audio()).loadstart;
    await input.uploadFile('/tmp/_test_Моя музыка (1).mp3');
    await until(async () => near((await audio()).length, 70, 0.1));
    await heard();
    st = await state(); a = await audio();
    check('another file under the same name replaces it: the tool says so, and reads and plays the new one, from its beginning', /заменил прежний файл с этим именем/.test(st.note) && near(a.length, 70, 0.1) && near(st.wave.seconds, 70, 0.1) && a.loadstart > n0 && st.now.start === 0 && fs.readFileSync(`${MEDIA}/${NAME}`).equals(bytes('_test_clicks.mp3')),
      `«${st.note}»; ${a.length?.toFixed(2)} s`);
    await click('save');
    await until(async () => !(await state()).unsaved);
    check('… and it is saved under that name', fileNow() === soundText([`src: 'media/${NAME}',`, ...EXAMPLES]) && JSON.stringify(await exported(fileNow())) === JSON.stringify({ src: `media/${NAME}` }), fileNow().slice(head.length));
    // not music
    fs.writeFileSync('/tmp/_test_notes.txt', 'not music');
    await input.uploadFile('/tmp/_test_notes.txt');
    await wait(400);
    st = await state();
    check('a file that is no music is refused, in words', st.bad && /музыкой не поставить: нужен звуковой файл/.test(st.note) && st.now.src === `media/${NAME}` && !fs.existsSync(`${MEDIA}/_test_notes.txt`), `«${st.note}»`);
    // a file named like music that is none
    fs.writeFileSync('/tmp/_test_fake.mp3', 'this is no sound at all, only text. '.repeat(200));
    await input.uploadFile('/tmp/_test_fake.mp3');
    await until(async () => (await state()).now.src === 'media/_test_fake.mp3');
    await until(async () => (await audio()).error && (await state()).wave === 'failed');
    st = await state(); a = await audio();
    check('a file with a music\'s name that the browser cannot play: the panel says so', a.error && st.wave === 'failed' && /этот браузер не проигрывает/.test(st.note) && (await page.evaluate(() => document.querySelector('#sounder .msg').classList.contains('bad'))), `«${st.note}»`);
    const warned = msgs.filter((m) => /sound: media\/_test_fake\.mp3 cannot be played/.test(m)).length;
    check('… and the page says it in its console too', warned >= 1, `${warned} message(s)`);
    for (let i = msgs.length - 1; i >= 0; i--) if (/_test_fake\.mp3/.test(msgs[i]) || /Failed to load resource/.test(msgs[i])) msgs.splice(i, 1);
    await choose('audio.m4a');
    st = await state(); a = await audio();
    check('back to the film\'s own sound from the list', st.now.src === 'audio.m4a' && a.src === '/audio.m4a' && !a.error && !/не проигрывает/.test(st.note), `«${st.note}»`);
  }

  if (await part('drop', 'music from the computer: dropped on the page')) {
    put(PLAIN);
    await open('f=250&paused');
    const DROPPED = '_test_Моя музыка, финал (2).mp3';
    r = await drop(bytes('_test_short.mp3'), DROPPED, 'audio/mpeg');
    await until(async () => (await state()).now.src === `media/${DROPPED}`);
    await heard();
    st = await state(); a = await audio(); fm = await film();
    check('a sound file dragged over the page opens the sound tool; dropped, it is the music — under its own name — and the sound is on', r.taken && r.kept && r.opened && r.hot && st.open && st.now.src === `media/${DROPPED}` && a.src === `/media/${DROPPED}` && near(a.length, 8, 0.1) && !a.error && fm.sound && !a.muted
      && fs.existsSync(`${MEDIA}/${DROPPED}`) && !(await tools()).placer, `${JSON.stringify(r)}; «${st.note}»; ${a.src}`);
    /** the file went to the server once, and the tool does not say that it replaced anything */
    const once = async (name) => uploads.filter((n) => n === name).length === 1 && !/заменил/.test((await state()).note);
    check('… it was sent once', await once(DROPPED), `${uploads.filter((n) => n === DROPPED).length} upload(s); «${st.note}»`);
    check('… and no window got it', (await page.evaluate(() => window.__placer.state().unsaved.length === 0)) && !/_test_/.test(fs.readFileSync(`${REPO}/src/media.js`, 'utf8')), '');
    await click('save');
    await until(async () => !(await state()).unsaved);
    check('… saved, the file names it as it is called', JSON.stringify(await exported(fileNow())) === JSON.stringify({ src: `media/${DROPPED}` }) && !(await state()).unsaved, fileNow().slice(head.length));
    // a picture dropped while the sound tool is open
    r = await drop(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), '_test_pic.svg', 'image/svg+xml');
    await wait(400);
    st = await state();
    check('a picture dropped while the tool is open is refused, in words — and not opened in place of the page', r.taken && r.kept && st.bad && /музыкой не поставить/.test(st.note) && st.now.src === `media/${DROPPED}` && !fs.existsSync(`${MEDIA}/_test_pic.svg`), `«${st.note}»`);
    // with the placement tool open: music still finds its tool
    await page.keyboard.press('KeyE');
    await wait(300);
    r = await drop(bytes('_test_clicks.ogg'), '_test_onwindow.ogg', '');
    await until(async () => (await state()).now.src === 'media/_test_onwindow.ogg');
    await heard();
    st = await state(); a = await audio();
    check('music dropped while the placement tool is open (and the browser did not tell its kind) goes to the sound tool all the same', r.taken && r.kept && JSON.stringify(await tools()) === JSON.stringify({ sounder: true, placer: false, titler: false, exporter: false }) && st.now.src === 'media/_test_onwindow.ogg' && near(a.length, 70, 0.1),
      `${JSON.stringify(r)}; ${JSON.stringify(await tools())}; «${st.note}»`);
    check('… once: the tool that opens for it does not take the same file again', await once('_test_onwindow.ogg'), `${uploads.filter((n) => n === '_test_onwindow.ogg').length} upload(s); «${st.note}»`);
    // … and with the title tool open
    await page.keyboard.press('KeyT');
    await wait(400);
    r = await drop(bytes('_test_short.mp3'), '_test_ontitle.mp3', 'audio/mpeg');
    await until(async () => (await state()).now.src === 'media/_test_ontitle.mp3');
    st = await state();
    check('… and so does music dropped while the title tool is open', r.kept && (await tools()).sounder && !(await tools()).titler && st.now.src === 'media/_test_ontitle.mp3' && (await page.evaluate(() => window.__titler.state().now.emblem)) !== 'media/_test_ontitle.mp3' && (await once('_test_ontitle.mp3')), `${uploads.filter((n) => n === '_test_ontitle.mp3').length} upload(s); «${st.note}»`);
    // a picture with no tool open is still for a window
    await page.keyboard.press('KeyS');
    await wait(300);
    r = await drop(Buffer.from('not a picture'), '_test_nopic.txt', 'text/plain');
    await wait(400);
    check('a file that is no sound, dropped with no tool open, is still the placement tool\'s business', r.taken && (await tools()).placer && !(await tools()).sounder, JSON.stringify(await tools()));
    // the video tool has no use for a file: with it open, a dropped file goes where it would with no tool open
    await page.keyboard.press('KeyV');
    await wait(300);
    r = await drop(bytes('_test_short.mp3'), '_test_onvideo.mp3', 'audio/mpeg');
    await until(async () => (await state()).now.src === 'media/_test_onvideo.mp3');
    check('music dropped while the video tool is open is the sound tool\'s (and is not opened in place of the page)', r.taken && r.kept && (await state()).now.src === 'media/_test_onvideo.mp3' && JSON.stringify(await tools()) === JSON.stringify({ sounder: true, placer: false, titler: false, exporter: false }) && (await once('_test_onvideo.mp3')),
      `${JSON.stringify(r)} ${JSON.stringify(await tools())}; ${uploads.filter((n) => n === '_test_onvideo.mp3').length} upload(s)`);
    await page.keyboard.press('KeyV');
    await wait(300);
    r = await drop(Buffer.from('not a picture'), '_test_nopic.txt', 'text/plain');
    await wait(400);
    check('… and a file of another kind the placement tool\'s', r.taken && r.kept && JSON.stringify(await tools()) === JSON.stringify({ sounder: false, placer: true, titler: false, exporter: false }), `${JSON.stringify(r)} ${JSON.stringify(await tools())}`);
  }

  if (await part('readonly', 'a page that may not write')) {
    put(PLAIN);
    const ro = await browser.newPage();
    listen(ro);
    await ro.setRequestInterception(true);
    ro.on('request', (q) => {
      if (!/\/__sound/.test(q.url())) return q.continue();
      if (q.method() === 'GET') return q.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ name: '_test_clicks.mp3', size: 1681492 }], write: false, max: 99614720 }) });
      return q.respond({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'read-only' }) });
    });
    await ro.goto(`${HOST}/?f=250&paused&dpr=${DPR}`, { waitUntil: 'load', timeout: 120000 });
    await ready(ro);
    const main = page;
    page = ro;
    await page.keyboard.press('KeyS');
    await heard();
    await choose('media/_test_clicks.mp3');
    await slide('fadeOut', 2);
    st = await state(); a = await audio();
    const off = await page.evaluate(() => ['save', 'pick'].map((k) => document.querySelector(`#sounder [data-a=${k}]`).disabled));
    check('the music follows the list and the sliders; nothing can be written, and the tool says where it can', !st.write && st.unsaved && off.every(Boolean) && /Запись выключена/.test(st.note) && a.src === '/media/_test_clicks.mp3' && st.block === "export default {\n  src: 'media/_test_clicks.mp3',\n  fadeOut: 2,\n};",
      `${JSON.stringify(off)} «${st.note}»`);
    r = await drop(bytes('_test_short.mp3'), '_test_ro.mp3', 'audio/mpeg');
    await wait(400);
    st = await state();
    check('a dropped file is not sent', st.bad && /Запись выключена/.test(st.note) && !uploads.includes('_test_ro.mp3') && !fs.existsSync(`${MEDIA}/_test_ro.mp3`), `«${st.note}»`);
    await click('copy');
    await wait(300);
    st = await state();
    check('«Скопировать» hands over the block (or selects it for Ctrl + C)', /Блок скопирован|Блок выделен/.test(st.note), `«${st.note}»`);
    check('the file was not touched', fileNow() === PLAIN);
    await ro.close();
    page = main;
  }

  // ============================== the film running ==============================
  if (await part('live', 'the film running, in real time')) {
    put(PLAIN);
    await open('f=1&paused');
    await page.keyboard.press('KeyS');      // (a key pressed on the page: a browser lets a page that was touched make sound)
    await heard();
    const both = () => page.evaluate(() => { const p = window.__player, a = p.audio; return { film: p.time, playing: p.playing, music: a.currentTime, paused: a.paused, volume: a.volume, muted: a.muted }; });
    /** the film played from second `from` under these settings: what the film and the element say every 0.25 s */
    const run = async (settings, from, seconds) => {
      await page.evaluate(() => window.__player.pause());
      await set({ ...OWN, ...settings });
      await heard();
      await seek(from);
      await wait(300);
      await page.evaluate(() => window.__player.play());
      const rows = [];
      for (let t0 = Date.now(); Date.now() - t0 < seconds * 1000;) { await wait(250); rows.push(await both()); }
      return rows;
    };
    const table = (rows) => rows.map((x) => `${x.film.toFixed(2)}:${x.paused ? '—' : x.music.toFixed(2)}`).join(' ');
    // How far apart the film and its music may be found. 0.3 s is where one of them is made to jump (soundtrack.js:
    // follow) — and it is looked at once per picture drawn, which on this machine, without a graphics card, can be
    // another fifth of a second later.
    const STEP = 0.5;
    const inStep = (rows, start) => rows.every((x) => x.paused || near(x.music, x.film + start, STEP));

    let rows = await run({}, 10, 2.5);
    check('the film\'s own sound runs with the film', rows.every((x) => x.playing && !x.paused && !x.muted) && inStep(rows, 0) && rows.at(-1).film > 11.5, table(rows));
    rows = await run({ src: 'media/_test_clicks.mp3', start: 2 }, 0, 2.5);
    check('music of one\'s own, from its second 2: it runs two seconds ahead of the film', rows.every((x) => x.playing && !x.paused) && inStep(rows, 2) && rows.at(-1).music > 3.5, table(rows));
    await page.evaluate(() => window.__player.pause());
    await wait(200);
    let now = await both();
    check('the film pauses: so does the music, where the film is', now.paused && !now.playing && near(now.music, now.film + 2, STEP), JSON.stringify(now));
    await page.evaluate(() => window.__player.play());
    await wait(800);
    now = await both();
    check('… and goes on with it', !now.paused && now.playing && near(now.music, now.film + 2, STEP), JSON.stringify(now));
    await page.keyboard.press('KeyM');
    await wait(300);
    now = await both();
    const offAt = now.film;
    check('M: the sound is off while the film runs on', now.playing && now.paused && now.muted, JSON.stringify(now));
    await wait(500);
    await page.keyboard.press('KeyM');
    await wait(600);
    now = await both();
    check('M again: the music is back where the film has got to meanwhile', now.playing && !now.paused && !now.muted && now.film > offAt + 0.5 && near(now.music, now.film + 2, STEP), JSON.stringify(now));

    rows = await run({ src: 'media/_test_clicks.mp3', start: -1.5, volume: 0.6 }, 0.5, 3);
    const early = rows.filter((x) => x.film < 1.4), late = rows.filter((x) => x.film > 1.9);
    check('music that comes in at 1.5 s of the film: the element rests until then, then plays from its beginning', early.length >= 2 && early.every((x) => x.paused) && late.length >= 3 && late.every((x) => !x.paused) && inStep(late, -1.5) && rows.every((x) => x.playing && near(x.volume, 0.6, 1e-6)), table(rows));
    await seek(0.2);
    await wait(400);
    now = await both();
    check('the film put back before the music\'s entrance: the element rests again', now.playing && now.paused, JSON.stringify(now));

    rows = await run({ src: 'media/_test_short.mp3', start: 6 }, 0.6, 3);
    const during = rows.filter((x) => x.film < 1.8), after = rows.filter((x) => x.film > 2.3);
    check('music that is over at 2 s of the film: it plays to its end, then rests; the film runs on', during.length >= 2 && during.every((x) => !x.paused) && inStep(during, 6) && after.length >= 2 && after.every((x) => x.paused && x.playing), table(rows));
    await seek(0.5);
    await wait(700);
    now = await both();
    check('the film put back to where the music is: it plays again', now.playing && !now.paused && near(now.music, now.film + 6, STEP), JSON.stringify(now));

    const fadeIn = { src: 'media/_test_clicks.mp3', volume: 0.8, fadeIn: 2 };
    rows = await run(fadeIn, 0, 2.8);
    // (the level is set once per picture the page draws, the reading is taken between two of them — and this machine,
    // drawing without a graphics card, now and then takes half a second over one: the level may be that much behind)
    const levelOk = (x, s) => { const g = [0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.7].map((d) => gain(x.film - d, s)); return x.volume >= Math.min(...g) - 1e-6 && x.volume <= Math.max(...g) + 1e-6; };
    check('a fade in: the element grows louder with the film, by the square law, and stays at the level set', rows.every((x) => levelOk(x, fadeIn)) && rows[0].volume < 0.1 && rows.at(-1).volume === 0.8 && rows.every((x, i) => i === 0 || x.volume >= rows[i - 1].volume),
      rows.map((x) => `${x.film.toFixed(2)}:${x.volume.toFixed(3)}`).join(' '));

    const fadeOut = { src: 'media/_test_clicks.mp3', start: 3, fadeOut: 3 };
    rows = await run(fadeOut, 47, 5);
    const ended = rows.at(-1);
    check('a fade out: the element dies away towards the film\'s end', rows.filter((x) => x.playing).every((x) => levelOk(x, fadeOut)) && rows[0].volume === 1 && rows.every((x, i) => i === 0 || x.volume <= rows[i - 1].volume + 1e-9),
      rows.map((x) => `${x.film.toFixed(2)}:${x.volume.toFixed(3)}`).join(' '));
    check('… and at the end the film stops, silent, and the music with it — though it is longer than the film', !ended.playing && ended.paused && near(ended.film, 50.5, 1e-6) && ended.volume < 0.001 && ended.music < 55, JSON.stringify(ended));
    await page.keyboard.press('Space');
    await wait(900);
    now = await both();
    check('Space after the end: the film starts over, and the music from where it lies under the first frame', now.playing && !now.paused && now.film < 2 && near(now.music, now.film + 3, STEP) && now.volume === 1, JSON.stringify(now));
    await page.evaluate(() => window.__player.pause());

    // a file saved by hand while the film runs
    await click('undo');
    await page.evaluate(() => { window.__player.seek(5); window.__player.play(); });
    await wait(500);
    put(soundText(["src: 'media/_test_clicks.mp3',", 'start: 20,', 'volume: 0.5,']));
    await followed({ src: 'media/_test_clicks.mp3', start: 20, volume: 0.5, fadeIn: 0, fadeOut: 0 });
    await wait(900);
    now = await both();
    check('src/sound.js saved by hand while the film runs: the page plays the new music, in place, without loading again', now.playing && !now.paused && near(now.music, now.film + 20, STEP) && near(now.volume, 0.5, 1e-6) && (await audio()).src === '/media/_test_clicks.mp3',
      JSON.stringify(now));
    await page.evaluate(() => window.__player.pause());
  }

  check('the page said nothing but what it was asked to say', msgs.length === 0, [...new Set(msgs)].join(' | ') + (msgs.length && refused.length ? `  [the server refused: ${[...new Set(refused)].join(' | ')}]` : ''));
} catch (e) {
  failed++;
  console.log('STOPPED:', e.stack || e.message);
} finally {
  await Promise.race([browser.close(), wait(15000)]);
  put(original);
  for (const n of fs.readdirSync(MEDIA)) if (!hadFiles.has(n)) fs.rmSync(`${MEDIA}/${n}`, { force: true });
  for (const n of ['_test_Моя музыка (1).mp3', '_test_notes.txt', '_test_fake.mp3']) fs.rmSync(`/tmp/${n}`, { force: true });
}
console.log(failed ? `${failed} of ${checks} checks FAILED` : `all ${checks} checks passed`);
process.exit(failed ? 1 : 0);
