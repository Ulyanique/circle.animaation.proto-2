// Small math + keyframe helpers shared by all shots.

export const FPS = 24;
export const VIDEO_W = 1280;
export const VIDEO_H = 720;
export const LAST_FRAME = 1213;
export const DURATION = (LAST_FRAME - 1) / FPS;

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoothstep = (a, b, x) => smooth((x - a) / (b - a));
export const smoother = (t) => { t = clamp(t); return t * t * t * (t * (6 * t - 15) + 10); };   // C2 ease (zero velocity and acceleration at both ends)
export const frameToTime = (f) => (f - 1) / FPS;
export const timeToFrame = (t) => t * FPS + 1;

// "The picture has to be drawn again": raised by whatever changes it besides the film's own clock — the size of the
// page, the bars, where a picture sits in its window. A paused film is drawn only then (the loop in main.js).
let stamp = 0;
export const touch = () => { stamp++; };
export const touched = () => stamp;

/** Deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** [r,g,b] 0..255 sRGB -> linear floats */
export const rgb255 = (r, g, b) => [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)];

const EASE = {
  linear: (t) => t,
  smooth,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  in3: (t) => t * t * t,
  out3: (t) => 1 - Math.pow(1 - t, 3),
  hold: () => 0,
};

/**
 * Keyframe track. keys: [[frame, value, ease?], ...] sorted by frame; value is a number or an array.
 * mode 'spline' = Catmull-Rom (Hermite with finite-difference tangents), otherwise per-segment easing
 * (the ease stored on a key shapes the segment that starts at that key; default 'linear').
 * Outside the keyed range the value is held, or — with `extrapolate` — carried on at the velocity it had
 * at the first/last key (a camera must never coast to a stop just because its keys ran out).
 */
export function track(keys, mode = 'linear', extrapolate = false) {
  const n = keys.length;
  const isArr = Array.isArray(keys[0][1]);
  const dim = isArr ? keys[0][1].length : 1;
  const F = keys.map((k) => k[0]);
  const V = keys.map((k) => (isArr ? k[1] : [k[1]]));
  const out = new Array(dim);
  const tangent = (i, d) => {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    return a === b ? 0 : (V[b][d] - V[a][d]) / (F[b] - F[a]);
  };
  return (f) => {
    let i = 0;
    if (f <= F[0]) i = -1;
    else if (f >= F[n - 1]) i = n - 1;
    else { while (i < n - 2 && f >= F[i + 1]) i++; }
    if (i === -1 || i === n - 1) {
      const k = i === -1 ? 0 : n - 1;
      if (extrapolate && n > 1) {
        const j = k === 0 ? 1 : n - 2;
        for (let d = 0; d < dim; d++) {
          const vel = mode === 'spline' ? tangent(k, d) : (V[k][d] - V[j][d]) / (F[k] - F[j]);
          out[d] = V[k][d] + vel * (f - F[k]);
        }
        return isArr ? out.slice() : out[0];
      }
      return isArr ? V[k].slice() : V[k][0];
    }
    const span = F[i + 1] - F[i];
    const u = (f - F[i]) / span;
    if (mode === 'spline') {
      const u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      for (let d = 0; d < dim; d++) {
        out[d] = h00 * V[i][d] + h10 * span * tangent(i, d) + h01 * V[i + 1][d] + h11 * span * tangent(i + 1, d);
      }
    } else {
      const e = (EASE[keys[i][2]] || EASE.linear)(u);
      for (let d = 0; d < dim; d++) out[d] = V[i][d] + (V[i + 1][d] - V[i][d]) * e;
    }
    return isArr ? out.slice() : out[0];
  };
}

/** Constant-or-track helper: accepts a number/array, or keys. */
export function param(v, mode) {
  if (typeof v === 'function') return v;
  if (Array.isArray(v) && Array.isArray(v[0])) return track(v, mode);
  return () => v;
}
