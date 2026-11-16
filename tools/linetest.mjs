// linetest.mjs — checks of src/dev/mediaLine.js (the lines the placement tool writes into src/media.js), of
// src/dev/brandLine.js (the lines the title tool writes into src/brand.js) and of src/dev/soundLine.js with
// src/core/soundSettings.js (the lines the sound tool writes into src/sound.js, and what they mean): formatting,
// validation, file names, and putting a line into / taking it out of the file's text. Plain node:
//   node tools/linetest.mjs
import { existsSync, readFileSync } from 'node:fs';
const repo = existsSync(new URL('../src/dev/mediaLine.js', import.meta.url)) ? new URL('..', import.meta.url).pathname : '/home/user/circle.animaation.proto-2/';
const { mediaLine, cleanSettings, putLine, dropLine, entryText, safeName } = await import(`${repo}src/dev/mediaLine.js`);
let failed = 0, checks = 0;
const eq = (name, got, want) => { checks++; const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { failed++; console.log(`FAIL ${name}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`); } };
const throws = (name, fn) => { checks++; let threw = false; try { fn(); } catch { threw = true; } if (!threw) { failed++; console.log(`FAIL ${name}: did not throw`); } };
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

// ==== src/dev/brandLine.js: the title's settings as lines of src/brand.js ====================================
const { tidyBrand, brandEntries, brandBlock, cleanBrand, putBrand, EMBLEM_FILE, MAX_TEXT } = await import(`${repo}src/dev/brandLine.js`);
const written = (raw) => brandEntries(raw).map(([k, v]) => `${k}: ${v},`);

// ---- the lines
eq('brand: nothing set — the placeholder, one line', written({}), ["caption: 'Янтарный циркуль',"]);
eq('brand: every key, in the tool\'s order', written({ name: 'N', ring: false, emblemGold: true, emblemSize: 1.5, emblem: 'media/l.svg', size: 1.2, tagline: 't', caption: 'c' }),
  ["caption: 'c',", "tagline: 't',", 'size: 1.2,', "emblem: 'media/l.svg',", 'emblemSize: 1.5,', 'emblemGold: true,', 'ring: false,', "name: 'N',"]);
eq('brand: values that are the default have no line', written({ caption: 'c', tagline: '', size: 1, emblem: 'compass', emblemSize: 1, emblemGold: null, ring: true, name: '' }), ["caption: 'c',"]);
eq('brand: rounded to the third digit, held within the limits', written({ caption: 'c', size: 1.23456, emblem: 'media/l.png', emblemSize: 9 }), ["caption: 'c',", 'size: 1.235,', "emblem: 'media/l.png',", 'emblemSize: 3,']);
eq('brand: a picture\'s size and colour are not written without a picture', written({ caption: 'c', emblemSize: 2, emblemGold: false }), ["caption: 'c',"]);
eq('brand: … nor with no emblem at all', written({ caption: 'c', emblem: 'none', emblemSize: 2, emblemGold: true }), ["caption: 'c',", "emblem: 'none',"]);
eq('brand: `emblem: false` is written as none', written({ caption: 'c', emblem: false }), ["caption: 'c',", "emblem: 'none',"]);
eq('brand: no caption is a line too', written({ caption: '' }), ["caption: '',"]);
eq('brand: a text is one line, single spaces, letters in one piece', tidyBrand({ caption: '  Се\u0306верныи\u0306 \n\t ветер \u2028 ' }).caption, 'Се\u0306верный ветер'.normalize('NFC'));
eq('brand: quotes, backslashes and what would hide in a line are written as escapes', written({ caption: "it's \\ a\u0007b\u007f" }), ["caption: 'it\\'s \\\\ a\\u0007b\\u007f',"]);
eq('brand: the block', brandBlock({ caption: 'Северный ветер', tagline: 'бюро' }), "export default {\n  caption: 'Северный ветер',\n  tagline: 'бюро',\n};");
for (const raw of [{}, { caption: '' }, { caption: "Д'Артаньян \\ Ко ${x} `y` </script>", tagline: 'a\u0007b «№ 7»', size: 0.5, emblem: "media/it's (2).svg", emblemSize: 0.2, emblemGold: false, ring: false, name: '"N"' },
  { caption: 'x'.repeat(MAX_TEXT), emblem: 'none', ring: false, size: 3 }]) {
  eq(`brand: the block, read as a module, says the same: ${JSON.stringify(raw).slice(0, 50)}`, brandEntries(await load(brandBlock(raw))), brandEntries(raw));
}

