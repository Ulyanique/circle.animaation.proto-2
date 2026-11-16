// The soundtrack's settings as lines of src/sound.js, and putting those lines into the file's text. Shared by the sound
// tool in the browser (sounder.js) and by its side of the dev server (soundServer.js), so that what the tool shows is
// exactly what gets written. Plain functions, no browser or node APIs. Not part of the build.

import { OWN_SOUND, soundSettings } from '../core/soundSettings.js';
import { putEntries, quote } from './brandLine.js';

/** The keys of src/sound.js, in the order the tool writes them in. */
export const SOUND_KEYS = ['off', 'src', 'start', 'volume', 'fadeIn', 'fadeOut'];
/** The value of the <select> entry that turns the music off (and of no real file). */
export const SOUND_OFF_ENTRY = 'off';
/** Files that can be the soundtrack — the extension decides. */
export const SOUND_FILE = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i;

const num = (v, digits) => String(Number(v.toFixed(digits)));
const DIGITS = { start: 3, volume: 2, fadeIn: 2, fadeOut: 2 };
const DEFAULT = { start: 0, volume: 1, fadeIn: 0, fadeOut: 0 };

/**
 * Settings as src/sound.js exports them, complete and at the precision of the written line — the form the tool keeps
 * them in: { off, src, start, volume, fadeIn, fadeOut }. With `off` the src is still carried (it says which file comes
 * back when the music is turned on again) but it is not written over it — see soundEntries.
 */
export function tidySound(raw) {
  const s = soundSettings(raw), out = { off: s.off, src: s.src };
  for (const k of Object.keys(DIGITS)) out[k] = Number(num(s[k], DIGITS[k])) + 0;      // (+ 0: no negative zero)
  return out;
}

/**
 * What the file has to say for these settings: [[key, value as written], …] in the order of SOUND_KEYS. A value that
 * is the default has no line — the film's own soundtrack, untouched, is an empty file. With `off`, the tool writes
 * one line, `off: true`; the src comes back into play only when it is chosen again.
 */
export function soundEntries(raw) {
  const s = tidySound(raw), out = [];
  if (s.off) out.push(['off', 'true']);
  if (s.src !== OWN_SOUND) out.push(['src', quote(s.src)]);
  for (const k of Object.keys(DIGITS)) if (s[k] !== DEFAULT[k]) out.push([k, num(s[k], DIGITS[k])]);
  return out;
}

/** The settings as a whole `export default { … };` — what the tool shows and copies. */
export const soundBlock = (raw) => `export default {\n${soundEntries(raw).map(([k, v]) => `  ${k}: ${v},\n`).join('')}};`;

/** Settings that came over the wire: only the known keys, only plain values. Returns a clean copy or throws. */
export function cleanSound(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('no settings');
  const out = {};
  if (raw.off !== undefined) {
    if (typeof raw.off !== 'boolean') throw new Error('bad off');
    out.off = raw.off;
  }
  if (raw.src !== undefined) {
    if (typeof raw.src !== 'string' || !/^[^\n\r`$\\]{1,300}$/.test(raw.src)) throw new Error('bad src');
    out.src = raw.src;
  }
  for (const k of Object.keys(DIGITS)) {
    if (raw[k] === undefined) continue;
    if (!Number.isFinite(raw[k])) throw new Error(`bad ${k}`);
    out[k] = raw[k];
  }
  return out;
}

/** Puts the soundtrack's settings into the text of src/sound.js (brandLine.js: putEntries). */
export const putSound = (text, raw) => putEntries(text, 'src/sound.js', SOUND_KEYS, soundEntries(raw));
