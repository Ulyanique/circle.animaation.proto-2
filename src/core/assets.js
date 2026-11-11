// Asset loading: what the windows show (placeholder stills, or the photos / videos chosen in src/media.js) and the
// soundtrack.

import * as THREE from 'three';
import { mediaFor, isVideo, CARD } from './slots.js';

const base = import.meta.env.BASE_URL;
const MAX_SIDE = 4096;      // longer side of a photo on the GPU (every WebGL 2 device takes it; 50 MB with its mip-maps)
/** `src` of media.js -> address: a file under public/, or a full address (its server must allow cross-origin use). */
const urlOf = (src) => (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(src) ? src : base + src.replace(/^\.?\//, ''));

/** A photo from public/ (src/media.js). Resolves to null if it cannot be loaded — the placeholder then stays. */
function loadPhoto(loader, cfg) {
  return new Promise((resolve) => {
    loader.load(urlOf(cfg.src), (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 16;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      // a 24-megapixel original would cost 100+ MB of video memory and upload time for nothing: scale it down first
      // (by halves, then the rest — one big step would alias in browsers that only filter bilinearly)
      let im = t.image, w = im.width, h = im.height;
      while (Math.max(w, h) > MAX_SIDE) {
        const k = Math.max(0.5, MAX_SIDE / Math.max(w, h));
        const c = document.createElement('canvas');
        c.width = w = Math.max(1, Math.round(w * k)); c.height = h = Math.max(1, Math.round(h * k));
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(im, 0, 0, w, h);
        im = c;
      }
      t.image = im;
      t.userData.media = { kind: 'photo', cfg, width: t.image.width, height: t.image.height };
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

export async function loadAssets(names) {
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
