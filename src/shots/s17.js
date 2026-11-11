// Shots 17+18 (f963–1213): the flare explodes into a burst of sparks (flash peak f974); through the fading flash the
// emblem appears — a golden compass opens (f984–1008) and a point of light draws the circle around it (f1000–1040) —
// then the caption rises below it (f1022–1050). The title holds until the end while the camera creeps towards it.
import * as THREE from 'three';
import { track } from '../core/util.js';
import { makeTitle, ringPointPx } from '../fx/title.js';
import { makeBurst } from '../fx/burst.js';

const centre = track([[963, [665, 375]], [966, [645, 352]], [970, [640, 356]], [1003, [641, 362]]]);
const flareI = track([[963, 1.5], [966, 2.2], [970, 3.0], [974, 4.0], [979, 3.0], [985, 2.0], [988, 1.4], [991, 0.7], [994, 0.3], [997, 0.12], [1003, 0.03], [1008, 0]]);
const flareS = track([[963, 1.4], [968, 3.0], [974, 6.0], [982, 4.5], [988, 3.5], [994, 2.4], [1003, 1.5]]);
const flash = track([[963, 0.04], [966, 0.19], [969, 0.5], [972, 0.85], [974, 1.0], [976, 0.8], [979, 0.58], [982, 0.48], [985, 0.4], [988, 0.25], [991, 0.1], [994, 0.035], [997, 0.012], [1000, 0.004], [1003, 0]]);
const opacity = track([[980, 0], [986, 0.45], [993, 1]]);
const open = track([[984, 0, 'smooth'], [1008, 1]]);                 // the legs of the compass
const ringP = track([[1000, 0, 'smooth'], [1040, 1]]);               // how much of the circle is drawn
const ringLevel = track([[1000, 1.3], [1040, 1.3], [1075, 0.95], [1213, 0.85]]);
const tipI = track([[1000, 0], [1004, 0.8], [1033, 0.8], [1041, 0]]);    // the point of light that draws it
const caption = track([[1022, 0, 'smooth'], [1046, 1]]);
const rise = track([[1022, 8, 'out'], [1050, 0]]);
const rays = track([[963, 1], [970, 0.2], [1000, 0.2], [1010, 1]]);
const beams = track([[1003, 0], [1009, 0.22], [1045, 1]]);
const bokeh = track([[972, 0], [980, 1], [1003, 0.9], [1060, 0.32], [1120, 0.16], [1213, 0.1]]);
const glint = track([[1046, [270, 512]], [1207, [1020, 524]]]);      // a sparkle that wanders along the caption
const glintI = track([[1046, 0], [1066, 0.2], [1120, 0.12], [1190, 0.26], [1213, 0.2]]);

export default {
  id: 's17',
  make() {
    const group = new THREE.Group();
    group.visible = false;
    const title = makeTitle();
    const burst = makeBurst();
    group.add(title.group, burst);
    const size = new THREE.Vector2();
    return {
      id: 's17', range: [963, 1213], group,
      update(f, st, time) {
        const cam = st.camera;
        cam.position.set(0, 0, 0); cam.quaternion.identity();
        if (cam.fov !== 45) { cam.fov = 45; cam.updateProjectionMatrix(); }
        cam.updateMatrixWorld(true);
        st.renderer.getDrawingBufferSize(size);
        const p = ringP(f);
        title.update(f, time, {
          opacity: opacity(f), open: open(f), ring: p, ringLevel: ringLevel(f), caption: caption(f), rise: rise(f),
          beams: beams(f), bokeh: bokeh(f), px: size.y / 720,
        });
        const c = centre(f);
        burst.visible = f < 1004;
        burst.material.uniforms.uF.value = f;
        burst.material.uniforms.uC.value.set(c[0], c[1]);
        const fl = st.flares[0];
        fl.x = c[0]; fl.y = c[1]; fl.i = flareI(f); fl.s = flareS(f); fl.ring = 0; fl.rays = rays(f); fl.rot = time * 0.3;
        const gl = st.flares[1];
        if (f < 1042) {
          // the tip of light on the circle
          const q = ringPointPx(p, f);
          gl.x = q[0]; gl.y = q[1]; gl.i = f >= 1000 ? tipI(f) : 0; gl.s = 0.5; gl.ring = 0; gl.rays = 0.7; gl.rot = time * 0.2;
        } else {
          const g = glint(f);
          gl.x = g[0]; gl.y = g[1]; gl.i = f >= 1046 ? glintI(f) : 0; gl.s = 0.42; gl.ring = 0; gl.rays = 1; gl.rot = time * 0.1;
        }
        st.post.flash = flash(f);
        st.post.flashColor = [1.0, 0.64, 0.32];
        st.post.vignette = 0.34;
      },
    };
  },
};
