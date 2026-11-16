// captiontest.mjs — checks of the final title's text, without a browser: the settings of src/brand.js and the page's
// name (src/fx/titleSettings.js), the spacing of a line (src/fx/caption.js), the font file (src/fx/fonts/) and what
// the build keeps of it. Plain node, from the repository (three.js is taken from its node_modules):
//   node tools/captiontest.mjs
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const repo = existsSync(new URL('../src/fx/caption.js', import.meta.url)) ? new URL('..', import.meta.url).pathname : '/home/user/circle.animaation.proto-2/';
const { titleSettings, titleChars, keepGlyphs, pageHtml, DEFAULT_CAPTION } = await import(`${repo}src/fx/titleSettings.js`);
const { fitLine } = await import(`${repo}src/fx/caption.js`);
const THREE = await import(`${repo}node_modules/three/build/three.module.js`);
const { Font } = await import(`${repo}node_modules/three/examples/jsm/loaders/FontLoader.js`);
const font = JSON.parse(readFileSync(`${repo}src/fx/fonts/title-serif-600.json`, 'utf8'));
const html = readFileSync(`${repo}index.html`, 'utf8');

let failed = 0, checks = 0;
const ok = (name, cond, note = '') => { checks++; if (!cond) { failed++; console.log(`FAIL ${name}${note ? `: ${note}` : ''}`); } };
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const near = (name, got, want, tol = 1e-9) => ok(name, Math.abs(got - want) <= tol, `got ${got}, want ${want}`);

// ---- settings
const D = { caption: DEFAULT_CAPTION, tagline: '', name: '', size: 1, emblem: 'compass', image: null, emblemSize: 1, emblemGold: null, ring: true };
eq('settings: nothing given', titleSettings(undefined), D);
eq('settings: empty object', titleSettings({}), D);
eq('settings: the file in the repo is readable', typeof titleSettings((await import(`${repo}src/brand.js`)).default).caption, 'string');
eq('settings: text is one clean line', titleSettings({ caption: '  Северный \n  ветер ', tagline: '\tбюро  проектов ' }), { ...D, caption: 'Северный ветер', tagline: 'бюро проектов' });
eq('settings: no caption', titleSettings({ caption: '' }).caption, '');
eq('settings: letters typed as letter + mark become one', [titleSettings({ caption: 'Южны\u0438\u0306' }).caption, titleSettings({ tagline: 'Cafe\u0301' }).tagline], ['Южны\u0439', 'Caf\u00e9']);
eq('settings: a caption that is not text falls back', titleSettings({ caption: 42 }).caption, DEFAULT_CAPTION);
eq('settings: size is kept in range', [titleSettings({ size: 0.1 }).size, titleSettings({ size: 9 }).size, titleSettings({ size: '1.3' }).size, titleSettings({ size: 'big' }).size, titleSettings({ size: null }).size, titleSettings({ size: true }).size], [0.5, 3, 1.3, 1, 1, 1]);
eq('settings: emblemSize is kept in range', [titleSettings({ emblemSize: 0 }).emblemSize, titleSettings({ emblemSize: 50 }).emblemSize, titleSettings({ emblemSize: 1.4 }).emblemSize], [0.2, 3, 1.4]);
eq('settings: picture', (({ emblem, image }) => [emblem, image])(titleSettings({ emblem: ' media/logo.svg ' })), ['image', 'media/logo.svg']);
eq('settings: no emblem', (({ emblem, image }) => [emblem, image])(titleSettings({ emblem: 'none' })), ['none', null]);
eq('settings: emblem false = none', titleSettings({ emblem: false }).emblem, 'none');
eq('settings: emblem empty = compass', titleSettings({ emblem: '' }).emblem, 'compass');
eq('settings: gold', [titleSettings({ emblemGold: true }).emblemGold, titleSettings({ emblemGold: false }).emblemGold, titleSettings({ emblemGold: 'yes' }).emblemGold], [true, false, null]);
eq('settings: ring', [titleSettings({ ring: false }).ring, titleSettings({ ring: 0 }).ring, titleSettings({}).ring], [false, true, true]);

