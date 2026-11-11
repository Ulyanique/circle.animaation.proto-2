// Generic data-driven shot: gold shards (+ footage screens), a keyframed camera, foreground overlays, dust and free
// lens flares. The light that flies through the film is not part of any shot (fx/hero.js): a shot only lets it shine
// on its gold.
//
// Geometry / camera / tracks come from `data` (see src/shots/data/*.json — reconstructed from the
// reference video), look & timing come from the hand written `def` next to it.

import * as THREE from 'three';
import { track, param, rgb255, VIDEO_W, VIDEO_H, clamp, smoother } from '../core/util.js';
import { ShardBuilder, makeShardMaterial, makeSoftMaterial } from '../fx/shards.js';
import { registerSlot } from '../core/slots.js';
import { makeDust } from '../fx/dust.js';

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Camera rig evaluated from keys [[f, px,py,pz, qx,qy,qz,qw], ...]. */
export function cameraRig(keys, fov) {
  // [[frame, [px,py,pz, qx,qy,qz,qw]], ...] with the quaternions kept in one hemisphere (they are interpolated per component)
  const tidy = (list) => {
    let prev = null;
    for (const k of list) {
      const v = k[1];
      if (prev && prev[3] * v[3] + prev[4] * v[4] + prev[5] * v[5] + prev[6] * v[6] < 0) for (let i = 3; i < 7; i++) v[i] = -v[i];
      prev = v;
    }
    return list;
  };
  const build = (list) => (list.length > 1 ? track(list, 'spline', true) : () => list[0][1]);     // keeps flying past its last key
  const own = tidy(keys.map((k) => [k[0], k.slice(1, 8)]));
  const raw = build(own);
  let now = own, pose = raw;
  const fovAt = param(fov);
  return {
    fovAt,
    /** the shot's own flight path, [px,py,pz, qx,qy,qz,qw] of frame f (never altered by links) */
    raw,
    /** the path actually flown: the own one, with the hand-over to a linked neighbour spliced in (see linkRigs) */
    pose: (f) => pose(f),
    /** replace / add the keys of the frames covered by `list` ([[frame, [7]], ...], consecutive frames) */
    splice(list) {
      const f0 = list[0][0], f1 = list[list.length - 1][0];
      now = tidy([...now.filter((k) => k[0] < f0), ...list.map((k) => [k[0], k[1].slice()]), ...now.filter((k) => k[0] > f1)]);
      pose = build(now);
    },
    /** writes position/quaternion/fov of frame f into `cam` */
    apply(f, cam) {
      const v = pose(f);
      cam.position.set(v[0], v[1], v[2]);
      cam.quaternion.set(v[3], v[4], v[5], v[6]).normalize();
      const fv = fovAt(f);
      if (cam.fov !== fv) { cam.fov = fv; cam.updateProjectionMatrix(); }
      cam.updateMatrixWorld(true);
    },
    /** video pixel at which the camera of frame f sees a world point ([x, y, z]) */
    project(f, w, out = { x: 0, y: 0 }) {
      const v = pose(f);
      const k = (VIDEO_H / 2) / Math.tan((fovAt(f) * Math.PI) / 360);
      _q.set(-v[3], -v[4], -v[5], v[6]).normalize();
      _p.set(w[0] - v[0], w[1] - v[1], w[2] - v[2]).applyQuaternion(_q);
      const z = Math.max(1e-3, -_p.z);
      out.x = VIDEO_W / 2 + (k * _p.x) / z; out.y = VIDEO_H / 2 - (k * _p.y) / z;
      return out;
    },
    /** world point seen at video pixel (x, y) at view depth d by the camera of frame f */
    unproject(f, x, y, d, target = new THREE.Vector3()) {
      const v = pose(f);
      const t = Math.tan((fovAt(f) * Math.PI) / 360);
      const k = (VIDEO_H / 2) / t;
      target.set(((x - VIDEO_W / 2) / k) * d, (-(y - VIDEO_H / 2) / k) * d, -d);
      _q.set(v[3], v[4], v[5], v[6]).normalize();
      return target.applyQuaternion(_q).add(_p.set(v[0], v[1], v[2]));
    },
  };
}

