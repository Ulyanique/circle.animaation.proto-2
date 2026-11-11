// placershot.mjs — the picture of the placement tool for the README (docs/placer.jpg).
//   cd /tmp/tools && node placershot.mjs PHOTO.jpg OUT.png [frame]
// Puts PHOTO into window w05 as public/media/house.jpg for the shot, moves it a little with the mouse, takes the
// screenshot, then removes the file and puts src/media.js back as it was.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const REPO = process.env.REPO || '/home/user/circle.animaation.proto-2';
const [photo, out, frame = '436'] = process.argv.slice(2);
const SETTINGS = `${REPO}/src/media.js`, FILE = `${REPO}/public/media/house.jpg`;
const original = fs.readFileSync(SETTINGS, 'utf8');
if (fs.existsSync(FILE)) { console.log('public/media/house.jpg exists — not touching it'); process.exit(1); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: chromium.args, defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1.5 } });
try {
  fs.copyFileSync(photo, FILE);
  fs.writeFileSync(SETTINGS, original.replace(/export default \{[\s\S]*$/, "export default {\n  w05: { src: 'media/house.jpg', x: 0.46, y: 0.5, zoom: 1.12 },\n};\n"));
  await wait(800);
  const page = await browser.newPage();
  await page.goto(`http://localhost:5173/?f=${frame}&paused&edit`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.__ready === true && !!window.__placer', { timeout: 120000 });
  await page.evaluate(() => window.__placer.asked);
  await wait(500);
  const spot = await page.evaluate(() => { for (let y = 360; y < 560; y += 20) for (let x = 420; x < 800; x += 20) if (window.__placer.probe(x, y)?.id === 'w05') return [x, y]; return null; });
  console.log('w05 at', spot);
  await page.mouse.move(...spot);
  await page.mouse.wheel({ deltaY: -60 });
  await page.mouse.down();
  await page.mouse.move(spot[0] + 24, spot[1] - 10, { steps: 4 });
  await page.mouse.up();
  await page.mouse.move(spot[0] + 150, spot[1] + 60);
  await wait(600);
  console.log(await page.evaluate(() => window.__placer.state().line));
  await page.screenshot({ path: out });
} finally {
  await browser.close();
  fs.rmSync(FILE, { force: true });
  fs.writeFileSync(SETTINGS, original);
}
