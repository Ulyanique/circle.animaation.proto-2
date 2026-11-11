// font2json.mjs IN.woff OUT.json "chars" — minimal three.js typeface JSON (same conversion as three's TTFLoader) for a few glyphs.
import opentype from 'opentype.js';
import fs from 'node:fs';
const [src, out, chars] = process.argv.slice(2);
const buf = fs.readFileSync(src);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const scale = 100000 / ((font.unitsPerEm || 2048) * 72);
const r = Math.round;
const reversed = font.outlinesFormat === 'cff';
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
for (const ch of new Set([...chars])) {
  const g = font.charToGlyph(ch);
  if (!g || g.index === 0) { console.error('missing glyph', ch); continue; }
  const t = { ha: r(g.advanceWidth * scale), x_min: r(g.xMin * scale), x_max: r(g.xMax * scale), o: '' };
  for (const c of (reversed ? reverse(g.path.commands) : g.path.commands)) {
    if (c.type.toLowerCase() === 'c') c.type = 'b';
    t.o += c.type.toLowerCase() + ' ';
    if (c.x !== undefined) t.o += r(c.x * scale) + ' ' + r(c.y * scale) + ' ';
    if (c.x1 !== undefined) t.o += r(c.x1 * scale) + ' ' + r(c.y1 * scale) + ' ';
    if (c.x2 !== undefined) t.o += r(c.x2 * scale) + ' ' + r(c.y2 * scale) + ' ';
  }
  glyphs[ch] = t;
}
const data = { glyphs, familyName: font.getEnglishName('fullName'), ascender: r(font.ascender * scale), descender: r(font.descender * scale),
  underlinePosition: font.tables.post.underlinePosition, underlineThickness: font.tables.post.underlineThickness,
  boundingBox: { xMin: font.tables.head.xMin, xMax: font.tables.head.xMax, yMin: font.tables.head.yMin, yMax: font.tables.head.yMax }, resolution: 1000 };
fs.writeFileSync(out, JSON.stringify(data));
console.log(out, font.outlinesFormat, Object.keys(glyphs).join(''), fs.statSync(out).size, 'bytes');
