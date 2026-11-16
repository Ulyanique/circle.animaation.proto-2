// The hero light: ONE light that flies through the whole film, from the first frame into the burst before the title.
//
// Its flight is authored, not tracked (tools/heropath.py): the head follows a single least-jerk curve on the screen
// that is continuous in position and speed across every cut, and the tail is what the head leaves behind, drifting
// with the camera's motion like smoke. All of it is simulated offline and baked into shots/data/hero.json — per film
// frame a polyline of `n` tail points (index k = laid k * step frames ago) with the view depth each point is drawn at.
// Here it is only interpolated (between film frames, so it glides at any display rate) and drawn:
//
//   * a ribbon in screen space: a white-hot core, a handful of fine gold strands that fan out behind the head, a soft
//     glow and glitter that stays where it was laid;
//   * a glow on the head;
//   * under both, a warm tint of whatever is behind them (see SHADE): against a white sky light alone is invisible.
//
// Both are depth-tested against the shards with the baked depth: the light flies in front of them, and at the places
// the planner picked it slips behind one and comes out on the other side. Behind a shard it is not cut off: a fifth of
// it glows through, so the tail is never lost from sight.

import * as THREE from 'three';
import data from '../shots/data/hero.json';
import { VIDEO_W, VIDEO_H, clamp } from '../core/util.js';

const SEG = 180;          // ribbon samples along the tail
const HALF = 46;          // half-width of the ribbon strip, px at 720p (the strands and the glow live inside it)
const GLOW_R = 170;       // radius of the head glow, px at 720p
const THROUGH = 0.2;      // how much of the light shows through a shard it is behind
// Light is added to the picture, and white plus light is still white: over a bright window the light used to dissolve
// and leave its tail behind without a head. So the picture behind it is first FILTERED (multiplied) towards amber — a
// white sky turns gold around the light and the light reads on it, while darkness and the dark side of the gold, having
// nothing to lose, stay as they were.
const SHADE = 0.62;                             // strength of that filter on the axis of the ribbon / at the head
const SHADE_TINT = 'vec3(1.0, 0.70, 0.32)';     // what white becomes at full strength

function decode(str, Type) {
  const bin = atob(str);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Type(u8.buffer);
}

const RIBBON_VERT = /* glsl */ `
attribute float aSide;
attribute vec4 aInfo;      // age (frames), length from the head (px), px per frame of age, size
uniform vec2 uView;
varying float vSide, vAge, vLen, vStretch, vSize;
void main() {
  vSide = aSide; vAge = aInfo.x; vLen = aInfo.y; vStretch = aInfo.z; vSize = aInfo.w;
  // position = (video px x, video px y, view depth): placed on the screen directly, the depth only decides what hides it
  vec4 c = projectionMatrix * vec4(0.0, 0.0, -position.z, 1.0);
  gl_Position = vec4((position.x / uView.x * 2.0 - 1.0) * c.w, (1.0 - position.y / uView.y * 2.0) * c.w, c.z, c.w);
}`;

