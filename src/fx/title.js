// Final title (f978–1213): the emblem — a golden drawing compass that opens and draws a circle of light around
// itself — and the caption «Янтарный циркуль» below it, in front of two crossing light beams and drifting bokeh.
// Everything is laid out in video pixels (x right, y up) around the zoom centre TITLE_CENTRE at the scale of
// frame 1100; the whole block grows slowly (a slow push-in) until the end.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Font } from 'three/addons/loaders/FontLoader.js';
// glyph outlines of the caption only, derived from Playfair Display SemiBold (SIL OFL 1.1, see fonts/LICENSE-playfair-display.txt)
import serifData from './fonts/title-serif-600.json';
import { VIDEO_W, VIDEO_H, rng } from '../core/util.js';

export const TITLE_CENTRE = [645, 364];
export const CAPTION = 'Янтарный циркуль';
const FOCAL = (VIDEO_H / 2) / Math.tan(Math.PI / 8);
const DEPTH = 10;

// ---- emblem geometry (its own units; EMBLEM places and scales it in the title block) -----------------
const RING = { x: 0, y: 66, r: 112 };                  // the circle the compass draws
const HINGE_Y = RING.y + 74;                           // the hinge sits inside the circle, the handle pokes out of it
const LEG = 180;                                       // hinge -> tip
const TIP = [56, RING.y - 97];                         // pencil tip (the needle is its mirror image); both touch the circle
const LEG_ANGLE = Math.atan2(TIP[0], HINGE_Y - TIP[1]);         // half opening of the legs when the tips are on the circle
const RING_START = Math.atan2(TIP[1] - RING.y, TIP[0]);         // the circle starts at the pencil tip
const EMBLEM = { k: 1.34, x: 0, y: 40 };               // scale and position of the circle's centre in the block
const CAP_H = 44, CAPTION_W = 800, CAPTION_Y = -196;

/** Video pixel of the point of the circle that is drawn when `p` (0..1) of it is done, at frame f. */
export function ringPointPx(p, f) {
  const a = RING_START + p * Math.PI * 2, S = titleScale(f);
  return [TITLE_CENTRE[0] + S * (EMBLEM.x + EMBLEM.k * RING.r * Math.cos(a)), TITLE_CENTRE[1] - S * (EMBLEM.y + EMBLEM.k * RING.r * Math.sin(a))];
}

/** Scale of the title block at frame f (1 at f ≈ 1100), i.e. screen px per block unit. */
export const titleScale = (f) => (637 + 0.56 * (f - 1009)) / 687;

/** Glyph layout: `ref` glyph gets `height` px, the whole line is fitted to `width` px by tracking. */
function layout(font, text, { ref, height, width, xScale = 1, space = 0.42 }) {
  const size = 100;
  const unit = size / font.data.resolution;
  const box = (shapes) => { const b = new THREE.Box2(); for (const s of shapes) for (const p of s.getPoints(6)) b.expandByPoint(p); return b; };
  const k = height / box(font.generateShapes(ref, size)).getSize(new THREE.Vector2()).y;
  const glyphs = [...text].map((ch) => {
    if (ch === ' ' || !font.data.glyphs[ch]) return { adv: space * height / k, shapes: null };
    const shapes = font.generateShapes(ch, size);
    return { adv: font.data.glyphs[ch].ha * unit, shapes, box: box(shapes) };
  });
  const first = glyphs[0], last = glyphs[glyphs.length - 1];
  const natural = glyphs.slice(0, -1).reduce((s, g) => s + g.adv, 0) + last.box.max.x - first.box.min.x;
  const tracking = (width / (k * xScale) - natural) / (glyphs.length - 1);
  let x = -first.box.min.x;
  for (const g of glyphs) { g.x = x; x += g.adv + tracking; }
  return { glyphs, k, xScale, width: width / (k * xScale) };
}

function textGeometry(font, text, o) {
  const L = layout(font, text, o);
  const parts = [];
  for (const g of L.glyphs) {
    if (!g.shapes) continue;
    const geo = new THREE.ExtrudeGeometry(g.shapes, { depth: o.depth / L.k, bevelEnabled: true, bevelThickness: o.bevel / L.k, bevelSize: o.bevel / L.k, bevelSegments: 2, curveSegments: 8 });
    geo.translate(g.x - L.width / 2, 0, -o.depth / L.k);
    parts.push(geo);
  }
  const geo = mergeGeometries(parts);
  geo.scale(L.k * L.xScale, L.k, L.k);
  return geo;
}

