// «Янтарный циркуль» — real-time three.js recreation of the reference video (video.mp4).

import { Stage } from './core/stage.js';
import { DURATION, FPS, LAST_FRAME, clamp, smoother, timeToFrame, touch, touched } from './core/util.js';
import { loadAssets, restorePhotos } from './core/assets.js';
import { syncVideos, finishSlots } from './core/slots.js';
import { buildShots, linkShots, FOOTAGE } from './shots/index.js';
import { makeHero } from './fx/hero.js';
import { TITLE } from './fx/title.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const stageEl = $('stage');
const stage = new Stage($('view'));

// The one light that flies through the whole film (fx/hero.js). It lives in the stage's scene, not in a shot: the cuts
// change the world around it, never the light.
const hero = makeHero();
stage.scene.add(hero.group);
stage.hero = hero;

/** Which lens flares of two linked shots are the same light (closest ones at the border frame): id <-> id. */
function pairFlares(link) {
  const grab = (shot) => {
    stage.resetFrame();
    shot.update(link.at, stage, (link.at - 1) / FPS);
    return stage.flares.filter((fl) => fl.id && fl.i > 0).map((fl) => ({ id: fl.id, x: fl.x, y: fl.y }));
  };
  const A = grab(link.a), B = grab(link.b), pairs = new Map();
  for (const a of A) {
    let best = null, bd = 120;      // px: farther apart = two different lights (they simply cross-fade)
    for (const b of B) { const d = Math.hypot(a.x - b.x, a.y - b.y); if (!pairs.has(b.id) && d < bd) { bd = d; best = b; } }
    if (best) { pairs.set(a.id, best.id); pairs.set(best.id, a.id); }
  }
  return pairs;
}

const HERO_FLARE = 0.5;      // strength of the lens flare on the hero light

