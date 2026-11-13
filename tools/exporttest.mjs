// exporttest.mjs [OUTDIR] — the video tool of the dev server (src/dev/exporter.js + filmFile.js; key V on the page):
// does the page make the file it promises? Headless Chromium against the dev server; ffmpeg reads the files back.
//   cd /tmp/tools && node exporttest.mjs /tmp/work/exporttest          (≈ 9 min; FULL=1 adds the whole film, ≈ 4 min)
//   env: URL (http://localhost:5173), REPO, FFMPEG (/tmp/tools/ffmpeg); ONLY=panel,sample,stop,lost,webm,rates,bars,
//   large,huge,title,videos,offset,hidden,refuse,full — some of its parts; HUGE=1 adds the part `huge` (five frames
//   at 2560×1440 and 3840×2160, ≈ 3 min)
// It makes its own test clips (public/media/_test_*), writes its own line into src/media.js for the part about videos
// in the windows and, when it is done or has failed, puts src/media.js back as it found it and removes the clips.
// Checks: the panel (keys, the other tools, what is remembered); a «проба» through the real buttons and its download;
// the page while a file is made and the page afterwards; «Стоп» and leaving the page; a graphics card that gives up;
// a title that is typed and not saved; MP4 and WebM read back — streams, frame counts, every frame against a lossless
// render of the same frame of the film, the sound against public/audio.m4a; 30 and 60 frames per second; a file
// larger than the page; the bars; videos in a window, frame by frame; the same with the page out of sight; a browser
// that lacks an encoder. The files stay in OUTDIR.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const REPO = process.env.REPO || '/home/user/circle.animaation.proto-2';
const HOST = process.env.URL || 'http://localhost:5173';
const FFMPEG = process.env.FFMPEG || '/tmp/tools/ffmpeg';
const OUT = process.argv[2] || '/tmp/work/exporttest';
const SETTINGS = `${REPO}/src/media.js`, MEDIA = `${REPO}/public/media`, SOUND = `${REPO}/public/audio.m4a`;
const W = 320, H = 180;      // the size of the test files: small, so that the software renderer keeps up
const original = fs.readFileSync(SETTINGS, 'utf8'), hadFiles = new Set(fs.readdirSync(MEDIA));
const head = original.slice(0, original.indexOf('export default {'));
const settingsText = (lines) => `${head}export default {\n${lines.map((l) => `  ${l}\n`).join('')}};\n`;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(`${OUT}/downloads`, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, info = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? '  — ' + String(info).slice(0, 230) : ''}`); };
const t00 = Date.now();
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
let partNow = 'start';      // the part that is running: console messages are marked with it
const ran = new Set();
/** Is this part asked for? Says so when it is. */
const part = (key, name) => {
  if (ONLY ? !ONLY.includes(key) : (key === 'full' && !process.env.FULL) || (key === 'huge' && !process.env.HUGE)) return false;
  console.log(`\n== ${name}  [${((Date.now() - t00) / 1000).toFixed(0)} s]`);
  partNow = key; ran.add(key);
  return true;
};

// ---- ffmpeg reads the files back ------------------------------------------------------------------
const ff = (args, input) => { const r = spawnSync(FFMPEG, ['-hide_banner', ...args], { input, maxBuffer: 2 ** 31 - 1 }); return { out: r.stdout, err: String(r.stderr) }; };
/** what ffmpeg says a file holds */
function about(file) {
  const { err } = ff(['-i', file]);
  const v = /Stream #0:\d+[^\n]*?: Video: (\w+)[^\n]*?, (\d+)x(\d+)[^\n]*?, ([\d.]+) fps/.exec(err), a = /Stream #0:\d+[^\n]*?: Audio: (\w+)[^\n]*?, (\d+) Hz, (\w+)/.exec(err);
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(err);
  return {
    video: v ? `${v[1]} ${v[2]}x${v[3]} ${+v[4]}fps` : null, audio: a ? `${a[1]} ${a[2]} ${a[3]}` : null,
    seconds: d ? d[1] * 3600 + d[2] * 60 + +d[3] : null, colour: /yuv420p\(([^)]*)\)/.exec(err)?.[1] ?? '',
  };
}
/** every picture of a file, as rgb24 */
function framesOf(file, w, h) {
  const { out } = ff(['-loglevel', 'error', '-i', file, '-map', '0:v:0', '-fps_mode', 'passthrough', '-sws_flags', 'accurate_rnd+full_chroma_int', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const n = w * h * 3, list = [];
  for (let at = 0; at + n <= out.length; at += n) list.push(out.subarray(at, at + n));
  return list;
}
/** PNG pictures as rgb24 */
function rgbOf(pictures, w, h) {
  const { out } = ff(['-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'png', '-i', '-', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], Buffer.concat(pictures));
  const n = w * h * 3, list = [];
  for (let at = 0; at + n <= out.length; at += n) list.push(out.subarray(at, at + n));
  return list;
}
/** when the pictures of a file are shown, in the file's own units */
const stamps = (file) => String(ff(['-loglevel', 'error', '-i', file, '-map', '0:v:0', '-c', 'copy', '-f', 'framecrc', '-']).out).split('\n').filter((l) => /^\s*0,/.test(l)).map((l) => +l.split(',')[1]);
/** the sound of a file: 48 kHz stereo, sample 0 at second 0 of the file */
function pcm(file) {
  const { out } = ff(['-loglevel', 'error', '-i', file, '-map', '0:a:0', '-af', 'aresample=async=1:first_pts=0', '-f', 's16le', '-ac', '2', '-ar', '48000', '-']);
  return new Int16Array(out.buffer.slice(out.byteOffset, out.byteOffset + (out.length & ~1)));
}
function psnr(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return s ? 10 * Math.log10((255 * 255 * a.length) / s) : 99;
}
/** Pictures of a file against renders of the same frames: the lowest and the mean PSNR, and how many pictures are as near to a neighbour's render as to their own. */
function compare(file, refs, reach = 3) {
  const n = Math.min(file.length, refs.length);
  let low = 99, sum = 0, astray = 0;
  for (let k = 0; k < n; k++) {
    const own = psnr(file[k], refs[k]);
    low = Math.min(low, own); sum += own;
    for (let d = -reach; d <= reach; d++) if (d && refs[k + d] && psnr(file[k], refs[k + d]) >= own) { astray++; break; }
  }
  return { low: +low.toFixed(1), mean: +(sum / n).toFixed(1), astray, n, text: `${n} pictures: PSNR lowest ${low.toFixed(1)} dB, mean ${(sum / n).toFixed(1)} dB; nearer to another frame: ${astray}` };
}
/** The order of the boxes of an MP4. */
function boxes(buf) {
  const list = [];
  for (let at = 0; at + 8 <= buf.length;) {
    let size = buf.readUInt32BE(at);
    if (size === 1) size = Number(buf.readBigUInt64BE(at + 8));
    if (size < 8) break;
    list.push(buf.toString('latin1', at + 4, at + 8));
    at += size;
  }
  return list;
}
/** Samples of `a` from frame `skip` on against `b` moved by `lag` frames: how many values differ, of how many. */
function sameSound(a, b, lag, skip = 0) {
  let differ = 0, n = 0;
  for (let i = skip * 2; i < a.length && i + lag * 2 < b.length; i++, n++) if (a[i] !== b[i + lag * 2]) differ++;
  return { differ, n };
}
/** Where a second of `a` (from frame `at`) sits in `b` around frame `where`: the lag in frames, and how alike they are there (1 = the same). */
function findSound(a, at, b, where, reach = 1440, span = 24000) {
  const mono = (p, i) => (p[2 * i] ?? 0) + (p[2 * i + 1] ?? 0);
  let ea = 0;
  for (let i = 0; i < span; i++) ea += mono(a, at + i) ** 2;
  let best = { lag: 0, like: -2 };
  for (let lag = -reach; lag <= reach; lag++) {
    let dot = 0, eb = 0;
    for (let i = 0; i < span; i++) { const y = mono(b, where + lag + i) || 0; dot += mono(a, at + i) * y; eb += y * y; }
    const like = dot / Math.sqrt(ea * eb || 1);
    if (like > best.like) best = { lag, like };
  }
  return best;
}

// ---- the page -------------------------------------------------------------------------------------
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(), headless: 'shell', args: [...chromium.args, '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
  env: { ...process.env, LC_ALL: 'C.utf8' },      // a download keeps a name in Cyrillic only under a UTF-8 locale
  // one question to the page may wait for a whole file — the film takes about three minutes here — and puppeteer
  // gives up on any question after three ("Waiting failed", its reason only in `cause`): the waits have their own limits
  protocolTimeout: 0,
});
const page = await browser.newPage();
const msgs = [];
const listen = (to) => {
  to.on('console', (m) => { if (['error', 'warning', 'warn'].includes(m.type())) msgs.push(`[${partNow}] ${m.text().slice(0, 200)}`); });
  to.on('pageerror', (e) => msgs.push(`[${partNow}] PAGEERROR ${e.message}`));
};
listen(page);
const dialogs = [];      // what the browser asked ("leave this page?"); the answer is «stay» each time
page.on('dialog', async (d) => { dialogs.push(`${partNow}: ${d.type()}`); await d.dismiss(); });
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: `${OUT}/downloads`, eventsEnabled: true });
const downloads = [];
client.on('Browser.downloadWillBegin', (e) => downloads.push({ guid: e.guid, name: e.suggestedFilename }));
client.on('Browser.downloadProgress', (e) => { const d = downloads.find((x) => x.guid === e.guid); if (d) { d.state = e.state; d.bytes = e.receivedBytes; } });

const state = () => page.evaluate(() => window.__exporter.state());
const asked = () => page.waitForFunction('Object.keys(window.__exporter.state().support).length > 0', { timeout: 30000, polling: 50 });
async function load(query) {
  await page.goto(`${HOST}/${query}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.__ready === true && !!window.__exporter && !!window.__placer && !!window.__titler', { timeout: 120000 });
  await wait(300);
}
/** two frames of the page's own loop (it has laid the picture out again by then), or 1.5 s */
const turn = () => page.evaluate(() => new Promise((r) => { const t = setTimeout(r, 1500); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); }));
const pageNow = () => page.evaluate(() => {
  const c = window.__stage.renderer.domElement, p = window.__player, s = document.getElementById('stage'), x = document.getElementById('exporter');
  return {
    canvas: [c.width, c.height].join('x'), css: [c.style.width, c.style.height].join(' '), hold: !!p.hold, playing: p.playing, frame: Math.round(p.time * 24 + 1),
    exporting: s.classList.contains('exporting'), hud: getComputedStyle(document.getElementById('hud')).visibility, veil: !document.getElementById('exporter-veil').hidden,
    off: ['[data-a=size]', '[data-a=fps]', '[data-a=level]', '[data-a=format]', '[data-a=sound]', '[data-a=make]', '[data-a=sample]'].map((q) => (x.querySelector(q).disabled ? 1 : 0)).join(''),
    run: !x.querySelector('.run').hidden, got: !x.querySelector('.got').hidden, placer: window.__placer.state().open, titler: window.__titler.state().open,
    bars: window.__stage.final.uniforms.uBars.value > 0, sound: p.sound,
  };
});
/** the frame the page stands on, drawn now, as it is on the screen */
const picture = () => page.evaluate(() => { const p = window.__player; p.renderAt(Math.round(p.time * 24 + 1)); return document.getElementById('view').toDataURL('image/png'); });
/** the file the tool made last, byte for byte */
async function pull(from = page) {
  const size = await from.evaluate(() => window.__exporter.file().blob.size), parts = [], step = 3 << 20;
  for (let at = 0; at < size; at += step) {
    parts.push(Buffer.from(await from.evaluate(async (at, step) => {
      const b = new Uint8Array(await window.__exporter.file().blob.slice(at, at + step).arrayBuffer());
      let s = '';
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      return btoa(s);
    }, at, step), 'base64'));
  }
  return Buffer.concat(parts);
}
const going = (frames = 1, patience = 60000) => page.waitForFunction(`window.__exporter.state().running?.done >= ${frames}`, { timeout: patience, polling: 30 });
const over = (patience = 240000) => page.waitForFunction('!window.__exporter.state().running', { timeout: patience, polling: 100 });
/** A file made through the tool, with settings of its own; saved as OUTDIR/<name>. Resolves to what the tool says about it + its path, or null. */
async function make(name, settings = {}, sample = false, patience = 240000) {
  await page.evaluate((settings, sample) => { window.__made = undefined; window.__exporter.make(settings, sample).then((r) => { window.__made = r ? 'file' : 'none'; }, (e) => { window.__made = `error ${e}`; }); }, settings, sample);
  await page.waitForFunction('window.__made !== undefined', { timeout: patience, polling: 100 });
  const st = await state();
  if (!st.file) return null;
  const path = `${OUT}/${name}`;
  fs.writeFileSync(path, await pull());
  return { ...st.file, path, note: st.note };
}
/** Lossless renders of frames of the film at w×h, straight from the page — what the file's pictures are compared with. */
async function renders(frames, w, h) {
  await page.evaluate((w, h) => { const p = window.__player, c = window.__stage.renderer.domElement, css = [c.style.width, c.style.height]; p.pause(); p.hold = true; window.__stage.resize(w, h, 1); [c.style.width, c.style.height] = css; }, w, h);
  const list = [];
  try {
    for (const f of frames) list.push(Buffer.from((await page.evaluate((f) => { window.__player.renderAt(f); return document.getElementById('view').toDataURL('image/png'); }, f)).split(',')[1], 'base64'));
  } finally { await page.evaluate(() => { window.__player.hold = false; }); await turn(); }
  return rgbOf(list, w, h);
}
const range = (n, from = 0, step = 1) => Array.from({ length: n }, (_, k) => from + k * step);