/**
 * Link two shots whose border the film flies through without a cut (`at` = first frame of shot B).
 *
 * Every shot lives in its own world with its own camera path, so a plain switch makes the picture jump and the flight
 * change speed within one frame. Here the two worlds are glued together and one common flight is built for the frames
 * at-n .. at+n: it leaves A's path and arrives on B's with the *velocity* cross-faded,
 *     v(f) = (1 - W) vA(f) + W vB(f),      W = smoother((f - (at - n)) / 2n),
 * for position and rotation alike. (Cross-fading the positions instead would brake before the border and overshoot
 * after it whenever the two shots fly at different speeds.) That flight is spliced into both rigs, each in its own
 * world, so both shots can be drawn along the same move — which is what lets the player dissolve from one to the
 * other instead of cutting (see main.js).
 */
export function linkRigs(A, B, at, n, glue = null) {
  // world A -> world B: X_B = k * (qAB * X_A) + tAB
  let qAB, tAB, k = 1;
  if (glue) {
    // the two worlds were unified offline (tools/unify.py): shared shards are the very same geometry in both
    qAB = new THREE.Quaternion(...glue.q).normalize(); tAB = new THREE.Vector3(...glue.t); k = glue.k ?? 1;
  } else {
    // nothing in common to measure: let the two cameras coincide at the border
    const pa = A.raw(at), pb = B.raw(at);
    const qA = new THREE.Quaternion(pa[3], pa[4], pa[5], pa[6]).normalize();
    const qB = new THREE.Quaternion(pb[3], pb[4], pb[5], pb[6]).normalize();
    qAB = qB.clone().multiply(qA.clone().invert());
    tAB = new THREE.Vector3(pb[0], pb[1], pb[2]).sub(new THREE.Vector3(pa[0], pa[1], pa[2]).applyQuaternion(qAB));
  }
  const qBA = qAB.clone().invert();
  const tBA = tAB.clone().applyQuaternion(qBA).multiplyScalar(-1 / k);
  const v = new THREE.Vector3(), r = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const map = (pose, q, t, scale) => {
    v.set(pose[0], pose[1], pose[2]).applyQuaternion(q).multiplyScalar(scale).add(t);
    r.set(pose[3], pose[4], pose[5], pose[6]).normalize().premultiply(q);
    return [v.x, v.y, v.z, r.x, r.y, r.z, r.w];
  };
  // how far B's flight is from A's at frame f, in A's world: position offset + rotation vector (in A's camera frame)
  const delta = (f) => {
    const a = A.raw(f), b = map(B.raw(f), qBA, tBA, 1 / k);
    qa.set(a[3], a[4], a[5], a[6]).normalize();
    qb.set(b[3], b[4], b[5], b[6]).normalize();
    r.copy(qa).invert().multiply(qb);
    if (r.w < 0) r.set(-r.x, -r.y, -r.z, -r.w);
    const sin = Math.hypot(r.x, r.y, r.z), m = sin > 1e-9 ? (2 * Math.atan2(sin, r.w)) / sin : 2;
    return [b[0] - a[0], b[1] - a[1], b[2] - a[2], r.x * m, r.y * m, r.z * m];
  };
  const f0 = at - n, f1 = at + n, SUB = 8;
  const W = (f) => smoother((f - f0) / (2 * n));
  const dW = (f) => { const u = clamp((f - f0) / (2 * n)); return (30 * u * u * (1 - u) * (1 - u)) / (2 * n); };
  // I(f) = integral of W'(x) delta(x) dx from f0 to f (trapezoid rule, SUB steps per frame)
  const I = [[0, 0, 0, 0, 0, 0]];
  let last = delta(f0).map((x) => x * dW(f0));
  for (let i = 1; i <= 2 * n * SUB; i++) {
    const f = f0 + i / SUB, cur = delta(f).map((x) => x * dW(f));
    I.push(I[i - 1].map((x, j) => x + (0.5 * (last[j] + cur[j])) / SUB));
    last = cur;
  }
  const Iend = I[I.length - 1];
  // offset from A's path:  W delta - I + I(end) W   ->   velocity  vA + W (vB - vA)  (+ a small term closing the loop)
  const keysA = [], keysB = [];
  for (let f = f0 - 2; f <= f1 + 2; f++) {
    const a = A.raw(f).slice(), d = delta(f), w = W(f);
    const Ii = I[clamp(Math.round((f - f0) * SUB), 0, I.length - 1)];
    const o = d.map((x, j) => w * x - Ii[j] + Iend[j] * w);
    const ang = Math.hypot(o[3], o[4], o[5]);
    qa.set(a[3], a[4], a[5], a[6]).normalize();
    if (ang > 1e-9) qa.multiply(r.setFromAxisAngle(v.set(o[3] / ang, o[4] / ang, o[5] / ang), ang));
    const pose = [a[0] + o[0], a[1] + o[1], a[2] + o[2], qa.x, qa.y, qa.z, qa.w];
    keysA.push([f, pose]);
    keysB.push([f, map(pose, qAB, tAB, k)]);
  }
  A.splice(keysA);
  B.splice(keysB);
}

