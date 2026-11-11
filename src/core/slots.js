// Windows as slots: any photo or video can be put into any footage window (settings: src/media.js).
//
// A placeholder still is a picture in the texture space of ITS OWN window, cut from the reference video. Custom media
// is fitted instead: it covers a box ("object-fit: cover") and x / y / zoom / rotate place it — like CSS
// object-position, so no setting can open a gap at the window's edge. The box is the part of the window that the
// picture ever shows (the camera often flies so close that a window is never seen whole); with `fixed` it is the
// picture itself, and the window is a cut-out over media that stays put on the screen. `to` moves the numbers slowly
// while the window is on screen. Videos follow the film's clock: they play while the film plays, stand still while it
// is paused, and seek with it.

import settings from '../media.js';
import { FPS, VIDEO_W, VIDEO_H, clamp, lerp } from './util.js';

/** Slot ids in the order the windows appear -> name of the screen in the shot data (and of the placeholder still). */
export const SLOTS = {
  w01: 'workers', w02: 'closeup', w03: 'plant', w04: 'substation', w05: 'lineman', w06: 'helmet',
  w07: 'field', w08: 'pylons', w09: 'cabinet', w10: 'youngman', w11: 'turbines',
};
const ID = Object.fromEntries(Object.entries(SLOTS).map(([id, name]) => [name, id]));
/**
 * Windows whose media is `fixed` unless its line says otherwise: w04 fills the whole picture and the camera flies
 * close over it, so media pinned to the window would only ever show a strongly enlarged, sliding piece of itself.
 */
const FIXED = { w04: true };
export const fixedByDefault = (id) => !!FIXED[id];

/** The settings of media.js by screen name (lines without a file or for a window that does not exist are skipped). */
function choose(all, warn) {
  const out = {};
  for (const [key, cfg] of Object.entries(all || {})) {
    if (!cfg || !cfg.src) continue;
    if (!SLOTS[key]) { if (warn) console.warn(`media.js: no window "${key}" (use w01 … w11)`); continue; }
    out[SLOTS[key]] = cfg;
  }
  return out;
}
const chosen = choose(settings, true);
/**
 * `?card` in the address: every window shows a 16:9 test card instead of its picture, placed by the window's own
 * settings — the quickest way to see which part of a horizontal frame each window takes.
 */
