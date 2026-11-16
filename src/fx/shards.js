// Faceted gold "shards": geometry builder (planar facets with chamfered, light-catching edges)
// and the shader material that shades them (and maps footage onto the facets that act as screens).

import * as THREE from 'three';
import { rng } from '../core/util.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

/** Newell normal of a (roughly planar) polygon given as Vector3[]. */
function polygonNormal(v) {
  const n = new THREE.Vector3();
  for (let i = 0; i < v.length; i++) {
    const p = v[i], q = v[(i + 1) % v.length];
    n.x += (p.y - q.y) * (p.z + q.z);
    n.y += (p.z - q.z) * (p.x + q.x);
    n.z += (p.x - q.x) * (p.y + q.y);
  }
  return n.normalize();
}

export class ShardBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.glow = [];
    this.screen = [];
    this.soft = { pos: [], col: [] };   // defocused background facets: rgba with feathered alpha
  }

  /**
   * Defocused facet: a flat polygon whose edge fades out over `feather` world units
   * (cheap stand-in for depth of field on far background shards).
   */
  addSoft(verts, o = {}) {
    const color = o.color || [0.1, 0.08, 0.04];
    const v = verts.map((p) => p.clone());
    const N = v.length;
    const centroid = v.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / N);
    let n = polygonNormal(v);
    const ux = v[1].clone().sub(v[0]).normalize();
    const uy = new THREE.Vector3().crossVectors(n, ux).normalize();
    const p2 = v.map((p) => { const d = p.clone().sub(centroid); return new THREE.Vector2(d.dot(ux), d.dot(uy)); });
    let size = Infinity;
    for (const q of p2) size = Math.min(size, q.length());
    const f = Math.min(o.feather ?? 0.2, size * 0.8);
    const offset = (dist) => p2.map((q, i) => {
      const a = p2[(i + N - 1) % N], b = p2[(i + 1) % N];
      const e0 = new THREE.Vector2(q.y - a.y, a.x - q.x).normalize();
      const e1 = new THREE.Vector2(b.y - q.y, q.x - b.x).normalize();
      const k = 1 + e0.dot(e1);
      const m = new THREE.Vector2(e0.x + e1.x, e0.y + e1.y).multiplyScalar(dist / Math.max(k, 0.3));
      return centroid.clone().addScaledVector(ux, q.x + m.x).addScaledVector(uy, q.y + m.y);
    });
    // edge normals above point outwards for CCW polygons; flip the sign for CW ones
    let area = 0;
    for (let i = 0; i < N; i++) { const a = p2[i], b = p2[(i + 1) % N]; area += a.x * b.y - b.x * a.y; }
    const sgn = area > 0 ? 1 : -1;
    const inner = offset(-f * 0.5 * sgn), outer = offset(f * 0.5 * sgn);
    const S = this.soft;
    const put = (p, a) => { S.pos.push(p.x, p.y, p.z); S.col.push(color[0], color[1], color[2], a); };
    for (const t of THREE.ShapeUtils.triangulateShape(p2, [])) { put(inner[t[0]], 1); put(inner[t[1]], 1); put(inner[t[2]], 1); }
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      put(inner[i], 1); put(outer[i], 0); put(outer[j], 0);
      put(inner[i], 1); put(outer[j], 0); put(inner[j], 1);
    }
    return this;
  }

  buildSoft() {
    if (!this.soft.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.soft.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.soft.col, 4));
    g.computeBoundingSphere();
    return g;
  }

  _tri(a, b, c, n, color, glow, screen) {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) {
      this.nrm.push(n.x, n.y, n.z);
      this.col.push(color[0], color[1], color[2]);
      this.glow.push(glow);
      this.screen.push(screen);
    }
  }

  /**
   * One planar facet with a chamfer ring.
   * @param {THREE.Vector3[]} verts polygon, any winding (it is re-oriented to face `toward`)
   * @param {object} o
   *   color   [r,g,b] linear tone of the face
   *   bevel   chamfer width in world units (0 = none)
   *   glow    number | number[] per edge: extra emissive on the chamfer (bright edges)
   *   edge    brightness multiplier of the chamfer relative to the face (default 1.25)
   *   push    how far the outer rim is pushed back along -normal (plates: = bevel, solids: 0)
   *   thick   extrusion depth of the side walls (0 = none)
   *   wall    brightness multiplier for the side walls
   *   screen  0 | 1 | 2 — which footage slot is shown on the face
   *   toward  THREE.Vector3 the face should look at (default: origin = reference camera)
   */
  addFacet(verts, o = {}) {
    const color = o.color || [0.2, 0.15, 0.07];
    const bevel = o.bevel ?? 0;
    const edgeMul = o.edge ?? 1.25;
    const push = o.push ?? 0;
    const thick = o.thick ?? 0;
    const wallMul = o.wall ?? 0.4;
    const screen = o.screen ?? 0;
    const toward = o.toward || new THREE.Vector3(0, 0, 0);
    let v = verts.map((p) => p.clone());
    const centroid = v.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / v.length);
    let n = polygonNormal(v);
    let reversed = false;
    if (n.dot(_a.copy(toward).sub(centroid)) < 0) { v.reverse(); n.negate(); reversed = true; }
    const N = v.length;
    // per-edge glows are authored in the original vertex order (edge k joins vertex k and k+1)
    const glowOf = (i) => {
      if (o.glow == null) return 0;
      if (typeof o.glow === 'number') return o.glow;
      return o.glow[reversed ? (2 * N - 2 - i) % N : i] ?? 0;
    };

    // plane basis
    const ux = _a.copy(v[1]).sub(v[0]).normalize().clone();
    const uy = new THREE.Vector3().crossVectors(n, ux).normalize();
    const p2 = v.map((p) => { const d = _b.copy(p).sub(centroid); return new THREE.Vector2(d.dot(ux), d.dot(uy)); });

    // inset polygon (offset every edge inwards by `bevel`, intersect neighbours)
    let inner = v;
    let inner2 = p2;
    const eOut = [];
    for (let i = 0; i < N; i++) {
      const a = p2[i], b = p2[(i + 1) % N];
      const d = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
      eOut.push(new THREE.Vector2(d.y, -d.x)); // outward for CCW polygons (n = ux × uy)
    }
    if (bevel > 0) {
      inner2 = [];
      for (let i = 0; i < N; i++) {
        const e0 = eOut[(i + N - 1) % N], e1 = eOut[i];
        // bisector offset: move by -bevel along both edge normals
        const k = 1 + e0.dot(e1);
        const m = new THREE.Vector2(e0.x + e1.x, e0.y + e1.y).multiplyScalar(-bevel / Math.max(k, 0.25));
        inner2.push(new THREE.Vector2(p2[i].x + m.x, p2[i].y + m.y));
      }
      inner = inner2.map((q) => centroid.clone().addScaledVector(ux, q.x).addScaledVector(uy, q.y));
    }

    // face
    const tris = THREE.ShapeUtils.triangulateShape(inner2, []);
    for (const t of tris) this._tri(inner[t[0]], inner[t[1]], inner[t[2]], n, color, screen ? (o.dim ?? 0) : 0, screen);

    // chamfer ring + walls
    const rim = v.map((p) => p.clone().addScaledVector(n, -push));
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const eo = _c.set(0, 0, 0).addScaledVector(ux, eOut[i].x).addScaledVector(uy, eOut[i].y).clone();
      if (bevel > 0) {
        const bn = n.clone().multiplyScalar(0.72).addScaledVector(eo, 0.69).normalize();
        const g = glowOf(i);
        const bc = [color[0] * edgeMul, color[1] * edgeMul, color[2] * edgeMul];
        this._tri(inner[i], rim[i], rim[j], bn, bc, g, 0);
        this._tri(inner[i], rim[j], inner[j], bn, bc, g, 0);
      }
      if (thick > 0) {
        const wc = [color[0] * wallMul, color[1] * wallMul, color[2] * wallMul];
        const a2 = rim[i].clone().addScaledVector(n, -thick);
        const b2 = rim[j].clone().addScaledVector(n, -thick);
        this._tri(rim[i], a2, b2, eo, wc, 0, 0);
        this._tri(rim[i], b2, rim[j], eo, wc, 0, 0);
      }
    }
    return this;
  }

  /** Grounding fins: hang a vertical curtain from the polygon's LOWEST chain of edges down to `ground` — the plinth
   *  a monolith grows into the rock. Deliberately NOT from every edge: a full extrusion would lie coplanar with a
   *  vertical face and z-fight the face itself (and hang like a slab's own twin). Colour is near-black gold. */
  addSkirt(verts, o = {}) {
    const ground = o.ground;
    if (!(ground < Infinity)) return this;
    const color = o.color || [0.045, 0.035, 0.016];
    let low = Infinity, high = -Infinity;
    for (const v of verts) { low = Math.min(low, v.y); high = Math.max(high, v.y); }
    const tol = (high - low) * 0.02 + 0.02;
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i], b = verts[(i + 1) % verts.length];
      if (Math.max(a.y, b.y) > low + tol) continue;    // only the bottom chain of the silhouette
      if (a.y <= ground && b.y <= ground) continue;    // already standing on the rock
      let dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) continue;                        // vertical edge: its curtain has no width
      dx /= len; dz /= len;
      const n = new THREE.Vector3(dz, 0, -dx);         // horizontal normal of the curtain
      const a2 = new THREE.Vector3(a.x, Math.min(ground, a.y), a.z);
      const b2 = new THREE.Vector3(b.x, Math.min(ground, b.y), b.z);
      this._tri(a, a2, b2, n, color, 0, 3);
      this._tri(a, b2, b, n, color, 0, 3);
    }
    return this;
  }

  /**
   * Closed faceted solid: an irregular prism/crystal made of stacked rings.
   * rings: [{ y, r, dx, dz, twist }] bottom to top (r = 0 makes a point); sides: number of sides.
   */
  addCrystal(o) {
    const R = rng(o.seed ?? 1);
    const sides = o.sides ?? 5;
    const jitter = o.jitter ?? 0.25;
    const base = o.at || new THREE.Vector3();
    const rot = o.rot || 0;
    const tilt = o.tilt || new THREE.Euler();
    const q = new THREE.Quaternion().setFromEuler(tilt);
    const ang = [];
    for (let i = 0; i < sides; i++) ang.push(((i + (R() - 0.5) * jitter * 2) / sides) * Math.PI * 2 + rot);
    const rad = ang.map(() => 1 + (R() - 0.5) * jitter * 1.6);
    const rings = o.rings.map((ring) => ang.map((a, i) => {
      const r = ring.r * rad[i] * (1 + (R() - 0.5) * (ring.j ?? 0));
      const p = new THREE.Vector3(Math.cos(a + (ring.twist || 0)) * r * (o.sx ?? 1) + (ring.dx || 0), ring.y, Math.sin(a + (ring.twist || 0)) * r * (o.sz ?? 1) + (ring.dz || 0));
      return p.applyQuaternion(q).add(base);
    }));
    const centre = (k) => rings[k].reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / sides);
    const tone = o.tone || ((n) => o.color || [0.2, 0.15, 0.07]);
    const facet = (pts, out) => {
      const n = polygonNormal(pts);
      const cen = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
      const sign = n.dot(_a.copy(cen).sub(out)) < 0 ? -1 : 1;
      const nn = n.multiplyScalar(sign);
      this.addFacet(pts, { color: tone(nn, cen), bevel: o.bevel ?? 0.03, edge: o.edge ?? 1.3, glow: o.glow ?? 0, toward: cen.clone().add(nn) });
    };
    for (let k = 0; k < rings.length - 1; k++) {
      const mid = centre(k).lerp(centre(k + 1), 0.5);
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        const a = rings[k][i], b = rings[k][j], c = rings[k + 1][j], d = rings[k + 1][i];
        if (o.rings[k + 1].r === 0) { facet([a, b, c], mid); continue; }
        if (o.rings[k].r === 0) { facet([a, c, d], mid); continue; }
        if ((i + k) % 2 === 0) { facet([a, b, c], mid); facet([a, c, d], mid); } else { facet([a, b, d], mid); facet([b, c, d], mid); }
      }
    }
    if (o.capTop && o.rings[rings.length - 1].r > 0) facet(rings[rings.length - 1].slice(), centre(0));
    if (o.capBottom && o.rings[0].r > 0) facet(rings[0].slice(), centre(rings.length - 1));
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.glow, 1));
    g.setAttribute('aScreen', new THREE.Float32BufferAttribute(this.screen, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const VERT = /* glsl */ `
attribute float aGlow;
attribute float aScreen;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vGlow;
varying float vScreen;
varying vec3 vClip;          // clip-space x, y, w: where the fragment is in the picture
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  vGlow = aGlow;
  vScreen = aScreen;
  gl_Position = projectionMatrix * viewMatrix * wp;
  vClip = gl_Position.xyw;
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vGlow;
varying float vScreen;
varying vec3 vClip;          // clip-space x, y, w: where the fragment is in the picture

uniform float uOpacity;
uniform float uLevel;        // overall light level of the gold
uniform float uSheen;        // strength of the view-dependent gradient on flat faces
uniform float uToneContrast; // contrast of the facet tones themselves (the gold reads as gold, not as a wash)
uniform float uGlass;        // strength of the glass response: a bright sky sheen where a face turns away from the eye
uniform float uGlassTint;    // how far that sheen leans to the cool sky colour instead of the gold
uniform vec3 uGlowColor;     // colour of the lit chamfers
uniform float uGlowLevel;
uniform vec4 uLights[3];     // xyz world position, w intensity (flare heads light the gold)
uniform vec3 uLightColor;
uniform float uLightRange;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uMirror;       // 1 when rendering the floor reflection (clip below the floor)
uniform float uMirrorY;      // world height of the mirror plane: the reflected copy is only drawn below it
uniform float uTime;         // seconds, for the shimmer of the gold
uniform float uRim;          // strength of the rim light (the hot halo on the silhouettes)
uniform float uSpark;        // strength of the view-dependent glitter

uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform vec3 uScrO[2];       // screen rectangle: origin (top-left), U axis, V axis
uniform vec3 uScrU[2];
uniform vec3 uScrV[2];
uniform vec4 uScrMix[2];     // x reveal 0..1, y sepia 0..1, z brightness, w uv scroll (v)
uniform vec4 uScrA[2];       // footage moving inside its facet: texture uv = mat2(A.xy, A.zw) * uv + T
uniform vec2 uScrT[2];
uniform vec3 uSepia;
uniform vec2 uTexel[2];      // size of one texel of each window's picture
uniform float uSharp[2];     // unsharp mask on the footage, per screen
uniform float uScrOwn[2];    // 0: bare glass (nothing has arrived), 1: a photo, 2: a video — both from src/media.js
uniform float uScrFixed[2];  // 1: own media is fixed to the picture and the window is a cut-out over it (fixed: true in media.js)

// Photos are decoded from sRGB by the GPU. Video frames are not — three.js uploads them as plain RGBA8 (an sRGB upload
// of a video frame is slow in browsers) and leaves the decoding to the shader.
vec3 texel(int i, sampler2D tex, vec2 uv) {
  // a positive LOD bias samples a blurrier mip: at grazing angles the source footage's regular lattice (fences,
  // towers) would otherwise alias into a shimmering cross-hatch
  vec3 c = texture2D(tex, uv).rgb;
  if (uScrOwn[i] > 1.5) c = mix(pow(c * 0.9478672986 + 0.0521327014, vec3(2.4)), c * 0.0773993808, vec3(lessThanEqual(c, vec3(0.04045))));
  return c;
}

vec3 footage(int i, sampler2D tex) {
  vec3 d = vWorld - uScrO[i];
  vec2 uv = vec2(dot(d, uScrU[i]) / dot(uScrU[i], uScrU[i]), dot(d, uScrV[i]) / dot(uScrV[i], uScrV[i]));
  uv.y += uScrMix[i].w;
  if (uScrFixed[i] > 0.5) uv = vec2(vClip.x, -vClip.y) / vClip.z * 0.5 + 0.5;      // position in the picture, y down
  // media is fitted to cover whatever part of the window the picture shows (core/slots.js), and past that its edge
  // texels simply go on
  float inside = max(step(0.5, uScrOwn[i]), step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0));
  uv = vec2(dot(uScrA[i].xy, uv), dot(uScrA[i].zw, uv)) + uScrT[i];
  vec2 tuv = vec2(uv.x, 1.0 - uv.y);
  vec3 c = texel(i, tex, tuv);
  // unsharp mask: the stills are upscaled video frames; this gives their edges back some bite (no effect once the
  // still is minified, the taps then land in the same mip texel)
  vec2 e = uTexel[i] * 1.5;
  vec3 soft = (texel(i, tex, tuv + vec2(e.x, 0.0)) + texel(i, tex, tuv - vec2(e.x, 0.0))
             + texel(i, tex, tuv + vec2(0.0, e.y)) + texel(i, tex, tuv - vec2(0.0, e.y))) * 0.25;
  c = max(c + (c - soft) * uSharp[i], 0.0);
  float l = dot(c, vec3(0.3, 0.6, 0.1));
  vec3 duo = mix(vec3(0.07, 0.035, 0.008), uSepia, smoothstep(0.12, 0.95, sqrt(l)));
  c = mix(c, duo, uScrMix[i].y) * uScrMix[i].z;
  // Footage stays below the bloom threshold: otherwise a highlight that creeps over it (a reveal completing, a gain
  // key) lights up as a glowing blob within one frame. Only a deliberate wash-out (gain > 1.3: a flare passing right
  // in front of the screen) may exceed it. Soft shoulder, so nothing clips.
  float cap = 1.0 + max(0.0, uScrMix[i].z - 1.3) * 1.5;
  vec3 knee = vec3(0.75 * cap);
  c = mix(c, knee + (cap - knee) * (1.0 - exp(-(c - knee) / (cap - knee))), step(knee, c));
  return mix(vec3(0.0), c, inside);
}

void main() {
  if (uMirror > 0.5 && vWorld.y > uMirrorY) discard;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;

  // tone of the facet, with a soft view dependent gradient so big flat faces are not dead flat
  vec3 R = reflect(-V, N);
  float sheen = 0.5 + 0.5 * sin(R.x * 2.3 + R.y * 3.1 + 0.6 + uTime * 0.45);
  // The facet tone is a flat albedo, so a face turned away from everything comes out as pale as one facing the light
  // and the gold turns into a milky wash (the reference has deep dark planes next to bright ones). Sinking the tone
  // curve about a low pivot and letting the light and the rim put the highlights back restores that contrast.
  vec3 tone = pow(max(vColor, 0.0), vec3(1.0 + uToneContrast));      // heavier curve: darker in the body, white stays white
  vec3 col = tone * uLevel * mix(1.0, 0.55 + 0.9 * sheen, uSheen);
  col *= 1.0 + uToneContrast * 0.55;                // (give a little of the brightness back at the top end)

  // curtain walls (aScreen = 3) are matte rock: no point lights, no specular, no glitter — just a dark monolith shaft
  vec3 lit = vec3(0.0);
  if (vScreen < 2.5) {
    for (int i = 0; i < 3; i++) {
      vec3 L = uLights[i].xyz - vWorld;
      float d2 = dot(L, L);
      L *= inversesqrt(d2 + 1e-5);
      float att = uLights[i].w / (1.0 + d2 / (uLightRange * uLightRange));
      float ndl = max(dot(N, L), 0.0);
      float spec = pow(max(dot(N, normalize(L + V)), 0.0), 24.0);
      lit += uLightColor * att * (ndl * 0.85 + spec * 0.6);
    }
    float lum = max(max(vColor.r, vColor.g), vColor.b);
    col += lit * (vColor / max(lum, 1e-3)) * (0.25 + 0.75 * smoothstep(0.0, 0.25, lum));

    // lit chamfers (on screen faces the attribute carries a per-facet dimming factor instead)
    if (vScreen < 0.5) col += uGlowColor * vGlow * uGlowLevel;

    // rim light: a hot halo where the light grazes the silhouette — monolith against the dark
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col += uGlowColor * rim * uRim * (0.25 + 0.75 * smoothstep(0.6, 1.4, uLevel + vGlow));

    // Glass: a pane seen edge-on turns into a mirror of the sky, so the faces that fall away from the eye pick up a
    // broad, cool sheen. This is what the reference has and a flat gold albedo cannot: bright panes next to dark ones,
    // the body of a facet reading as a sheet rather than as a painted plane.
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.2);
    vec3 sky = mix(uGlowColor, vec3(0.62, 0.74, 1.0), uGlassTint);
    col += sky * fres * uGlass * (0.35 + 0.65 * smoothstep(0.0, 0.5, uLevel));

    // glitter: a few needle-bright cells of a fine hash lattice flare up and fade over time — sparks, not confetti.
    // Only gold that already catches some light can throw sparks.
    vec3 gq = floor(R * 90.0);
    float gh = fract(sin(dot(gq, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float tw = pow(max(sin(uTime * (1.6 + gh * 3.2) + gh * 6.2831), 0.0), 180.0);
    col += uGlowColor * tw * uSpark * step(0.78, gh) * smoothstep(0.1, 0.45, lum * uLevel);
  }

  // footage on screen facets. A window whose media has not arrived has nothing to sample: it stays bare glass — the
  // sheen, the rim and the filming light that the facet already has — rather than showing a black rectangle.
  if (vScreen > 0.5 && vScreen < 2.5) {
    float own = vScreen < 1.5 ? uScrOwn[0] : uScrOwn[1];
    vec3 f = vScreen < 1.5 ? footage(0, uTexA) : footage(1, uTexB);
    f = mix(col, f, step(0.5, own));      // (no picture: keep the glass)
    // the keyed reveal is perceptual: mixing in linear light with the key itself would put most of the visible change
    // into the first frame or two (the footage would pop in and then barely move)
    float reveal = pow(vScreen < 1.5 ? uScrMix[0].x : uScrMix[1].x, 2.2);
    col = mix(col, f * (1.0 - vGlow) + lit * 0.15, reveal);
  }

  float dist = length(cameraPosition - vWorld);
  col = mix(uFogColor, col, exp(-dist * uFogDensity));
  gl_FragColor = vec4(col, uOpacity);
}`;

const dummyTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
dummyTex.needsUpdate = true;

export function makeShardMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: true,
    side: THREE.DoubleSide,
    uniforms: {
      uLevel: { value: 1 },
      uOpacity: { value: 1 },
      uSheen: { value: 0.18 },
      uToneContrast: { value: 0.15 },
      uGlass: { value: 0.30 },
      uGlassTint: { value: 0.55 },
      uGlowColor: { value: new THREE.Color(1.0, 0.86, 0.5) },
      uGlowLevel: { value: 1 },
      uLights: { value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)] },   // w = intensity: off by default (a bare Vector4 has w = 1)
      uLightColor: { value: new THREE.Color(1.0, 0.8, 0.45) },
      uLightRange: { value: 4 },
      uFogColor: { value: new THREE.Color(0, 0, 0) },
      uFogDensity: { value: 0 },
      uMirror: { value: 0 },
      uMirrorY: { value: 0 },
      uTime: { value: 0 },
      uRim: { value: 0.55 },
      uSpark: { value: 0 },
      uTexel: { value: [new THREE.Vector2(1 / 1024, 1 / 1024), new THREE.Vector2(1 / 1024, 1 / 1024)] },
      uSharp: { value: [0, 0] },
      uScrOwn: { value: [0, 0] },
      uScrFixed: { value: [0, 0] },
      uTexA: { value: dummyTex },
      uTexB: { value: dummyTex },
      uScrO: { value: [new THREE.Vector3(), new THREE.Vector3()] },
      uScrU: { value: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0)] },
      uScrV: { value: [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0)] },
      uScrMix: { value: [new THREE.Vector4(0, 0, 1, 0), new THREE.Vector4(0, 0, 1, 0)] },
      uScrA: { value: [new THREE.Vector4(1, 0, 0, 1), new THREE.Vector4(1, 0, 0, 1)] },
      uScrT: { value: [new THREE.Vector2(0, 0), new THREE.Vector2(0, 0)] },
      uSepia: { value: new THREE.Color(1.1, 0.84, 0.4) },
    },
  });
}

/** Material for the defocused background facets (see ShardBuilder.addSoft). */
export function makeSoftMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uLevel: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec4 color;
      varying vec4 vColor;
      void main() { vColor = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uLevel;
      varying vec4 vColor;
      void main() { float a = smoothstep(0.0, 1.0, vColor.a); gl_FragColor = vec4(vColor.rgb * uLevel, a); }`,
  });
}