const RIBBON_FRAG = /* glsl */ `
precision highp float;
uniform float uFrame, uTime, uGain, uLife, uLmax, uHalf, uPx;
varying float vSide, vAge, vLen, vStretch, vSize;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// a line of light: gaussian of width s (px at 720p); never thinner than the pixel grid can hold (it would shimmer)
float line(float d, float s) {
  float w = max(s, 0.62 / uPx);
  return exp(-d * d / (2.0 * w * w)) * (s / w);
}

void main() {
  float y = vSide * uHalf * vSize;                 // px across the ribbon
  float age = vAge;
  float lay = uFrame - vAge;                       // the film frame this bit of tail was laid at: it never changes,
                                                   // so every pattern keyed on it stays put on the tail
  float life = clamp(1.0 - age / uLife, 0.0, 1.0);
  float env = pow(life, 1.15) * (1.0 - smoothstep(uLmax - 360.0, uLmax, vLen));
  float edge = 1.0 - smoothstep(0.70, 1.0, abs(vSide));
  float open = smoothstep(0.0, 12.0, age);         // the bundle is one line at the head and fans out behind it
  float amp = (1.2 + 17.0 * smoothstep(0.0, 42.0, age)) * vSize * open;

  // white-hot core: thick and burning next to the head, a fine line further back
  float hot = 1.0 - smoothstep(0.0, 20.0, age);
  float sc = mix(1.15, 3.0, hot) * vSize;
  vec3 col = mix(vec3(1.0, 0.84, 0.50), vec3(1.0, 0.95, 0.80), hot) * line(y, sc) * mix(1.25, 6.0, hot * hot);
  float body = line(y, sc * 1.7) * 0.85;           // how much the ribbon covers what is behind it (see below)

  // fine strands weaving around the core
  for (int k = 0; k < 7; k++) {
    float fk = float(k);
    float o = amp * (0.42 + 0.58 * fract(fk * 0.618 + 0.21))
            * sin(lay * (0.17 + 0.037 * fk) + fk * 2.399 + 0.7 + 0.9 * sin(lay * 0.071 + fk * 2.1));
    float sl = (0.85 + 0.45 * fract(fk * 0.37 + 0.5)) * vSize;
    col += vec3(1.0, 0.78, 0.38) * line(y - o, sl) * (0.95 - 0.09 * fk) * (0.75 + 0.25 * sin(lay * 0.23 + fk * 4.1));
    body += line(y - o, sl * 1.8) * 0.5;
  }

  // the glow that holds them together
  float sh = (6.0 + 12.0 * open) * vSize;
  col += vec3(1.0, 0.68, 0.26) * exp(-y * y / (2.0 * sh * sh)) * mix(0.42, 0.11, open);

  // glitter: dust shed by the light; it is laid with the tail and twinkles
  float ppf = clamp(vStretch, 5.0, 60.0);
  float band = amp * 1.35 + 6.0 * vSize;
  for (int j = 0; j < 2; j++) {
    float fj = float(j);
    float cw = (7.0 + 5.0 * fj) * vSize;
    float cl = 2.2 - 0.9 * fj;                     // cells per frame of tail
    vec2 g = vec2(lay * cl + 13.7 * fj, y / cw + 64.0 + 0.37 * fj);
    vec2 id = floor(g), fr = fract(g);
    float h = hash(id + 7.1 * fj), h2 = hash(id + 17.3), h3 = hash(id + 41.9);
    vec2 d = vec2((fr.x - 0.15 - 0.7 * h2) * ppf / cl, (fr.y - 0.15 - 0.7 * h3) * cw);
    float sr = max((0.65 + 0.9 * h * h) * vSize, 0.62 / uPx);
    float tw = 0.5 + 0.5 * sin(uTime * (4.0 + 12.0 * h2) + h * 50.0);
    float lit = step(0.66, h) * exp(-y * y / (2.0 * band * band));
    col += vec3(1.0, 0.87, 0.55) * exp(-dot(d, d) / (2.0 * sr * sr)) * tw * tw * lit * (1.2 + 3.2 * h3 * h3) * smoothstep(0.0, 5.0, age);
  }

  // Light alone cannot be seen against a bright picture (white plus light is white), so the ribbon also has a body: a
  // translucent amber veil that tints what is behind it. Premultiplied output: rgb is added, alpha covers.
  float k = env * edge;
  float veil = exp(-y * y / (2.0 * (amp + 3.0 * vSize) * (amp + 3.0 * vSize))) * 0.2;
  float a = clamp(body + veil, 0.0, 0.72) * k * min(uGain, 1.0);
  gl_FragColor = vec4(col * (k * uGain) + vec3(0.55, 0.33, 0.07) * a, a);
}`;

const RIBBON_SHADE_FRAG = /* glsl */ `
precision highp float;
uniform float uGain, uLife, uLmax, uHalf;
varying float vSide, vAge, vLen, vStretch, vSize;
void main() {
  float y = vSide * uHalf * vSize;
  float life = clamp(1.0 - vAge / uLife, 0.0, 1.0);
  float env = pow(life, 1.15) * (1.0 - smoothstep(uLmax - 360.0, uLmax, vLen));
  float edge = 1.0 - smoothstep(0.55, 1.0, abs(vSide));
  float w = (8.0 + 10.0 * smoothstep(0.0, 12.0, vAge)) * vSize;
  float a = ${SHADE.toFixed(3)} * exp(-y * y / (2.0 * w * w)) * env * edge * min(uGain, 1.0);
  gl_FragColor = vec4(mix(vec3(1.0), ${SHADE_TINT}, a), 1.0);
}`;

