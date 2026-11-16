// variants.mjs F OUTDIR name=jsExpr ... — render frame F after running each JS snippet (p = player, st = stage), save name.jpg
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const f = Number(process.argv[2]), out = process.argv[3];
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], executablePath: await chromium.executablePath(), headless: 'shell', defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR ' + (e.stack || e.message).slice(0, 500)));
await page.goto('http://localhost:5173/?paused&nowarm&dpr=1', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.__ready === true', { timeout: 60000 });
for (const a of process.argv.slice(4)) {
  const i = a.indexOf('='); const name = a.slice(0, i), code = a.slice(i + 1);
  const url = await page.evaluate((f, code) => {
    const p = window.__player, st = window.__stage;
    const res = new Function('p', 'st', 'f', code)(p, st, f);
    return [document.getElementById('view').toDataURL('image/jpeg', 0.9), res === undefined ? null : JSON.stringify(res)];
  }, f, code);
  fs.writeFileSync(`${out}/${name}.jpg`, Buffer.from(url[0].split(',')[1], 'base64'));
  if (url[1]) console.log(name, url[1].slice(0, 600));
}
await browser.close();