let holding = false;
const player = {
  time: 0,
  playing: false,
  speed: 1,      // how fast `time` runs against the wall clock: 1, unless frames take over 100 ms (see the clock below)
  sound: false,
  shots: [],
  links: [],
  current: null,
  audio: null,
  renders: 0,     // frames drawn so far (the checking tools read it)
  live: false,    // a video is showing in a window: the picture changes on its own
  // Someone else draws the frames, at a size of its own (dev server: the video file): the loop below stands by.
  // The moment the picture is given back it is laid out for the window again — at once, not by the loop, which is at
  // rest while the tab is out of sight.
  get hold() { return holding; },
  set hold(on) {
    const was = holding;
    holding = !!on;
    if (was && !holding) layout();
  },

  shotAt(f) {
    const s = this.shots;
    for (let i = s.length - 1; i >= 0; i--) if (f >= s[i].range[0]) return s[i];
    return s[0];
  },

  /** Render the frame for a given (fractional, 1-based) video frame number. */
  renderAt(f) {
    f = clamp(f, 1, LAST_FRAME);
    this.renders++;
    // videos in the windows run on the film's clock; while someone draws the frames for a file, that one has put
    // each of them on its frame already (settleVideos) and they are left alone
    this.live = this.hold ? false : syncVideos(f, this.playing, this.speed);
    const shot = this.shotAt(f);
    if (shot !== this.current) {
      if (this.current) this.current.group.visible = false;
      shot.group.visible = true;
      this.current = shot;
    }
    stage.resetFrame();
    const time = (f - 1) / FPS;
    const light = hero.update(f, time, stage);
    // Linked border (the film flies through it without a cut): draw the neighbouring shot along the same camera move
    // and dissolve between the two, instead of switching worlds within one frame.
    const link = this.links.find((l) => Math.abs(f - l.at) < l.n);
    const other = link && (shot === link.b ? link.a : link.b);
    const wB = link ? smoother((f - (link.at - link.n)) / (2 * link.n)) : 0;      // share of the incoming shot
    const mix = link ? (shot === link.b ? 1 - wB : wB) : 0;                       // share of the neighbour
    if (mix > 0.004) {
      link.pairs ??= pairFlares(link);
      let flares, post;
      stage.renderUnder(mix, () => {
        shot.group.visible = false; other.group.visible = true;
        other.update(f, stage, time);
        flares = stage.flares.filter((fl) => fl.id).map((fl) => ({ ...fl }));
        post = { ...stage.post };
      });
      other.group.visible = false; shot.group.visible = true;
      stage.resetFrame();
      stage.underMix = mix;
      shot.update(f, stage, time);
      // Lens flares and grading belong to the picture, so they are handed over with the same weights. A flare that both
      // shots have (the streak head: each shot tracks it on its own side of the border) becomes one flare gliding from
      // one track to the other; the rest simply fade.
      for (const fl of stage.flares) {
        if (!fl.id) continue;
        const o = flares.find((o) => o.id === link.pairs.get(fl.id));
        if (o) {
          o.used = true;
          for (const k of ['x', 'y', 'i', 's', 'ring', 'ghost', 'rays']) fl[k] += (o[k] - fl[k]) * mix;
        } else fl.i *= 1 - mix;
      }
      const rest = flares.filter((o) => !o.used && o.i > 0);
      for (const fl of stage.flares) if (!fl.id && rest.length) { Object.assign(fl, rest.shift()); fl.i *= mix; }
      for (const k of ['exposure', 'flash', 'bloom']) stage.post[k] += (post[k] - stage.post[k]) * mix;
    } else {
      shot.update(f, stage, time);
    }
    if (light.active) {
      // the lens flare of the hero light; it dims while the light is behind a shard
      let fl = null;
      for (let k = stage.flares.length - 1; k >= 0 && !fl; k--) if (!stage.flares[k].id && !(stage.flares[k].i > 0)) fl = stage.flares[k];
      if (fl) {
        fl.id = 'hero'; fl.x = light.x; fl.y = light.y; fl.i = HERO_FLARE * light.gain * (0.25 + 0.75 * light.vis); fl.s = 0.8 * light.size;
        fl.ring = 0.35; fl.ghost = 0.08; fl.rays = 0.8; fl.rot = time * 0.15;
      }
    }
    if (f >= LAST_FRAME) stage.post.fade = 0; // the video ends on a black frame
    stage.render(time);
  },

  seek(t) {
    this.time = clamp(t, 0, DURATION);
    if (this.audio) this.audio.currentTime = this.time;
    rememberFrame();
  },

  play() {
    if (this.time >= DURATION - 1e-3) this.seek(0);
    this.playing = true;
    if (this.audio && this.sound) { this.audio.currentTime = this.time; this.audio.play().catch(() => {}); }
    rememberFrame();
  },

  pause() {
    this.playing = false;
    this.audio?.pause();
    rememberFrame();
  },

  toggle() { this.playing ? this.pause() : this.play(); },

  /** Dev server: puts the paused frame into the address right now (the placement tool, before it reloads the page). */
  keepFrame() { rememberFrame(true); },

  setSound(on) {
    this.sound = on;
    if (!this.audio) return;
    this.audio.muted = !on;
    if (on && this.playing) { this.audio.currentTime = this.time; this.audio.play().catch(() => {}); }
    if (!on) this.audio.pause();
  },
};
window.__player = player;
window.__stage = stage;

// Dev server only: a paused film keeps its frame in the address (?f=…&paused), so the page comes back to the same
// picture when it reloads after an edit — that is how the media in the windows is placed (src/media.js).
let remembering = 0;
function rememberFrame(now = false) {
  if (!import.meta.env.DEV || window.__manual) return;
  clearTimeout(remembering);
  const write = () => {
    const rest = location.search.slice(1).split('&').filter((q) => q && !/^(f|t|paused)(=|$)/.test(q));
    const q = (player.playing ? rest : [`f=${Math.round(timeToFrame(player.time))}`, 'paused', ...rest]).join('&');
    const url = location.pathname + (q ? '?' + q : '') + location.hash;
    if (url !== location.pathname + location.search + location.hash) try { history.replaceState(null, '', url); } catch { /* the address is a convenience */ }
  };
  // once things settle: browsers limit how often the address may change (`now`: the page is about to be loaded again)
  if (now) write(); else remembering = setTimeout(write, 250);
}