// ---- validation
eq('brand: clean keeps the known keys only', cleanBrand({ caption: 'c', tagline: 't', size: 2, emblem: 'media/l.svg', emblemSize: 1.5, emblemGold: null, ring: false, name: 'n', evil: 'x' }),
  { caption: 'c', tagline: 't', emblem: 'media/l.svg', name: 'n', size: 2, emblemSize: 1.5, ring: false });
for (const [what, raw] of [['nothing', null], ['a text', 'caption'], ['a caption that is a number', { caption: 7 }], ['a caption that is too long', { caption: 'я'.repeat(MAX_TEXT + 1) }], ['a size that is text', { size: '2' }],
  ['a size that is not a number', { size: NaN }], ['an endless size', { emblemSize: Infinity }], ['a ring that is text', { ring: 'false' }], ['gold that is a number', { emblemGold: 1 }], ['an emblem that is a list', { emblem: ['a'] }]]) {
  throws(`brand: refused — ${what}`, () => cleanBrand(raw));
}
for (const good of ['logo.svg', 'Знак (2).PNG', 'a.webp', 'a.avif', 'a.gif', 'a.jpeg']) eq(`brand: a picture for the emblem: ${good}`, safeName(good, EMBLEM_FILE), good);
for (const bad of ['film.mp4', 'page.html', 'logo.svg.exe', 'logo.svgz', '.svg', 'svg', 'a.pdf', 'a.heic']) eq(`brand: not a picture for the emblem: ${bad}`, safeName(bad, EMBLEM_FILE), null);

// ---- the file
const brandFile = readFileSync(`${repo}src/brand.js`, 'utf8');
const bhead = brandFile.slice(0, brandFile.indexOf('export default {'));
const bbody = (...lines) => `${bhead}export default {\n${lines.map((l) => `${l}\n`).join('')}};\n`;
const plain = bbody("  caption: 'Янтарный циркуль',", "  // tagline: 'архитектурное бюро',", "  // emblem: 'media/logo.svg',");
eq('brand: the placeholder\'s file stays as it is', putBrand(plain, {}), plain);
const full = { caption: 'Северный ветер', tagline: 'бюро', size: 1.25, emblem: 'media/logo.svg', emblemSize: 1.4, emblemGold: false, ring: false, name: 'Проба' };
let b = putBrand(plain, full);
eq('brand: lines are added in the tool\'s order, each before the commented example of its key', b, bbody("  caption: 'Северный ветер',", "  tagline: 'бюро',", "  // tagline: 'архитектурное бюро',", '  size: 1.25,',
  "  emblem: 'media/logo.svg',", "  // emblem: 'media/logo.svg',", '  emblemSize: 1.4,', '  emblemGold: false,', '  ring: false,', "  name: 'Проба',"));
eq('brand: … and the result is a module with these settings', await load(b), full);
eq('brand: the same settings again change nothing', putBrand(b, full), b);
eq('brand: back to the defaults — the file is what it was', putBrand(b, { caption: 'Янтарный циркуль' }), plain);
eq('brand: one value changed — one line changed', putBrand(b, { ...full, size: 2 }), b.replace('  size: 1.25,', '  size: 2,'));
eq('brand: a comment after a line stays; lines of the user\'s own stay; a line that is the default again goes',
  putBrand(bbody("  caption: 'Старое',   // название", "  emblem: 'https://example.com/l.svg',  // пока так", '', '  // своё примечание', '  size: 2,'), { caption: 'Новое', emblem: 'https://example.com/l.svg', tagline: 'строка' }),
  bbody("  caption: 'Новое',   // название", "  tagline: 'строка',", "  emblem: 'https://example.com/l.svg',  // пока так", '', '  // своё примечание'));
eq('brand: a key named inside a text or a comment is no line of that key',
  putBrand(bbody("  caption: 'size: 2, tagline: x',   // ring: false", "  // name: 'пример',"), { caption: 'c', ring: false, name: 'N' }), bbody("  caption: 'c',   // ring: false", '  ring: false,', "  name: 'N',", "  // name: 'пример',"));
