// font2json.mjs — glyph outlines of a font as three.js typeface JSON (the conversion of three's TTFLoader), for the
// caption of the final title (src/fx/title.js reads src/fx/fonts/title-serif-600.json; the build keeps only the
// glyphs the caption in src/brand.js uses — see vite.config.js).
//   node font2json.mjs OUT.json IN.woff [IN2.woff …] [--chars "АБВ…"] [--name "family name"]
// Without --chars: every character the fonts have. Several inputs are the subsets of one font (latin, cyrillic …);
// a character is taken from the first font that has it. Needs opentype.js (npm install opentype.js).
// The file in the repo was made from @fontsource/playfair-display 5.3.0 (SIL OFL 1.1), weight 600:
//   node font2json.mjs title-serif-600.json files/playfair-display-{latin,cyrillic,latin-ext,vietnamese}-600-normal.woff \
//     --name "title-serif 600 (glyph outlines derived from Playfair Display SemiBold)"
import opentype from 'opentype.js';
import fs from 'node:fs';

const args = process.argv.slice(2), opt = {};
for (const key of ['--chars', '--name']) { const i = args.indexOf(key); if (i >= 0) opt[key] = args.splice(i, 2)[1]; }
const [out, ...inputs] = args;
if (!out || !inputs.length) { console.error('usage: node font2json.mjs OUT.json IN.woff [IN2.woff …] [--chars "…"] [--name "…"]'); process.exit(1); }
const r = Math.round;

/** CFF outlines run the other way round than TrueType ones: turn every contour. */
function reverse(commands) {
  const paths = []; let path;
  for (const c of commands) { if (c.type.toLowerCase() === 'm') { path = [c]; paths.push(path); } else if (c.type.toLowerCase() !== 'z') path.push(c); }
  const res = [];
  for (const p of paths) {
    res.push({ type: 'm', x: p[p.length - 1].x, y: p[p.length - 1].y });
    for (let i = p.length - 1; i > 0; i--) {
      const c = p[i], o = { type: c.type };
      if (c.x2 !== undefined) { o.x1 = c.x2; o.y1 = c.y2; o.x2 = c.x1; o.y2 = c.y1; } else if (c.x1 !== undefined) { o.x1 = c.x1; o.y1 = c.y1; }
      o.x = p[i - 1].x; o.y = p[i - 1].y; res.push(o);
    }
  }
  return res;
}

const glyphs = {};
let data = null;
for (const src of inputs) {
  const buf = fs.readFileSync(src);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const scale = 100000 / ((font.unitsPerEm || 2048) * 72);
  const reversed = font.outlinesFormat === 'cff';
  const wanted = opt['--chars'] ? [...new Set([...opt['--chars']])] : Object.keys(font.tables.cmap.glyphIndexMap).map((code) => String.fromCodePoint(Number(code)));
  let taken = 0;
  for (const ch of wanted) {
    if (glyphs[ch] || /\s|\p{C}/u.test(ch)) continue;      // spaces and control characters have no outline
    const g = font.charToGlyph(ch);
    if (!g || g.index === 0) continue;
    const t = { ha: r(g.advanceWidth * scale), x_min: r((g.xMin ?? 0) * scale), x_max: r((g.xMax ?? 0) * scale), o: '' };
    for (const c of (reversed ? reverse(g.path.commands) : g.path.commands)) {
      const type = c.type.toLowerCase() === 'c' ? 'b' : c.type.toLowerCase();
      t.o += type + ' ';
      if (c.x !== undefined) t.o += r(c.x * scale) + ' ' + r(c.y * scale) + ' ';
      if (c.x1 !== undefined) t.o += r(c.x1 * scale) + ' ' + r(c.y1 * scale) + ' ';
      if (c.x2 !== undefined) t.o += r(c.x2 * scale) + ' ' + r(c.y2 * scale) + ' ';
    }
    glyphs[ch] = t;
    taken++;
  }
  data ??= {
    familyName: opt['--name'] || font.getEnglishName('fullName'), ascender: r(font.ascender * scale), descender: r(font.descender * scale),
    underlinePosition: font.tables.post.underlinePosition, underlineThickness: font.tables.post.underlineThickness,
    boundingBox: { xMin: font.tables.head.xMin, xMax: font.tables.head.xMax, yMin: font.tables.head.yMin, yMax: font.tables.head.yMax }, resolution: 1000,
  };
  console.log(`${src.split('/').pop()}: ${font.outlinesFormat}, ${taken} glyphs taken`);
}
if (opt['--chars']) for (const ch of new Set([...opt['--chars']])) if (!glyphs[ch] && !/\s/.test(ch)) console.error('missing glyph', ch);
// one glyph per line: the file sits in git, and a diff should show which glyphs changed
const sorted = Object.keys(glyphs).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
const body = sorted.map((ch) => `${JSON.stringify(ch)}:${JSON.stringify(glyphs[ch])}`).join(',\n');
fs.writeFileSync(out, `{"glyphs":{\n${body}\n},\n${JSON.stringify(data).slice(1)}\n`);
console.log(`${out}: ${sorted.length} glyphs, ${fs.statSync(out).size} bytes`);