/** Ramp keys without explicit easing start and stop gently (a reveal must not switch on with a visible step). */
function easedRamp(v) {
  if (!Array.isArray(v) || !Array.isArray(v[0]) || v.some((k) => k.length > 2)) return v;
  const n = v.length - 1;
  return v.map((k, i) => [k[0], k[1], n === 1 ? 'smooth' : i === 0 ? 'in' : i === n - 1 ? 'out' : 'linear']);
}

function inPolygon(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

/**
 * The part [u0, u1, v0, v1] of a window (`polys`: its facets in the screen's own uv; `at(u, v)`: world point) that is
 * ever inside the picture during frames f0…f1. The camera often flies so close that a window is never seen whole, and
 * what stays outside the picture should not take up room in the media laid over the window.
 */
function seenPart(polys, at, rig, f0, f1) {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of polys) for (const [u, v] of p) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  if (!(u1 > u0) || !(v1 > v0)) return [0, 1, 0, 1];
  const N = 48, du = (u1 - u0) / N, dv = (v1 - v0) / N, M = 24, px = { x: 0, y: 0 };
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (let iy = 0; iy < N; iy++) {
    for (let ix = 0; ix < N; ix++) {
      const u = u0 + (ix + 0.5) * du, v = v0 + (iy + 0.5) * dv;
      if (u >= a0 && u <= a1 && v >= b0 && v <= b1) continue;      // would not widen the answer
      if (!polys.some((p) => inPolygon(p, u, v))) continue;
      const w = at(u, v);
      for (let f = f0; ; f = Math.min(f + 2, f1)) {
        rig.project(f, w, px);
        if (px.x > -M && px.x < VIDEO_W + M && px.y > -M && px.y < VIDEO_H + M) {
          a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v);
          break;
        }
        if (f >= f1) break;
      }
    }
  }
  if (!(a1 >= a0)) return [u0, u1, v0, v1];
  // from the centres of the grid cells to their edges, plus one cell of caution; never past the window itself
  return [Math.max(u0, a0 - 1.5 * du), Math.min(u1, a1 + 1.5 * du), Math.max(v0, b0 - 1.5 * dv), Math.min(v1, b1 + 1.5 * dv)];
}

