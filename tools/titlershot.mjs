// titlershot.mjs — the picture of the title tool for the README (docs/titler.jpg).
//   cd /tmp/tools && node titlershot.mjs OUT.png
// Puts a logo into public/media/logo.svg for the shot, opens the tool, types a caption and a second line, picks the
// logo and takes the screenshot; then removes the file. Nothing is saved: src/brand.js is not written.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const REPO = process.env.REPO || '/home/user/circle.animaation.proto-2';
const out = process.argv[2];
if (!out) { console.error('usage: node titlershot.mjs OUT.png'); process.exit(1); }
const FILE = `${REPO}/public/media/logo.svg`;
if (fs.existsSync(FILE)) { console.log('public/media/logo.svg exists — not touching it'); process.exit(1); }
// a wind rose, black: the title fills a black mark with its gold
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="400" height="400">
  <path d="M142 58 L116 100 L142 142 L100 116 L58 142 L84 100 L58 58 L100 84 Z"/>
  <path d="M100 2 L117 83 L198 100 L117 117 L100 198 L83 117 L2 100 L83 83 Z"/>
</svg>
`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: chromium.args, defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1.5 } });
try {
  fs.writeFileSync(FILE, LOGO);
  const page = await browser.newPage();
  const said = [];
  page.on('console', (m) => { if (['error', 'warning', 'warn'].includes(m.type())) said.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => said.push(`PAGEERROR ${e.message}`));
  await page.goto('http://localhost:5173/?f=1100&paused&title', { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.__ready === true && !!window.__titler', { timeout: 120000 });
  await page.evaluate(() => window.__titler.asked);
  const settled = async () => { for (let i = 0; i < 150 && !(await page.evaluate(() => window.__titler.state().settled)); i++) await wait(100); };
  const type = async (a, text) => {
    await page.evaluate((a) => { const i = document.querySelector(`#titler [data-a=${a}]`); i.focus(); i.select(); }, a);
    await page.keyboard.type(text, { delay: 8 });
    await settled();
  };
  await page.evaluate(() => { const s = document.querySelector('#titler [data-a=emblem]'); s.value = 'media/logo.svg'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await settled();
  await type('caption', 'Северный ветер');
  await type('tagline', 'архитектурное бюро');
  await page.mouse.move(430, 610);      // the player's bar comes up
  await wait(1500);
  const st = await page.evaluate(() => window.__titler.state());
  console.log(JSON.stringify(st.now), '| unsaved:', st.unsaved, '| note:', st.note, '| warn:', st.warn);
  await page.screenshot({ path: out });
  console.log(said.length ? said.join('\n') : 'the page said nothing');
  // nothing was saved; what was typed is not kept for the next visit either
  await page.evaluate(() => document.querySelector('#titler [data-a=undo]').click());
  await settled();
} finally {
  await browser.close();
  fs.rmSync(FILE, { force: true });
}
