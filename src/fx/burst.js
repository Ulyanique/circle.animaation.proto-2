// Burst (f963–1000): radial sparks thrown out of the flash. Instanced streak quads drawn directly in video pixels.

import * as THREE from 'three';
import { rng } from '../core/util.js';

export function makeBurst(count = 380) {
  const R = rng(5);
  const s = new Float32Array(count * 4), w = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    s.set([R() * Math.PI * 2, 10 + 62 * Math.pow(R(), 1.2), 962 + 20 * Math.pow(R(), 1.3), 1.2 + 3.2 * R()], i * 4);
    w.set([2.0 + 3.4 * R() * R(), 1.0 + 2.0 * R()], i * 2);
  }
  const base = new THREE.PlaneGeometry(1, 1);
  base.translate(0.5, 0, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(s, 4));
  geo.setAttribute('aW', new THREE.InstancedBufferAttribute(w, 2));
  geo.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uF: { value: 0 }, uC: { value: new THREE.Vector2(640, 356) }, uGain: { value: 1 } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec4 aS; attribute vec2 aW; uniform float uF; uniform vec2 uC;
      varying float vA; varying vec2 vQ;
      void main() {
        float tau = uF - aS.z;
        float head = aS.y * max(tau, 0.0), tail = aS.y * max(tau - aS.w, 0.0);
        vec2 dir = vec2(cos(aS.x), sin(aS.x));
        vec2 p = uC + dir * mix(tail, head, position.x) + vec2(-dir.y, dir.x) * position.y * aW.x;
        vA = aW.y * step(0.0, tau) * smoothstep(26.0, 10.0, tau) * smoothstep(1001.0, 990.0, uF);
        vQ = vec2(position.x, position.y * 2.0);
        gl_Position = vec4(p.x / 640.0 - 1.0, 1.0 - p.y / 360.0, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uGain; varying float vA; varying vec2 vQ;
      void main() { gl_FragColor = vec4(vec3(1.0, 0.85, 0.56) * (0.2 + 0.8 * vQ.x) * (1.0 - vQ.y * vQ.y) * vA * uGain, 1.0); }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 31;
  return mesh;
}
