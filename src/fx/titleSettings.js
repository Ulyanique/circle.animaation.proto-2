// The settings of the final title (src/brand.js) with their defaults filled in, and what follows from them outside
// the film. Plain functions — no three.js, no browser: the page uses them (fx/title.js), the dev server and the build
// do (vite.config.js: the page's own name, the glyphs to ship), and so do the checks (tools/captiontest.mjs).

export const DEFAULT_CAPTION = 'Янтарный циркуль';

const number = (v, d, lo, hi) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
/**
 * One line of text: no line breaks, single spaces, nothing at the ends; letters with marks in one piece each (text
 * typed or copied on a Mac may hold «й» as «и» + a separate breve, and the font has «й», not the breve).
 */
const line = (v, d) => (typeof v === 'string' ? v.normalize('NFC').replace(/\s+/g, ' ').trim() : d);

/**
 * -> { caption, tagline, name, size, emblem: 'compass' | 'none' | 'image', image: the picture's file or null,
 *      emblemSize, emblemGold: true | false | null (null: gold only if the picture is nearly black), ring }
 */
export function titleSettings(brand) {
  const b = brand && typeof brand === 'object' ? brand : {};
  const emblem = typeof b.emblem === 'string' ? b.emblem.trim() : b.emblem === false ? 'none' : 'compass';
  const image = emblem !== '' && emblem !== 'compass' && emblem !== 'none';
  return {
    caption: line(b.caption, DEFAULT_CAPTION),
    tagline: line(b.tagline, ''),
    name: line(b.name, ''),
    size: number(b.size, 1, 0.5, 3),
    emblem: image ? 'image' : emblem === 'none' ? 'none' : 'compass',
    image: image ? emblem : null,
    emblemSize: number(b.emblemSize, 1, 0.2, 3),
    emblemGold: typeof b.emblemGold === 'boolean' ? b.emblemGold : null,
    ring: b.ring !== false,
  };
}

/** The characters the title is written with (no spaces), each once. */
export const titleChars = (s) => [...new Set([...(s.caption + s.tagline)])].filter((ch) => ch !== ' ').sort();

/** typeface JSON -> { font: the same with only the glyphs of `chars`, missing: the characters it has no glyph for }. */
export function keepGlyphs(font, chars) {
  const glyphs = {}, missing = [];
  for (const ch of chars) { if (font.glyphs[ch]) glyphs[ch] = font.glyphs[ch]; else missing.push(ch); }
  return { font: { ...font, glyphs }, missing };
}

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The page's own names: `tab` — the browser tab (`name`, or the caption followed by « — three.js»); `label` — the
 * loading screen and the description (the caption, or `name` if there is no caption).
 */
export const pageNames = (s) => ({ label: s.caption || s.name, tab: s.name || (s.caption ? `${s.caption} — three.js` : 'three.js') });

/** index.html with the page's own names in it: the browser tab, the description and the loading screen. */
export function pageHtml(html, s) {
  const names = pageNames(s), label = esc(names.label), tab = esc(names.tab);
  return html
    .replace(/<title>[^<]*<\/title>/, () => `<title>${tab}</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, (m, a) => `${a}${label ? `${label}: заставка` : 'Заставка'}, воссозданная в реальном времени на three.js."`)
    .replace(/(<div id="loading"[^>]*><span>)[^<]*/, (m, a) => a + label);
}