eq('brand: the file\'s own indent is kept', putBrand(`export default {\n\tcaption: 'a',\n};\n`, { caption: 'b', tagline: 't' }), `export default {\n\tcaption: 'b',\n\ttagline: 't',\n};\n`);
eq('brand: double quotes, no comma at the end, no semicolon after the brace', putBrand('export default {\n  caption: "a",\n  size: 2\n}\n', { caption: 'b', size: 2, ring: false }), "export default {\n  caption: 'b',\n  size: 2,\n  ring: false,\n}\n");
eq('brand: Windows line ends are kept', putBrand(plain.replace(/\n/g, '\r\n'), { caption: 'c', ring: false }), bbody("  caption: 'c',", "  // tagline: 'архитектурное бюро',", "  // emblem: 'media/logo.svg',", '  ring: false,').replace(/\n/g, '\r\n'));
eq('brand: a value that was a name becomes the plain value', putBrand("const N = 'x';\nexport default {\n  caption: N,\n  size: 1.5,\n};\n", { caption: 'Словами', size: 1.5 }), "const N = 'x';\nexport default {\n  caption: 'Словами',\n  size: 1.5,\n};\n");
throws('brand: no export line', () => putBrand("const brand = { caption: 'a' };\nexport default brand;\n", full));
throws('brand: no closing line', () => putBrand("export default {\n  caption: 'a',\n", full));
throws('brand: two settings on one line', () => putBrand(bbody("  caption: 'a', size: 2,"), full));
throws('brand: the same setting twice', () => putBrand(bbody("  caption: 'a',", "  caption: 'b',"), full));
throws('brand: a value that is not one plain value', () => putBrand(bbody("  size: 1 + 0.5,"), full));
eq('brand: the real file takes the settings', brandEntries(await load(putBrand(brandFile, full))), brandEntries(full));

// ==== src/core/soundSettings.js, src/dev/soundLine.js: the soundtrack's settings as lines of src/sound.js ==========
const { soundSettings, gainAt, untouched, OWN_SOUND, FILM_END, MAX_FADE, MAX_START } = await import(`${repo}src/core/soundSettings.js`);
const { tidySound, soundEntries, soundBlock, cleanSound, putSound, SOUND_FILE, SOUND_KEYS } = await import(`${repo}src/dev/soundLine.js`);
const near = (name, got, want, by = 1e-9) => { checks++; if (!(Math.abs(got - want) <= by)) { failed++; console.log(`FAIL ${name}\n   got  ${got}\n   want ${want}`); } };
const sounds = (raw) => soundEntries(raw).map(([k, v]) => `${k}: ${v},`);
const OWN = { src: 'audio.m4a', start: 0, volume: 1, fadeIn: 0, fadeOut: 0 };

// ---- what the settings mean
eq('sound: the film ends at 1213 / 24 s', FILM_END, 1213 / 24);
for (const raw of [undefined, null, {}, 'music.mp3', 7, [], { src: '', start: 'x', volume: null, fadeIn: NaN, fadeOut: {} }, { src: 5, start: Infinity, volume: [], fadeIn: '', fadeOut: ' ' }]) {
  eq(`sound: no settings are the film's own soundtrack, untouched: ${JSON.stringify(raw)}`, soundSettings(raw), OWN);
}
eq('sound: the own soundtrack is untouched', untouched(soundSettings({})), true);
for (const raw of [{ start: 0.5 }, { volume: 0.9 }, { fadeIn: 1 }, { fadeOut: 1 }]) eq(`sound: touched: ${JSON.stringify(raw)}`, untouched(soundSettings(raw)), false);
eq('sound: music of one\'s own, as it is, is untouched too', untouched(soundSettings({ src: 'media/m.mp3' })), true);
eq('sound: values are kept', soundSettings({ src: ' media/m.mp3 ', start: 12.5, volume: 0.8, fadeIn: 1.5, fadeOut: 3 }), { src: 'media/m.mp3', start: 12.5, volume: 0.8, fadeIn: 1.5, fadeOut: 3 });
eq('sound: numbers written as text count', soundSettings({ start: '-3', volume: '0.5' }), { ...OWN, start: -3, volume: 0.5 });
eq('sound: values out of range are brought into it', soundSettings({ start: -1000, volume: 3, fadeIn: -1, fadeOut: 99 }), { ...OWN, start: -FILM_END, volume: 1, fadeIn: 0, fadeOut: MAX_FADE });
eq('sound: … at the other end', soundSettings({ start: 1e9, volume: -2 }), { ...OWN, start: MAX_START, volume: 0 });
{
  const s = soundSettings({ volume: 0.8, fadeIn: 2, fadeOut: 4 });
  near('sound: silent at the first moment of a fade in', gainAt(0, s), 0);
  near('sound: a quarter of the level halfway through the fade in (a square law)', gainAt(1, s), 0.8 * 0.25);
  near('sound: full level once the fade in is over', gainAt(2, s), 0.8);
  near('sound: full level in the middle of the film', gainAt(25, s), 0.8);
  near('sound: full level where the fade out begins', gainAt(FILM_END - 4, s), 0.8);
  near('sound: a quarter halfway through the fade out', gainAt(FILM_END - 2, s), 0.8 * 0.25);
  near('sound: silent at the film\'s end', gainAt(FILM_END, s), 0);
  near('sound: … and after it', gainAt(FILM_END + 5, s), 0);
  near('sound: fades that overlap multiply', gainAt(1, soundSettings({ fadeIn: 2, fadeOut: 20 })), 0.25 * ((FILM_END - 1) / 20 >= 1 ? 1 : ((FILM_END - 1) / 20) ** 2));
  near('sound: no fades — the level everywhere', gainAt(0, soundSettings({ volume: 0.3 })), 0.3);
  near('sound: … to the last moment', gainAt(FILM_END, soundSettings({ volume: 0.3 })), 0.3);
  let falls = true;
  for (let t = FILM_END - 4, last = Infinity; t <= FILM_END; t += 0.01) { const g = gainAt(t, s); if (g > last + 1e-12) falls = false; last = g; }
  eq('sound: the fade out only ever falls', falls, true);
}