// Render resolution: the device's own pixels, up to 3072x1728 (a 14-16" retina display in full screen). The footage
// stills come from a 720p source, but the shards, the light and the title are drawn, so they do gain from every
// pixel. `quality` is lowered by the frame-time governor in the tick loop when the GPU cannot hold the display rate
// (a steady lower resolution looks far better than a stuttering camera).
const MAX_PIXELS = 3072 * 1728;
let quality = 1;
let reserve = 0;      // dev server: this much of the window's right side is kept free of the film (setReserve)
function layout() {
  if (player.hold) return;      // (it is laid out again when the hold is over)
  const aspect = 16 / 9, boxW = window.innerWidth - reserve;
  const w = Math.min(boxW, window.innerHeight * aspect), h = w / aspect;
  let ratio = params.has('dpr') ? Number(params.get('dpr')) : Math.min(window.devicePixelRatio || 1, 3);
  if (!params.has('dpr')) ratio = Math.min(ratio, Math.sqrt(MAX_PIXELS / Math.max(1, w * h))) * quality;
  stage.resize(boxW, window.innerHeight, ratio);
  touch();
}
/** Dev server: the film leaves `px` at the right of the window free — a tool's panel stands there, beside the picture. */
function setReserve(px) {
  if (px === reserve) return;
  reserve = px;
  stageEl.style.right = px ? `${px}px` : '';
  layout();
}
window.addEventListener('resize', layout);
document.addEventListener('visibilitychange', touch);      // a tab that comes back may have lost its picture
layout();

// ---- HUD ------------------------------------------------------------------------------------
const playBtn = $('play'), seekEl = $('seek'), clockEl = $('clock'), soundBtn = $('sound');
let hudTimer = 0;
function showHud() {
  stageEl.classList.add('show-hud');
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => { if (player.playing) stageEl.classList.remove('show-hud'); }, 2200);
}
function syncHud() {
  playBtn.classList.toggle('paused', !player.playing);
  soundBtn.classList.toggle('on', player.sound);
  if (document.activeElement !== seekEl) seekEl.value = String(Math.round((player.time / DURATION) * 1000));
  const s = Math.floor(player.time);
  clockEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
window.addEventListener('pointermove', showHud);
$('view').addEventListener('click', () => { player.toggle(); showHud(); });
playBtn.addEventListener('click', () => { player.toggle(); showHud(); });
soundBtn.addEventListener('click', () => { player.setSound(!player.sound); showHud(); });
seekEl.addEventListener('input', () => { player.seek((Number(seekEl.value) / 1000) * DURATION); showHud(); });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); player.toggle(); }
  else if (e.code === 'KeyM') player.setSound(!player.sound);
  else if (e.code === 'KeyB') setScope(!scope);
  else if (e.code === 'ArrowRight') player.seek(player.time + (e.shiftKey ? 1 / FPS : 1));
  else if (e.code === 'ArrowLeft') player.seek(player.time - (e.shiftKey ? 1 / FPS : 1));
  else return;
  showHud();
});

// ---- cinema bars (2.39:1), off by default: `?scope` in the address or the B key ---------------------
let scope = params.has('scope');
function setScope(on) { scope = on; stage.final.uniforms.uBars.value = on ? (1 - (16 / 9) / 2.39) / 2 : 0; touch(); }
setScope(scope);

