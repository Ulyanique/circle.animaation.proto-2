// buildtest.mjs — what the build makes of src/brand.js. Builds the site twice into OUTDIR (the user's settings as they
// are, then a test variant with a tagline, a picture for the emblem and a character the font lacks), checks what was
// shipped — the page's name, the glyphs kept from the font, the font's licence — then serves the test build
// (vite preview) and draws its title in headless Chromium: OUTDIR/built_f1100.png.
//   node buildtest.mjs [OUTDIR]          (default /tmp/work/buildtest; about a minute)
// The user's src/brand.js is put back afterwards and the test picture is removed from public/media/.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const repo = fs.existsSync(new URL('../src/brand.js', import.meta.url)) ? new URL('..', import.meta.url).pathname : '/home/user/circle.animaation.proto-2/';
const { titleSettings, titleChars, DEFAULT_CAPTION } = await import(`${repo}src/fx/titleSettings.js`);
const out = process.argv[2] || '/tmp/work/buildtest';
const PORT = 4174;
fs.mkdirSync(out, { recursive: true });
const brandFile = path.join(repo, 'src/brand.js'), picture = path.join(repo, 'public/media/_test_mark_build.svg');
const original = fs.readFileSync(brandFile, 'utf8');
let failed = 0, checks = 0;
const ok = (name, cond, note = '') => { checks++; if (!cond) failed++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${note ? ` — ${note}` : ''}`); };

const vite = path.join(repo, 'node_modules/.bin/vite');
const build = (dir) => {
  const r = spawnSync(vite, ['build', '--outDir', dir, '--emptyOutDir'], { cwd: repo, encoding: 'utf8' });
  return { code: r.status, log: (r.stdout || '') + (r.stderr || '') };
};
/** What a build shipped. */
const shipped = (dir) => {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const js = fs.readdirSync(path.join(dir, 'assets')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(dir, 'assets', f), 'utf8')).join('\n');
  return {
    tab: html.match(/<title>([^<]*)<\/title>/)[1], loading: html.match(/<div id="loading"[^>]*><span>([^<]*)</)[1],
    glyphs: (js.match(/x_min/g) || []).length,      // every glyph of the font file has one
    kB: +(Buffer.byteLength(js) / 1000).toFixed(2),
    licence: fs.existsSync(path.join(dir, 'LICENSE-playfair-display.txt')) && /SIL OPEN FONT LICENSE/i.test(fs.readFileSync(path.join(dir, 'LICENSE-playfair-display.txt'), 'utf8')),
  };
};

let server = null, browser = null;
/** The file replaced in one step: a dev server that may be running then sees one change, and never an empty file. */
const put = (file, text) => { fs.writeFileSync(`${file}.buildtest-tmp`, text); fs.renameSync(`${file}.buildtest-tmp`, file); };
const restore = () => { put(brandFile, original); fs.rmSync(picture, { force: true }); };
process.on('SIGINT', () => { restore(); server?.kill(); process.exit(130); });
try {
  // ---- 1. the settings as they are
  const mine = titleSettings((await import(`${brandFile}?now=${Date.now()}`)).default);
  let b = build(path.join(out, 'as_is'));
  ok('the build with the settings as they are succeeds', b.code === 0, b.code === 0 ? '' : b.log.slice(-600));
  let s = shipped(path.join(out, 'as_is'));
  ok('… ships only the glyphs of the text', s.glyphs === titleChars(mine).length, `${s.glyphs} glyphs for «${mine.caption}${mine.tagline ? ` / ${mine.tagline}` : ''}» (${titleChars(mine).length} different characters); JS ${s.kB} kB`);
  ok('… names the page after the caption', s.loading === (mine.caption || mine.name) && s.tab === (mine.name || (mine.caption ? `${mine.caption} — three.js` : 'three.js')), `tab «${s.tab}»`);
  ok('… carries the font licence', s.licence);
  ok('… says nothing about glyphs', !/no glyphs/.test(b.log));
  if (mine.caption === DEFAULT_CAPTION && !mine.tagline) ok('… and the placeholder leaves index.html\'s names as they were', fs.readFileSync(path.join(out, 'as_is/index.html'), 'utf8').includes('<title>Янтарный циркуль — three.js</title>'));

  // ---- 2. a test variant
  const test = { caption: 'Северный ветер № 7', tagline: 'бюро · Zürich 東', emblem: 'media/_test_mark_build.svg', name: 'Проверка <сборки>' };
  fs.writeFileSync(picture, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200"><path d="M120 8 L228 192 H12 Z M120 70 L66 162 H174 Z"/><circle cx="120" cy="132" r="17"/></svg>');
  put(brandFile, `// buildtest: a test variant — the tool puts the real file back when it is done\nexport default ${JSON.stringify(test, null, 2)};\n`);
  const dir = path.join(out, 'variant');
  b = build(dir);
  ok('the build of the test variant succeeds', b.code === 0, b.code === 0 ? '' : b.log.slice(-600));
  s = shipped(dir);
  const chars = titleChars(titleSettings(test));
  ok('… ships the glyphs of caption and tagline, less the one the font lacks', s.glyphs === chars.length - 1, `${s.glyphs} glyphs, ${chars.length} different characters; JS ${s.kB} kB`);
  ok('… warns about the character the font lacks', /no glyphs for 東/.test(b.log));
  ok('… names the page', s.tab === 'Проверка &lt;сборки&gt;' && s.loading === 'Северный ветер № 7', `tab «${s.tab}», loading screen «${s.loading}»`);
  ok('… carries the font licence and the picture', s.licence && fs.existsSync(path.join(dir, 'media/_test_mark_build.svg')));

  // ---- 3. the test build on screen
  server = spawn(vite, ['preview', '--outDir', dir, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: repo, stdio: 'ignore' });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* not up yet */ }
    if (i > 100) throw new Error('vite preview did not start');
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: chromium.args, defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 } });
  const page = await browser.newPage();
  const said = [];
  page.on('console', (m) => { if (['error', 'warn', 'warning'].includes(m.type())) said.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => said.push('PAGEERROR ' + (e.stack || e.message).slice(0, 300)));
  await page.evaluateOnNewDocument(() => { window.__manual = true; });
  await page.goto(`http://127.0.0.1:${PORT}/?paused&nowarm&dpr=1`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.__ready === true', { timeout: 120000 });
  const shot = async (f) => Buffer.from((await page.evaluate((f) => { window.__player.renderAt(f); return document.getElementById('view').toDataURL('image/png'); }, f)).split(',')[1], 'base64');
  fs.writeFileSync(path.join(out, 'built_f1100.png'), await shot(1100));
  ok('the built page opens and names itself', await page.title() === 'Проверка <сборки>', `tab «${await page.title()}»`);
  ok('… and says only that the font lacks a character', said.length === 1 && /no glyphs for 東/.test(said[0]), said.join(' | ') || 'nothing said');
  // the title is there: light where the caption and the picture stand, measured against the background next to them
  const px = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const g = c.getContext('2d');
    window.__player.renderAt(1100);      // a WebGL canvas can be read only right after it was drawn
    g.drawImage(document.getElementById('view'), 0, 0, 1280, 720);
    const mean = (x, y, w, h) => { const d = g.getImageData(x, y, w, h).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += Math.max(d[i], d[i + 1], d[i + 2]); return s / (d.length / 4); };
    return { caption: mean(300, 505, 680, 50), above: mean(300, 440, 680, 40), emblem: mean(585, 250, 120, 120), beside: mean(380, 250, 120, 120) };
  });
  ok('… with the caption drawn', px.caption > px.above + 12, `band of the caption ${px.caption.toFixed(1)}, band above it ${px.above.toFixed(1)}`);
  ok('… and the picture standing for the emblem, in gold', px.emblem > px.beside + 25, `inside the circle ${px.emblem.toFixed(1)}, beside it ${px.beside.toFixed(1)}`);
} finally {
  restore();
  await browser?.close();
  server?.kill();
}
console.log(failed ? `${failed} of ${checks} checks FAILED` : `all ${checks} checks passed`);
process.exit(failed ? 1 : 0);
