// Renderer, 16:9 stage and the post chain: scene -> bloom -> lens flares / grade -> screen.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VIDEO_W, VIDEO_H } from './util.js';

export const MAX_FLARES = 4;

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uAspect: { value: VIDEO_W / VIDEO_H },
    uTime: { value: 0 },
    uFlare: { value: Array.from({ length: MAX_FLARES }, () => new THREE.Vector4()) },   // xy uv, z intensity, w size
    uFlareB: { value: Array.from({ length: MAX_FLARES }, () => new THREE.Vector4()) },  // x ring, y ghost, z rotation, w rays
    uFlareColor: { value: new THREE.Color(1.0, 0.82, 0.5) },
    uExposure: { value: 1 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1.0, 0.93, 0.78) },
    uFade: { value: 1 },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.02 },
    uFringe: { value: 0.012 },      // colour fringing at the frame corners (fraction of the frame)
    uGrade: { value: 1 },           // strength of the film grade (0 = neutral)
    uContrast: { value: 0.62 },     // how far the display-space S-curve is pushed (0 = as it was)
    uShadow: { value: 0.16 },       // how much the haze is dug out of the blacks (0 = milky, 1 = crushed)
    uShoulder: { value: 3.2 },      // soft roll-off of the highlights into white
    uBars: { value: 0 },            // height of each letterbox bar as a fraction of the frame (0.128 = 2.39:1)
    uTint: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uAspect, uTime, uExposure, uFlash, uFade, uVignette, uGrain, uFringe, uGrade, uBars;
    uniform float uContrast, uShadow, uShoulder;
    uniform vec4 uFlare[${MAX_FLARES}];
    uniform vec4 uFlareB[${MAX_FLARES}];
    uniform vec3 uFlareColor, uFlashColor, uTint;

    float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453123); }
    float hash2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    // periodic value noise over the angle
    float anoise(float a, float freq, float seed) {
      float x = a / 6.2831853 * freq;
      float i = floor(x), f = fract(x);
      float u = f * f * (3.0 - 2.0 * f);
      return mix(hash1(mod(i, freq) + seed), hash1(mod(i + 1.0, freq) + seed), u);
    }

    vec3 flare(vec2 uv, vec4 F, vec4 B) {
      if (F.z <= 0.0) return vec3(0.0);
      vec2 d = (uv - F.xy) * vec2(uAspect, 1.0);
      float size = F.w;
      float r = length(d) / size;            // 1.0 == ray length scale (0.42 * height at size 1)
      float a = atan(d.y, d.x);
      float rc = r * 16.0;                    // core units
      float core = 3.0 * exp(-rc * rc) + 0.8 / (1.0 + rc * rc * rc);
      float halo = 0.10 / (1.0 + pow(r * 4.0, 2.0)) + 0.5 * exp(-pow(r / 0.12, 2.0));
      float fine = pow(anoise(a + B.z, 72.0, 3.0), 6.0) * exp(-r * 7.0) * 0.55;
      float spikes = 0.0;
      for (int k = 0; k < 16; k++) {
        float fk = float(k);
        float ak = (fk + hash1(fk * 3.7 + 1.0)) * 0.3927 + B.z * (0.25 + 0.3 * hash1(fk + 0.5));
        float da = abs(mod(a - ak + 3.14159265, 6.2831853) - 3.14159265);
        float len = 0.05 + 0.2 * hash1(fk * 9.1 + 2.0);
        float perp = r * sin(min(da, 1.5708));
        float along = r * cos(min(da, 1.5708));
        spikes += exp(-pow(perp / 0.008, 2.0)) * exp(-along / len) * step(da, 1.5708);
      }
      // The look of a cinema lens: a soft glow with a few faint rays and a long horizontal (anamorphic) streak,
      // a touch cooler than the light itself — not a hard many-pointed star.
      vec2 dn = d / size;
      float streak = exp(-pow(dn.y / 0.016, 2.0)) * exp(-abs(dn.x) / 0.62) * 0.42 + exp(-pow(dn.y / 0.05, 2.0)) * exp(-abs(dn.x) / 0.42) * 0.14;
      float gate = B.w * smoothstep(0.0, 0.03, r);
      float rays = (fine + spikes * 0.26) * gate;
      float ringR = 0.55;
      float ring = exp(-pow((r - ringR) / 0.022, 2.0)) * (0.5 + 0.5 * anoise(a, 5.0, 5.0)) * B.x * 0.10;
      ring += exp(-pow((r - ringR * 0.97) / 0.10, 2.0)) * B.x * 0.02;
      vec3 c = uFlareColor * (core + halo + rays) + mix(uFlareColor, vec3(0.80, 0.88, 1.0), 0.4) * (streak * gate) + vec3(1.0, 0.7, 0.36) * ring;
      // ghost orb, mirrored through the frame centre
      vec2 g = (uv - (vec2(0.5) + (vec2(0.5) - F.xy) * 0.9)) * vec2(uAspect, 1.0);
      float orb = smoothstep(0.17, 0.05, length(g)) * B.y;
      c += vec3(0.75, 0.8, 0.35) * orb * 0.55;
      return c * F.z;
    }

    void main() {
      // lens: a trace of colour fringing that grows towards the corners
      vec2 off = (vUv - 0.5) * dot(vUv - 0.5, vUv - 0.5) * uFringe;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b) * uExposure;
      for (int i = 0; i < ${MAX_FLARES}; i++) col += flare(vUv, uFlare[i], uFlareB[i]);
      col += uFlashColor * uFlash;
      col *= uTint;
      // vignette
      vec2 q = (vUv - 0.5) * vec2(uAspect / 1.7778, 1.0);
      col *= 1.0 - uVignette * smoothstep(0.35, 1.0, length(q) * 1.25);
      // grade: the blacks keep a breath of cold, the lights go amber (the two-tone look of film stock)
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col += vec3(0.0, 0.0006, 0.0020) * uGrade * (1.0 - smoothstep(0.0, 0.08, lum));
      col *= mix(vec3(1.0), vec3(1.035, 1.0, 0.93), uGrade * smoothstep(0.15, 0.9, lum));
      // soft shoulder: identity below 0.75, rolls off into white
      vec3 hi = max(col - 0.75, 0.0);
      col = min(col, 0.75) + 0.25 * (1.0 - exp(-hi * uShoulder));
      col *= uFade;
      col = mix(col * 12.92, 1.055 * pow(max(col, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));
      // Contrast in display space. Ours came out milky next to the reference, whose shadows are much deeper, but the
      // usual contrast about a fixed pivot drags a dark frame (the burst at f1000 is nearly all shadow) down to black:
      // this is an S that is identity at 0 and at 1, faded out below middle grey, so it only steepens a frame that has
      // the middle to steepen. The haze comes off the blacks multiplicatively for the same reason — black stays black.
      float c = clamp(col.r * 0.2126 + col.g * 0.7152 + col.b * 0.0722, 0.0, 1.0);
      float s = c * c * (3.0 - 2.0 * c);
      col += (s - c) * uContrast * smoothstep(0.0, 0.12, c) * smoothstep(0.10, 0.45, c);
      col = max(col, 0.0);
      // the haze comes off the blacks multiplicatively, so black stays black
      col *= 1.0 - uShadow * (1.0 - smoothstep(0.02, 0.45, c));
      col = clamp(col, 0.0, 1.0);
      col += (hash2(vUv * vec2(1280.0, 720.0) + fract(uTime) * 91.7) - 0.5) * uGrain;
      col *= smoothstep(0.0, 0.004, min(vUv.y, 1.0 - vUv.y) - uBars);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/** Dissolve between the frame just rendered and a second view of the same instant (linked shot transitions). */
const MixShader = {
  uniforms: { tDiffuse: { value: null }, tUnder: { value: null }, uMix: { value: 0 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform sampler2D tUnder; uniform float uMix; varying vec2 vUv;
    void main() { gl_FragColor = mix(texture2D(tDiffuse, vUv), texture2D(tUnder, vUv), uMix); }`,
};

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.autoClear = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, VIDEO_W / VIDEO_H, 0.05, 400);

    const size = new THREE.Vector2(VIDEO_W, VIDEO_H);
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(size, 0.45, 0.4, 1.0);
    this.final = new ShaderPass(FinalShader);
    this.under = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.mixPass = new ShaderPass(MixShader);
    this.mixPass.enabled = false;
    this.underMix = 0;
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.mixPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.final);

    // per-frame state the shots write into
    this.flares = Array.from({ length: MAX_FLARES }, () => ({ x: 0, y: 0, i: 0, s: 1, ring: 0, ghost: 0, rot: 0, rays: 1 }));
    this.post = { exposure: 1, flash: 0, fade: 1, vignette: 0.42, bloom: 0.45, bloomThreshold: 1.0, bloomRadius: 0.4, contrast: 0.62, shadow: 0.16, shoulder: 3.2 };
    this.width = VIDEO_W;
    this.height = VIDEO_H;
  }

  /** Fit a 16:9 stage into the available box. */
  resize(boxW, boxH, pixelRatio = Math.min(window.devicePixelRatio || 1, 2)) {
    const aspect = VIDEO_W / VIDEO_H;
    let w = boxW, h = Math.round(boxW / aspect);
    if (h > boxH) { h = boxH; w = Math.round(boxH * aspect); }
    this.width = w; this.height = h;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h, true);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.under.setSize(Math.round(w * pixelRatio), Math.round(h * pixelRatio));
    // 4x MSAA up to 1440p; above that the pixels are small enough for 2x (and the two HDR buffers get heavy)
    const samples = w * h * pixelRatio * pixelRatio > 3.8e6 ? 2 : 4;
    for (const t of [this.composer.renderTarget1, this.composer.renderTarget2, this.under]) {
      if (t.samples !== samples) { t.samples = samples; t.dispose(); }
    }
  }

  /**
   * Draw a second view of the current instant into the "under" buffer; `mix` (0..1) is its share of the final picture
   * (the mix pass blends it with the main view, before bloom). `prepare()` sets the scene up for that view.
   */
  renderUnder(mix, prepare) {
    const r = this.renderer;
    r.setRenderTarget(this.under);
    r.clear();
    prepare();
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    this.underMix = mix;
  }

  resetFrame() {
    this.underMix = 0;
    for (const f of this.flares) { f.id = null; f.i = 0; f.s = 1; f.ring = 0; f.ghost = 0; f.rot = 0; f.rays = 1; }
    const p = this.post;
    p.exposure = 1; p.flash = 0; p.fade = 1; p.vignette = 0.42; p.bloom = 0.45; p.bloomThreshold = 1.0; p.bloomRadius = 0.4; p.contrast = 0.62; p.shadow = 0.16; p.shoulder = 3.2; p.flashColor = null;
  }

  render(time) {
    const u = this.final.uniforms;
    const fc = this.post.flashColor || [1.0, 0.93, 0.78];
    u.uFlashColor.value.setRGB(fc[0], fc[1], fc[2]);
    u.uTime.value = time;
    this.flares.forEach((f, i) => {
      u.uFlare.value[i].set(f.x / VIDEO_W, 1 - f.y / VIDEO_H, f.i, 0.42 * f.s);
      u.uFlareB.value[i].set(f.ring, f.ghost, f.rot, f.rays);
    });
    const p = this.post;
    u.uExposure.value = p.exposure;
    u.uFlash.value = p.flash;
    u.uFade.value = p.fade;
    u.uVignette.value = p.vignette;
    u.uContrast.value = p.contrast ?? 0.62;
    u.uShadow.value = p.shadow ?? 0.16;
    u.uShoulder.value = p.shoulder ?? 3.2;
    this.bloom.strength = p.bloom;
    this.bloom.threshold = p.bloomThreshold;
    this.bloom.radius = p.bloomRadius;
    this.mixPass.enabled = this.underMix > 0;
    this.mixPass.uniforms.tUnder.value = this.under.texture;
    this.mixPass.uniforms.uMix.value = this.underMix;
    this.composer.render();
  }
}