// ---- the page's own name
eq('page: the placeholder leaves index.html as it is', pageHtml(html, titleSettings({})), html);
const tags = (h) => [h.match(/<title>([^<]*)<\/title>/)[1], h.match(/name="description" content="([^"]*)"/)[1], h.match(/<div id="loading"[^>]*><span>([^<]*)</)[1]];
eq('page: caption', tags(pageHtml(html, titleSettings({ caption: 'Orbita' }))), ['Orbita — three.js', 'Orbita: заставка, воссозданная в реальном времени на three.js.', 'Orbita']);
eq('page: name', tags(pageHtml(html, titleSettings({ caption: 'ORBITA', name: 'Orbita — showreel' }))), ['Orbita — showreel', 'ORBITA: заставка, воссозданная в реальном времени на three.js.', 'ORBITA']);
eq('page: name without a caption', tags(pageHtml(html, titleSettings({ caption: '', name: 'Orbita' }))), ['Orbita', 'Orbita: заставка, воссозданная в реальном времени на three.js.', 'Orbita']);
eq('page: neither', tags(pageHtml(html, titleSettings({ caption: '' }))), ['three.js', 'Заставка, воссозданная в реальном времени на three.js.', '']);
eq('page: markup and replacement patterns in the text stay text', tags(pageHtml(html, titleSettings({ caption: 'A&B <i>"$1$&"</i>' }))), ['A&amp;B &lt;i&gt;&quot;$1$&amp;&quot;&lt;/i&gt; — three.js', 'A&amp;B &lt;i&gt;&quot;$1$&amp;&quot;&lt;/i&gt;: заставка, воссозданная в реальном времени на three.js.', 'A&amp;B &lt;i&gt;&quot;$1$&amp;&quot;&lt;/i&gt;']);
ok('page: the rest of index.html is untouched', pageHtml(html, titleSettings({ caption: 'Orbita' })).replace(/Orbita/g, DEFAULT_CAPTION) === html);

// ---- spacing of a line
{
  const cap = 100, track = [0.04, 0.5];
  let r = fitLine({ natural: 1300, gaps: 15, cap, target: 1800, most: 2250, track });
  near('fit: a line in range is spread to the target', r.width, 1800); near('fit: … by this much', r.tracking, 500 / 15); eq('fit: … at full size', [r.shrink, r.fitted], [1, true]);
  r = fitLine({ natural: 400, gaps: 5, cap, target: 1800, most: 2250, track });
  near('fit: a short line gets the widest spacing', r.tracking, 50); near('fit: … and stays narrow', r.width, 650); eq('fit: … at full size', [r.shrink, r.fitted], [1, false]);
  r = fitLine({ natural: 2000, gaps: 30, cap, target: 1800, most: 2250, track });
  near('fit: a longer line gets the tightest spacing', r.tracking, 4); near('fit: … and is wider than the target', r.width, 2120); eq('fit: … still at full size', r.shrink, 1);
  r = fitLine({ natural: 3000, gaps: 40, cap, target: 1800, most: 2250, track });
  near('fit: a very long line is made smaller', r.shrink, 2250 / 3160); near('fit: … to exactly the most it may take', r.width * r.shrink, 2250);
  r = fitLine({ natural: 300, gaps: 0, cap, target: 1800, most: 2250, track });
  eq('fit: one letter', [r.tracking, r.width, r.shrink], [0, 300, 1]);
  r = fitLine({ natural: 3000, gaps: 0, cap, target: 1800, most: 2250, track });
  near('fit: one huge letter', r.shrink, 0.75);
  r = fitLine({ natural: 500, gaps: 4, cap, target: 1800 });
  eq('fit: no limits = always the target', [r.width, r.tracking, r.shrink, r.fitted], [1800, 325, 1, true]);
  // random lines: the invariants
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let bad = 0, prev = null;
  for (let i = 0; i < 20000; i++) {
    const natural = 50 + rnd() * 6000, gaps = Math.floor(rnd() * 60), target = 1800, most = 2250;
    const f = fitLine({ natural, gaps, cap, target, most, track });
    const within = gaps < 1 || (f.tracking >= track[0] * cap - 1e-9 && f.tracking <= track[1] * cap + 1e-9);
    const sized = f.shrink <= 1 && f.shrink > 0 && f.width * f.shrink <= most + 1e-6 && (f.width > most || f.shrink === 1);
    const consistent = gaps < 1 || Math.abs(natural + f.tracking * gaps - f.width) < 1e-6;
    const honest = !f.fitted || Math.abs(f.width - target) < 1e-9;
    if (!within || !sized || !consistent || !honest) bad++;
  }
  eq('fit: 20 000 random lines keep within the limits', bad, 0);
  for (let natural = 100; natural <= 5000; natural += 50) {      // a longer line is never spaced wider, nor drawn bigger
    const f = fitLine({ natural, gaps: 20, cap, target: 1800, most: 2250, track });
    if (prev && (f.tracking > prev.tracking + 1e-9 || f.shrink > prev.shrink + 1e-9)) bad++;
    prev = f;
  }
  eq('fit: spacing and size only go down as a line gets longer', bad, 0);
}

