// The soundtrack's settings (src/sound.js) with their defaults filled in, and how loud the music is at a moment of the
// film. Plain functions — no browser: the page uses them (core/soundtrack.js), the dev server's tools do (dev/sounder.js,
// dev/soundLine.js, dev/filmFile.js), and so do the checks (tools/linetest.mjs).

import { FPS, LAST_FRAME, clamp } from './util.js';

/** The film's own soundtrack: what sounds when src/sound.js names no file. */
export const OWN_SOUND = 'audio.m4a';
/** The film is over at this second: the last frame has been on the screen for its 1/24 s. */
export const FILM_END = LAST_FRAME / FPS;
/** The longest fade, seconds. */
export const MAX_FADE = 20;
/** The furthest moment of a music file the film can begin at, seconds. */
export const MAX_START = 3600;

const number = (v, d, lo, hi) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

/**
 * -> { off, src, start, volume, fadeIn, fadeOut }
 *   off       true — музыка убрана: ни на странице, ни в файле-ролике музыки нет (так сейчас и стоит в src/sound.js)
 *   src       the file, under public/ (or a full address)
 *   start     the second of the music that sounds at the film's first frame; negative: the music comes in that much later
 *   volume    0…1
 *   fadeIn    seconds over which the music rises at the film's beginning
 *   fadeOut   seconds over which it dies away towards the film's end
 */
export function soundSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const off = s.off === true;
  return {
    off,
    src: typeof s.src === 'string' && s.src.trim() ? s.src.trim() : OWN_SOUND,
    start: number(s.start, 0, -FILM_END, MAX_START),
    volume: number(s.volume, 1, 0, 1),
    fadeIn: number(s.fadeIn, 0, 0, MAX_FADE),
    fadeOut: number(s.fadeOut, 0, 0, MAX_FADE),
  };
}

/**
 * How loud the music is at second `t` of the film: 0…1, a factor on its samples. The fades follow a square law — a
 * straight line of amplitude sounds as if nothing happened for half the fade and then the sound fell away.
 */
export function gainAt(t, s) {
  let g = s.volume;
  if (s.fadeIn > 0) { const x = clamp(t / s.fadeIn); g *= x * x; }
  if (s.fadeOut > 0) { const x = clamp((FILM_END - t) / s.fadeOut); g *= x * x; }
  return g;
}

/** Do these settings leave the file's own sound as it is — every sample in its place, at its own level? */
export const untouched = (s) => s.start === 0 && s.volume === 1 && s.fadeIn === 0 && s.fadeOut === 0;
