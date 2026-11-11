// shoot.mjs f1,f2,... [outPrefix] — renders frames of the three.js app with headless chromium.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
const frames = process.argv[2].split(',').map(Number);
const prefix = process.argv[3] || '/tmp/work/render/r_';
const url = process.env.URL || 'http://localhost:5173/?paused&nowarm&dpr=1';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: chromium.args, defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.evaluateOnNewDocument(() => { window.__manual = true; });
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 }).catch(() => errors.push('timeout waiting for __ready'));
import fs from 'node:fs';
for (const f of frames) {
  const url = await page.evaluate((f) => { window.__player.renderAt(f); return document.getElementById('view').toDataURL('image/png'); }, f);
  fs.writeFileSync(`${prefix}${String(f).padStart(4, '0')}.png`, Buffer.from(url.split(',')[1], 'base64'));
}
if (errors.length) console.log('CONSOLE:\n' + [...new Set(errors)].slice(0, 12).join('\n'));
await browser.close();
