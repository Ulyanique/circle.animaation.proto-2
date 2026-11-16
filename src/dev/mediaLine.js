// One line of src/media.js from a window's settings, and putting that line into the file's text. Shared by the placement
// tool in the browser (placer.js) and by its side of the dev server (mediaServer.js), so that what the tool shows is
// exactly what gets written. Plain functions, no browser or node APIs. Not part of the build.

const PLACE = ['x', 'y', 'zoom', 'rotate'];
const DEFAULT = { x: 0.5, y: 0.5, zoom: 1, rotate: 0 };
const num = (v, digits = 3) => String(Number(Number(v).toFixed(digits)));
const quote = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const value = (k, v) => (k === 'rotate' ? (v === 'level' ? "'level'" : num(v, 1)) : num(v));

/** Files a window can show — the extension decides. */
export const MEDIA_FILE = /\.(jpe?g|png|webp|avif|gif|mp4|webm|m4v|mov|ogv)$/i;
/** The largest file the tool takes: GitHub refuses files of 100 MB and more. */
export const MAX_UPLOAD = 95 * 1024 * 1024;

/**
 * A file name fit for public/media/, for an address and for a line of media.js; null if no window can show such a file
 * (`allowed`: what the extension has to be — the title tool takes other files than the windows do, brandLine.js).
 * Letters of any alphabet, digits, spaces and . _ - ( ) + , @ stay, anything else becomes an underscore.
 */
export function safeName(name, allowed = MEDIA_FILE) {
  let s = String(name ?? '').normalize('NFC').split(/[\\/]/).pop();
  s = s.replace(/[^\p{L}\p{N} ._()+,@-]/gu, '_').replace(/\s+/g, ' ').replace(/^[. ]+/, '').trim();
  const dot = s.lastIndexOf('.');
  if (dot < 1 || !allowed.test(s)) return null;
  return s.slice(0, dot).slice(0, 100).trim() + s.slice(dot);
}

/** Settings -> `w05: { src: 'media/a.jpg', x: 0.3, to: { zoom: 1.1 } },` (values that are the default are left out). */
export function mediaLine(id, cfg) {
  const parts = [`src: ${quote(cfg.src)}`];
  for (const k of PLACE) if (cfg[k] !== undefined && cfg[k] !== DEFAULT[k]) parts.push(`${k}: ${value(k, cfg[k])}`);
  if (cfg.to) {
    const to = PLACE.filter((k) => cfg.to[k] !== undefined).map((k) => `${k}: ${value(k, cfg.to[k])}`);
    if (to.length) parts.push(`to: { ${to.join(', ')} }`);
  }
  if (typeof cfg.fixed === 'boolean') parts.push(`fixed: ${cfg.fixed}`);
  for (const k of ['start', 'rate', 'sharpen']) if (Number.isFinite(cfg[k])) parts.push(`${k}: ${num(cfg[k])}`);
  if (cfg.loop === false) parts.push('loop: false');
  return `${id}: { ${parts.join(', ')} },`;
}

