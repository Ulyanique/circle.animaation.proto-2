// solo.mjs AT F1,F2,.. OUTDIR — for a linked border: renders shot A alone, shot B alone and the dissolve at each frame
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const at = Number(process.argv[2]), frames = process.argv[3].split(',').map(Number), out = process.argv[4];
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], executablePath: await chromium.executablePath(), headless: 'shell', defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR ' + (e.stack || e.message).slice(0, 500)));
await page.goto('http://localhost:5173/?paused&nowarm&dpr=1', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.__ready === true', { timeout: 60000 });
for (const f of frames) for (const mode of ['a', 'b', 'mix']) {
  const url = await page.evaluate((f, mode, at) => {
    const p = window.__player; const L = p.links.find((l) => l.at === at);
    const links = p.links, shotAt = p.shotAt;
    if (mode !== 'mix') { p.links = []; p.shotAt = () => (mode === 'a' ? L.a : L.b); }
    p.renderAt(f);
    p.links = links; p.shotAt = shotAt;
    return document.getElementById('view').toDataURL('image/jpeg', 0.9);
  }, f, mode, at);
  fs.writeFileSync(`${out}/${mode}_${f}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
}
await browser.close();
console.log('ok', out);