/** Polished gold: a banded "horizon" gradient over the height y0 .. y0 + h, lit bevels, a highlight that sweeps across. */
const goldMaterial = (h, y0 = 0, spec = 0.7) => new THREE.ShaderMaterial({
  uniforms: { uH: { value: h }, uY0: { value: y0 }, uSpec: { value: spec }, uSweep: { value: -1000 }, uLevel: { value: 1 }, uOpacity: { value: 1 } },
  transparent: true,
  vertexShader: /* glsl */`
    varying vec3 vN; varying vec3 vP; varying float vX;
    void main() {
      vN = normalize(normalMatrix * normal); vP = position;
      vX = (modelMatrix * vec4(position, 1.0)).x;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform float uH, uY0, uSpec, uSweep, uLevel, uOpacity;
    varying vec3 vN; varying vec3 vP; varying float vX;
    void main() {
      vec3 n = normalize(vN);
      float y = clamp((vP.y - uY0) / uH, 0.0, 1.0);
      vec3 hi = vec3(1.0, 0.90, 0.60), mid = vec3(0.86, 0.64, 0.27), low = vec3(0.36, 0.24, 0.08), foot = vec3(0.74, 0.54, 0.22);
      vec3 face = y > 0.5 ? mix(mid, hi, smoothstep(0.5, 0.74, y)) : (y > 0.32 ? mix(low, mid, smoothstep(0.32, 0.5, y)) : mix(foot, low, smoothstep(0.0, 0.32, y)));
      float front = smoothstep(0.55, 0.95, n.z);
      vec3 side = vec3(0.22, 0.15, 0.05) * (0.55 + 1.4 * max(n.y, 0.0) + 0.5 * max(-n.x, 0.0));
      vec3 col = mix(side, face, front);
      col += vec3(1.0, 0.9, 0.62) * pow(max(dot(n, normalize(vec3(-0.35, 0.65, 0.68))), 0.0), 18.0) * uSpec * (1.0 - front);
      float g = exp(-pow((vX - uSweep) / 0.9, 2.0));          // world x: the sweep crosses emblem and caption as one
      col += vec3(1.0, 0.95, 0.8) * g * 0.34 * front;
      gl_FragColor = vec4(col * uLevel, uOpacity);
    }`,
});

const extrude = (shapes, depth = 12, bevel = 1.1) => new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 20 }).translate(0, 0, -depth);
const poly = (pts) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
const disc = (x, y, r) => new THREE.Shape().absarc(x, y, r, 0, Math.PI * 2, false);

/** One leg, hinge at the origin, pointing straight down. `pencil`: the drawing leg (lead holder), else the needle. */
function legGeometry(pencil) {
  const parts = [extrude([poly([[-7.5, 8], [7.5, 8], [3.5, -146], [-3.5, -146]])])];
  if (pencil) {
    parts.push(extrude([poly([[-5.4, -132], [5.4, -132], [5.4, -157], [-5.4, -157]])], 13, 1.0).translate(0, 0, 0.5));
    parts.push(extrude([poly([[-3.1, -157], [3.1, -157], [0, -LEG]])], 8, 0.5).translate(0, 0, -2));
  } else {
    parts.push(extrude([poly([[-4.8, -138], [4.8, -138], [4.8, -149], [-4.8, -149]])], 13, 1.0).translate(0, 0, 0.5));
    parts.push(extrude([poly([[-1.9, -149], [1.9, -149], [0, -LEG]])], 6, 0.4).translate(0, 0, -3));
  }
  return mergeGeometries(parts);
}

/** The bow of the compass: an arc around the hinge, fixed to the needle leg, the pencil leg slides along it. */
function bowGeometry() {
  const r = 88, w = 2.3, a0 = -Math.PI / 2 - 0.05, a1 = -Math.PI / 2 + 2 * LEG_ANGLE + 0.11;
  const s = new THREE.Shape();
  s.absarc(0, 0, r + w, a0, a1, false);
  s.absarc(0, 0, r - w, a1, a0, true);
  const knob = disc(r * Math.cos(a1), r * Math.sin(a1), 4.4);
  return mergeGeometries([extrude([s], 5, 0.6).translate(0, 0, -13), extrude([knob], 7, 0.8).translate(0, 0, -12)]);
}