// ---- the lines
eq('sound: the own soundtrack, untouched, writes nothing', sounds({}), []);
eq('sound: defaults are left out', sounds({ src: 'media/m.mp3', start: 0, volume: 1, fadeIn: 0, fadeOut: 0 }), ["src: 'media/m.mp3',"]);
eq('sound: all the lines, in their order', sounds({ fadeOut: 2, fadeIn: 0.5, volume: 0.8, start: 12.5, src: 'media/m.mp3' }), ["src: 'media/m.mp3',", 'start: 12.5,', 'volume: 0.8,', 'fadeIn: 0.5,', 'fadeOut: 2,']);
eq('sound: the order of the keys is the order of the lines', SOUND_KEYS, ['src', 'start', 'volume', 'fadeIn', 'fadeOut']);
eq('sound: rounding — a millisecond of place, a hundredth of the rest', sounds({ start: 12.34567, volume: 0.8049, fadeIn: 1.005001, fadeOut: 2.999 }), ['start: 12.346,', 'volume: 0.8,', 'fadeIn: 1.01,', 'fadeOut: 3,']);
eq('sound: a negative place', sounds({ start: -3 }), ['start: -3,']);
eq('sound: what rounds to the default has no line (and no minus zero)', sounds({ start: -0.0004, volume: 0.999, fadeIn: 0.004 }), []);
eq('sound: tidy — no minus zero', Object.is(tidySound({ start: -0.0004 }).start, 0), true);
eq('sound: a quote in the name', sounds({ src: "media/it's.mp3" }), ["src: 'media/it\\'s.mp3',"]);
eq('sound: the block', soundBlock({ src: 'media/m.mp3', fadeOut: 2 }), "export default {\n  src: 'media/m.mp3',\n  fadeOut: 2,\n};");
eq('sound: the empty block', soundBlock({}), 'export default {\n};');
for (const raw of [{}, { src: 'media/Музыка (2).mp3', start: 73.25, volume: 0.65, fadeIn: 0.4, fadeOut: 3.5 }, { start: -2.5, fadeOut: 20 }, { src: "media/it's \\ odd.mp3" }]) {
  eq(`sound: the block, read as a module, says the same: ${JSON.stringify(raw).slice(0, 50)}`, soundEntries(await load(soundBlock(raw))), soundEntries(raw));
  eq(`sound: tidy settings stay as they are: ${JSON.stringify(raw).slice(0, 50)}`, tidySound(tidySound(raw)), tidySound(raw));
}

