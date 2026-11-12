// The settings of the final title as lines of src/brand.js, and putting those lines into the file's text. Shared by the
// title tool in the browser (titler.js) and by its side of the dev server (brandServer.js), so that what the tool
// shows is exactly what gets written. Plain functions, no browser or node APIs. Not part of the build.

import { titleSettings } from '../fx/titleSettings.js';
import { bare, commentAt } from './mediaLine.js';

/** The keys of src/brand.js, in the order the tool writes them in. */
export const KEYS = ['caption', 'tagline', 'size', 'emblem', 'emblemSize', 'emblemGold', 'ring', 'name'];
/** Files that can stand for the emblem — the extension decides. */
export const EMBLEM_FILE = /\.(svg|png|webp|avif|gif|jpe?g)$/i;
/** The longest line of text the tool takes. */
export const MAX_TEXT = 200;

const num = (v) => String(Number(v.toFixed(3)));
// a text in single quotes; what would break the line or hide in it is written as an escape
const quote = (t) => `'${t.replace(/[\\']/g, '\\$&').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}'`;

/**
 * Settings as src/brand.js exports them, complete and at the precision of the written line — the form the tool keeps
 * them in: { caption, tagline, size, emblem: 'compass' | 'none' | the picture's address, emblemSize,
 * emblemGold: true | false | null, ring, name }.
 */
export function tidyBrand(raw) {
  const s = titleSettings(raw);
  return {
    caption: s.caption, tagline: s.tagline, size: Number(num(s.size)), emblem: s.image ?? s.emblem,
    emblemSize: Number(num(s.emblemSize)), emblemGold: s.emblemGold, ring: s.ring, name: s.name,
  };
}

/**
 * What the file has to say for these settings: [[key, value as written], …] in the order of KEYS. A value that is the
 * default has no line (the caption always has one: its default is a placeholder), nor has one that changes nothing —
 * the size and colour of a picture when there is no picture.
 */
export function brandEntries(raw) {
  const s = tidyBrand(raw), picture = s.emblem !== 'compass' && s.emblem !== 'none', out = [['caption', quote(s.caption)]];
  if (s.tagline) out.push(['tagline', quote(s.tagline)]);
  if (s.size !== 1) out.push(['size', num(s.size)]);
  if (s.emblem !== 'compass') out.push(['emblem', quote(s.emblem)]);
  if (picture && s.emblemSize !== 1) out.push(['emblemSize', num(s.emblemSize)]);
  if (picture && s.emblemGold !== null) out.push(['emblemGold', String(s.emblemGold)]);
  if (!s.ring) out.push(['ring', 'false']);
  if (s.name) out.push(['name', quote(s.name)]);
  return out;
}

/** The settings as a whole `export default { … };` — what the tool shows and copies. */
export const brandBlock = (raw) => `export default {\n${brandEntries(raw).map(([k, v]) => `  ${k}: ${v},\n`).join('')}};`;

/** Settings that came over the wire: only the known keys, only plain values. Returns a clean copy or throws. */
export function cleanBrand(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('no settings');
  const out = {};
  for (const k of ['caption', 'tagline', 'emblem', 'name']) {
    if (raw[k] === undefined) continue;
    if (typeof raw[k] !== 'string' || raw[k].length > (k === 'emblem' ? 300 : MAX_TEXT)) throw new Error(`bad ${k}`);
    out[k] = raw[k];
  }
  for (const k of ['size', 'emblemSize']) {
    if (raw[k] === undefined) continue;
    if (!Number.isFinite(raw[k])) throw new Error(`bad ${k}`);
    out[k] = raw[k];
  }
  for (const k of ['emblemGold', 'ring']) {
    if (raw[k] === undefined || raw[k] === null) continue;
    if (typeof raw[k] !== 'boolean') throw new Error(`bad ${k}`);
    out[k] = raw[k];
  }
  return out;
}

const KEY = new RegExp(`^\\s*(${KEYS.join('|')})\\s*:`), NOTE = new RegExp(`^\\s*//\\s*(${KEYS.join('|')})\\s*:`);
// a line the tool can rewrite, its strings emptied (mediaLine.js: bare): one key, one plain value
const PLAIN = /^\s*\w+\s*:\s*(''|""|[-+.\w]+)\s*,?\s*$/;

/**
 * Puts the settings into the text of src/brand.js, line by line: the line of a key is replaced (a comment after it
 * stays), added in the order of KEYS, or taken out where the value is the default again. Every other line — comments,
 * commented-out examples — is left as it is. Throws if the file no longer looks like `export default {` … `};` with
 * one `key: value,` per line; whether the result says what was meant is for the caller to check (brandServer.js).
 */
export function putBrand(text, raw) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n', lines = text.split(/\r?\n/), code = lines.map(bare);
  const open = lines.findIndex((l) => /^export default \{\s*(\/\/.*)?$/.test(l));
  if (open < 0) throw new Error('src/brand.js: no "export default {" line');
  let close = lines.findIndex((l, i) => i > open && /^\};?\s*(\/\/.*)?$/.test(l));
  if (close < 0) throw new Error('src/brand.js: no closing "};" line');
  const keyAt = (i) => KEY.exec(code[i])?.[1] ?? null;      // the key a line sets …
  const noteAt = (i) => (code[i].trim() ? null : NOTE.exec(lines[i])?.[1] ?? null);      // … or would, were it not commented out
  let indent = '  ';
  const seen = new Set();
  for (let i = open + 1; i < close; i++) {
    const k = keyAt(i);
    if (!k) continue;
    if (seen.has(k)) throw new Error(`src/brand.js: two lines of ${k}`);
    if (!PLAIN.test(code[i])) throw new Error(`src/brand.js: the line of ${k} is not a plain "${k}: value," — put each setting on a line of its own`);
    if (!seen.size) indent = /^\s*/.exec(lines[i])[0];
    seen.add(k);
  }
  const want = new Map(brandEntries(raw));
  for (const k of KEYS) {
    let at = -1;
    for (let i = open + 1; i < close && at < 0; i++) if (keyAt(i) === k) at = i;
    if (!want.has(k)) {
      if (at >= 0) { lines.splice(at, 1); code.splice(at, 1); close--; }
      continue;
    }
    const entry = `${k}: ${want.get(k)},`;
    if (at >= 0) {
      const c = commentAt(lines[at]), tail = c < 0 ? '' : lines[at].slice(lines[at].slice(0, c).trimEnd().length);
      lines[at] = /^\s*/.exec(lines[at])[0] + entry + tail;
    } else {
      // before the first line of a later key; an example of the key itself that is commented out comes right after
      const order = KEYS.indexOf(k);
      let pos = close;
      for (let i = open + 1; i < close; i++) {
        const o = keyAt(i), n = noteAt(i);
        if ((o && KEYS.indexOf(o) > order) || (n && KEYS.indexOf(n) >= order)) { pos = i; break; }
      }
      lines.splice(pos, 0, indent + entry); code.splice(pos, 0, bare(indent + entry)); close++;
    }
  }
  return lines.join(eol);
}