/** Settings that came over the wire: only the known keys, only plain values. Returns a clean copy or throws. */
export function cleanSettings(cfg) {
  if (!cfg || typeof cfg !== 'object') throw new Error('no settings');
  if (typeof cfg.src !== 'string' || !/^[^\n\r`$\\]{1,300}$/.test(cfg.src)) throw new Error('bad src');
  const out = { src: cfg.src };
  const place = (from, into) => {
    for (const k of PLACE) {
      if (from[k] === undefined) continue;
      if (k === 'rotate' && from[k] === 'level') into[k] = 'level';
      else if (Number.isFinite(from[k])) into[k] = from[k];
      else throw new Error(`bad ${k}`);
    }
  };
  place(cfg, out);
  if (cfg.to !== undefined && cfg.to !== null) {
    if (typeof cfg.to !== 'object') throw new Error('bad to');
    out.to = {};
    place(cfg.to, out.to);
  }
  if (cfg.fixed !== undefined) {
    if (typeof cfg.fixed !== 'boolean') throw new Error('bad fixed');
    out.fixed = cfg.fixed;
  }
  for (const k of ['start', 'rate', 'sharpen']) {
    if (cfg[k] === undefined) continue;
    if (!Number.isFinite(cfg[k])) throw new Error(`bad ${k}`);
    out[k] = cfg[k];
  }
  if (cfg.loop === false) out.loop = false;
  return out;
}

/** Index where a `//` comment starts in a line of code (outside strings), or -1. */
export function commentAt(line) {
  let q = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '/' && line[i + 1] === '/') return i;
  }
  return -1;
}

/** A line of code without its comment and with every string emptied — what is left is structure. */
export function bare(line) {
  const end = commentAt(line);
  let q = '', out = '';
  for (let i = 0; i < (end < 0 ? line.length : end); i++) {
    const c = line[i];
    if (q) { if (c === '\\') i++; else if (c === q) { q = ''; out += c; } continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    out += c;
  }
  return out;
}
const braces = (code) => (code.match(/\{/g) || []).length - (code.match(/\}/g) || []).length;

/** The lines of src/media.js and where window `id` has its entry in them: lines at … end, or at = -1. */
function locate(text, id) {
  const lines = text.split('\n'), code = lines.map(bare);
  const open = lines.findIndex((l) => /^export default \{\s*(\/\/.*)?$/.test(l));
  if (open < 0) throw new Error('src/media.js: no "export default {" line');
  const close = lines.findIndex((l, i) => i > open && /^\};?\s*(\/\/.*)?$/.test(l));
  if (close < 0) throw new Error('src/media.js: no closing "};" line');
  const idOf = (i) => { const m = /^\s*(w\d\d)\s*:/.exec(code[i]); return m ? m[1] : null; };
  for (let i = open + 1; i < close; i++) {
    // the tool works line by line: two windows on one line would lose one of them
    if ((code[i].match(/\bw\d\d\s*:/g) || []).length > 1) throw new Error('src/media.js: two windows on one line — put each on its own line');
  }
  let at = -1, end = -1;
  for (let i = open + 1; i < close && at < 0; i++) if (idOf(i) === id) at = i;
  if (at >= 0) {
    let depth = 0;
    for (let j = at; j < close && end < 0; j++) { depth += braces(code[j]); if (depth <= 0) end = j; }
    if (end < 0) throw new Error(`src/media.js: the entry of ${id} does not close`);
  }
  return { lines, open, close, at, end, idOf };
}

/**
 * Puts `line` (as made by mediaLine) for window `id` into the text of src/media.js: replaces the window's entry, or
 * adds one in the order of the windows. Entries that are commented out are left alone. Throws if the file no longer
 * looks like `export default {` … `};` with one window per line.
 */
export function putLine(text, id, line) {
  const { lines, open, close, at, end, idOf } = locate(text, id);
  if (at >= 0) {
    const c = at === end ? commentAt(lines[at]) : -1;      // a comment after a one-line entry stays
    lines.splice(at, end - at + 1, `  ${line}${c < 0 ? '' : `   ${lines[at].slice(c)}`}`);
  } else {
    let pos = close;
    for (let i = open + 1; i < close; i++) { const o = idOf(i); if (o && o > id) { pos = i; break; } }
    lines.splice(pos, 0, `  ${line}`);
  }
  return lines.join('\n');
}

/** Takes the entry of window `id` out of the text of src/media.js (the window goes back to its placeholder). */
export function dropLine(text, id) {
  const { lines, at, end } = locate(text, id);
  if (at >= 0) lines.splice(at, end - at + 1);
  return lines.join('\n');
}

/** The entry of window `id` as it is written in the file, or null. */
export function entryText(text, id) {
  const { lines, at, end } = locate(text, id);
  return at < 0 ? null : lines.slice(at, end + 1).join('\n');
}
