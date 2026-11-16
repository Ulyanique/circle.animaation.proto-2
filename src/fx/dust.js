// Motes of dust in the air: tiny points that hang in the shot's world. The camera flies through them — the ones close
// to the lens drift past as big, faint out-of-focus discs, the far ones are sparks — which gives the flight depth and
// speed, the way dust in a beam of light does on film. They are depth-tested: shards in front hide them.

import * as THREE from 'three';
import { rng } from '../core/util.js';

const VERT = /* glsl */ `
attribute vec4 aSeed;                 // x size, y twinkle, z brightness, w phase
uniform vec3 uCam;
uniform float uBox, uTime, uPx, uLevel, uFocus;
varying float vA;
varying float vSoft;
void main() {
  vec3 p = position + 0.14 * vec3(sin(uTime * 0.11 + aSeed.w), cos(uTime * 0.13 + aSeed.w * 1.7), sin(uTime * 0.09 + aSeed.w * 2.3));
  p += uBox * floor((uCam - p) / uBox + 0.5);                        // the cloud repeats: there is always dust around the camera
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float d = -mv.z;
  float coc = abs(1.0 / max(d, 0.25) - 1.0 / uFocus) * 30.0;         // blur disc (px at 720p): sharp at the focus distance
  float size = (2.0 + coc) * aSeed.x;
  gl_PointSize = clamp(size * uPx, 1.0, 72.0);
  float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed.y) + aSeed.y * 30.0);
  // the same light spread over a bigger disc is fainter; nothing right at the lens, nothing where the cloud wraps
  vA = uLevel * aSeed.z * twinkle / (1.0 + 0.02 * size * size) * smoothstep(0.4, 1.2, d) * (1.0 - smoothstep(uBox * 0.36, uBox * 0.5, d));
  vSoft = clamp(size / 6.0, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
varying float vA;
varying float vSoft;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float disc = smoothstep(1.0, mix(0.2, 0.82, vSoft), r) * (1.0 + 0.35 * vSoft * smoothstep(0.55, 0.9, r));      // a blurred point is a disc with a slightly brighter rim
  if (vA * disc < 0.002) discard;
  gl_FragColor = vec4(uColor * vA * disc, 1.0);
}`;

export function makeDust({ count = 700, box = 16, seed = 11, level = 1 } = {}) {
  const R = rng(seed);
  const pos = new Float32Array(count * 3), sd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    pos.set([R() * box, R() * box, R() * box], i * 3);
    sd.set([0.6 + 0.9 * R() * R(), 0.3 + 2.2 * R(), 0.25 + 0.75 * Math.pow(R(), 1.6), R() * 6.283], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  const uniforms = {
    uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uTime: { value: 0 }, uPx: { value: 1 }, uLevel: { value: level },
    uFocus: { value: 7 }, uColor: { value: new THREE.Color(1.0, 0.8, 0.5) },
  };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false;
  pts.renderOrder = 8;
  return pts;
}