export const CARD = typeof location !== 'undefined' && new URLSearchParams(location.search).has('card');
/** Settings of the custom media for a screen, or null (placeholder still). */
export const mediaFor = (name) => chosen[name] || (CARD ? {} : null);
export const isVideo = (src) => /\.(mp4|webm|m4v|mov|ogv)([?#].*)?$/i.test(src);

/**
 * How media of shape `aspect` (width / height) lies over a box W × H that it covers ("object-fit: cover") at the zoom
 * and rotation of `p`: the linear part [a, b; c, d] of the map from box uv (0..1, x right, y down) to media uv, and
 * the range its focus point may take without uncovering a corner of the box (x0..x1 across, y0..y1 down, media uv).
 */
export function fitParts(W, H, aspect, p) {
  const th = (p.rotate * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
  // half-extents of the box along the media's own axes: the (rotated) media must reach that far from its focus
  const hw = (Math.abs(c) * W + Math.abs(s) * H) / 2, hh = (Math.abs(s) * W + Math.abs(c) * H) / 2;
  const Hm = Math.max(2 * hh, (2 * hw) / aspect) * Math.max(1, p.zoom), Wm = Hm * aspect;      // size of the media, box units
  return { a: (c * W) / Wm, b: (s * H) / Wm, c: (-s * W) / Hm, d: (c * H) / Hm, x0: hw / Wm, x1: 1 - hw / Wm, y0: hh / Hm, y1: 1 - hh / Hm };
}

/**
 * Affine map [a, b, c, d, tx, ty] from the window's box (uv 0..1, x right, y down) to media uv:
 * media = (a*u + b*v + tx, c*u + d*v + ty). W, H = size of the box, aspect = media width / height.
 */
export function fitMatrix(W, H, aspect, p) {
  const m = fitParts(W, H, aspect, p);
  const fx = lerp(m.x0, m.x1, clamp(p.x)), fy = lerp(m.y0, m.y1, clamp(p.y));
  return [m.a, m.b, m.c, m.d, fx - (m.a + m.b) / 2, fy - (m.c + m.d) / 2];
}

const registry = {};      // screen name -> { id, name, f0, f1, aspect, tilt, box, kind, src, cfg, place, fixed, video, users }
if (typeof window !== 'undefined') window.__slots = registry;
/** The windows by screen name (read by the placement tool of the dev server and by the checking tools). */
export const slots = registry;

const number = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
const placeKey = (o, d) => ({ x: number(o.x, d.x), y: number(o.y, d.y), zoom: number(o.zoom, d.zoom), rotate: o.rotate === 'level' ? 'level' : number(o.rotate, d.rotate) });
/** Settings -> the placement as live values: where it starts (`base`) and, with a `to` move, where it ends (`end`). */
function placeOf(cfg) {
  const base = placeKey(cfg, { x: 0.5, y: 0.5, zoom: 1, rotate: 0 });
  return { base, end: cfg.to && typeof cfg.to === 'object' ? placeKey(cfg.to, base) : null };
}

/** The placement { x, y, zoom, rotate } of a window's own media at frame f (rotate in degrees, 'level' resolved). */
export function placeAt(r, f) {
  const { base, end } = r.place;
  const angle = (v) => (v === 'level' ? (r.fixed ? 0 : -r.tilt) : Number(v) || 0);
  if (!end) return { x: base.x, y: base.y, zoom: base.zoom, rotate: angle(base.rotate) };
  const t = clamp((f - r.f0) / Math.max(1, r.f1 - r.f0));
  return { x: lerp(base.x, end.x, t), y: lerp(base.y, end.y, t), zoom: lerp(base.zoom, end.zoom, t), rotate: lerp(angle(base.rotate), angle(end.rotate), t) };
}

/** Pins a window's media to the picture (`fixed`) or to the window. */
export function setFixed(r, on) {
  r.fixed = !!on;
  for (const u of r.users) if (u.own) u.ask.fixed(r.fixed);
}

/**
 * Called by every shot for every screen it shows; `range` = frames the window's picture is on, `primary` = the window
 * is this shot's main one (a window shared by two shots takes its tilt and shape from there). `ask`:
 *   span     the shot's own frames [first, last]
 *   part(pre, post)   [u0, u1, v0, v1] — the part of the window, in the screen's own uv, that this shot ever has in
 *            the picture, counting `pre` / `post` frames before / after its span
 *   frames() [first, last] frame of the shot at which the window, with its picture on, is in the frame at all; or null
 *   shape(b) width / height of such a uv box in the shot's world
 *   tilt()   how far the window's x axis is turned on the screen, degrees clockwise
 *   apply(b) point the shot's screen rectangle at the uv box (custom media only)
 *   fixed(on) switch the shot's shader between media pinned to the picture and media pinned to the window
 *   uv(f, x, y), inside(u, v), centre(f)   picking, for the placement tool (see shots/shot.js)
 * Returns the per-frame fit [a, b, c, d, tx, ty] for custom media, or null. Valid once finishSlots() has run.
 */
export function registerSlot(name, range, primary, media, ask) {
  const r = registry[name] || (registry[name] = { id: ID[name] || name, name, f0: range[0], f1: range[1], aspect: 1, tilt: 0, kind: 'placeholder', users: [] });
  r.f0 = Math.min(r.f0, range[0]); r.f1 = Math.max(r.f1, range[1]);
  r.users.push({ primary, ask, own: !!media });
  if (!media) return null;
  const cfg = media.cfg, aspect = media.width / media.height;
  r.kind = media.kind; r.src = cfg.src; r.cfg = cfg; r.shape = aspect;
  if (media.video && !r.video) r.video = media.video;
  // `fixed`: the media covers the picture, not the window — the window is a cut-out over it and the camera's flight
  // does not move it (background-attachment: fixed, in CSS terms)
  r.fixed = cfg.fixed ?? FIXED[r.id] ?? false;
  // the placement is kept as live values: on the dev server they change under a running film — when media.js is
  // edited (below) and in the placement tool
  if (!r.place) r.place = placeOf(cfg);
  const fit = (f) => fitMatrix(r.fixed ? VIDEO_W / VIDEO_H : r.aspect, 1, aspect, placeAt(r, f));
  fit.fixed = r.fixed;
  return fit;
}

/**
 * Once every shot is built and linked: the frames each window is really on screen, and its box — the part of it that
 * the picture ever shows, in all the shots it appears in — with its shape and tilt. Media is fitted to that box, so `x: 0` puts the left edge of the
 * media at the leftmost point of the window that is ever seen, not at a corner that stays outside the frame.
 */
export function finishSlots(links = []) {
  // at a linked border both shots are drawn for `n` frames on either side of it (the dissolve)
  const overlap = (f) => { const l = links.find((k) => k && k.at === f); return l ? l.n + 1 : 0; };
  for (const r of Object.values(registry)) {
    const box = [Infinity, -Infinity, Infinity, -Infinity];
    let f0 = Infinity, f1 = -Infinity;
    for (const u of r.users) {
      const b = u.ask.part(overlap(u.ask.span[0]), overlap(u.ask.span[1] + 1));
      box[0] = Math.min(box[0], b[0]); box[1] = Math.max(box[1], b[1]); box[2] = Math.min(box[2], b[2]); box[3] = Math.max(box[3], b[3]);
      const fr = u.ask.frames();
      if (fr) { f0 = Math.min(f0, fr[0]); f1 = Math.max(f1, fr[1]); }
    }
    // the window's time on screen: a shot may go on long after a window has left the frame (w08 in s12), and a `to`
    // move or a video should not spend itself there
    if (f1 >= f0) { r.f0 = f0; r.f1 = f1; }
    const du = (box[1] - box[0]) * 0.02, dv = (box[3] - box[2]) * 0.02;      // a facet's bevel looks a little past its outline
    box[0] -= du; box[1] += du; box[2] -= dv; box[3] += dv;
    const main = r.users.find((u) => u.primary) || r.users[0];
    r.box = box; r.aspect = main.ask.shape(box); r.tilt = main.ask.tilt();
    for (const u of r.users) if (u.own) u.ask.apply(box);
  }
}

const TAIL = 16;      // frames a shot may still be on screen past its own range (the dissolve into the next one)

/**
 * Keeps the videos on the film's clock. Called once per rendered frame. `speed`: how fast that clock runs against
 * the wall clock — 1, unless frames take over 100 ms (the film then slows down rather than skip, and so do the videos).
 */
export function syncVideos(f, playing, speed = 1) {
  for (const r of Object.values(registry)) {
    const el = r.video;
    if (!el) continue;
    if (f < r.f0 - TAIL || f > r.f1 + TAIL) { if (!el.paused) el.pause(); continue; }      // its window is far away
    const rate = r.cfg.rate ?? 1, dur = el.duration, start = r.cfg.start ?? 0;
    let t = start + (Math.max(0, f - r.f0) / FPS) * rate;
    const loop = r.cfg.loop !== false && Number.isFinite(dur) && dur > 0.2;
    if (loop) t %= dur; else if (Number.isFinite(dur)) t = Math.min(t, Math.max(0, dur - 0.05));
    let off = el.currentTime - t;
    if (loop) off -= Math.round(off / dur) * dur;
    if (playing && f >= r.f0) {
      if (el.paused) {
        if (Math.abs(off) > 0.05) el.currentTime = t;
        el.playbackRate = clamp(rate * speed, 0.1, 4); r.trim = false;
        el.play().catch(() => {});
      } else if (Math.abs(off) > 0.5) { if (!el.seeking) el.currentTime = t; }      // far off (the tab slept, a stall): one jump
      else {
        // otherwise the video is steered, not jumped: it runs a little slower or faster until it is back on the clock
        if (Math.abs(off) > 0.04) r.trim = true; else if (Math.abs(off) < 0.01) r.trim = false;
        const want = clamp(rate * speed * (r.trim ? clamp(1 - 1.2 * off, 0.6, 1.4) : 1), 0.1, 4);
        if (Math.abs(el.playbackRate - want) > 0.01) el.playbackRate = want;
      }
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(off) > 0.02 && !el.seeking) el.currentTime = t;
    }
  }
}

// Dev server: an edit of media.js that only moves pictures (x, y, zoom, rotate, to, fixed) shows at once, under the
// running film. Anything else — another file, a video's timing — loads the page again.
if (import.meta.hot) {
  const PLACING = ['x', 'y', 'zoom', 'rotate', 'to', 'fixed'];
  const rest = (cfg) => JSON.stringify(Object.keys(cfg).filter((k) => !PLACING.includes(k)).sort().map((k) => [k, cfg[k]]));
  const applySettings = (next) => {
    const want = choose(next, false);
    for (const name of new Set([...Object.keys(chosen), ...Object.keys(want)])) {
      if (!chosen[name] || !want[name] || rest(chosen[name]) !== rest(want[name])) return false;
    }
    for (const [name, cfg] of Object.entries(want)) {
      chosen[name] = cfg;
      const r = registry[name];
      if (!r || !r.place) continue;      // its file did not load: the placeholder is on
      r.cfg = cfg; r.place = placeOf(cfg);
      setFixed(r, cfg.fixed ?? FIXED[r.id] ?? false);
    }
    return true;
  };
  import.meta.hot.accept('../media.js', (mod) => {
    if (mod && applySettings(mod.default)) window.dispatchEvent(new Event('media-settings'));
    else location.reload();
  });
}

// nothing is drawn while the tab is hidden: the videos must not run on meanwhile (they resume with the next frame)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) for (const r of Object.values(registry)) if (r.video && !r.video.paused) r.video.pause();
  });
}
