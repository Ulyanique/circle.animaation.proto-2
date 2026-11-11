// Asset loading: footage stills and the soundtrack.

import * as THREE from 'three';

const base = import.meta.env.BASE_URL;

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
  await Promise.all(names.map(async (n) => { footage[n] = await loadTexture(loader, `${base}footage/${n}.jpg`); }));
  // soundtrack of the original video; the player keeps it muted until the user turns the sound on
  const audio = new Audio(`${base}audio.m4a`);
  audio.preload = 'auto';
  audio.muted = true;
  return { footage, audio };
}