function headGeometry() {
  const handle = poly([[-5, 10], [5, 10], [5, 45], [-5, 45]]);
  const cap = poly([[-7.4, 45], [7.4, 45], [7.4, 51], [-7.4, 51]]);
  return mergeGeometries([
    extrude([disc(0, 0, 15.5)], 15, 1.4).translate(0, 0, 3),
    extrude([handle], 10, 1.2).translate(0, 0, -1),
    extrude([cap, disc(0, 55.5, 4.6)], 11, 1.0).translate(0, 0, -0.5),
  ]);
}

/** The circle of light: drawn from RING_START counter-clockwise, `uProg` 0..1; the freshly drawn end is hotter. */
const ringMaterial = () => new THREE.ShaderMaterial({
  uniforms: { uProg: { value: 0 }, uLevel: { value: 1 }, uOpacity: { value: 1 }, uR: { value: RING.r }, uStart: { value: RING_START } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform float uProg, uLevel, uOpacity, uR, uStart; varying vec2 vP;
    void main() {
      float r = length(vP), a = atan(vP.y, vP.x);
      float t = mod(a - uStart, 6.2831853) / 6.2831853;            // 0..1 along the circle
      float behind = uProg - t;                                    // > 0: already drawn
      float on = mix(smoothstep(0.0, 0.004, behind) * step(0.0005, uProg), 1.0, step(0.9999, uProg));     // closed once complete
      float fresh = exp(-max(behind, 0.0) * 26.0) * (1.0 - smoothstep(0.985, 1.0, uProg));
      float d = r - uR;
      float line = exp(-d * d / 2.2) * (0.95 + 2.4 * fresh) + exp(-d * d / 40.0) * (0.13 + 0.5 * fresh) + exp(-abs(d) / 14.0) * 0.03;
      gl_FragColor = vec4(vec3(1.0, 0.60, 0.20) * line * on * uLevel * uOpacity, 1.0);
    }`,
});

/** The amber set into the hinge: a warm cabochon with a small highlight. */
const amberMaterial = () => new THREE.ShaderMaterial({
  uniforms: { uOpacity: { value: 1 }, uGlow: { value: 1 } },
  transparent: true,
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform float uOpacity, uGlow; varying vec2 vUv;
    void main() {
      vec2 p = (vUv - 0.5) * 2.0;
      float r = length(p);
      vec3 col = mix(vec3(0.95, 0.42, 0.05), vec3(0.30, 0.07, 0.005), smoothstep(0.1, 1.0, r));
      col += vec3(1.0, 0.66, 0.2) * exp(-dot(p - vec2(0.1, -0.3), p - vec2(0.1, -0.3)) * 5.0) * (0.25 + 0.2 * uGlow);     // light glowing through it from below
      col += vec3(1.0, 0.95, 0.85) * exp(-dot(p - vec2(-0.3, 0.36), p - vec2(-0.3, 0.36)) * 40.0) * 0.6;                  // highlight
      gl_FragColor = vec4(col, uOpacity * smoothstep(1.0, 0.9, r));
    }`,
});

const beamMaterial = () => new THREE.ShaderMaterial({
  uniforms: { uLevel: { value: 0 }, uAlong: { value: 436 }, uTime: { value: 0 } },
  transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform float uLevel, uAlong, uTime; varying vec2 vUv;
    float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453123); }
    void main() {
      vec2 p = vec2(vUv.x * ${VIDEO_W}.0, (1.0 - vUv.y) * ${VIDEO_H}.0);
      vec3 acc = vec3(0.0);
      for (int side = 0; side < 2; side++) {
        vec2 q = side == 0 ? p : vec2(${2 * TITLE_CENTRE[0]}.0 - p.x, p.y);       // the two arms mirror each other
        vec2 d = vec2(0.788, 0.615), n = vec2(-0.615, 0.788);
        vec2 r = q - vec2(0.0, 330.0);
        float along = dot(r, d), perp = dot(r, n);
        float wide = mix(46.0, 16.0, smoothstep(0.0, 380.0, along));              // broad at the frame edge, thin further in
        float core = exp(-pow(perp / wide, 2.0)) + 0.35 * exp(-pow((perp - 20.0) / 85.0, 2.0));
        float lines = 0.0;
        for (int k = 0; k < 6; k++) {
          float fk = float(k) + 9.0 * float(side);
          float off = (hash1(fk + 0.3) - 0.5) * 300.0 + 6.0 * sin(uTime * 0.2 + fk);
          lines += exp(-pow((perp - off) / (1.5 + 4.0 * hash1(fk + 3.1)), 2.0)) * (0.12 + 0.3 * hash1(fk + 11.7));
        }
        float edge = exp(-max(along, 0.0) / 240.0);
        float blob = exp(-pow((along - uAlong) / 130.0, 2.0));
        float spot = exp(-(pow(along - uAlong, 2.0) + perp * perp) / (34.0 * 34.0)) + 0.5 * exp(-pow(perp / 5.0, 2.0)) * exp(-pow((along - uAlong) / 90.0, 2.0));
        float I = core * (1.1 * edge + 0.34 * blob + 0.07) + lines * (0.30 * edge + 0.12 * blob + 0.05) + spot * 1.3;
        vec3 c = mix(vec3(0.34, 0.60, 0.92) * 0.8, vec3(1.0, 0.68, 0.30), smoothstep(30.0, 400.0, along));     // teal at the frame edge, amber further in
        acc += c * I;
      }
      acc += vec3(0.03, 0.02, 0.011) * exp(-pow(length((p - vec2(645.0, 290.0)) * vec2(0.8, 1.0)) / 380.0, 2.0)) / 0.55;   // faint warm haze behind the emblem
      gl_FragColor = vec4(acc * uLevel * 0.55, 1.0);
    }`,
});

/** Bokeh dots: thrown out by the burst, then they drift slowly and fade. Drawn straight in video pixels. */
function makeBokeh(count = 220) {
  const R = rng(77);
  const a = new Float32Array(count * 4), b = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    a.set([R() * Math.PI * 2, 120 + 820 * Math.pow(R(), 0.8), 9 + 24 * R(), 3 + 10 * Math.pow(R(), 2.2)], i * 4);
    b.set([(R() - 0.5) * 0.7, (R() - 0.5) * 0.5 - 0.1, R() * 6.28, 0.35 + 0.65 * R()], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aA', new THREE.BufferAttribute(a, 4));
  geo.setAttribute('aB', new THREE.BufferAttribute(b, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uF: { value: 0 }, uAlpha: { value: 0 }, uPx: { value: 1 } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec4 aA; attribute vec4 aB; uniform float uF, uAlpha, uPx; varying float vA;
      void main() {
        float tau = max(uF - 970.0, 0.0);
        float r = aA.y * (1.0 - exp(-tau / aA.z));
        vec2 p = vec2(640.0, 360.0) + vec2(cos(aA.x), sin(aA.x)) * r + aB.xy * max(uF - 990.0, 0.0);
        vA = uAlpha * aB.w * (0.6 + 0.4 * sin(uF * 0.21 + aB.z));
        gl_Position = vec4(p.x / 640.0 - 1.0, 1.0 - p.y / 360.0, 0.0, 1.0);
        gl_PointSize = aA.w * uPx * (1.0 + 1.2 * exp(-tau / 12.0));
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vec3(1.0, 0.74, 0.34) * smoothstep(1.0, 0.45, d) * vA * 1.7, 1.0); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 30;
  return pts;
}

export function makeTitle() {
  const group = new THREE.Group();

  // light beams, on a plane that exactly fills the frame far behind the title
  const far = 40, h = 2 * far * Math.tan(Math.PI / 8);
  const beams = new THREE.Mesh(new THREE.PlaneGeometry(h * VIDEO_W / VIDEO_H, h), beamMaterial());
  beams.position.z = -far; beams.renderOrder = -5; beams.frustumCulled = false;
  group.add(beams);

  // title block in pixel units (x right, y up) around the zoom centre
  const block = new THREE.Group();
  block.position.set(((TITLE_CENTRE[0] - VIDEO_W / 2) / FOCAL) * DEPTH, (-(TITLE_CENTRE[1] - VIDEO_H / 2) / FOCAL) * DEPTH, -DEPTH);
  group.add(block);

  // ---- emblem ----
  const emblem = new THREE.Group();
  emblem.scale.setScalar(EMBLEM.k);
  emblem.position.set(EMBLEM.x - EMBLEM.k * RING.x, EMBLEM.y - EMBLEM.k * RING.y, 0);
  block.add(emblem);
  const gold = goldMaterial(LEG + 70, -LEG, 0.3);       // one gradient over the whole compass (tip .. handle), in hinge coordinates
  const hinge = new THREE.Group();
  hinge.position.set(RING.x, HINGE_Y, 0);
  emblem.add(hinge);
  const needle = new THREE.Group(), pencil = new THREE.Group();
  needle.add(new THREE.Mesh(legGeometry(false), gold), new THREE.Mesh(bowGeometry(), gold));
  pencil.add(new THREE.Mesh(legGeometry(true), gold));
  pencil.position.z = -1;                               // the two legs overlap at the hinge
  hinge.add(needle, pencil, new THREE.Mesh(headGeometry(), gold));
  const amber = new THREE.Mesh(new THREE.CircleGeometry(10.2, 40), amberMaterial());
  amber.position.z = 5.2;                               // just in front of the hinge's face
  hinge.add(amber);
  // its warm glow on the air around the hinge
  const glow = new THREE.Mesh(new THREE.CircleGeometry(46, 40), new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 1 } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uOpacity; varying vec2 vUv; void main() { float r = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(vec3(1.0, 0.45, 0.10) * exp(-r * r * 5.0) * 0.22 * uOpacity, 1.0); }',
  }));
  glow.position.z = 5.6; glow.renderOrder = 4;
  hinge.add(glow);

  const ring = new THREE.Mesh(new THREE.RingGeometry(RING.r - 60, RING.r + 60, 160, 1), ringMaterial());
  ring.position.set(RING.x, RING.y, -7);                // behind the front faces of the legs: the tips stand on the circle
  ring.renderOrder = 3;
  emblem.add(ring);

  // ---- caption ----
  const serif = new Font(serifData);
  const captionGold = goldMaterial(CAP_H);
  const caption = new THREE.Mesh(textGeometry(serif, CAPTION, { ref: 'Я', height: CAP_H, width: CAPTION_W, depth: 5, bevel: 0.5 }), captionGold);
  caption.position.set(0, CAPTION_Y, 0);
  block.add(caption);

  const bokeh = makeBokeh();
  group.add(bokeh);

  return {
    group,
    /**
     * f: frame; o: { opacity (emblem), open (0..1, legs), ring (0..1, circle drawn), ringLevel, caption (opacity),
     *                rise (px the caption still has to rise), beams, bokeh, level, px (drawing-buffer px per video px) }
     */
    update(f, time, o) {
      const s = titleScale(f) * (DEPTH / FOCAL);
      block.scale.set(s, s, s);
      block.visible = o.opacity > 0.001 || o.caption > 0.001;
      const sweep = (-560 + ((f - 1040) % 132) * 11) * s + block.position.x;      // a highlight crosses the title every 5.5 s
      for (const m of [gold, captionGold]) { m.uniforms.uLevel.value = o.level ?? 1; m.uniforms.uSweep.value = f > 1040 ? sweep : -1000; }
      gold.uniforms.uOpacity.value = o.opacity;
      amber.material.uniforms.uOpacity.value = o.opacity;
      amber.material.uniforms.uGlow.value = 0.6 + 0.4 * Math.sin(time * 1.3);
      glow.material.uniforms.uOpacity.value = o.opacity * (0.8 + 0.2 * Math.sin(time * 1.3));
      emblem.visible = o.opacity > 0.001;
      const ang = THREE.MathUtils.lerp(0.09, LEG_ANGLE, o.open);
      needle.rotation.z = -ang; pencil.rotation.z = ang;
      ring.material.uniforms.uProg.value = o.ring;
      ring.material.uniforms.uLevel.value = o.ringLevel ?? 1;
      ring.material.uniforms.uOpacity.value = o.opacity;
      ring.visible = o.ring > 0.0005;
      captionGold.uniforms.uOpacity.value = o.caption;
      caption.visible = o.caption > 0.001;
      caption.position.y = CAPTION_Y - (o.rise ?? 0);
      beams.material.uniforms.uLevel.value = o.beams;
      beams.material.uniforms.uAlong.value = 495 + 0.08 * (f - 1100);
      beams.material.uniforms.uTime.value = time;
      bokeh.material.uniforms.uF.value = f;
      bokeh.material.uniforms.uAlpha.value = o.bokeh;
      bokeh.material.uniforms.uPx.value = o.px;
      bokeh.visible = o.bokeh > 0.001;
    },
  };
}
