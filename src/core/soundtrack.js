// The film's soundtrack on the page: one <audio> element that follows the film's clock (main.js). Which file it plays,
// from which of its seconds and how loud is said by src/sound.js (core/soundSettings.js).
//
// The picture leads and the sound follows — see the clock in main.js. The music need not cover the film: it may come
// in later than the first frame (a negative `start`) or be over before the last one; where the film is and the music
// is not, the element rests (`out`) and is started again when the film comes back to it.

import raw from '../sound.js';
import { urlOf } from './assets.js';
import { gainAt, soundSettings } from './soundSettings.js';

/** The settings in force. */
export let SOUND = soundSettings(raw);

let el = null;            // the element
let filmTime = () => 0;   // the film's second, for when the element reports something on its own
let on = false;           // the user has the sound on
let playing = false;      // the film runs
let out = false;          // the element rests because the film is where the music is not
let refused = false;      // the browser would not start it (no click on the page yet): not tried again by itself
let drift = 0;            // smoothed (music − picture), seconds
let level = -1;           // the volume the element was given last

const musicAt = (t) => t + SOUND.start;
const length = () => (el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : Infinity);
/** Does the music sound at its second `m`? (Not known to be over while its length is not known.) */
const sounds = (m) => m >= 0 && m < length() - 0.02;

function start() {
  refused = false;
  const p = el.play();
  if (p) p.catch((e) => { if (e?.name === 'NotAllowedError') refused = true; });
}
function setLevel(t) {
  const g = gainAt(t, SOUND);
  if (g !== level) { el.volume = g; level = g; }
}
/** Puts the element where second `t` of the film is, and starts it if it ought to sound and does not. */
function place(t) {
  const m = musicAt(t);
  if (sounds(m)) {
    out = false;
    el.currentTime = m;
    if (on && playing && el.paused) start();
  } else {
    out = true;
    if (!el.paused) el.pause();
  }
  setLevel(t);
}

function makeEl() {
  const a = new Audio(urlOf(SOUND.src));
  a.preload = 'auto';
  a.muted = true;
  a.preservesPitch = false;      // the clock's tiny rate trims must not go through a time-stretcher
  a.addEventListener('ended', () => { out = true; });
  // a file that is not there, or that this browser does not play: the film runs on without sound, and says why
  a.addEventListener('error', () => console.warn(`sound: ${SOUND.src} cannot be played${a.error?.message ? ` (${a.error.message})` : ''}`));
  a.addEventListener('loadedmetadata', () => place(filmTime()));      // its length is known now
  return a;
}

export const soundtrack = {
  /** The <audio> element, or null before `open`, and when src/sound.js says the music is off. */
  get el() { return el; },
  /** `time()`: the film's second. The element is made here, muted until the user turns the sound on. */
  open(time) {
    filmTime = time;
    if (SOUND.off) return null;      // музыка убрана из ролика: на странице тишина (src/sound.js: off: true)
    el = makeEl();
    return el;
  },
  /** The film was put on second `t`. */
  seek(t) { if (el) place(t); },
  /** The film starts running from second `t`. */
  play(t) { playing = true; if (el && on) place(t); },
  pause() { playing = false; el?.pause(); },
  /** The user turns the sound on or off. */
  setOn(v, t) {
    on = v;
    if (!el) return;
    el.muted = !v;
    if (!v) el.pause(); else if (playing) place(t);
  },
  /**
   * Once per frame while the film runs, at its second `t`. The sound follows the picture: small drift is trimmed with
   * an inaudible change of the playback rate, a big one (the tab was in the background, the sound stalled) with one
   * jump. Returns the second the film should jump to when it is the picture that fell behind, else null.
   */
  follow(t) {
    if (!el) return null;
    setLevel(t);
    if (!on) return null;
    const m = musicAt(t);
    if (el.paused) {
      if (out && !refused && sounds(m)) place(t);      // the music comes in here
      return null;
    }
    if (!sounds(m)) { place(t); return null; }           // the music is over, the film is not
    if (el.readyState < 2 || el.seeking) return null;
    const d = el.currentTime - m;
    if (d > 0.3) { drift = 0; return el.currentTime - SOUND.start; }      // the picture fell behind: it catches up
    if (d < -0.3) { el.currentTime = m; drift = 0; return null; }         // the sound fell behind: it is pulled forward
    drift += (d - drift) * 0.04;
    const rate = Math.abs(drift) < 0.04 ? 1 : drift > 0 ? 0.985 : 1.015;
    if (el.playbackRate !== rate) el.playbackRate = rate;
    return null;
  },
};

/**
 * Other settings — what src/sound.js exports — come into force at once: another file, another place, another level.
 * `anew`: the file was replaced under the same name and has to be read again.
 */
export function showSound(next, anew = false) {
  const s = soundSettings(next), swap = anew || s.src !== SOUND.src, moved = swap || s.start !== SOUND.start;
  SOUND = s;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sound-shown', { detail: s }));      // (the dev server's video tool names the music)
  if (s.off) {      // тишина, и файл-ролик молчит: музыку убрали в src/sound.js
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); el = null; }
    level = -1; out = false;
    return;
  }
  if (!el) { el = makeEl(); level = -1; place(filmTime()); return; }      // музыка вернулась: элемент делается заново
  if (swap) {
    el.pause();
    // (a browser keeps the sound it has played by address: a file replaced under its name is asked for under another)
    el.src = urlOf(s.src) + (anew ? `${s.src.includes('?') ? '&' : '?'}anew=${Date.now()}` : '');
    el.load();      // where it stands is settled again once its length is known
  }
  if (moved) place(filmTime()); else setLevel(filmTime());           // a level alone does not make the music skip
}
/** What src/sound.js exports now, and who is told when it changes (the sound tool takes that over: it may hold settings that are not saved yet). */
export const soundFile = { raw, changed: (next) => showSound(next) };
if (import.meta.hot) {
  import.meta.hot.accept('../sound.js', (mod) => {
    if (!mod) return;      // the file does not parse: the page says so, the sound stays
    soundFile.raw = mod.default;
    soundFile.changed(mod.default);
  });
}
