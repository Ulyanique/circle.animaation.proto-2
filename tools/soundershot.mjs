// soundershot.mjs — the picture of the sound tool for the README (docs/sounder.jpg).
//   cd /tmp/tools && node soundershot.mjs OUT.png [FRAME] [START]
// Copies a test music into public/media/music.mp3 for the picture, opens the page on a frame of the film (250 unless
// told), opens the tool, picks the music and puts it where `START` says; then takes the screenshot: 1920×1080, which
// docs/sounder.jpg shows at 1600×900. The music is tools/soundtest.py's (the film's last shot's drums: hits at 58 s and
// 106 s of it), put so that the first of them lands on the frame shown — the flash of the film, if that is the frame.
// Nothing is saved — src/sound.js is not written — and the file is removed afterwards.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const REPO = process.env.REPO || '/home/user/circle.animaation.proto-2';
const HOST = process.env.URL || 'http://localhost:5173';
const SOUNDS = process.env.SOUNDS || '/tmp/work/sound/files';
const out = process.argv[2], frame = Number(process.argv[3] || 250);
const SRC = 'media/music.mp3', START = process.argv[4] !== undefined ? Number(process.argv[4]) : Math.round((58 - (frame - 1) / 24) * 1000) / 1000;
if (!out) { console.error('usage: node soundershot.mjs OUT.png [FRAME] [START]'); process.exit(1); }
const FILE = `${REPO}/public/${SRC}`, MINE = `${SOUNDS}/_test_music.mp3`;
if (fs.existsSync(FILE)) { console.log(`${SRC} exists — not touching it`); process.exit(1); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: chromium.args, defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1.5 } });
try {
  fs.copyFileSync(MINE, FILE);
  const page = await browser.newPage();
  const said = [];
  page.on('console', (m) => { if (['error', 'warning', 'warn'].includes(m.type())) said.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => said.push(`PAGEERROR ${e.message}`));
  await page.goto(`${HOST}/?f=${frame}&paused`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.__ready === true && !!window.__sounder', { timeout: 120000 });
  await page.keyboard.press('KeyS');      // the way a visitor opens it
  await page.evaluate(() => window.__sounder.asked);
  await wait(400);
  // the music, and the film where its hit falls on the flash
  await page.select('#sounder [data-a=src]', SRC);
  for (let i = 0; i < 200 && (await page.evaluate(() => window.__sounder.state())).wave === 'reading'; i++) await wait(100);
  await page.evaluate((v) => { const i = document.querySelector('#sounder [data-a=start]'); i.focus(); i.value = String(v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); i.blur(); }, START);
  await wait(300);
  await page.mouse.move(430, 610);        // the player's bar comes up
  await wait(1500);
  const st = await page.evaluate(() => window.__sounder.state());
  console.log(JSON.stringify({ open: st.open, file: st.file, now: st.now, unsaved: st.unsaved, vals: st.vals, note: st.note, wave: st.wave && { seconds: st.wave.seconds, most: st.wave.most } }));
  console.log(await page.evaluate(() => JSON.stringify({ sound: window.__player.sound, paused: window.__player.audio.paused, t: +window.__player.audio.currentTime.toFixed(3), length: +window.__player.audio.duration.toFixed(3), film: +window.__player.time.toFixed(3) })));
  await page.screenshot({ path: out });
  console.log(said.length ? said.join('\n') : 'the page said nothing');
  // nothing is saved, and the tool does not keep what was chosen for the next visit
  await page.evaluate(() => sessionStorage.removeItem('sounder'));
} finally {
  await browser.close();
  fs.rmSync(FILE, { force: true });
}
