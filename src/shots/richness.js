// Facets that give a bare shot something to look at.
//
// Some shots were reconstructed from very few planes — shot 1 is thirteen faces spread over fifty units of world — so
// at a given frame the camera gives two or three big slabs and a wide empty field. The light then has nothing to catch
// on and the eye has nothing to measure depth by. The reference film is a dense lattice there instead: what reads as
// depth is the number of edges, not the size of the planes.
//
// A field of facets alone does not fix that. Put as separate cards in the void they read as cards, however they are
// lit — the eye wants them in the same cladding as everything else: overlapping, of a piece, edges shared. So they are
// seeded as a *cluster*: one slab of world, facets laid close enough to touch and to hide each other in part, all of
// them cut by the same small number of planes. `fan`: how far the cluster reaches, `density` how tightly it is packed.

import * as THREE from 'three';
import { rng, rgb255 } from '../core/util.js';

/**
 * Adds a cluster of small facets inside `box` (world limits x/y/z), facing `toward`. `tone` is in 0–255 sRGB.
 *
 * A face is dark and its chamfer is bright: in the reference a facet in shadow is nearly black and what the eye sees is
 * the lit edge. `edge` multiplies the rim colour, and since the rim colour is a near-black base it has to be large to
 * show at all — but not so large that the rim becomes a hard white stroke.
 */
export function seedFacets(builder, {
  count = 24, box, toward = [0, 0, 0], seed = 1, tone = [90, 74, 44], spread = 0.55,
  size = [0.6, 2.4], edge = 10, rim = 0.5, tilt = [0.7, 0.5],
}) {
  const R = rng(seed);
  const target = new THREE.Vector3(...toward);
  // Three planes the whole cluster is cut by, as the authored geometry is cut by a few shared directions. A facet
  // drawn with no relation to its neighbours is the thing that reads as a card; facets that share a handful of
  // directions read as one broken sheet of glass.
  const cuts = [0, 1, 2].map(() => new THREE.Euler((R() - 0.5) * tilt[0], R() * Math.PI * 2, (R() - 0.5) * tilt[1]));
  for (let i = 0; i < count; i++) {
    const at = new THREE.Vector3(
      box[0][0] + R() * (box[0][1] - box[0][0]),
      box[1][0] + R() * (box[1][1] - box[1][0]),
      box[2][0] + R() * (box[2][1] - box[2][0]),
    );
    const k = size[0] + R() * (size[1] - size[0]);
    const e = cuts[(R() * cuts.length) | 0];
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      e.x + (R() - 0.5) * 0.12, e.y + (R() - 0.5) * 0.12, e.z + (R() - 0.5) * 0.12,
    ));
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      // not a rectangle: a corner is pushed in, so the face is an irregular quad like the authored ones
      const w = u < 0 ? 1 + (R() - 0.5) * 0.55 : 1, h = v < 0 ? 1 + (R() - 0.5) * 0.55 : 1;
      return new THREE.Vector3(u * k * w * 0.5, v * k * h * 0.5, 0).applyQuaternion(q).add(at);
    });
    // Tone: a face's place in the shot's range, *plus* its distance. Depth cueing is most of what makes a set of
    // separate planes read as one place — without it they are all equally lit and look pasted on, however many there
    // are. Faces further from the lens (-z) go darker, as they would in fog.
    const depth = (box[2][1] - at.z) / Math.max(1e-3, box[2][1] - box[2][0]);      // 0 near, 1 far
    const f = (R() * spread) * (1 - 0.55 * depth);
    builder.addFacet(pts, {
      color: rgb255(tone[0] * rim * f, tone[1] * rim * f, tone[2] * rim * f),
      bevel: 0.008 + R() * 0.014,
      edge,
      glow: 0,
      toward: target,
    });
  }
}