const GLOW_VERT = /* glsl */ `
uniform vec2 uView;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 c = projectionMatrix * vec4(0.0, 0.0, -position.z, 1.0);
  gl_Position = vec4((position.x / uView.x * 2.0 - 1.0) * c.w, (1.0 - position.y / uView.y * 2.0) * c.w, c.z, c.w);
}`;

const GLOW_FRAG = /* glsl */ `
precision highp float;
uniform float uGain;
varying vec2 vUv;
void main() {
  vec2 d = vUv * 2.0 - 1.0;
  float r2 = dot(d, d);
  vec3 col = vec3(1.0, 0.95, 0.84) * exp(-r2 * 420.0) * 7.0
           + vec3(1.0, 0.80, 0.44) * exp(-r2 * 60.0) * 0.5
           + vec3(1.0, 0.64, 0.24) * exp(-r2 * 6.5) * 0.07;
  gl_FragColor = vec4(col * ((1.0 - smoothstep(0.62, 1.0, r2)) * uGain), 1.0);
}`;

const GLOW_SHADE_FRAG = /* glsl */ `
precision highp float;
uniform float uGain;
varying vec2 vUv;
void main() {
  vec2 d = vUv * 2.0 - 1.0;
  float r2 = dot(d, d);
  float a = ${SHADE.toFixed(3)} * exp(-r2 * 10.0) * (1.0 - smoothstep(0.62, 1.0, r2)) * min(uGain, 1.0);
  gl_FragColor = vec4(mix(vec3(1.0), ${SHADE_TINT}, a), 1.0);
}`;