// ---- boot -----------------------------------------------------------------------------------
stage.renderer.domElement.addEventListener('webglcontextrestored', () => { restorePhotos(); touch(); });      // after three.js's own listener
loadAssets(FOOTAGE, (t) => stage.renderer.initTexture(t), { emblem: TITLE.image }).then((assets) => {
  player.shots = buildShots(assets, stage);
  player.links = linkShots(player.shots);
  finishSlots(player.links);      // what each window shows of itself is known only now, with the flights linked
  for (const s of player.shots) stage.scene.add(s.group);
  player.audio = assets.audio;
  if (player.audio) player.audio.preservesPitch = false;      // tiny rate trims must not go through a time-stretcher

  // Warm-up behind the loading screen: compile every shader, upload every texture and draw every shot once.
  // Otherwise the first frame of each shot stalls for a moment and the flight visibly hitches at every cut.
  // (`?nowarm` skips it — used by the frame-by-frame capture tools, where a stall does not matter.)
  if (!params.has('nowarm')) {
    try {
      // shaders and textures do not care about the picture size: warm up on a thumbnail (a weak GPU would otherwise
      // spend seconds on two dozen full-size frames nobody sees)
      stage.resize(window.innerWidth, window.innerHeight, Math.min(1, 160 / Math.max(1, window.innerWidth)));
      for (const t of Object.values(assets.footage)) if (t) stage.renderer.initTexture(t);
      stage.renderer.compile(stage.scene, stage.camera);
      for (const s of player.shots) player.renderAt((s.range[0] + s.range[1]) / 2);
      for (const l of player.links) player.renderAt(l.at);      // the dissolve path (second buffer, mix pass) as well
    } catch (e) { console.warn('warm-up failed', e); }
    layout();
  }
  $('loading').classList.add('hidden');
  $('stage').classList.remove('booting');      // the picture fades in from black

  if (params.has('f')) player.time = (Number(params.get('f')) - 1) / FPS;
  else if (params.has('t')) player.time = Number(params.get('t'));
  const manual = params.has('f') || params.has('t') || params.has('paused');
  if (!manual) player.play();
  showHud();

  // ---- clock ----------------------------------------------------------------------------------
  // The picture always advances by the display's own frame time (requestAnimationFrame), which is perfectly
  // even. The soundtrack follows the picture: HTMLMediaElement.currentTime only updates in coarse, uneven
  // steps, so driving the camera from it makes the motion judder. Small drift is trimmed with an inaudible
  // playback-rate change; a big one (tab was in the background, audio stalled) is fixed with one jump.
  //
  // A paused film is a still picture, and pictures are placed in their windows with the film paused, for minutes on
  // end: drawing it at the display's rate all that time would keep the GPU — and a laptop's fan — busy for nothing.
  // So a paused film is drawn when something has changed (the frame, or anything that calls touch()): three frames,
  // and one more a moment later for whatever arrives late. A video showing in a window keeps it drawing.
  let last = performance.now();
  let drift = 0;                 // smoothed (audio - picture), s
  let slow = 0, fastFrames = 0;  // frame-time governor state
  let shown = -1, seen = -1;     // the frame and the touch() count that were drawn last
  let left = 0, lateAt = 0;      // frames still to draw; when to draw the late one (0 = it is drawn)
  function tick(now) {
    if (player.hold) {
      // the picture is not this loop's for now (once it is given back, layout() has it drawn anew)
      last = now;
      syncHud();
      if (!window.__manual) requestAnimationFrame(tick);
      return;
    }
    const raw = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.1, raw);
    last = now;
    if (player.playing) {
      player.time += dt;
      player.speed += ((raw > 0 ? dt / raw : 1) - player.speed) * (1 - Math.exp(-raw / 0.3));
      const a = player.audio;
      if (a && player.sound && !a.paused && a.readyState >= 2 && !a.seeking) {
        const d = a.currentTime - player.time;
        if (d > 0.3) { player.time = a.currentTime; drift = 0; }                 // picture fell behind: catch up
        else if (d < -0.3) { a.currentTime = player.time; drift = 0; }           // sound fell behind: pull it forward
        else {
          drift += (d - drift) * 0.04;
          const rate = Math.abs(drift) < 0.04 ? 1 : drift > 0 ? 0.985 : 1.015;
          if (a.playbackRate !== rate) a.playbackRate = rate;
        }
      }
      if (player.time >= DURATION) { player.time = DURATION; player.pause(); showHud(); }

      // frame-time governor: if the GPU cannot keep up (frames well over 16.7 ms for about a second), drop the
      // internal resolution one notch. It never goes back up, so it cannot oscillate.
      if (!params.has('dpr') && !window.__manual && raw < 0.25) {
        if (raw > 0.026) slow++; else fastFrames++;
        if (slow + fastFrames >= 90) {
          if (slow > 45 && quality > 0.45) { quality *= 0.8; layout(); }
          slow = fastFrames = 0;
        }
      }
    }
    const f = timeToFrame(player.time), stamp = touched();
    if (player.playing || f !== shown || stamp !== seen) { left = 3; lateAt = now + 300; }
    const late = lateAt > 0 && now >= lateAt;
    if (left > 0 || late || player.live) {
      player.renderAt(f);
      shown = f; seen = stamp; left--;
      if (late) lateAt = 0;
    }
    syncHud();
    if (!window.__manual) requestAnimationFrame(tick);
  }
  window.__ready = true;
  requestAnimationFrame(tick);

  // Dev server only: the placement tool (key E, or ?edit) — drag a picture inside its window and save its line —
  // the title tool (key T, or ?title) — type the caption, drop a logo, save src/brand.js — and the video tool
  // (key V, or ?video) — the film as it stands, saved as a video file
  if (import.meta.env.DEV && !window.__manual) {
    Promise.all([import('./dev/placer.js'), import('./dev/titler.js'), import('./dev/exporter.js')]).then(([placer, titler, exporter]) => {
      placer.startPlacer(player, params.has('edit'));
      titler.startTitler(player, stage, params.has('title'), setReserve);
      exporter.startExporter(player, stage, params.has('video'));
    });
  }
});
