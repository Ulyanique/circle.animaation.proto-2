// linetest.mjs — checks of src/dev/mediaLine.js (the lines the placement tool writes into src/media.js): formatting,
// validation, file names, and putting a line into / taking it out of the file's text. Plain node:
//   node tools/linetest.mjs
import { existsSync, readFileSync } from 'node:fs';
const repo = existsSync(new URL('../src/dev/mediaLine.js', import.meta.url)) ? new URL('..', import.meta.url).pathname : '/home/user/circle.animaation.proto-2/';
const { mediaLine, cleanSettings, putLine, dropLine, entryText, safeName } = await import(`${repo}src/dev/mediaLine.js`);
let failed = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { failed++; console.log(`FAIL ${name}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`); } };
const throws = (name, fn) => { try { fn(); failed++; console.log(`FAIL ${name}: did not throw`); } catch { /* expected */ } };
const load = async (text) => (await import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`)).default;

// ---- the line
eq('defaults left out', mediaLine('w05', { src: 'media/a.jpg', x: 0.5, y: 0.5, zoom: 1, rotate: 0 }), "w05: { src: 'media/a.jpg' },");
eq('rounding', mediaLine('w05', { src: 'media/a.jpg', x: 0.30449, y: 0.4, zoom: 1.2004, rotate: 2.04 }), "w05: { src: 'media/a.jpg', x: 0.304, y: 0.4, zoom: 1.2, rotate: 2 },");
eq('level, to, fixed, video keys', mediaLine('w08', { src: 'media/b.mp4', rotate: 'level', to: { zoom: 1.08, x: 0.4 }, fixed: false, start: 2, rate: 0.5, loop: false, sharpen: 0.3 }),
  "w08: { src: 'media/b.mp4', rotate: 'level', to: { x: 0.4, zoom: 1.08 }, fixed: false, start: 2, rate: 0.5, sharpen: 0.3, loop: false },");
eq('empty to', mediaLine('w01', { src: 'a.jpg', to: {} }), "w01: { src: 'a.jpg' },");
eq('quote in the name', mediaLine('w01', { src: "media/it's.jpg" }), "w01: { src: 'media/it\\'s.jpg' },");

// ---- validation
eq('clean keeps the known keys only', cleanSettings({ src: 'media/a.jpg', x: 0.2, to: { zoom: 1.1 }, fixed: true, evil: 'x' }), { src: 'media/a.jpg', x: 0.2, to: { zoom: 1.1 }, fixed: true });
throws('no src', () => cleanSettings({ x: 1 }));
throws('src with a line break', () => cleanSettings({ src: 'a.jpg\n};' }));
throws('src with a template', () => cleanSettings({ src: 'a${x}.jpg' }));
throws('x is text', () => cleanSettings({ src: 'a.jpg', x: '0.3' }));
throws('zoom is NaN', () => cleanSettings({ src: 'a.jpg', zoom: NaN }));
throws('to is text', () => cleanSettings({ src: 'a.jpg', to: 'zoom' }));

// ---- file names
eq('a plain name stays', safeName('Дом на набережной (2).JPG'), 'Дом на набережной (2).JPG');
eq('a camera name keeps its underscore', safeName('_DSC1234.jpg'), '_DSC1234.jpg');
eq('no folders', safeName('../../etc/x.png'), 'x.png');
eq('no folders, the other slash', safeName('C:\\photos\\a.webp'), 'a.webp');
eq('odd characters become underscores', safeName('a#b?c%d\'e"f.mp4'), 'a_b_c_d_e_f.mp4');
eq('hidden files come out of hiding', safeName('..hidden.jpg'), 'hidden.jpg');
eq('decomposed letters are composed', safeName('и\u0306.jpg'), 'й.jpg');
eq('a long name is cut, the extension stays', safeName('x'.repeat(300) + '.webm').length, 105);
for (const bad of ['notes.txt', 'evil.js', 'photo.heic', 'photo.jpg.exe', 'jpg', '.jpg', '', null, 'a.svg']) eq(`refused: ${bad}`, safeName(bad), null);

// ---- the file
const file = readFileSync(`${repo}src/media.js`, 'utf8');
const head = file.slice(0, file.indexOf('export default {'));
const body = (inner) => `${head}export default {\n${inner}};\n`;
const L5 = mediaLine('w05', { src: 'media/a.jpg', x: 0.3 }), L3 = mediaLine('w03', { src: 'media/c.jpg' }), L9 = mediaLine('w09', { src: 'media/d.jpg', to: { zoom: 1.1 } });
let t = putLine(body("  // w05: { src: 'media/house.jpg', x: 0.5 },\n"), 'w05', L5);
eq('added after the commented example', t, body(`  // w05: { src: 'media/house.jpg', x: 0.5 },\n  ${L5}\n`));
t = putLine(putLine(t, 'w09', L9), 'w03', L3);
eq('kept in the order of the windows', t, body(`  // w05: { src: 'media/house.jpg', x: 0.5 },\n  ${L3}\n  ${L5}\n  ${L9}\n`));
eq('replaced, the comment after it stays', putLine(body("  w05: { src: 'media/old.jpg', to: { zoom: 2 } },   // фасад\n  w09: { src: 'x.jpg' },\n"), 'w05', L5), body(`  ${L5}   // фасад\n  w09: { src: 'x.jpg' },\n`));
const multi = body("  w05: {\n    src: 'media/old.jpg',\n    to: { zoom: 2 },\n  },\n  w09: { src: 'x.jpg' },\n");
eq('replaced an entry of several lines', putLine(multi, 'w05', L5), body(`  ${L5}\n  w09: { src: 'x.jpg' },\n`));
eq('braces inside a file name', putLine(body("  w05: { src: 'media/{old}.jpg' },\n  w09: { src: 'x.jpg' },\n"), 'w05', L5), body(`  ${L5}\n  w09: { src: 'x.jpg' },\n`));
eq('a window named inside a string or a comment is not an entry', putLine(body("  w03: { src: 'media/w05: {.jpg' },   // w05: { later\n"), 'w05', L5), body(`  w03: { src: 'media/w05: {.jpg' },   // w05: { later\n  ${L5}\n`));
eq('same line again changes nothing', putLine(t, 'w05', L5), t);
eq('the entry as written', entryText(multi, 'w05'), "  w05: {\n    src: 'media/old.jpg',\n    to: { zoom: 2 },\n  },");
eq('no entry', entryText(t, 'w01'), null);
eq('a commented entry is no entry', entryText(body("  // w05: { src: 'media/house.jpg' },\n"), 'w05'), null);
eq('taken out', dropLine(t, 'w05'), body(`  // w05: { src: 'media/house.jpg', x: 0.5 },\n  ${L3}\n  ${L9}\n`));
eq('taken out, several lines', dropLine(multi, 'w05'), body("  w09: { src: 'x.jpg' },\n"));
eq('taking out what is not there changes nothing', dropLine(t, 'w01'), t);
throws('no export line', () => putLine('const a = {};\n', 'w05', L5));
throws('no closing line', () => putLine('export default {\n  w05: { src: 1 },\n', 'w05', L5));
throws('two windows on one line', () => putLine(body("  w05: { src: 'a.jpg' }, w06: { src: 'b.jpg' },\n"), 'w05', L5));
eq('the result is a module with these settings', await load(t), { w03: { src: 'media/c.jpg' }, w05: { src: 'media/a.jpg', x: 0.3 }, w09: { src: 'media/d.jpg', to: { zoom: 1.1 } } });
eq('the real file takes a line', (await load(putLine(file, 'w05', L5))).w05, { src: 'media/a.jpg', x: 0.3 });
console.log(failed ? `${failed} check(s) FAILED` : 'all checks passed');
process.exit(failed ? 1 : 0);
