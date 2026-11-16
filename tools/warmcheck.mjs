// warmcheck.mjs — the picture after the (thumbnail) warm-up must be identical to a cold one
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell', defaultViewport: { width: 1280, height: 720 } });
for (const [name, q] of [['warm', ''], ['cold', '&nowarm']]) {
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/?paused&dpr=1&f=600' + q, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.__ready === true', { timeout: 170000 });
  const info = await page.evaluate(async () => { window.__manual = true; window.__player.renderAt(600); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); window.__player.renderAt(600); const c = document.querySelector('canvas'); return [c.width, c.height, window.__stage.width, window.__stage.height]; });
  await (await page.$('canvas')).screenshot({ path: `/tmp/work/sheets/${name}600.png` });
  console.log(name, JSON.stringify(info));
  await page.close();
}
await browser.close();