let windowId = null;
/** Takes the page out of sight (its window minimised) or brings it back; resolves to what the page then says of itself. */
async function show(on) {
  windowId ??= (await client.send('Browser.getWindowForTarget')).windowId;
  await client.send('Browser.setWindowBounds', { windowId, bounds: { windowState: on ? 'normal' : 'minimized' } });
  await wait(700);
  return page.evaluate(() => document.visibilityState);
}
/** src/media.js as it was found, and the page loaded with it. */
async function ownSettings() {
  // (a page that is open when the settings get another file loads itself anew — it must not do so across this script's own loading)
  await page.goto('about:blank');
  fs.writeFileSync(SETTINGS, original);
  await wait(500);
  await load('?f=362&paused&dpr=0.5&video');
  await asked();
}

// ---- videos in a window ---------------------------------------------------------------------------
// Clips whose every frame is one flat grey, a different one each time and far from its neighbours': a frame that is
// late or early cannot hide. The window is w04 — it fills the picture (frames 335–387).
const LEVELS = "geq=lum='40+3*mod(N*37,64)':cb=128:cr=128";
const H264 = (g) => ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '8', '-g', String(g), '-movflags', '+faststart'];
const CLIPS = {
  '_test_levels24.mp4': { rate: 24, enc: H264(12) },
  '_test_levels24.webm': { rate: 24, enc: ['-c:v', 'libvpx-vp9', '-crf', '8', '-b:v', '0', '-g', '12'] },
  '_test_levels30.mp4': { rate: 30, enc: H264(15) },
  '_test_levels24a.mp4': { rate: 24, enc: H264(12), tone: true },      // with a sound track: a browser treats such a video differently in a tab that is not seen
};
function clipFile(name) {
  const { rate, enc, tone } = CLIPS[name];
  if (!fs.existsSync(`${MEDIA}/${name}`)) {
    ff(['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=320x180:r=${rate}:d=4,format=yuv420p,${LEVELS}`, ...(tone ? ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:a', 'aac', '-b:a', '96k'] : []), ...enc, '-pix_fmt', 'yuv420p', `${MEDIA}/${name}`]);
  }
  return rate;
}
/**
 * One clip in window w04 and a file of frames 330–392 at `fps`: is the clip on the right frame at the moment each
 * picture is drawn, and (24-frame files) is that frame in the picture? `hidden`: the file is made with the page out
 * of sight. `start`: the clip's `start` in src/media.js, seconds — the pictures are then not compared.
 */