// ---- validation, file names
eq('sound: clean keeps the known keys only', cleanSound({ src: 'media/m.mp3', start: 1, volume: 0.5, fadeIn: 1, fadeOut: 2, evil: 'x', loop: true }), { src: 'media/m.mp3', start: 1, volume: 0.5, fadeIn: 1, fadeOut: 2 });
eq('sound: clean — nothing set is nothing', cleanSound({}), {});
for (const [what, raw] of [['no settings', null], ['text', 'media/m.mp3'], ['src is a number', { src: 5 }], ['src is empty', { src: '' }], ['src with a line break', { src: 'a.mp3\n};' }], ['src with a template', { src: 'a${x}.mp3' }],
  ['src with a back-tick', { src: 'a`.mp3' }], ['src with a backslash', { src: 'a\\.mp3' }], ['src too long', { src: 'a'.repeat(301) }], ['start is text', { start: '3' }], ['volume is NaN', { volume: NaN }],
  ['fadeIn is infinite', { fadeIn: Infinity }], ['fadeOut is null', { fadeOut: null }]]) {
  throws(`sound: refused — ${what}`, () => cleanSound(raw));
}
for (const good of ['song.mp3', 'Музыка (2).M4A', 'a.aac', 'a.wav', 'a.ogg', 'a.oga', 'a.opus', 'a.flac']) eq(`sound: a music file: ${good}`, safeName(good, SOUND_FILE), good);
for (const bad of ['film.mp4', 'film.webm', 'page.html', 'song.mp3.exe', 'song.mp3x', '.mp3', 'mp3', 'a.mid', 'a.wma', 'a.jpg']) eq(`sound: not a music file: ${bad}`, safeName(bad, SOUND_FILE), null);

// ---- the file
const soundFileText = readFileSync(`${repo}src/sound.js`, 'utf8');
const shead = soundFileText.slice(0, soundFileText.indexOf('export default {'));
const sbody = (...lines) => `${shead}export default {\n${lines.map((l) => `${l}\n`).join('')}};\n`;
const empty = sbody("  // src: 'media/music.mp3',", '  // start: 12.5,', '  // fadeOut: 2,');
const all = { src: 'media/m.mp3', start: 12.5, volume: 0.8, fadeIn: 0.5, fadeOut: 2 };
eq('sound: the file as it comes is the empty one', soundFileText, empty);
eq('sound: the empty file says: the own soundtrack', soundSettings(await load(soundFileText)), OWN);
eq('sound: nothing to say — the file stays as it is', putSound(empty, {}), empty);
let sf = putSound(empty, all);
eq('sound: lines are added in their order, each before its commented-out example',
  sf, sbody("  src: 'media/m.mp3',", "  // src: 'media/music.mp3',", '  start: 12.5,', '  // start: 12.5,', '  volume: 0.8,', '  fadeIn: 0.5,', '  fadeOut: 2,', '  // fadeOut: 2,'));
eq('sound: the result is a module with these settings', await load(sf), all);
eq('sound: the same settings again change nothing', putSound(sf, all), sf);
eq('sound: back to the defaults — the file is what it was', putSound(sf, {}), empty);
eq('sound: one value changed — one line changed', putSound(sf, { ...all, start: 30 }), sf.replace('  start: 12.5,\n  //', '  start: 30,\n  //'));
eq('sound: a value back at its default loses its line, the others stay', putSound(sf, { ...all, volume: 1 }), sf.replace('  volume: 0.8,\n', ''));
eq('sound: a comment after a value stays, a hand-written order stays; a new line goes before the first later key',
  putSound(sbody('  fadeOut: 3,   // к финалу', "  src: 'media/old.mp3',  // пока так", '', '  // своё примечание'), { src: 'media/new.mp3', fadeOut: 2, start: 5 }),
  sbody('  start: 5,', '  fadeOut: 2,   // к финалу', "  src: 'media/new.mp3',  // пока так", '', '  // своё примечание'));
eq('sound: the file\'s own indent is kept', putSound("export default {\n\tsrc: 'a.mp3',\n};\n", { src: 'b.mp3', volume: 0.5 }), "export default {\n\tsrc: 'b.mp3',\n\tvolume: 0.5,\n};\n");
eq('sound: Windows line ends are kept', putSound(empty.replace(/\n/g, '\r\n'), { fadeOut: 2 }), sbody("  // src: 'media/music.mp3',", '  // start: 12.5,', '  fadeOut: 2,', '  // fadeOut: 2,').replace(/\n/g, '\r\n'));
throws('sound: no export line', () => putSound("const sound = { src: 'a.mp3' };\nexport default sound;\n", all));
throws('sound: no closing line', () => putSound("export default {\n  src: 'a.mp3',\n", all));
throws('sound: two settings on one line', () => putSound(sbody("  src: 'a.mp3', start: 2,"), all));
throws('sound: the same setting twice', () => putSound(sbody('  start: 1,', '  start: 2,'), all));
throws('sound: a value that is not one plain value', () => putSound(sbody('  start: 60 + 12.5,'), all));

console.log(failed ? `${failed} of ${checks} checks FAILED` : `all ${checks} checks passed`);
process.exit(failed ? 1 : 0);
