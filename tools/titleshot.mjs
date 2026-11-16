// titleshot.mjs — the final title as other settings of src/brand.js give it, drawn by headless Chromium through the
// dev server (npm run dev must be running).
//   node titleshot.mjs OUTDIR                       the built-in set of variants (the checks of the title, 2–3 min);
//                                                   ONLY=long,picture,hot in the environment: just these
//   node titleshot.mjs OUTDIR '{"caption":"…"}' [FRAMES]     one variant; FRAMES like 1010,1100 (default 1100)
//                                                   QUERY=scope in the environment: more of the page's address (here: the 2.39:1 bars)
// Each variant: src/brand.js is rewritten, the page is opened anew, frames are saved as OUTDIR/<variant>_f<frame>.png
// (1280×720) and OUTDIR/report.json gets what the page said and how it was named. Checked on the way: the page says
// nothing (or exactly the warning the variant is there for) and is named after the settings; then (`hot`) an open
// paused page follows a change of the file by itself and stays on its frame; and (`lost`) a picture standing for the
// emblem is still there after the WebGL context was lost and restored. The pictures are for the eye.
// Test pictures go to public/media/_test_*. Afterwards the user's src/brand.js is put back and they are removed.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const repo = fs.existsSync(new URL('../src/brand.js', import.meta.url)) ? new URL('..', import.meta.url).pathname : '/home/user/circle.animaation.proto-2/';
const base = process.env.URL || 'http://localhost:5173/';
const more = process.env.QUERY ? `&${process.env.QUERY}` : '';
const out = process.argv[2];
if (!out) { console.error('usage: node titleshot.mjs OUTDIR [\'{"caption":"…"}\' [FRAMES]]'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const brandFile = path.join(repo, 'src/brand.js'), media = path.join(repo, 'public/media');
const original = fs.readFileSync(brandFile, 'utf8');

// ---- test pictures: a coloured mark, a black one, and a small one lost in a big see-through canvas
const MARK = (fill, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200"${extra}><path fill="${fill}" d="M120 8 L228 192 H12 Z M120 70 L66 162 H174 Z"/><circle cx="120" cy="132" r="17" fill="${fill}"/></svg>`;
const pictures = {
  '_test_mark_colour.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 160" width="300" height="160"><rect x="4" y="4" width="152" height="152" rx="30" fill="#e2452e"/><circle cx="220" cy="80" r="76" fill="#2e86e2"/><path d="M40 112 L80 44 L120 112 Z" fill="#ffffff"/><rect x="196" y="56" width="48" height="48" fill="#ffd23c"/></svg>`,
  '_test_mark_black.svg': MARK('#000000'),
  '_test_mark_white.svg': MARK('#ffffff', ' width="120" height="100"'),
};
const variants = one => one ? [['custom', one, null]] : [
  // name, settings, frames (null: 1100), the warning the page has to give (none if absent)
  ['default', { caption: 'Янтарный циркуль' }, [1010, 1100, 1212]],
  ['long', { caption: 'Архитектурное бюро «Северный ветер»', tagline: 'проекты, которые строят' }, [1100, 1212]],
  ['short', { caption: 'ORBITA' }, [1100, 1212]],
  ['tagline', { caption: 'Янтарный циркуль', tagline: 'архитектурное бюро' }, [1040, 1100, 1212]],
  ['big', { caption: 'Orbita', size: 1.6, tagline: 'studio' }, [1100, 1212]],
  ['latin', { caption: 'Zażółć Gęślą Jaźń & Söhne №7', tagline: 'Über-Café · 2024' }, [1100]],
  ['picture', { caption: 'Северный ветер', emblem: 'media/_test_mark_colour.svg' }, [990, 1010, 1100, 1213]],
  ['black', { caption: 'Северный ветер', emblem: 'media/_test_mark_black.svg' }, [1010, 1100]],
  ['black_own', { caption: 'Северный ветер', emblem: 'media/_test_mark_black.svg', emblemGold: false }, [1100]],
  ['white_gold', { caption: 'Северный ветер', emblem: 'media/_test_mark_white.svg', emblemGold: true, emblemSize: 1.3, ring: false }, [1100]],
  ['padded', { caption: 'Северный ветер', emblem: 'media/_test_mark_padded.png' }, [1100]],
  ['text_only', { caption: 'Северный ветер', tagline: 'архитектурное бюро', emblem: 'none', ring: false, size: 2 }, [1030, 1100, 1212]],
  ['ring_only', { caption: 'Северный ветер', emblem: 'none' }, [1100]],
  ['emblem_only', { caption: '' }, [1100]],
  ['picture_only', { caption: '', emblem: 'media/_test_mark_colour.svg', name: 'Orbita' }, [1100]],
  ['missing_file', { caption: 'Северный ветер', emblem: 'media/_test_no_such_file.svg' }, [1100], /cannot load the emblem media\/_test_no_such_file\.svg — the compass is shown instead/],
  ['odd_letters', { caption: 'Αθήνα 東京 ok' }, [1100], /no glyphs for Α θ ή ν α 東 京 — they are left out/],
  ['no_letters', { caption: '東京', tagline: '東' }, [1100], /no glyphs for 東 京 — they are left out/],
  ['tagline_only', { caption: '', tagline: 'архитектурное бюро' }, [1100]],
];

const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: chromium.args, defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 } });
const report = {};
let stamp = 0, failed = 0, checks = 0;
const check = (name, cond, note = '') => { checks++; if (!cond) { failed++; console.log(`FAIL ${name}${note ? `: ${note}` : ''}`); } };
/** The file replaced in one step: written in place it is empty for a moment, and the dev server reports two changes. */
const put = (file, text) => { fs.writeFileSync(`${file}.titleshot-tmp`, text); fs.renameSync(`${file}.titleshot-tmp`, file); };
/** Writes src/brand.js and waits until the dev server serves it (it notices a change a moment later). */
const setBrand = async (settings, wait = true) => {
  const mark = `titleshot ${process.pid}.${++stamp}`;
  put(brandFile, `// ${mark}: a test variant — the tool puts the real file back when it is done\nexport default ${JSON.stringify(settings, null, 2)};\n`);
  for (let i = 0; wait; i++) {
    const served = await (await fetch(`${base}src/brand.js`)).text();      // the module as a page gets it
    if (served.includes(mark)) break;
    if (i > 100) throw new Error('the dev server does not serve the new src/brand.js');
    await new Promise((r) => setTimeout(r, 100));
  }
};
const watch = (page, said) => {
  page.on('console', (m) => { if (['error', 'warn', 'warning'].includes(m.type())) said.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => said.push('PAGEERROR ' + (e.stack || e.message).slice(0, 400)));
};
const restore = () => { put(brandFile, original); for (const f of fs.readdirSync(media)) if (f.startsWith('_test_mark_')) fs.rmSync(path.join(media, f)); };
process.on('SIGINT', () => { restore(); process.exit(130); });
try {
  for (const [name, text] of Object.entries(pictures)) fs.writeFileSync(path.join(media, name), text);
  {
    // the padded bitmap: the black mark, 150 px wide, off-centre on a 1600×1000 see-through canvas
    const page = await browser.newPage();
    const png = await page.evaluate(async (svg) => {
      const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(svg); await img.decode();
      const c = document.createElement('canvas'); c.width = 1600; c.height = 1000;
      c.getContext('2d').drawImage(img, 1100, 200, 150, 125);
      return c.toDataURL('image/png');
    }, MARK('#101418'));
    fs.writeFileSync(path.join(media, '_test_mark_padded.png'), Buffer.from(png.split(',')[1], 'base64'));
    await page.close();
  }
  const custom = process.argv[3] ? JSON.parse(process.argv[3]) : null;
  const frames = process.argv[4] ? process.argv[4].split(',').map(Number) : null;
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  for (const [name, settings, ff, warning] of variants(custom)) {
    if (only && !only.includes(name)) continue;
    await setBrand(settings);
    const page = await browser.newPage();
    const said = [];
    watch(page, said);
    await page.evaluateOnNewDocument(() => { window.__manual = true; });
    await page.goto(`${base}?paused&nowarm&dpr=1${more}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction('window.__ready === true', { timeout: 120000 });
    const files = [];
    for (const f of frames || ff || [1100]) {
      const data = await page.evaluate((f) => { window.__player.renderAt(f); return document.getElementById('view').toDataURL('image/png'); }, f);
      const file = `${name}_f${f}.png`;
      fs.writeFileSync(path.join(out, file), Buffer.from(data.split(',')[1], 'base64'));
      files.push(file);
    }
    const named = await page.evaluate(() => ({ tab: document.title, loading: document.querySelector('#loading span')?.textContent, description: document.querySelector('meta[name=description]')?.content }));
    report[name] = { settings, files, said: [...new Set(said)], page: named };
    console.log(name.padEnd(13), files.length, 'frame(s);', 'tab:', JSON.stringify(named.tab) + ';', said.length ? 'said: ' + [...new Set(said)].join(' | ') : 'no messages');
    if (!custom) {
      const lines = [...new Set(said)];
      check(`${name}: what the page says`, warning ? lines.length === 1 && warning.test(lines[0]) : lines.length === 0, lines.join(' | ') || 'nothing');
      const caption = (settings.caption ?? 'Янтарный циркуль'), label = caption || settings.name || '';
      check(`${name}: the page's name`, named.tab === (settings.name || (caption ? `${caption} — three.js` : 'three.js')) && named.loading === label, JSON.stringify(named));
    }
    await page.close();
  }
  if (!custom && (!only || only.includes('hot'))) {
    // an open, paused page follows the file: the title is built anew under it, the page does not load itself again
    await setBrand({ caption: 'Первая подпись' });
    const page = await browser.newPage();
    const said = [];
    watch(page, said);
    await page.goto(`${base}?f=1100&paused&nowarm&dpr=1`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction('window.__ready === true', { timeout: 120000 });
    await page.keyboard.down('Shift'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.up('Shift');      // on to frame 1102
    await new Promise((r) => setTimeout(r, 600));          // the address follows the frame a moment later
    const state = () => page.evaluate(() => ({ tab: document.title, frame: Math.round(window.__player.time * 24 + 1), playing: window.__player.playing, address: location.search }));
    // the band of the frame where the caption stands, as the page draws it now: a grey picture, 64 × 4
    const band = () => page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 4;
      const g = c.getContext('2d');
      window.__player.renderAt(Math.round(window.__player.time * 24 + 1));      // a WebGL canvas can be read only right after it was drawn
      const view = document.getElementById('view');
      g.drawImage(view, view.width * 0.15, view.height * 0.7, view.width * 0.7, view.height * 0.09, 0, 0, 64, 4);
      const d = g.getImageData(0, 0, 64, 4).data;
      return Array.from({ length: 256 }, (_, i) => Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]));
    });
    const before = await state(), bandBefore = await band();
    let loads = 0;
    page.on('load', () => loads++);
    await setBrand({ caption: 'Вторая', size: 1.5 }, false);
    for (let i = 0; i < 150; i++) {
      if (await page.evaluate(() => document.title === 'Вторая — three.js')) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 1500));         // (were the page to load itself after all, it would be now)
    await page.waitForFunction('window.__ready === true', { timeout: 120000 });
    const after = { ...await state(), loads }, bandAfter = await band();
    const moved = Math.max(...bandBefore.map((v, i) => Math.abs(v - bandAfter[i])));
    report.hot = { before, after, moved, said };
    console.log('hot'.padEnd(13), JSON.stringify(before), '->', JSON.stringify(after), `; the caption's band changed by up to ${moved}`);
    check('hot: the page was on frame 1102, paused', before.frame === 1102 && !before.playing && before.tab === 'Первая подпись — three.js', JSON.stringify(before));
    check('hot: after the file changed it shows the new caption on the same frame, paused', after.frame === 1102 && !after.playing && after.tab === 'Вторая — three.js', JSON.stringify(after));
    check('hot: … in the picture too', moved > 40, `the caption's band changed by up to ${moved}`);
    check('hot: … without loading itself again', after.loads === 0, `${after.loads} times`);
    check('hot: nothing said', said.length === 0, said.join(' | '));
    await page.close();
  }
  if (!custom && (!only || only.includes('lost'))) {
    // the emblem's picture lives through a lost WebGL context (a sleeping laptop, a driver restart)
    await setBrand({ caption: 'Северный ветер', emblem: 'media/_test_mark_colour.svg' });
    const page = await browser.newPage();
    const said = [];
    watch(page, said);
    await page.evaluateOnNewDocument(() => { window.__manual = true; });
    await page.goto(`${base}?paused&nowarm&dpr=1`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction('window.__ready === true', { timeout: 120000 });
    const shot = () => page.evaluate(() => { window.__player.renderAt(1100); return document.getElementById('view').toDataURL('image/png'); });
    // largest difference between two frames, over the whole frame and over the middle of the circle of light
    const differ = (a, b) => page.evaluate(async (a, b) => {
      const px = async (url) => { const img = new Image(); img.src = url; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height); };
      const A = await px(a), B = await px(b);
      let all = 0, mid = 0;
      for (let y = 0; y < A.height; y++) for (let x = 0; x < A.width; x++) {
        const i = (y * A.width + x) * 4, d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
        if (d > all) all = d;
        if (d > mid && Math.abs(x - 645) < 100 && Math.abs(y - 324) < 60) mid = d;
      }
      return { all, mid };
    }, a, b);
    const before = await shot();
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
      const after = await shot();
      const d = await differ(before, after);
      // … and the comparison would notice a missing picture: the same frame with the compass in its place
      await setBrand({ caption: 'Северный ветер' });
      await page.goto(`${base}?paused&nowarm&dpr=1`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction('window.__ready === true', { timeout: 120000 });
      const other = await differ(before, await shot());
      report.lost = { lost, d, other, said };
      console.log('lost'.padEnd(13), JSON.stringify(lost), 'before against after:', JSON.stringify(d), '; against the compass:', JSON.stringify(other));
      check('lost: the context was lost and came back', lost.was && !lost.now, JSON.stringify(lost));
      check('lost: the frame with the picture is what it was', d.all <= 2, JSON.stringify(d));
      check('lost: (a frame without the picture would have been told apart)', other.mid > 60, JSON.stringify(other));
      check('lost: nothing said but the browser\'s own notice', said.every((t) => /context/i.test(t)), said.join(' | '));
    } else console.log('lost'.padEnd(13), '(no WEBGL_lose_context here: skipped)');
    await page.close();
  }
} finally {
  restore();
  await browser.close();
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
if (checks) console.log(failed ? `${failed} of ${checks} checks FAILED` : `all ${checks} checks passed`);
process.exit(failed ? 1 : 0);