async function videoRun({ name, fps, hidden = false, start = 0 }) {
  const rate = clipFile(name), where = `${name}${start ? ` from ${start} s` : ''} in a ${fps}-frame file${hidden ? ', the page out of sight' : ''}`;
  let made, file, cmp;
  await page.goto('about:blank');      // (see ownSettings)
  fs.writeFileSync(SETTINGS, settingsText([`w04: { src: 'media/${name}'${start ? `, start: ${start}` : ''} },`]));
  await wait(500);
  await load('?f=300&paused&dpr=0.5&video');
  await asked();
  const slot = await page.evaluate(() => { const r = Object.values(window.__slots).find((s) => s.video); return r ? { f0: r.f0, f1: r.f1, kind: r.kind, seconds: r.video.duration } : null; });
  if (!slot) { check(`${name} is in the window`, false, 'no video in any window'); return; }
  // what each frame of the clip looks like in the video element, found by this script's own seeks: a seek is over
  // when the element holds the frame with the time stamp asked for (the clips are this script's: frame n is at n / rate)
  const table = await page.evaluate(async (rate, count) => {
    const el = Object.values(window.__slots).find((s) => s.video).video, c = Object.assign(document.createElement('canvas'), { width: 8, height: 8 }), g = c.getContext('2d', { willReadFrequently: true });
    window.__level = () => { g.drawImage(el, 0, 0, 8, 8); return g.getImageData(4, 4, 1, 1).data[0]; };
    window.__stamp = () => { const frame = new VideoFrame(el), t = frame.timestamp; frame.close(); return t; };
    window.__seek = async (n) => {
      const t = (n + 0.5) / rate, on = () => Math.abs(window.__stamp() - (n / rate) * 1e6) < 1500;
      if (Math.abs(el.currentTime - t) > 1e-4 || el.seeking) await new Promise((done) => { const end = () => { clearTimeout(timer); el.removeEventListener('seeked', end); done(); }, timer = setTimeout(end, 5000); el.addEventListener('seeked', end); el.currentTime = t; });
      for (const until = performance.now() + 1000; !on() && performance.now() < until;) await new Promise((r) => setTimeout(r, 2));
      return on();
    };
    const list = [];
    for (let n = 0; n < count; n++) list.push((await window.__seek(n)) ? window.__level() : -1);
    await window.__seek(0);
    return list;
  }, rate, 90);
  const apart = Math.min(...table.slice(1).map((v, n) => Math.abs(v - table[n])));
  if (table.includes(-1)) { check(`${name}: this script can put the clip on a frame`, false, `frames it could not reach: ${table.map((v, n) => (v < 0 ? n : '')).filter(String).join(' ')}`); return; }
  const from = 330, to = 392, span = 24 / fps, count = Math.ceil((to - from + 1) / span);
  // the frame the element holds at the moment each picture is drawn: its time stamp, and its grey
  await page.evaluate(() => { const p = window.__player, inner = p.renderAt; window.__seen = []; window.__settleLog = []; p.renderAt = function (f) { if (this.hold) window.__seen.push([f, window.__stamp(), window.__level()]); return inner.call(this, f); }; });
  const sight = hidden ? await show(false) : 'visible';
  made = await make(`video_${name.replace(/\W/g, '_')}_${fps}${hidden ? '_hidden' : ''}${start ? '_start' : ''}.mp4`, { fps, from, to, sound: false });
  const seen = await page.evaluate(() => { const s = window.__seen; window.__seen = []; return s; });
  const paths = await page.evaluate(() => { const count = {}; let slow = 0; for (const [, how, ms] of window.__settleLog) { count[how] = (count[how] || 0) + 1; slow = Math.max(slow, ms); } window.__settleLog = undefined; return `${JSON.stringify(count)}, slowest ${slow} ms`; });
  if (hidden) { await show(true); await turn(); }
  // which frame of the clip the film asks for: the middle of the stretch the picture stays on screen
  const wanted = (f) => (start + Math.max(0, f + span / 2 - slot.f0) / 24) * rate;
  let wrong = 0, back = 0, last = null;
  const said = [];
  for (const [f, stamp, level] of seen) {
    const x = wanted(f), n = Math.round((stamp / 1e6) * rate);
    // (where the moment asked for falls on the border of two frames of the clip — a 60-frame file of a 24-frame clip — either will do)
    if (Math.abs(stamp - (n / rate) * 1e6) > 1500 || ![Math.floor(x - 0.02), Math.floor(x + 0.02)].includes(n) || Math.abs(table[n] - level) > 2) { wrong++; said.push(`f${f}: frame ${n} (grey ${level}), wanted ${Math.floor(x)} (grey ${table[Math.floor(x)]})`); continue; }
    if (last !== null && (n < last || n > last + Math.ceil(rate / fps - 1e-9))) back++;
    last = n;
  }
  console.log(`     (${where}: how the seeks ended: ${paths})`);
  check(`${where}: the clip stands on the right frame when each picture is drawn`, !!made && made.frames === count && seen.length === count && apart >= 20 && wrong === 0 && back === 0 && sight === (hidden ? 'hidden' : 'visible'), `${seen.length} pictures, clip frames ${seen.length ? Math.round((seen[0][1] / 1e6) * rate) : '?'}…${last}; wrong ${wrong}, out of order or left out ${back}; neighbours in the clip are ≥ ${apart} levels apart${said.length ? '; ' + said.slice(0, 3).join('; ') : ''}`);
  if (fps !== 24 || !made || start) return;
  // …and that frame is in the picture: against renders for which this script put the clip in place itself
  await page.evaluate((w, h) => { const p = window.__player, c = window.__stage.renderer.domElement, css = [c.style.width, c.style.height]; p.pause(); p.hold = true; window.__stage.resize(w, h, 1); [c.style.width, c.style.height] = css; }, W, H);
  const list = [];
  for (let f = from; f <= to; f++) {
    list.push(Buffer.from((await page.evaluate(async (f, n) => {
      const el = Object.values(window.__slots).find((s) => s.video).video;
      if (!(await window.__seek(n))) throw new Error(`the clip did not get to frame ${n}`);
      window.__stage.scene.traverse((o) => { for (const u of Object.values(o.material?.uniforms || {})) if (u?.value?.isTexture && u.value.userData?.media?.video === el) u.value.needsUpdate = true; });
      window.__player.renderAt(f);
      return document.getElementById('view').toDataURL('image/png');
    }, f, Math.floor(wanted(f)))).split(',')[1], 'base64'));
  }
  await page.evaluate(() => { window.__player.hold = false; });
  await turn();
  const refs = rgbOf(list, W, H);
  file = framesOf(made.path, W, H);
  cmp = compare(file, refs, 2);
  // how alike the renders of neighbouring frames are while the window is whole: a picture with the wrong frame of the clip would be that far from its render
  let alike = 0;
  for (let k = 346 - from; k < 380 - from; k++) alike = Math.max(alike, psnr(refs[k], refs[k + 1]));
  check('… and that frame is in the picture (against renders for which this script put the clip in place itself)', file.length === count && cmp.low >= 30 && cmp.astray === 0 && alike < 22, `${cmp.text}; renders of neighbouring frames are at most ${alike.toFixed(1)} dB alike`);
}
const NAME = 'Янтарный циркуль';      // the caption of src/brand.js as it is in the repository

