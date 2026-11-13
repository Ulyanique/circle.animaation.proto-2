// exportershot.mjs — the picture of the video tool for the README (docs/exporter.jpg).
//   cd /tmp/tools && node exportershot.mjs OUT.png [FRAME]
// Opens the page on a frame of the film (250 unless told), opens the tool with the settings it starts with and takes
// the screenshot: 1920×1080, which docs/exporter.jpg shows at 1600×900. No file is made: how long that takes is this
// machine's business and says nothing about the reader's.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
const out = process.argv[2], frame = Number(process.argv[3] || 250);
if (!out) { console.error('usage: node exportershot.mjs OUT.png [FRAME]'); process.exit(1); }
const HOST = process.env.URL || 'http://localhost:5173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: chromium.args, defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1.5 } });
try {
  const page = await browser.newPage();
  const said = [];
  page.on('console', (m) => { if (['error', 'warning', 'warn'].includes(m.type())) said.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => said.push(`PAGEERROR ${e.message}`));
  await page.goto(`${HOST}/?f=${frame}&paused`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.__ready === true && !!window.__exporter', { timeout: 120000 });
  await page.keyboard.press('KeyV');      // the way a visitor opens it
  await page.waitForFunction('Object.keys(window.__exporter.state().support).length > 0', { timeout: 30000, polling: 50 });
  await page.mouse.move(430, 610);        // the player's bar comes up
  await wait(1500);
  const st = await page.evaluate(() => window.__exporter.state());
  console.log(JSON.stringify(st.options), '|', st.sum, '| format:', st.format, '| note:', st.note || '—');
  await page.screenshot({ path: out });
  console.log(said.length ? said.join('\n') : 'the page said nothing');
} finally {
  await browser.close();
}