export function makeHero() {
  const N = data.n, F0 = data.f0, F1 = data.f1, STEP = data.step, LIFE = data.life;
  const XY = decode(data.xy, Int16Array), Z = decode(data.z, Uint16Array);
  const frames = F1 - F0 + 1;
  const Q = 1 / data.q, ZQ = 1 / data.zq;

  const cx = new Float32Array(N), cy = new Float32Array(N), cz = new Float32Array(N);
  const sx = new Float32Array(SEG + 1), sy = new Float32Array(SEG + 1), sz = new Float32Array(SEG + 1), sl = new Float32Array(SEG + 1);

  // ---- ribbon ----
  // One quad per segment with ONE depth: where the light changes sides of a shard the step is a clean cut between two
  // quads (a quad slanted in depth would pierce the shard and show as a notch).
  const vcount = SEG * 4;
  const pos = new Float32Array(vcount * 3), side = new Float32Array(vcount), info = new Float32Array(vcount * 4);
  const index = [];
  for (let i = 0; i < SEG; i++) {
    const a = i * 4;
    side[a] = -1; side[a + 1] = 1; side[a + 2] = -1; side[a + 3] = 1;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const px = new Float32Array((SEG + 1) * 4), pinfo = new Float32Array((SEG + 1) * 4);
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3), aInfo = new THREE.BufferAttribute(info, 4);
  aPos.setUsage(THREE.DynamicDrawUsage); aInfo.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos);
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('aInfo', aInfo);
  geo.setIndex(index);
  const view = new THREE.Vector2(VIDEO_W, VIDEO_H);
  const common = { transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };
  const veiled = {
    ...common, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  };
  // multiply: result = what is there × the colour written
  const filter = {
    ...common, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  };
  const ribbonU = {
    uView: { value: view }, uFrame: { value: 0 }, uTime: { value: 0 }, uGain: { value: 1 }, uLife: { value: LIFE },
    uLmax: { value: data.lmax }, uHalf: { value: HALF }, uPx: { value: 1 },
  };
  const ribbon = new THREE.Mesh(geo, new THREE.ShaderMaterial({ ...veiled, uniforms: ribbonU, vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG }));
  ribbon.frustumCulled = false; ribbon.renderOrder = 30;      // after everything in the shot, the overlays included
  const shade = new THREE.Mesh(geo, new THREE.ShaderMaterial({ ...filter, uniforms: ribbonU, vertexShader: RIBBON_VERT, fragmentShader: RIBBON_SHADE_FRAG }));
  shade.frustumCulled = false; shade.renderOrder = 29;        // before the light itself: it must not dim it
  // Where a shard is in front of the light it does not vanish: it glows faintly through the shard, so the eye never
  // loses the tail (the second pass draws only what the depth test of the first one rejected).
  const ghostU = { ...ribbonU, uGain: { value: 0 } };
  const ghost = new THREE.Mesh(geo, new THREE.ShaderMaterial({ ...veiled, depthFunc: THREE.GreaterDepth, uniforms: ghostU, vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG }));
  ghost.frustumCulled = false; ghost.renderOrder = 30;

  // ---- head glow ----
  const gpos = new Float32Array(12);
  const ggeo = new THREE.BufferGeometry();
  const gPos = new THREE.BufferAttribute(gpos, 3);
  gPos.setUsage(THREE.DynamicDrawUsage);
  ggeo.setAttribute('position', gPos);
  ggeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
  ggeo.setIndex([0, 1, 2, 1, 3, 2]);
  const glowU = { uView: { value: view }, uGain: { value: 1 } };
  const glow = new THREE.Mesh(ggeo, new THREE.ShaderMaterial({ ...common, uniforms: glowU, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG }));
  glow.frustumCulled = false; glow.renderOrder = 31;
  const glowGhostU = { uView: { value: view }, uGain: { value: 0 } };
  const glowGhost = new THREE.Mesh(ggeo, new THREE.ShaderMaterial({ ...common, depthFunc: THREE.GreaterDepth, uniforms: glowGhostU, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG }));
  glowGhost.frustumCulled = false; glowGhost.renderOrder = 31;

  const glowShade = new THREE.Mesh(ggeo, new THREE.ShaderMaterial({ ...filter, uniforms: glowU, vertexShader: GLOW_VERT, fragmentShader: GLOW_SHADE_FRAG }));
  glowShade.frustumCulled = false; glowShade.renderOrder = 29;

  const group = new THREE.Group();
  group.add(shade, glowShade, ribbon, ghost, glow, glowGhost);

  const lerpArr = (arr, f) => {
    const u = clamp(f - F0, 0, frames - 1), i = Math.min(Math.floor(u), frames - 2), a = u - i;
    return arr[i] + (arr[i + 1] - arr[i]) * a;
  };

  /**
   * The tail at film frame f (fractional) into cx/cy/cz: every point is followed through the neighbouring film frames
   * with a Catmull-Rom spline, so at any display rate the light moves without the 24-per-second corners of a linear
   * blend. The depth is taken from the nearer frame: a change of sides must not pass through the shard.
   */
  const sample = (f) => {
    const u = clamp(f - F0, 0, frames - 1), i = Math.min(Math.floor(u), frames - 2), w = u - i;
    const i0 = Math.max(i - 1, 0), i2 = i + 1, i3 = Math.min(i + 2, frames - 1);
    const w2 = w * w, w3 = w2 * w;
    const A = -0.5 * w3 + w2 - 0.5 * w, B = 1.5 * w3 - 2.5 * w2 + 1, C = -1.5 * w3 + 2 * w2 + 0.5 * w, D = 0.5 * w3 - 0.5 * w2;
    const zi = w < 0.5 ? i : i2;
    for (let k = 0; k < N; k++) {
      const a = (i0 * N + k) * 2, b = (i * N + k) * 2, c = (i2 * N + k) * 2, d = (i3 * N + k) * 2;
      cx[k] = (A * XY[a] + B * XY[b] + C * XY[c] + D * XY[d]) * Q;
      cy[k] = (A * XY[a + 1] + B * XY[b + 1] + C * XY[c + 1] + D * XY[d + 1]) * Q;
      cz[k] = Z[zi * N + k] * ZQ;
    }
  };

  // x, y, z: the head as drawn; vis: how much of it is in sight; zl, lit: depth and strength of the light as a lamp for
  // the gold (eased, always in front of the shards — see tools/heropath.py)
  const state = { active: false, x: 0, y: 0, z: 1, vis: 1, gain: 0, size: 1, zl: 1, lit: 1 };

  return {
    group, state, first: F0, last: F1, events: data.events,
    /** head position (video px) and draw depth at film frame f, without touching the meshes */
    headAt(f, out = {}) {
      sample(f);
      out.x = cx[0]; out.y = cy[0]; out.z = cz[0];
      return out;
    },
    /** tail polyline at film frame f as [[x, y, z], ...] (head first) — for the checking tools */
    tailAt(f) {
      sample(f);
      return Array.from({ length: N }, (_, k) => [cx[k], cy[k], cz[k]]);
    },
    update(f, time, stage) {
      const gain = f > F1 ? 0 : lerpArr(data.gain, f);
      state.active = gain > 0.002;
      group.visible = state.active;
      state.gain = gain;
      if (!state.active) return state;
      sample(f);
      // smooth curve through the baked points (uniform Catmull-Rom in age); the depth is not smoothed: where the
      // light changes sides of a shard it must do so between two points, not drift through the shard
      let len = 0;
      for (let s = 0; s <= SEG; s++) {
        const t = (s / SEG) * (N - 1), k = Math.min(Math.floor(t), N - 2), w = t - k;
        const k0 = Math.max(k - 1, 0), k2 = k + 1, k3 = Math.min(k + 2, N - 1);
        const w2 = w * w, w3 = w2 * w;
        const A = -0.5 * w3 + w2 - 0.5 * w, B = 1.5 * w3 - 2.5 * w2 + 1, C = -1.5 * w3 + 2 * w2 + 0.5 * w, D = 0.5 * w3 - 0.5 * w2;
        const x = A * cx[k0] + B * cx[k] + C * cx[k2] + D * cx[k3];
        const y = A * cy[k0] + B * cy[k] + C * cy[k2] + D * cy[k3];
        if (s > 0) len += Math.hypot(x - sx[s - 1], y - sy[s - 1]);
        sx[s] = x; sy[s] = y; sl[s] = len;
        sz[s] = w < 0.5 ? cz[k] : cz[k2];
      }
      const dAge = ((N - 1) * STEP) / SEG;          // frames of age per sample
      for (let i = 0; i <= SEG; i++) {
        const s0 = Math.max(i - 1, 0), s1 = Math.min(i + 1, SEG);
        let tx = sx[s1] - sx[s0], ty = sy[s1] - sy[s0];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl; ty /= tl;
        const age = i * dAge;
        const size = lerpArr(data.size, f - age);
        const hw = HALF * size;
        const o = i * 4;
        px[o] = sx[i] - ty * hw; px[o + 1] = sy[i] + tx * hw; px[o + 2] = sx[i] + ty * hw; px[o + 3] = sy[i] - tx * hw;
        pinfo[o] = age; pinfo[o + 1] = sl[i]; pinfo[o + 2] = (sl[s1] - sl[s0]) / ((s1 - s0) * dAge); pinfo[o + 3] = size;
      }
      for (let i = 0; i < SEG; i++) {
        const z = Math.min(sz[i], sz[i + 1]);
        for (let e = 0; e < 2; e++) {
          const src = (i + e) * 4;
          for (let w = 0; w < 2; w++) {
            const v = i * 4 + e * 2 + w;
            pos[v * 3] = px[src + w * 2]; pos[v * 3 + 1] = px[src + w * 2 + 1]; pos[v * 3 + 2] = z;
            info[v * 4] = pinfo[src]; info[v * 4 + 1] = pinfo[src + 1]; info[v * 4 + 2] = pinfo[src + 2]; info[v * 4 + 3] = pinfo[src + 3];
          }
        }
      }
      aPos.needsUpdate = true; aInfo.needsUpdate = true;
      ribbonU.uFrame.value = f; ribbonU.uTime.value = time; ribbonU.uGain.value = gain; ghostU.uGain.value = gain * THROUGH;
      ribbonU.uPx.value = (stage.renderer.getPixelRatio() * stage.height) / VIDEO_H;

      state.x = cx[0]; state.y = cy[0]; state.z = cz[0];
      state.vis = lerpArr(data.vis, f);
      state.size = lerpArr(data.size, f);
      state.zl = lerpArr(data.zl, f); state.lit = lerpArr(data.lit, f);
      const R = GLOW_R * state.size;
      gpos.set([state.x - R, state.y + R, state.z, state.x + R, state.y + R, state.z, state.x - R, state.y - R, state.z, state.x + R, state.y - R, state.z]);
      gPos.needsUpdate = true;
      glowU.uGain.value = gain; glowGhostU.uGain.value = gain * THROUGH;
      return state;
    },
  };
}