try {
  let st, now, info, order, at, file, refs, cmp, sound, same, made;
  // ================================================================================================
  if (part('panel', 'the panel')) {
  await load('?f=362&paused&dpr=0.5');
  st = await state(); now = await pageNow();
  check('the page starts with the tool closed and its button in the bar', !st.open && (await page.evaluate(() => document.getElementById('exporter').hidden && !!document.querySelector('#hud #exporter-open'))), JSON.stringify(st.options));
  await page.keyboard.press('KeyV');
  await asked();
  st = await state();
  check('V opens it; the browser is asked what it can encode', st.open && st.support.mp4 === true && st.support.webm === true && !st.bad, JSON.stringify(st.support));
  check('it starts with 1920×1080, 24 frames, MP4, with sound', JSON.stringify(st.options) === '{"size":"1920x1080","fps":24,"level":1,"format":"mp4","sound":true}' && /^1213 кадров · 50,5 с · 16 Мбит\/с · до ≈ \d+,\d МБ$/.test(st.sum), st.sum);
  await page.keyboard.press('KeyE');
  await wait(150);
  now = await pageNow();
  check('E opens the placement tool and this one closes', now.placer && !(await state()).open);
  await page.keyboard.press('KeyV');
  await wait(150);
  now = await pageNow();
  check('V opens this one and that one closes', !now.placer && (await state()).open);
  await page.keyboard.press('KeyT');
  await wait(300);
  now = await pageNow();
  check('T opens the title tool and this one closes', now.titler && !(await state()).open);
  await page.evaluate(() => document.querySelector('#hud #exporter-open').click());
  await wait(300);
  now = await pageNow();
  check('the button in the bar opens this one and the title tool closes', !now.titler && (await state()).open && now.canvas === '640x360', `canvas ${now.canvas}`);
  await page.select('#exporter [data-a=size]', '1280x720');
  await page.select('#exporter [data-a=fps]', '60');
  await page.select('#exporter [data-a=level]', '2');
  await page.select('#exporter [data-a=format]', 'webm');
  await page.click('#exporter [data-a=sound]');
  await asked();
  st = await state();
  check('the line under the settings follows them', /^3033 кадров · 50,[56] с · 25 Мбит\/с · до ≈ \d+,\d МБ$/.test(st.sum) && JSON.stringify(st.options) === '{"size":"1280x720","fps":60,"level":2,"format":"webm","sound":false}', `${st.sum}  ${JSON.stringify(st.options)}`);
  await load('?f=362&paused&dpr=0.5&video');
  await asked();
  st = await state();
  check('?video opens it, and what was chosen is remembered', st.open && JSON.stringify(st.options) === '{"size":"1280x720","fps":60,"level":2,"format":"webm","sound":false}' && st.format === 'webm', JSON.stringify(st.options));
  }

  // the settings of this script's own files: small pictures
  await load('?f=362&paused&dpr=0.5&video');
  await page.evaluate((size) => localStorage.setItem('exporter', JSON.stringify({ size, fps: 24, level: 1, format: 'mp4', sound: true })), `${W}x${H}`);
  await load('?f=362&paused&dpr=0.5&video');
  await asked();
  st = await state();
  const shown = await page.evaluate(() => { const s = document.querySelector('#exporter [data-a=size]'); return `${s.value} «${s.selectedOptions[0]?.textContent}»`; });
  check('a size that is not in the list is shown as it is', st.options.size === `${W}x${H}` && shown === `${W}x${H} «${W}×${H}»` && /^1213 кадров · 50,5 с · 0,8 Мбит\/с · до ≈ \d+,\d МБ$/.test(st.sum), `${shown}; ${st.sum}`);
  await page.screenshot({ path: `${OUT}/panel.png` });
  const before = await picture(), calm = await pageNow(), whole = pcm(SOUND);
  const sample = `${OUT}/sample.mp4`, sampleFrames = range(72, 362);
  let sampleRefs = null;
  const sampleRenders = async () => (sampleRefs ??= await renders(sampleFrames, W, H));

  // ================================================================================================
  if (part('sample', 'a «проба» through the buttons: three seconds from the frame on the screen')) {
  await page.click('#exporter [data-a=sample]');
  await going(3);
  st = await state(); now = await pageNow();
  check('while it works: a veil over the film, the bar hidden, the settings locked, progress shown', st.running?.sample && st.running.frames === 72 && st.veil && st.hold && now.exporting && now.hud === 'hidden' && now.off === '1111111' && now.run && /^кадр \d+ из 72/.test(st.left), `${JSON.stringify(st.running)} «${st.left}» locked ${now.off}`);
  for (const key of ['Space', 'ArrowRight', 'KeyE', 'KeyT', 'KeyB', 'KeyM', 'KeyV']) await page.keyboard.press(key);
  await page.mouse.click(400, 300);
  await page.click('#exporter [data-a=close]');
  const second = await page.evaluate(() => window.__exporter.make({}, true));
  now = await pageNow(); st = await state();
  check('… keys, a click on the film, × and a second request do nothing', st.open && !!st.running && second === null && !now.playing && now.frame === 362 && !now.placer && !now.titler && now.bars === calm.bars && now.sound === calm.sound, JSON.stringify({ ...now, off: undefined }));
  await page.screenshot({ path: `${OUT}/panel_working.png` });
  await over();
  await wait(1200);      // the download
  st = await state(); now = await pageNow();
  const sampleName = `${NAME} ${W}x${H} проба.mp4`;
  check('it ends with a file named after the film', st.file?.name === sampleName && st.file.frames === 72 && st.file.seconds === 3 && st.file.sound === 'copied' && st.file.from === 362 && st.file.to === 433 && /^Готово за \d+ с\./.test(st.note) && !st.bad, `${st.file?.name}; «${st.note}»`);
  const got = downloads.at(-1);
  check('the browser takes it as a download, under that name', downloads.length === 1 && got.name === sampleName && got.state === 'completed' && got.bytes === st.file?.bytes, JSON.stringify(got));
  const link = await page.evaluate(() => { const a = document.querySelector('#exporter .got a'); return { href: a.href.slice(0, 5), name: a.download, text: a.textContent }; });
  check('… and the panel keeps a link to it', now.got && link.href === 'blob:' && link.name === sampleName && link.text.startsWith(sampleName), JSON.stringify(link));
  check('the page is its own again: the veil gone, the bar back, the picture at the page\'s size, the same frame', !st.veil && !st.hold && !now.exporting && now.hud === 'visible' && now.off === '0000000' && !now.run && now.canvas === '640x360' && now.css === '1280px 720px' && now.frame === 362 && !now.playing, JSON.stringify({ canvas: now.canvas, css: now.css, frame: now.frame, hud: now.hud }));
  check('… and it draws that frame exactly as before', (await picture()) === before);
  await page.keyboard.press('Space');
  await wait(400);
  const plays = (await pageNow()).playing;
  await page.keyboard.press('Space');
  await page.evaluate(() => window.__player.seek(361 / 24));
  await wait(300);
  check('… and Space plays the film again', plays && !(await pageNow()).playing && (await pageNow()).frame === 362);
  await page.screenshot({ path: `${OUT}/panel_done.png` });

  const bytes = await pull();
  fs.writeFileSync(sample, bytes);
  info = about(sample); order = boxes(bytes);
  check('the file: H.264 and AAC in an MP4, 3 seconds of 24 frames', info.video === `h264 ${W}x${H} 24fps` && info.audio === 'aac 48000 stereo' && Math.abs(info.seconds - 3) < 0.06 && bytes.length === st.file.bytes, `${info.video} + ${info.audio}, ${info.seconds} s, ${bytes.length} bytes`);
  check('… its index stands before the pictures (it plays from a web page while it arrives)', order.indexOf('moov') > 0 && order.indexOf('moov') < order.indexOf('mdat'), order.join(' '));
  check('… its colours are labelled (BT.709, video range)', /^tv, bt709/.test(info.colour), info.colour);
  at = stamps(sample);
  check('… 72 pictures, evenly spaced', at.length === 72 && at.every((t, k) => t === at[0] + k * (at[1] - at[0])), `${at.length} pictures, ${at.slice(0, 4).join(' ')} …`);
  file = framesOf(sample, W, H); cmp = compare(file, await sampleRenders());
  check('… each of them is its frame of the film (against lossless renders of frames 362–433)', file.length === 72 && cmp.low >= 30 && cmp.astray === 0, cmp.text);
  const lag = Math.floor(((361 / 24) * 48000) / 1024) * 1024;
  sound = pcm(sample); same = sameSound(sound, whole, lag, 2048);
  check('… its sound is the film\'s own from that moment, sample for sample (it starts with a whole packet, ≤ 21 ms early)', same.differ === 0 && same.n > 2.9 * 96000 && 361 / 24 - lag / 48000 < 0.0214, `${same.n / 2} samples compared from ${(lag / 48000).toFixed(4)} s (the picture starts at ${(361 / 24).toFixed(4)} s): ${same.differ} differ`);
  }

  // ================================================================================================
  if (part('stop', '«Стоп»')) {
  const count = downloads.length;
  await page.click('#exporter [data-a=make]');
  await going(24);
  st = await state();
  check('«Сохранить видео» starts the whole film and says how long it will take', st.running && !st.running.sample && st.running.frames === 1213 && /^кадр \d+ из 1213 · ещё ≈ \d+ (с|мин)$/.test(st.left), `«${st.left}»`);
  // leaving the page now would take the unfinished file along: the browser asks first (this script answers «stay»)
  const left = await page.reload({ timeout: 3000 }).then(() => 'left', () => 'stayed');
  st = await state();
  check('the page is left meanwhile: the browser asks first, and on «stay» the work goes on', left === 'stayed' && dialogs.join() === 'stop: beforeunload' && st.running?.done > 24, `${left}; the browser asked: ${dialogs.join() || 'nothing'}; frame ${st.running?.done} by now`);
  await page.click('#exporter [data-a=stop]');
  await over(20000);
  await turn();
  st = await state(); now = await pageNow();
  check('«Стоп» ends it: no file, no download, the page as it was', st.note === 'Остановлено — файла нет.' && !st.bad && !st.file && !now.got && downloads.length === count && !st.hold && !st.veil && now.hud === 'visible' && now.canvas === '640x360' && now.frame === 362, `«${st.note}» ${JSON.stringify({ canvas: now.canvas, frame: now.frame })}`);
  check('… and it draws its frame exactly as before', (await picture()) === before);
  }

  // ================================================================================================
  if (part('lost', 'a graphics card that gives up: no memory for the size, a lost context')) {
  // No memory for buffers of the file's size: the context stays and the picture is black — only WebGL's error code
  // tells. (The code is this script's doing: the first one asked for after a frame was drawn.)
  await page.evaluate(() => {
    const gl = window.__stage.renderer.getContext(), inner = gl.getError.bind(gl), drawn = window.__player.renders;
    let told = false;
    gl.getError = () => { const error = inner(); if (told || window.__player.renders === drawn) return error; told = true; return gl.OUT_OF_MEMORY; };
    window.__made = undefined;
    window.__exporter.make({ from: 362, to: 433 }).then((r) => { window.__made = r ? 'file' : 'none'; });
  });
  await page.waitForFunction('window.__made !== undefined', { timeout: 30000, polling: 100 });
  await page.evaluate(() => { delete window.__stage.renderer.getContext().getError; });
  await turn();
  st = await state(); now = await pageNow();
  check('out of memory for the size: no file, the panel says why, the page is as it was', (await page.evaluate(() => window.__made)) === 'none' && st.bad && /^Не получилось: видеокарта не справилась с таким размером кадра/.test(st.note) && !st.file && !st.hold && !st.veil && now.hud === 'visible' && now.canvas === '640x360' && (await picture()) === before, `«${st.note}»`);
  const canLose = await page.evaluate(() => !!(window.__ext = window.__stage.renderer.getContext().getExtension('WEBGL_lose_context')));
  if (canLose) {
    await page.evaluate(() => { window.__made = undefined; window.__exporter.make({ from: 362, to: 433 }).then((r) => { window.__made = r ? 'file' : 'none'; }); });
    await going(3);
    await page.evaluate(() => window.__ext.loseContext());
    await page.waitForFunction('window.__made !== undefined', { timeout: 30000, polling: 100 });
    st = await state(); now = await pageNow();
    check('the file is given up and the panel says why', (await page.evaluate(() => window.__made)) === 'none' && st.bad && /^Не получилось: видеокарта не справилась с таким размером кадра/.test(st.note) && !st.file && !st.hold && !st.veil && now.hud === 'visible', `«${st.note}»`);
    await page.evaluate(() => window.__ext.restoreContext());
    await wait(1500);
    await turn();
    const again = await make('after_loss.mp4', { from: 362, to: 373, sound: false });
    file = again ? framesOf(again.path, W, H) : [];
    cmp = compare(file, (await sampleRenders()).slice(0, 12));
    check('once the context is back the next file is right', !!again && file.length === 12 && cmp.low >= 30 && cmp.astray === 0 && (await pageNow()).canvas === '640x360', again ? cmp.text : 'no file');
    check('… and the page draws its frame as before', (await picture()) === before);
  } else console.log('     (no WEBGL_lose_context here: skipped)');
  }

  // ================================================================================================
  if (part('webm', 'WebM')) {
  made = await make('piece.webm', { format: 'webm', from: 100, to: 123 });
  info = made ? about(made.path) : {};
  check('VP9 and Opus in a WebM', !!made && info.video === `vp9 ${W}x${H} 24fps` && info.audio === 'opus 48000 stereo' && made.sound === 'encoded' && made.name === `${NAME} ${W}x${H}.webm` && /^video\/webm; codecs="vp09[^"]*, opus"$/.test(made.type), `${info.video} + ${info.audio}; ${made?.type}`);
  file = made ? framesOf(made.path, W, H) : [];
  cmp = compare(file, await renders(range(24, 100), W, H));
  check('… 24 pictures, each its frame of the film (100–123)', file.length === 24 && cmp.low >= 30 && cmp.astray === 0, cmp.text);
  sound = made ? pcm(made.path) : new Int16Array(0);
  const found = sound.length > 80000 ? findSound(sound, 9600, whole, Math.round((99 / 24) * 48000) + 9600) : { lag: NaN, like: 0 };
  check('… its sound is the film\'s from that moment (encoded anew: alike, not the same; within 2 ms)', Math.abs(found.lag) <= 96 && found.like > 0.9 && Math.abs(sound.length / 96000 - 1) < 0.06, `${(sound.length / 96000).toFixed(3)} s; nearest ${(found.lag / 48).toFixed(2)} ms off, likeness ${found.like.toFixed(4)}`);
  }

  // ================================================================================================
  if (part('rates', '30 and 60 frames per second; a silent file')) {
  for (const fps of [60, 30]) {
    made = await make(`rate${fps}.mp4`, { fps, from: 500, to: 511, sound: false });
    const n = 12 * fps / 24;
    info = made ? about(made.path) : {};
    file = made ? framesOf(made.path, W, H) : [];
    cmp = compare(file, await renders(range(n).map((k) => 500 + (k * 24) / fps), W, H));
    at = made ? stamps(made.path) : [];
    check(`${fps} frames per second: half a second is ${n} different pictures, each drawn at its own moment of the film`, !!made && made.frames === n && file.length === n && info.video === `h264 ${W}x${H} ${fps}fps` && Math.abs(info.seconds - 0.5) < 0.02 && at.every((t, k) => t === at[0] + k * (at[1] - at[0])) && cmp.low >= 30 && cmp.astray === 0 && made.name === `${NAME} ${W}x${H} ${fps}fps.mp4`, `${info.video}, ${info.seconds} s; ${cmp.text}`);
    if (fps === 60) check('without «со звуком» the file has no sound track', !!made && info.audio === null && made.sound === null, `audio: ${info.audio}`);
  }
  }

  // ================================================================================================
  if (part('bars', 'the bars')) {
  const top = (list) => { let s = 0; const n = W * 3 * Math.round(H * 0.1); for (let i = 0; i < n; i++) s += list[0][i]; return s / n; };
  made = await make('nobars.mp4', { from: 362, to: 367, sound: false });
  const open = made ? top(framesOf(made.path, W, H)) : NaN;
  await page.keyboard.press('KeyB');
  await wait(200);
  made = await make('bars.mp4', { from: 362, to: 367, sound: false });
  const barred = made ? top(framesOf(made.path, W, H)) : NaN;
  await page.keyboard.press('KeyB');
  await wait(200);
  check('with the bars on (key B) the file has them', (await pageNow()).bars === false && open > 20 && barred < 3, `the top tenth of frame 362: ${open.toFixed(1)} without, ${barred.toFixed(1)} with`);
  check('… and with the bars off again the page draws its frame as before', (await picture()) === before);
  }

  // ================================================================================================
  if (part('large', 'a file larger than the page')) {
  await page.setViewport({ width: 640, height: 360, deviceScaleFactor: 1 });
  await wait(400);
  await turn();
  const small = await pageNow(), smallBefore = await picture();
  await page.screenshot({ path: `${OUT}/panel_small.png` });
  made = await make('large.mp4', { size: '1280x720', from: 205, to: 210, sound: false });
  info = made ? about(made.path) : {};
  file = made ? framesOf(made.path, 1280, 720) : [];
  now = await pageNow();
  check('a 320×180 picture on the page, a 1280×720 file', small.canvas === '320x180' && !!made && info.video === 'h264 1280x720 24fps' && file.length === 6 && now.canvas === '320x180' && now.css === '640px 360px', `page ${small.canvas} → ${now.canvas}; file ${info.video}`);
  check('… and the page draws its frame as before', (await picture()) === smallBefore);
  cmp = compare(file, await renders(range(6, 205), 1280, 720));
  check('… its pictures are the film drawn at that size (frames 205–210 against 1280×720 renders)', cmp.low >= 33 && cmp.astray === 0, cmp.text);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await wait(400);
  }

  // ================================================================================================
  // The two largest sizes of the panel, a few frames each. Not part of a plain run (HUGE=1, or ONLY=huge): without a
  // graphics card one 3840×2160 frame takes a quarter of a minute to draw.
  if (part('huge', 'the largest sizes: 2560×1440 and 3840×2160')) {
  await load('?f=205&paused&dpr=0.5&video');
  await asked();
  const pageBefore = await picture();
  for (const [w, h, n] of [[2560, 1440, 2], [3840, 2160, 3]]) {
    const t0 = Date.now();
    made = await make(`huge_${w}x${h}.mp4`, { size: `${w}x${h}`, from: 205, to: 204 + n, sound: false }, false, 900000);
    const took = (Date.now() - t0) / 1000;
    st = await state(); now = await pageNow();
    info = made ? about(made.path) : {};
    file = made ? framesOf(made.path, w, h) : [];
    cmp = made ? compare(file, await renders(range(n, 205), w, h)) : { low: 0, astray: -1, text: 'no file' };
    check(`${w}×${h}: the file is made, and its pictures are the film drawn at that size`, !!made && info.video === `h264 ${w}x${h} 24fps` && file.length === n && cmp.low >= 33 && cmp.astray === 0 && now.canvas === '640x360', `${info.video ?? `«${st.note}»`}, ${made ? (made.bytes / 1e6).toFixed(2) : '?'} MB; ${cmp.text}; ${(took / n).toFixed(1)} s a frame`);
  }
  check('… and the page draws its frame as before', (await picture()) === pageBefore);
  }

  // ================================================================================================
  if (part('title', 'a title typed in the title tool and not saved')) {
  await load('?f=1100&paused&dpr=0.5');
  const frames = range(6, 1100);
  const saved = await renders(frames, W, H);
  await page.keyboard.press('KeyT');
  await page.waitForFunction('window.__titler.state().open === true', { timeout: 10000 });
  await page.evaluate(() => { const i = document.querySelector('#titler [data-a=caption]'); i.focus(); i.select(); });
  await page.keyboard.type('Северный ветер', { delay: 8 });
  await page.waitForFunction('window.__titler.state().settled === true && window.__titler.state().unsaved === true', { timeout: 20000, polling: 50 });
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('KeyV');      // the video tool takes the title tool's place; what was typed stays on the page
  await page.waitForFunction('window.__exporter.state().open === true && window.__titler.state().open === false', { timeout: 10000 });
  await asked();
  made = await make('title.mp4', { from: 1100, to: 1105, sound: false });
  const typed = await renders(frames, W, H);
  file = made ? framesOf(made.path, W, H) : [];
  const own = file.length === 6 ? Math.min(...file.map((x, k) => psnr(x, typed[k]))) : 0, other = file.length === 6 ? Math.max(...file.map((x, k) => psnr(x, saved[k]))) : 99;
  check('the file shows the title as it is typed, and is named after it', !!made && made.name === `Северный ветер ${W}x${H}.mp4` && file.length === 6 && own >= 33 && other < own - 6, `«${made?.name}»; against the page with the typed title ≥ ${own.toFixed(1)} dB, against the saved one ≤ ${other.toFixed(1)} dB`);
  // (the title tool keeps what is not saved across a reload: «Вернуть», or the parts that follow would get that title)
  await page.keyboard.press('KeyT');
  await page.waitForFunction('window.__titler.state().open === true', { timeout: 10000 });
  await page.click('#titler [data-a=undo]');
  await page.waitForFunction('window.__titler.state().settled === true && window.__titler.state().unsaved === false', { timeout: 20000, polling: 50 });
  await page.keyboard.press('KeyT');
  const again = await renders(frames.slice(0, 1), W, H);
  const kept = await page.evaluate(() => JSON.parse(sessionStorage.getItem('titler') || '{}').now ?? null);
  check('… and after «Вернуть» the page draws the saved title again, bit for bit, and keeps nothing for the next load', again.length === 1 && again[0].equals(saved[0]) && kept === null, kept === null ? '' : `kept: ${JSON.stringify(kept)}`);
  }

  // ================================================================================================
  if (part('videos', 'videos in a window: each picture of the file shows the frame of the clip that belongs there')) {
  for (const name of ['_test_levels24.mp4', '_test_levels24.webm', '_test_levels30.mp4']) await videoRun({ name, fps: 24 });
  // more pictures than the clip has frames: an MP4's frame is kept while it lasts (`held`), a WebM is asked every time
  for (const name of ['_test_levels24.mp4', '_test_levels24.webm']) await videoRun({ name, fps: 60 });
  await ownSettings();
  }

  // ================================================================================================
  // A frame of a clip says when it starts and how long it lasts — rounded: to a microsecond, in a WebM to a
  // millisecond, so that a frame may claim a millisecond of the next one. With these `start`s every picture of the
  // file asks for a moment just past the border of two frames of the clip: 1.0–1.4 ms past it in the WebM, 0.2 ms in
  // the MP4. A picture that is kept because "it still covers that moment" would there be the frame before: so it
  // was for every third picture of the WebM and every second of the MP4 while half a millisecond past a frame's end
  // still counted as that frame.
  if (part('offset', 'videos in a window: a clip that is asked for moments just past the borders of its frames')) {
  await videoRun({ name: '_test_levels24.webm', fps: 24, start: 0.2302 });
  await videoRun({ name: '_test_levels24.mp4', fps: 24, start: 0.2294 });
  await ownSettings();
  }

  // ================================================================================================
  if (part('hidden', 'the page out of sight: its window minimised')) {
  if ((await show(false)) !== 'hidden') {
    await show(true);
    console.log('     (this browser goes on showing a minimised window: skipped)');
  } else {
    const beats = await page.evaluate(() => new Promise((done) => { let n = 0, on = true; const loop = () => { if (on) { n++; requestAnimationFrame(loop); } }; requestAnimationFrame(loop); setTimeout(() => { on = false; done(n); }, 600); }));
    made = await make('hidden.mp4', { from: 362, to: 433 });
    const unseen = await pageNow();
    const back = await show(true);
    await turn();
    file = made ? framesOf(made.path, W, H) : [];
    cmp = compare(file, await sampleRenders());
    check('a page that is not seen — its own loop at rest — makes the file all the same', beats === 0 && !!made && made.sound === 'copied' && file.length === 72 && cmp.low >= 30 && cmp.astray === 0, `the page's loop: ${beats} frames in 0.6 s; ${cmp.text}`);
    check('… and has its picture back at the page\'s size before anyone looks', unseen.canvas === '640x360' && unseen.css === '1280px 720px' && !unseen.hold && back === 'visible' && (await picture()) === before, `while out of sight: canvas ${unseen.canvas}, shown at ${unseen.css}`);
    if (made && fs.existsSync(sample)) {
      const packets = (f) => String(ff(['-loglevel', 'error', '-i', f, '-map', '0', '-c', 'copy', '-f', 'md5', '-']).out).trim();
      console.log(`     (packet for packet the «проба» that was made in sight: ${packets(made.path) === packets(sample) ? 'yes' : 'no'})`);
    }
    // a video in a window: nothing tells the page that a frame was shown — the browser shows none
    await videoRun({ name: '_test_levels24.mp4', fps: 60, hidden: true });
    await videoRun({ name: '_test_levels24a.mp4', fps: 24, hidden: true });
    await ownSettings();
  }
  }

  // ================================================================================================
  if (part('refuse', 'a browser that cannot: no encoder for the format, for the size, for the sound, none at all')) {
  // Each on a page of its own, which is told so before its scripts run. (The size is this script's, 320×180.)
  const visit = async (before, asks = true) => {
    const other = await browser.newPage();
    listen(other);
    await other.evaluateOnNewDocument(before);
    await other.goto(`${HOST}/?f=362&paused&dpr=0.5&video`, { waitUntil: 'load', timeout: 120000 });
    await other.waitForFunction('window.__ready === true && !!window.__exporter', { timeout: 120000 });
    if (asks) await other.waitForFunction('Object.keys(window.__exporter.state().support).length > 0', { timeout: 30000, polling: 50 });
    else await wait(1500);
    return other;
  };
  const look = (other) => other.evaluate(() => {
    const x = document.getElementById('exporter'), f = x.querySelector('[data-a=format]');
    return { ...window.__exporter.state(), shown: f.value, off: [...f.options].filter((o) => o.disabled).map((o) => o.value).join(','), make: !x.querySelector('[data-a=make]').disabled, sample: !x.querySelector('[data-a=sample]').disabled };
  });
  /** a short file from that page: what the tool says about it and what ffmpeg finds in it */
  const piece = async (other, name, settings) => {
    const said = await other.evaluate(async (settings) => { const r = await window.__exporter.make(settings); return r ? { name: r.name, sound: r.sound, note: window.__exporter.state().note, bad: window.__exporter.state().bad } : null; }, settings);
    if (!said) return null;
    fs.writeFileSync(`${OUT}/${name}`, await pull(other));
    return { ...said, ...about(`${OUT}/${name}`) };
  };
  let other, seen;

  other = await visit(() => { const inner = VideoEncoder.isConfigSupported.bind(VideoEncoder); VideoEncoder.isConfigSupported = async (config) => (/^avc/.test(config.codec) ? { supported: false, config } : inner(config)); });
  seen = await look(other);
  check('no H.264 encoder: the panel says so and takes WebM; the choice stays MP4', seen.support.mp4 === false && seen.support.webm === true && seen.format === 'webm' && seen.shown === 'webm' && seen.off === 'mp4' && seen.options.format === 'mp4' && !seen.bad && seen.make && seen.sample && seen.note === 'MP4 · H.264 в таком размере этот браузер не кодирует — файл будет WebM · VP9.', `«${seen.note}»`);
  made = await piece(other, 'refused_h264.webm', { from: 362, to: 367, sound: false });
  check('… and the file is a WebM', !!made && made.name === `${NAME} ${W}x${H}.webm` && made.video === `vp9 ${W}x${H} 24fps` && !made.bad, made ? `${made.name}: ${made.video}` : 'no file');
  await other.close();

  other = await visit(() => { VideoEncoder.isConfigSupported = async (config) => ({ supported: false, config }); });
  seen = await look(other);
  check('no encoder for this size: the panel asks for a smaller one, the buttons are off, nothing starts', seen.support.mp4 === false && seen.support.webm === false && seen.format === null && seen.bad && !seen.make && !seen.sample && seen.note === `В размере ${W}×${H} этот браузер видео не кодирует — выберите размер поменьше.` && (await other.evaluate(() => window.__exporter.make())) === null && !(await look(other)).hold, `«${seen.note}»`);
  await other.close();

  other = await visit(() => { delete window.VideoEncoder; }, false);
  seen = await look(other);
  check('a browser without WebCodecs: the panel says what it takes, the buttons are off', Object.keys(seen.support).length === 0 && seen.bad && !seen.make && !seen.sample && /^Этот браузер не кодирует видео сам \(WebCodecs\): нужен свежий Chrome или Edge/.test(seen.note), `«${seen.note}»`);
  await other.close();

  other = await visit(() => { AudioEncoder.isConfigSupported = async (config) => ({ supported: false, config }); });
  made = await piece(other, 'refused_opus.webm', { format: 'webm', from: 362, to: 367 });
  check('no Opus encoder: the WebM is made without sound and the panel says so', !!made && made.sound === null && made.audio === null && made.video === `vp9 ${W}x${H} 24fps` && !made.bad && / Файл без звука: звук для такого формата этот браузер не кодирует\. /.test(made.note), made ? `«${made.note}»` : 'no file');
  made = await piece(other, 'refused_opus.mp4', { format: 'mp4', from: 362, to: 367 });
  check('… while the MP4 keeps its sound: that is copied, not encoded', !!made && made.sound === 'copied' && made.audio === 'aac 48000 stereo' && !/без звука/.test(made.note), made ? `${made.audio}; «${made.note}»` : 'no file');
  await other.close();

  other = await visit(() => { const inner = window.fetch.bind(window); window.fetch = (what, ...rest) => (/audio\.m4a/.test(String(what?.url ?? what)) ? Promise.resolve(new Response('', { status: 404 })) : inner(what, ...rest)); });
  made = await piece(other, 'refused_sound.mp4', { from: 362, to: 367 });
  check('the soundtrack cannot be read: the file is made without sound and the panel says why', !!made && made.sound === null && made.audio === null && made.video === `h264 ${W}x${H} 24fps` && !made.bad && / Файл без звука: звуковая дорожка не прочиталась \([^)]*audio\.m4a: 404\)\. /.test(made.note), made ? `«${made.note}»` : 'no file');
  await other.close();
  }

  // ================================================================================================
  if (part('full', 'the whole film')) {
    await load('?f=362&paused&dpr=0.5&video');
    await asked();
    const t0 = Date.now(), n0 = downloads.length;
    await page.click('#exporter [data-a=make]');
    await going(1);
    await over(900000);
    await wait(2000);
    st = await state(); now = await pageNow();
    const fullName = `${NAME} ${W}x${H}.mp4`;
    check('«Сохранить видео» makes the whole film', st.file?.name === fullName && st.file.frames === 1213 && st.file.sound === 'copied' && st.file.from === 1 && st.file.to === 1213 && downloads.length === n0 + 1 && downloads.at(-1).name === fullName && downloads.at(-1).bytes === st.file.bytes, `${st.file?.name}, ${st.file?.bytes} bytes, ${((Date.now() - t0) / 1000).toFixed(0)} s; «${st.note}»`);
    check('… and leaves the page as it was', !st.hold && !st.veil && now.canvas === '640x360' && now.frame === 362 && (await picture()) === before);
    const full = `${OUT}/film.mp4`, data = await pull();
    fs.writeFileSync(full, data);
    info = about(full); order = boxes(data); at = stamps(full);
    const promised = /до ≈ ([\d,]+) МБ/.exec(st.sum)?.[1].replace(',', '.') * 2 ** 20;
    check('the file: 1213 pictures, 50.5 s, index first, no larger than promised', info.video === `h264 ${W}x${H} 24fps` && info.audio === 'aac 48000 stereo' && at.length === 1213 && at.every((t, k) => t === at[0] + k * (at[1] - at[0])) && Math.abs(info.seconds - 50.56) < 0.05 && order.indexOf('moov') < order.indexOf('mdat') && data.length <= promised * 1.05, `${info.video} + ${info.audio}, ${info.seconds} s, ${at.length} pictures, ${(data.length / 2 ** 20).toFixed(2)} MB of «${st.sum.split(' · ').pop()}»; ${order.join(' ')}`);
    sound = pcm(full); same = sameSound(sound, whole, 0);
    check('… its sound is public/audio.m4a, sample for sample, to the last picture', same.differ === 0 && sound.length / 96000 >= 1213 / 24 && whole.length - sound.length < 2 * 2048, `${(sound.length / 96000).toFixed(4)} s of ${(whole.length / 96000).toFixed(4)} s; ${same.differ} of ${same.n} values differ`);
    file = framesOf(full, W, H);
    // Every 30th frame and the last two, each with the renders of the frames next to it. Where the encoder runs out
    // of bits — the sparks after the flash (f991: at this size they are lines one pixel wide, and none stands where
    // it stood a frame ago) — a picture is far from its own render, but farther still from its neighbours'.
    const picks = range(41, 1, 30).concat([1212, 1213]);
    const want = [...new Set(picks.flatMap((f) => [f - 1, f, f + 1]).filter((f) => f >= 1 && f <= 1213))];
    const drawn = await renders(want, W, H);
    refs = new Map(want.map((f, i) => [f, drawn[i]]));
    let low = 99, lowAt = 0, sum = 0;
    const off = [];
    if (file.length === 1213) for (const f of picks) {
      const own = psnr(file[f - 1], refs.get(f)), next = Math.max(...[f - 1, f + 1].filter((n) => refs.has(n)).map((n) => psnr(file[f - 1], refs.get(n))));
      sum += own;
      if (own < low) { low = own; lowAt = f; }
      if (!(own >= 33 || (own >= 22 && own >= next + 3))) off.push(`f${f}: ${own.toFixed(1)} dB (the render next to it: ${next.toFixed(1)})`);
    }
    check('… its pictures are the film (every 30th frame and the last two against lossless renders)', file.length === 1213 && off.length === 0, `${file.length} pictures in the file, ${picks.length} compared: PSNR lowest ${low.toFixed(1)} dB (f${lowAt}), mean ${(sum / picks.length).toFixed(1)} dB${off.length ? '; not right: ' + off.slice(0, 4).join('; ') : ''}`);
  }

  // What the part about a graphics card that gives up leaves in the console: the tool's two errors, the loss of the
  // context and, at the first change of the picture's size after the context is back, three.js freeing buffers of
  // the context that is gone («delete: object does not belong to this context» — the page says the same without the
  // video tool; harmless).
  const expected = ran.has('lost') ? /WebGL context|Context Lost|context lost|graphics card (dropped|could not draw)|object does not belong to this context/i : /^$/;
  check('the browser asked before a page was left only while a file was being made', dialogs.join() === (ran.has('stop') ? 'stop: beforeunload' : ''), dialogs.join() || 'never');
  const odd = [...new Set(msgs)].filter((m) => !expected.test(m));
  check('the console stayed clean (but for what the graphics card\'s failures, this script\'s doing, left there)', odd.length === 0, odd.slice(0, 6).join(' | ') || `${msgs.length} message(s) about those failures`);
} catch (e) {
  failed++;
  console.log('STOPPED:', e.stack || e.message, e.cause ? `\n  because: ${e.cause.message || e.cause}` : '');
} finally {
  await browser.close();
  fs.writeFileSync(SETTINGS, original);
  for (const n of fs.readdirSync(MEDIA)) if (!hadFiles.has(n)) fs.rmSync(`${MEDIA}/${n}`, { force: true });
}
console.log(`\n${failed ? `${failed} check(s) FAILED` : 'all checks passed'}  [${((Date.now() - t00) / 1000).toFixed(0)} s]; files in ${OUT}`);
process.exit(failed ? 1 : 0);