export function makeShot(def, data, assets) {
  const id = def.id || data.id;
  const range = def.range || data.range;
  const group = new THREE.Group();
  group.name = id;
  group.visible = false;

  const rig = cameraRig(def.cam || data.cam, def.fov ?? data.fov ?? 45);

  // ---- shards -------------------------------------------------------------------------------
  const builder = new ShardBuilder();
  const bevel = def.bevel ?? 0.03;
  for (const p of data.polys || []) {
    const o = def.polys?.[p.id] || {};
    if (o.skip) continue;
    const soft = o.soft ?? p.soft;
    if (soft) {
      builder.addSoft(p.v.map((a) => new THREE.Vector3(a[0], a[1], a[2])), {
        color: rgb255(...(o.tone || p.tone || [70, 55, 28])).map((c) => c * (o.gain ?? 1)), feather: soft,
      });
      continue;
    }
    builder.addFacet(p.v.map((a) => new THREE.Vector3(a[0], a[1], a[2])), {
      color: rgb255(...(o.tone || p.tone || [70, 55, 28])).map((c) => c * (o.gain ?? 1)),
      bevel: (o.bevel ?? p.bevel ?? 1) * bevel,
      push: (o.bevel ?? p.bevel ?? 1) * bevel,
      glow: o.glow ?? p.glow ?? 0,
      edge: o.edge ?? p.edge ?? 1.25,
      thick: o.thick ?? p.thick ?? 0.4,
      screen: p.screen ?? 0,
      dim: o.dim ?? p.dim ?? 0,
    });
  }
  def.build?.(builder, { rig, data, THREE });
  const material = makeShardMaterial();
  const mesh = new THREE.Mesh(builder.build(), material);
  mesh.frustumCulled = false;
  group.add(mesh);
  const softGeo = builder.buildSoft();
  let softMesh = null;
  if (softGeo) {
    softMesh = new THREE.Mesh(softGeo, makeSoftMaterial());
    softMesh.frustumCulled = false;
    softMesh.renderOrder = -1;
    group.add(softMesh);
  }
  const U = material.uniforms;
  // dust in the air (def.dust: brightness, 0 = none)
  const dust = def.dust === 0 ? null : makeDust({ seed: 11 + range[0], level: def.dust ?? 1 });
  if (dust) group.add(dust);
  if (def.fog) { U.uFogDensity.value = def.fog; }
  if (def.sheen != null) U.uSheen.value = def.sheen;
  if (def.lightRange) U.uLightRange.value = def.lightRange;

  // optional mirrored copy under a glossy floor
  let mirror = null;
  if (def.floor) {
    mirror = new THREE.Mesh(mesh.geometry, makeShardMaterial());
    mirror.scale.y = -1;
    mirror.frustumCulled = false;
    mirror.material.uniforms.uMirror.value = 1;
    mirror.material.uniforms.uLevel.value = 0.35;
    group.add(mirror);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...(def.floor.color || [0.012, 0.01, 0.006])), transparent: true, opacity: def.floor.opacity ?? 0.8 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.renderOrder = 1;
    group.add(floor);
  }

  // ---- footage screens --------------------------------------------------------------------
  const screens = (data.screens || []).map((s, i) => {
    const sd = def.screens?.[s.name] || {};
    U.uScrO.value[i].fromArray(s.o);
    U.uScrU.value[i].fromArray(s.u);
    U.uScrV.value[i].fromArray(s.v);
    const tex = assets.footage[sd.tex || s.name];
    const media = tex?.userData.media || null;      // a photo / video of the user's own (src/media.js) instead of the still
    if (tex) {
      U[i === 0 ? 'uTexA' : 'uTexB'].value = tex;
      U.uTexel.value[i].set(1 / (media ? media.width : tex.image.width), 1 / (media ? media.height : tex.image.height));
    }
    // The window as a slot (core/slots.js): custom media is laid over the part of the window that the picture ever
    // shows, so that part takes the place of the screen rectangle.
    const O = new THREE.Vector3().fromArray(s.o), Ux = new THREE.Vector3().fromArray(s.u), Vy = new THREE.Vector3().fromArray(s.v);
    const q = new THREE.Vector3();
    const polys = data.polys.filter((p) => p.screen === i + 1)
      .map((p) => p.v.map((a) => { q.set(a[0], a[1], a[2]).sub(O); return [q.dot(Ux) / Ux.lengthSq(), q.dot(Vy) / Vy.lengthSq()]; }));
    const at = (u, v) => [O.x + Ux.x * u + Vy.x * v, O.y + Ux.y * u + Vy.y * v, O.z + Ux.z * u + Vy.z * v];
    // [u, v] in the screen's own uv of the point where the ray through picture point (x, y) meets the window's plane at
    // frame f, or null
    const nrm = new THREE.Vector3().crossVectors(Ux, Vy), ray = new THREE.Vector3();
    const planeUv = (f, x, y) => {
      const c = rig.pose(f);
      rig.unproject(f, x, y, 1, ray);
      ray.x -= c[0]; ray.y -= c[1]; ray.z -= c[2];
      const t = ((O.x - c[0]) * nrm.x + (O.y - c[1]) * nrm.y + (O.z - c[2]) * nrm.z) / ray.dot(nrm);
      if (!(t > 0) || !Number.isFinite(t)) return null;
      q.set(c[0] + ray.x * t, c[1] + ray.y * t, c[2] + ray.z * t).sub(O);
      return [q.dot(Ux) / Ux.lengthSq(), q.dot(Vy) / Vy.lengthSq()];
    };
    // the window is "on" from the frame its picture starts to show (videos and `to` moves count from there)
    const reveal = param(easedRamp(sd.reveal ?? 1));
    let shown = range[0];
    while (shown < range[1] && reveal(shown) < 0.02) shown++;
    const fit = registerSlot(s.name, [shown, range[1]], i === 0, media, {
      span: range,
      // asked for once every shot is built and linked (the hand-over to a linked neighbour changes the flight);
      // `pre`, `post`: frames this shot is also drawn before and after its own range, in the dissolves at linked borders
      part: (pre, post) => seenPart(polys, at, rig, shown > range[0] ? Math.max(range[0] - pre, shown - 2) : range[0] - pre, range[1] + post),
      // frames [first, last] of this shot at which the window, with its picture on, is in the frame at all
      // (rays from a grid of picture points to the window's plane), or null
      frames: () => {
        const seen = (f) => {
          for (let y = 30; y < VIDEO_H; y += 60) {
            for (let x = 40; x < VIDEO_W; x += 80) {
              const h = planeUv(f, x, y);
              if (h && polys.some((p) => inPolygon(p, h[0], h[1]))) return true;
            }
          }
          return false;
        };
        let a = shown, b = range[1];
        while (a <= b && !seen(a)) a++;
        while (b > a && !seen(b)) b--;
        return a <= b ? [a, b] : null;
      },
      // picking: where the ray through picture point (x, y) meets the window's plane, is that inside the window, and
      // where the middle of a uv box is in the picture
      uv: planeUv,
      inside: (u, v) => polys.some((p) => inPolygon(p, u, v)),
      centre: (f, b) => rig.project(f, at((b[0] + b[1]) / 2, (b[2] + b[3]) / 2), {}),
      fixed: (on) => { U.uScrFixed.value[i] = on ? 1 : 0; },
      shape: (b) => (Ux.length() * (b[1] - b[0])) / (Vy.length() * (b[3] - b[2])),
      tilt: () => {      // how far the window's x axis is turned on the screen in the middle of the shot, degrees clockwise
        const fm = (range[0] + range[1]) / 2, a = rig.project(fm, at(0.5, 0.5), {}), b = rig.project(fm, at(0.55, 0.5), {});
        return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      },
      apply: (b) => {
        U.uScrO.value[i].copy(O).addScaledVector(Ux, b[0]).addScaledVector(Vy, b[2]);
        U.uScrU.value[i].copy(Ux).multiplyScalar(b[1] - b[0]);
        U.uScrV.value[i].copy(Vy).multiplyScalar(b[3] - b[2]);
      },
    });
    if (fit) {
      U.uScrOwn.value[i] = media.kind === 'video' ? 2 : 1;
      U.uScrFixed.value[i] = fit.fixed ? 1 : 0;
      // the unsharp mask is there for the placeholder stills (upscaled 720p frames); a photo of the user's own is
      // shown as it is, unless its line in media.js asks for some (`sharpen`)
      U.uSharp.value[i] = clamp(Number(media.cfg.sharpen) || 0, 0, 1.5);
    }
    // the footage glides inside its facet: per-frame uv transform [a, b, c, d, tx, ty] measured by tools/uvtrack.py
    // (it belongs to the placeholder still; custom media has its own `to` move)
    const uv = fit || sd.uv === false || !s.uv ? null : track(s.uv.rows.map((r, k) => [s.uv.f0 + k, r]), 'spline', true);
    return {
      fit,
      reveal,
      sepia: param(sd.sepia ?? 0),
      gain: param(sd.gain ?? 1),
      scroll: param(sd.scroll ?? 0),
      uv,
    };
  });

  const _w = new THREE.Vector3();

  // ---- camera-attached foreground shards (px coordinates at a fixed depth, keyed 2D offset) ---------
  const overlays = (def.overlays || []).map((od) => {
    const b = new ShardBuilder();
    const d = od.depth ?? 3;
    const k = (d * Math.tan(((def.fov ?? data.fov ?? 45) * Math.PI) / 360)) / (VIDEO_H / 2);
    for (const pl of od.polys) {
      const verts = pl.pts.map(([x, y]) => new THREE.Vector3((x - VIDEO_W / 2) * k, -(y - VIDEO_H / 2) * k, -d - (pl.z ?? 0)));
      const color = rgb255(...(pl.tone || [70, 55, 28]));
      if (pl.soft) b.addSoft(verts, { color, feather: pl.soft * k });
      else b.addFacet(verts, { color, bevel: (pl.bevel ?? 1) * 0.012 * d, push: 0, glow: pl.glow ?? 0, edge: pl.edge ?? 1.3, thick: 0 });
    }
    const root = new THREE.Group();
    root.matrixAutoUpdate = false;
    const mat = makeShardMaterial();
    const m = new THREE.Mesh(b.build(), mat);
    m.frustumCulled = false; m.renderOrder = od.front ? 21 : 5;      // front: drawn over the other overlays and the soft shards
    mat.depthTest = false; mat.depthWrite = false;
    mat.transparent = true;      // sorted with the soft shards by renderOrder
    root.add(m);
    const sg = b.buildSoft();
    if (sg) { const sm = new THREE.Mesh(sg, makeSoftMaterial()); sm.frustumCulled = false; sm.renderOrder = od.front ? 20 : 4; sm.material.depthTest = false; root.add(sm); }
    group.add(root);
    // the offset keeps its last velocity outside the keys: during a linked hand-over the shot is still drawn past its own range
    const offset = Array.isArray(od.offset) && Array.isArray(od.offset[0]) ? track(od.offset, 'linear', true) : param(od.offset ?? [0, 0]);
    return { root, mat, k, offset, level: param(od.level ?? 1), opacity: param(od.opacity ?? 1), visible: od.visible };
  });

  // ---- free lens flares -------------------------------------------------------------------
  const flares = (def.flares || []).map((fd) => ({
    pos: track(typeof fd.track === 'string' ? data[fd.track].map((k) => [k[0], [k[1], k[2]]]) : fd.track, 'spline', true),     // flies on past its keys
    i: param(fd.i ?? 1), s: param(fd.s ?? 1), ring: param(fd.ring ?? 0), ghost: param(fd.ghost ?? 0), rays: param(fd.rays ?? 1),
  }));

  const level = param(def.level ?? 1);
  const heroLight = param(def.heroLight ?? 0.9);
  const glow = param(def.glow ?? 1);
  const exposure = param(def.exposure ?? 1);
  const flash = param(def.flash ?? 0);
  const bloom = param(def.bloom ?? 0.45);
  const res = new THREE.Vector2();
  const px = { x: 0, y: 0, z: 0 };

  return {
    id, range, group, def, data, rig, material,
    update(f, stage, time) {
      const cam = stage.camera;
      rig.apply(f, cam);
      U.uLevel.value = level(f);
      if (softMesh) softMesh.material.uniforms.uLevel.value = level(f);
      U.uGlowLevel.value = glow(f);
      screens.forEach((s, i) => {
        U.uScrMix.value[i].set(s.reveal(f), s.sepia(f), s.gain(f), s.fit ? 0 : s.scroll(f));
        const m = s.fit ? s.fit(f) : s.uv ? s.uv(f) : null;
        if (m) { U.uScrA.value[i].set(m[0], m[1], m[2], m[3]); U.uScrT.value[i].set(m[4], m[5]); }
      });
      res.set(stage.width, stage.height);
      if (dust) {
        const DU = dust.material.uniforms;
        DU.uCam.value.copy(cam.position); DU.uTime.value = time; DU.uPx.value = stage.renderer.getPixelRatio() * stage.height / VIDEO_H;
      }

      let slot = 0;
      let li = 0;
      for (let i = 0; i < 3; i++) U.uLights.value[i].set(0, 0, 0, 0);
      // the hero light (fx/hero.js) is a small lamp in this shot's world: it lights the gold it flies past, and dims
      // while it is behind a shard
      const hero = stage.hero?.state;
      if (hero?.active && li < 3) {
        const k = heroLight(f) * hero.gain * (0.45 + 0.55 * hero.lit);
        if (k > 0) { rig.unproject(f, hero.x, hero.y, hero.zl, _w); U.uLights.value[li++].set(_w.x, _w.y, _w.z, k); }
      }
      for (const [n, fd] of flares.entries()) {
        if (slot >= stage.flares.length) break;
        const p = fd.pos(f);
        const fl = stage.flares[slot++];
        fl.id = `${id}/f${n}`;
        fl.x = p[0]; fl.y = p[1]; fl.i = fd.i(f); fl.s = fd.s(f); fl.ring = fd.ring(f); fl.ghost = fd.ghost(f); fl.rays = fd.rays(f);
        fl.rot = time * 0.12 + slot * 1.7;
      }
      for (const o of overlays) {
        const [dx, dy] = o.offset(f);
        o.root.visible = o.visible ? (f >= o.visible[0] || o.visible[0] <= range[0]) && (f <= o.visible[1] || o.visible[1] >= range[1]) : true;
        o.root.matrix.copy(cam.matrixWorld).multiply(_m4.makeTranslation(dx * o.k, -dy * o.k, 0));
        o.root.matrixWorldNeedsUpdate = true;
        o.mat.uniforms.uLevel.value = o.mat.uniforms.uGlowLevel.value = o.level(f);
        o.mat.uniforms.uOpacity.value = o.opacity(f);
      }
      if (mirror) {
        const MU = mirror.material.uniforms;
        MU.uLights.value = U.uLights.value;
        MU.uLevel.value = level(f) * (def.floor.reflect ?? 0.35);
        MU.uGlowLevel.value = glow(f) * (def.floor.reflect ?? 0.35);
      }
      stage.post.exposure = exposure(f);
      stage.post.flash = flash(f);
      stage.post.bloom = bloom(f);
      def.update?.(f, stage, time, this);
    },
  };
}
