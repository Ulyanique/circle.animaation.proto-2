// Asset loading: what the windows show (placeholder stills, or the photos / videos chosen in src/media.js) and the
// soundtrack.

import * as THREE from 'three';
import { mediaFor, isVideo, CARD } from './slots.js';

const base = import.meta.env.BASE_URL;
const MAX_SIDE = 4096;      // longer side of a photo on the GPU (every WebGL 2 device takes it; 50 MB with its mip-maps)
/** `src` of media.js -> address: a file under public/, or a full address (its server must allow cross-origin use). */
const urlOf = (src) => (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(src) ? src : base + src.replace(/^\.?\//, ''));

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

/** A photo from public/ (src/media.js). Resolves to null if it cannot be loaded — the placeholder then stays. */
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
    }, undefined, () => { console.warn(`media.js: cannot load ${cfg.src} — the placeholder is shown instead`); resolve(null); });
  });
}

/**
 * A video (src/media.js): muted, parked on the frame its window opens with, driven later by core/slots.js.
 * Resolves to null if it cannot be played — the placeholder then stays.
 */
function loadVideo(cfg) {
  const el = document.createElement('video');
  el.muted = true; el.defaultMuted = true; el.playsInline = true;
  el.setAttribute('muted', ''); el.setAttribute('playsinline', '');      // what iOS looks at
  el.preload = 'auto'; el.crossOrigin = 'anonymous'; el.disableRemotePlayback = true;
  el.loop = cfg.loop !== false;
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true; clearTimeout(timer);
      el.pause();
      if (!ok || !el.videoWidth) { console.warn(`media.js: cannot play ${cfg.src} — the placeholder is shown instead`); resolve(null); return; }
      const t = new THREE.VideoTexture(el);
      t.colorSpace = THREE.SRGBColorSpace;
      // mip-mapped like the photos (three.js leaves videos unfiltered by default): a window is often smaller than the
      // video or seen at an angle, and fine detail would shimmer
      t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.anisotropy = 16;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.userData.media = { kind: 'video', cfg, video: el, width: el.videoWidth, height: el.videoHeight };
      resolve(t);
    };
    // a slow connection must not hold the film back for ever: with the size known the video is taken as it is and
    // its window stays dark until the first frame arrives
    const timer = setTimeout(() => finish(el.readyState >= 1), 12000);
    el.addEventListener('loadeddata', () => {
      el.pause();
      const start = cfg.start ?? 0;      // the frame the window opens with must be decoded before the film starts
      if (start > 0.01) { el.addEventListener('seeked', () => finish(true), { once: true }); el.currentTime = start; } else finish(true);
    }, { once: true });
    el.addEventListener('error', () => finish(false), { once: true });
    el.src = urlOf(cfg.src);
    el.load();
    el.play()?.catch(() => {});      // phones fetch nothing but the header until a video is asked to play
  });
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

function loadTexture(loader, url) {
  return new Promise((resolve) => {
    loader.load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 16;      // the windows are seen at grazing angles; the renderer clamps this to what the GPU can do
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      resolve(t);
    }, undefined, () => resolve(null));
  });
}

/** `toGpu(texture)`: puts a texture on the GPU at once — with it a photo's canvas is given back as soon as it is there. */
export async function loadAssets(names, toGpu = null) {
  upload = toGpu;
  const loader = new THREE.TextureLoader();
  const footage = {};
  await Promise.all(names.map(async (n) => {
    const cfg = mediaFor(n);
    const own = !cfg ? null : CARD ? makeCard(cfg) : await (isVideo(cfg.src) ? loadVideo(cfg) : loadPhoto(loader, cfg));
    footage[n] = own || await loadTexture(loader, `${base}footage/${n}.jpg`);
  }));
  // soundtrack of the original video; the player keeps it muted until the user turns the sound on
  const audio = new Audio(`${base}audio.m4a`);
  audio.preload = 'auto';
  audio.muted = true;
  return { footage, audio };
}
