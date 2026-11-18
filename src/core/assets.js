// Asset loading: what the windows show (the photos / videos chosen in src/media.js) and the picture that stands for
// the emblem of the final title (src/brand.js). (The soundtrack: core/soundtrack.js.)
//
// There is no still to fall back on: a window whose media has not arrived yet is bare glass, dark, and takes the cut
// as soon as it can be played (see loadVideo's `late`).

import * as THREE from 'three';
import { mediaFor, isVideo, CARD } from './slots.js';

const base = import.meta.env.BASE_URL;
const MAX_SIDE = 4096;      // longer side of a photo on the GPU (every WebGL 2 device takes it; 50 MB with its mip-maps)
/** `src` of media.js or sound.js -> address: a file under public/, or a full address (its server must allow cross-origin use). */
export const urlOf = (src) => (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(src) ? src : base + src.replace(/^\.?\//, ''));

// Own photos reach the GPU through a 2D canvas, which makes every browser show the same picture:
//   · in sRGB — three.js asks WebGL to take pixel values as they are, so a photo tagged Display P3 (phones) or
//     Adobe RGB (cameras) would come out duller than it is; drawn on a canvas, it is converted as on any web page;
//   · upright — a phone or camera stores "turn me a quarter" in EXIF, and not every browser's WebGL looks at it;
//   · no bigger than the film can use.
// The canvas is emptied as soon as its picture is on the GPU, one photo at a time: a dozen 10-megapixel canvases at
// once are more than a phone will give. After a lost WebGL context the photos are developed again (restorePhotos).
const photos = [];      // { texture, img } of the photos in the windows
let upload = null;      // puts a texture on the GPU at once (given to loadAssets)

/** <img> -> texture.image; returns the size the picture has there. */
function develop(texture, img) {
  let im = img, w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  do {
    // a 24-megapixel original would cost 100+ MB of video memory and upload time for nothing: scale it down
    // (by halves, then the rest — one big step would alias in browsers that only filter bilinearly; and no step
    // bigger than 16 megapixels: phones give a canvas no more)
    const k = Math.min(1, Math.max(0.5, MAX_SIDE / Math.max(w, h)), Math.sqrt(16e6 / (w * h)));
    const c = document.createElement('canvas');
    c.width = w = Math.max(1, Math.round(w * k)); c.height = h = Math.max(1, Math.round(h * k));
    const g = c.getContext('2d', { alpha: false });      // a see-through PNG shows over black, the same everywhere
    g.imageSmoothingQuality = 'high';
    g.drawImage(im, 0, 0, w, h);
    if (im !== img) im.width = im.height = 0;
    im = c;
  } while (Math.max(w, h) > MAX_SIDE);
  texture.image = im;
  texture.needsUpdate = true;
  if (upload) { upload(texture); im.width = im.height = 0; }
  return [w, h];
}

/** The WebGL context was lost and is back: the photos' canvases are long empty, so make them again. */
export function restorePhotos() {
  for (const p of photos) { try { develop(p.texture, p.img); } catch (e) { console.warn('photo not restored', e); } }
}

/** A photo from public/ (src/media.js). Resolves to null if it cannot be loaded — the window then stays bare. */
function loadPhoto(loader, cfg) {
  return new Promise((resolve) => {
    loader.load(urlOf(cfg.src), (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 16;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      const img = t.image, [width, height] = develop(t, img);
      photos.push({ texture: t, img });
      t.userData.media = { kind: 'photo', cfg, width, height };
      resolve(t);
    }, undefined, () => { console.warn(`media.js: cannot load ${cfg.src} — the window stays bare`); resolve(null); });
  });
}

/**
 * A video (src/media.js): muted, parked on the frame its window opens with, driven later by core/slots.js.
 * Resolves to null if it cannot be played — the window then stays bare.
 * The returned promise also carries `late()`: see below, it hands the cut over once it has arrived.
 */
function loadVideo(cfg) {
  const el = document.createElement('video');
  el.muted = true; el.defaultMuted = true; el.playsInline = true;
  el.setAttribute('muted', ''); el.setAttribute('playsinline', '');      // what iOS looks at
  el.preload = 'auto'; el.crossOrigin = 'anonymous'; el.disableRemotePlayback = true;
  el.loop = cfg.loop !== false;
  let settle = () => {};      // defined below: parks the video on the frame its window opens with
  /**
   * The film is not held back by a cut that has not arrived, but the cut is not given up on either: until the film
   * starts the window is bare and takes the cut as soon as it can be played — a window is often half a minute of film
   * away, and its cut may still be on the way.
   * A video that cannot be played at all (a 404, a codec the browser has none of) is a different matter: `late()`
   * gives up on it after the browser has said so, so it is not met again at every frame.
   */
  let done = false, texture = null, handedOver = false;
  const take = () => {
    if (texture || !el.videoWidth) return null;
    el.pause();
    const t = new THREE.VideoTexture(el);
    t.colorSpace = THREE.SRGBColorSpace;
    // mip-mapped like the photos (three.js leaves videos unfiltered by default): a window is often smaller than the
    // video or seen at an angle, and fine detail would shimmer
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = 16;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    // `fresh()`: the frame the video stands on is taken at the next draw (core/slots.js, settleVideos)
    t.userData.media = { kind: 'video', cfg, video: el, width: el.videoWidth, height: el.videoHeight, fresh: () => { t.needsUpdate = true; } };
    texture = t;
    return t;
  };
  /** Parks the video on its opening frame, then hands it over (`onReady`) — or calls `onFail` if it cannot be played. */
  const park = (onReady, onFail) => {
    el.pause();
    const start = cfg.start ?? 0;
    if (start > 0.01 && Math.abs(el.currentTime - start) > 1e-3) {
      el.addEventListener('seeked', () => onReady(), { once: true });
      el.currentTime = start;
    } else onReady();
  };
  const promise = new Promise((resolve) => {
    const finish = (ok) => {
      if (done) return;
      done = true; clearTimeout(timer);
      el.pause();
      if (!ok || !el.videoWidth) { console.warn(`media.js: cannot play ${cfg.src} — the window stays bare`); resolve(null); return; }
      handedOver = true;
      resolve(take());
    };
    settle = () => park(() => finish(true), () => finish(false));
    // a slow connection must not hold the film back for ever: the window stays bare and the cut is adopted
    // later by `late()` (a video that is already showing a frame is good enough as it is)
    const timer = setTimeout(() => { if (el.readyState >= 1) finish(true); else { done = true; clearTimeout(timer); resolve(null); } }, 12000);
    el.addEventListener('loadeddata', () => { if (!done) settle(); }, { once: true });
    el.addEventListener('error', () => finish(false), { once: true });
    el.src = urlOf(cfg.src);
    el.load();
    el.play()?.catch(() => {});      // phones fetch nothing but the header until a video is asked to play
  });
  /**
   * The cut arrived after the film had started: `onReady(texture)` is called once it can stand on its opening frame.
   * Nothing is given up on meanwhile — the window stays bare for as long as it takes — and a file the
   * browser cannot play at all is simply never handed over (the window keeps the still for good).
   */
  promise.late = (onReady) => {
    if (handedOver) return;                       // the film got it already
    let seeking = false;
    const attempt = () => {
      if (handedOver || el.error) return;
      if (!el.videoWidth) return;                 // nothing decoded yet: the next event brings us back here
      const start = cfg.start ?? 0;
      if (start > 0.01 && Math.abs(el.currentTime - start) > 1e-3) {
        if (seeking) return;                      // one seek at a time
        seeking = true;
        el.addEventListener('seeked', () => { seeking = false; attempt(); }, { once: true });
        el.currentTime = start;
        return;
      }
      el.pause();
      handedOver = true;
      const t = take();
      if (t) onReady(t);
    };
    // a slow file fires these several times as more of it arrives; a file that never comes simply never fires them
    el.addEventListener('loadeddata', attempt);
    el.addEventListener('canplay', attempt);
    el.addEventListener('seeked', attempt);
    attempt();                                    // (it may be ready already)
  };
  return promise;
}

/** The test card of `?card`: a 16:9 frame with named squares (A1 … I16), a circle and a border. */
function makeCard(cfg) {
  const W = 1920, H = 1080, s = 120;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#e6e2d8'; g.fillRect(0, 0, W, H);
  g.font = '500 30px system-ui, "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let j = 0; j < H / s; j++) {
    for (let i = 0; i < W / s; i++) {
      if ((i + j) % 2) { g.fillStyle = '#d6d1c4'; g.fillRect(i * s, j * s, s, s); }
      g.fillStyle = '#4c483c'; g.fillText('ABCDEFGHI'[j] + (i + 1), (i + 0.5) * s, (j + 0.3) * s);
    }
  }
  g.strokeStyle = '#1e4696'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
  g.beginPath(); g.arc(W / 2, H / 2, H * 0.42, 0, 2 * Math.PI); g.stroke();
  g.strokeStyle = '#b4281e'; g.lineWidth = 16; g.strokeRect(8, 8, W - 16, H - 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.userData.media = { kind: 'card', cfg, width: W, height: H };
  return t;
}

const EMBLEM_SIDE = 1024;      // longer side of the emblem's picture on the GPU (on a 4K screen it is about that big)
const FULL_ADDRESS = /^([a-z][a-z0-9+.-]*:)?\/\//i;

/**
 * The picture that stands for the emblem of the final title (src/brand.js): an SVG, PNG or WebP with a see-through
 * background. Resolves to { texture, width, height, radius, uv: [u0, v0, u1, v1], dark }: the texture holds the picture
 * in linear light with its colour multiplied by alpha (so that its edges filter cleanly); the rest tells where its
 * inked part is (its box in texels and in uv, and how far the ink reaches from the middle of that box) and whether
 * it is a nearly black shape (the title then fills it with gold). Resolves to null if the picture cannot be used.
 * Used by loadAssets below and, on the dev server, when the settings change under the running film (shots/s17.js).
 */
export function loadEmblem(src, anew = false) {
  return new Promise((resolve) => {
    const fail = (why) => { console.warn(`brand.js: ${why} — the compass is shown instead`); resolve(null); };
    const img = new Image();
    if (FULL_ADDRESS.test(src)) img.crossOrigin = 'anonymous';
    img.onerror = () => fail(`cannot load the emblem ${src}`);
    img.onload = () => {
      try {
        const nw = img.naturalWidth || 300, nh = img.naturalHeight || 150;
        const vector = /\.svg([?#]|$)/i.test(src);       // drawn at any size it is asked for; a bitmap is only ever made smaller
        const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
        /**
         * The part (sx, sy, sw, sh) of the picture, drawn w × h -> its pixels: sRGB bytes, colour not multiplied by alpha.
         * The whole picture is drawn, placed so that the part fills the canvas: asked for the part outright (a source
         * rectangle), Chromium drew nothing of an SVG that declares no size of its own, only a viewBox.
         */
        const draw = (sx, sy, sw, sh, w, h) => {
          c.width = w; c.height = h;                     // (which also empties the canvas)
          g.imageSmoothingQuality = 'high';
          g.drawImage(img, -sx * w / sw, -sy * h / sh, nw * w / sw, nh * h / sh);
          return g.getImageData(0, 0, w, h).data;
        };
        // 1. A small draft shows where the ink is: a logo often sits somewhere on a much bigger see-through sheet.
        const dk = vector ? 512 / Math.max(nw, nh) : Math.min(1, 512 / Math.max(nw, nh));
        const dw = Math.max(1, Math.round(nw * dk)), dh = Math.max(1, Math.round(nh * dk));
        const draft = draw(0, 0, nw, nh, dw, dh);
        let bx0 = dw, by0 = dh, bx1 = -1, by1 = -1;
        for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) if (draft[(y * dw + x) * 4 + 3]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
        if (bx1 < 0) { fail(`the emblem ${src} is empty: every pixel of it is see-through`); return; }
        // 2. That part alone (with a draft pixel to spare on each side, on whole pixels of the picture: a bitmap that
        //    needs no scaling is then copied as it is), as big as the film can use.
        const sx = Math.max(0, Math.floor((bx0 - 1) * nw / dw)), sy = Math.max(0, Math.floor((by0 - 1) * nh / dh));
        const sw = Math.min(nw, Math.ceil((bx1 + 2) * nw / dw)) - sx, sh = Math.min(nh, Math.ceil((by1 + 2) * nh / dh)) - sy;
        const k = vector ? EMBLEM_SIDE / Math.max(sw, sh) : Math.min(1, EMBLEM_SIDE / Math.max(sw, sh));
        const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
        const px = draw(sx, sy, sw, sh, w, h);
        c.width = c.height = 0;
        const lin = new Float32Array(256), enc = new Uint8Array(4097);      // sRGB byte -> linear; linear (in 4096ths) -> sRGB byte
        for (let i = 0; i < 256; i++) { const v = i / 255; lin[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
        for (let i = 0; i <= 4096; i++) { const v = i / 4096; enc[i] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); }
        const out = new Uint8Array(w * h * 4);
        let x0 = w, y0 = h, x1 = -1, y1 = -1, ink = 0, light = 0;
        for (let y = 0; y < h; y++) {
          const row = (h - 1 - y) * w * 4;               // the texture's first row is the picture's bottom one
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4, a = px[i + 3];
            if (a === 0) continue;
            const o = row + x * 4, al = a / 255, r = lin[px[i]], gr = lin[px[i + 1]], b = lin[px[i + 2]];
            out[o] = enc[Math.round(r * al * 4096)]; out[o + 1] = enc[Math.round(gr * al * 4096)]; out[o + 2] = enc[Math.round(b * al * 4096)]; out[o + 3] = a;
            if (a > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
            ink += al; light += al * (0.2126 * r + 0.7152 * gr + 0.0722 * b);
          }
        }
        if (x1 < 0) { fail(`the emblem ${src} is too faint to be seen`); return; }
        // how far the ink reaches from the middle of its box: the title fits that circle, not the box, into its own
        // (a star or a round seal would come out small if their empty corners counted)
        const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
        let far = 0;
        for (let y = y0; y <= y1; y++) {
          const dy = Math.abs(y + 0.5 - cy) + 0.5;
          for (let x = x0; x <= x1; x++) {
            if (px[(y * w + x) * 4 + 3] <= 12) continue;
            const dx = Math.abs(x + 0.5 - cx) + 0.5, d = dx * dx + dy * dy;
            if (d > far) far = d;
          }
        }
        const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
        t.colorSpace = THREE.SRGBColorSpace;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
        t.needsUpdate = true;
        if (upload) upload(t);
        // nearly black and a shape (not a filled rectangle, like a photo): against the dark title it would not be seen
        const dark = light / ink < 0.03 && ink < 0.98 * (x1 - x0 + 1) * (y1 - y0 + 1);
        resolve({ texture: t, width: x1 - x0 + 1, height: y1 - y0 + 1, radius: Math.sqrt(far), uv: [x0 / w, (h - 1 - y1) / h, (x1 + 1) / w, (h - y0) / h], dark });
      } catch (e) { fail(`cannot read the emblem ${src} (${e.message})`); }
    };
    // `anew`: the file was replaced under the same name (dev server) — a page keeps the pictures it has shown by address
    img.src = urlOf(src) + (anew ? `${src.includes('?') ? '&' : '?'}anew=${Date.now()}` : '');
  });
}

/**
 * `toGpu(texture)`: puts a texture on the GPU at once — with it a photo's canvas is given back as soon as it is there.
 * `emblem`: the picture of the title's emblem, if src/brand.js names one.
 * `late`: screen name -> `late(onReady)` of a cut that had not arrived when the film started (see loadVideo); the
 * window is bare until it does.
 */
export async function loadAssets(names, toGpu = null, { emblem = null } = {}) {
  upload = toGpu;
  const loader = new THREE.TextureLoader();
  const footage = {}, late = {};
  const picture = emblem ? loadEmblem(emblem) : null;
  await Promise.all(names.map(async (n) => {
    const cfg = mediaFor(n);
    const video = !cfg || CARD || !isVideo(cfg.src) ? null : loadVideo(cfg);
    const own = !cfg ? null : CARD ? makeCard(cfg) : video ? await video : await loadPhoto(loader, cfg);
    if (video && !own) late[n] = video.late;      // (a cut that did arrive has nothing to hand over)
    // no still to fall back on: a window with nothing to show is bare glass, and takes its cut when `late` hands it over
    if (own) footage[n] = own;
  }));
  return { footage, emblem: await picture, late };
}