// ---- the font file
const has = (s) => [...s].filter((ch) => !font.glyphs[ch]);
eq('font: Russian', has('АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя'), []);
eq('font: Ukrainian, Belarusian', has('ІЇЄҐЎіїєґў'), []);
eq('font: Latin', has('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'), []);
eq('font: digits and punctuation', has('0123456789.,:;!?-–—«»„“”"\'()&№+/@#%*…·•©®™€$£'), []);
eq('font: European letters', has('ÄÖÜäöüßÀÂÇÉÈÊËÎÏÔÙÛàâçéèêëîïôùûÑñ¿¡ĄĆĘŁŃÓŚŹŻąćęłńóśźżČĎĚŇŘŠŤŮŽčďěňřšťůžĞİŞğışÅÆØåæø'), []);
eq('font: one em is 1000 units', font.resolution, 1000);
ok('font: the name is not the reserved one', !/^Playfair Display/.test(font.familyName), font.familyName);
{
  const counts = { m: 2, l: 2, q: 4, b: 6, z: 0 };
  let broken = [];
  for (const [ch, g] of Object.entries(font.glyphs)) {
    const t = g.o.trim().split(/\s+/); let i = 0, fine = Number.isFinite(g.ha) && g.ha >= 0 && t.length > 3;      // combining marks do not advance
    while (fine && i < t.length) { const n = counts[t[i]]; if (n === undefined) { fine = false; break; } for (let k = 1; k <= n; k++) if (!/^-?\d+$/.test(t[i + k] ?? '')) fine = false; i += n + 1; }
    if (!fine) broken.push(ch);
  }
  eq(`font: every one of the ${Object.keys(font.glyphs).length} outlines is well-formed`, broken, []);
  // the placeholder's letters are the outlines the film was made with
  const sum = createHash('sha256').update(JSON.stringify([...'Яаийклнртуцыь'].map((ch) => font.glyphs[ch]))).digest('hex').slice(0, 16);
  eq('font: the outlines of «Янтарный циркуль» are unchanged', sum, '06c331acadb5e146');
}
{
  // through three.js, as the page does it: shapes with finite points; counters are holes, not filled
  const f = new Font(font);
  let bad = [];
  for (const ch of Object.keys(font.glyphs)) {
    const shapes = f.generateShapes(ch, 100);
    const pts = shapes.flatMap((s) => s.getPoints(6));
    if (!shapes.length || !pts.length || pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) bad.push(ch);
  }
  eq('font: every glyph gives shapes', bad, []);
  const holes = (ch) => f.generateShapes(ch, 100).reduce((n, s) => n + s.holes.length, 0);
  eq('font: counters are holes', [...'OoАВдБ8BЯр0Ю'].map(holes), [1, 1, 1, 2, 1, 1, 2, 2, 1, 1, 1, 1]);
  for (const text of ['АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789&№«»—!?']) {
    let nan = 0, tris = 0;
    for (const ch of text) {
      const geo = new THREE.ExtrudeGeometry(f.generateShapes(ch, 100), { depth: 10, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 2, curveSegments: 8 });
      const p = geo.attributes.position.array; tris += p.length / 9;
      for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) nan++;
    }
    ok(`font: «${text.slice(0, 6)}…» extrudes cleanly`, nan === 0 && tris > text.length * 100, `${nan} bad numbers, ${tris} triangles`);
  }
}

// ---- what the build keeps
{
  const font = JSON.parse(readFileSync(`${repo}src/fx/fonts/title-serif-600.json`, 'utf8'));      // as on disk: three.js keeps notes in the one above
  const s = titleSettings({});
  eq('build: characters of the placeholder', titleChars(s).join(''), 'Яаийклнртуцыь');
  const kept = keepGlyphs(font, titleChars(s));
  eq('build: glyphs kept', [Object.keys(kept.font.glyphs).sort().join(''), kept.missing], ['Яаийклнртуцыь', []]);
  eq('build: the rest of the file is kept', Object.keys(kept.font), Object.keys(font));
  ok('build: the font itself is not changed', Object.keys(font.glyphs).length > 500);
  ok('build: the kept part is small', JSON.stringify(kept.font).length < 16000, `${JSON.stringify(kept.font).length} bytes`);
  const both = titleSettings({ caption: 'Северный ветер', tagline: 'бюро 2024' });
  eq('build: caption and tagline together, each character once, no spaces', titleChars(both).join(''), '024Сбвейнортыю');
  const odd = keepGlyphs(font, titleChars(titleSettings({ caption: 'Αθήνα 東京 ok' })));
  eq('build: characters the font lacks are reported', [Object.keys(odd.font.glyphs).sort().join(''), odd.missing.sort().join('')], ['ko', 'Αήαθν京東'.split('').sort().join('')]);
  eq('build: no text at all', keepGlyphs(font, titleChars(titleSettings({ caption: '' }))).font.glyphs, {});
}

console.log(failed ? `${failed} of ${checks} checks FAILED` : `all ${checks} checks passed`);
process.exit(failed ? 1 : 0);
