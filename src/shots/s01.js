// Shot 1 (f1–47): close-up of long gold facets, the light ramps up.
//
// The authored geometry is thirteen faces over fifty units of world, and at the opening frame they leave the right half
// of the picture almost empty: u 0.60–1.00 / v −0.6–0.96 is a broad dark field, because the planes that do reach there
// (d, d2, g, x1, e) are all turned away from the light and read as shadow. The reference is a dense lattice of small
// facets over the whole frame, and what the eye reads as depth there is the number of edges, not the size of the planes.
//
// So a seeded field of small facets stands in that field, in front of those planes (z −6.2 … −4.6 against their −5.0 …
// −8.2) and inside the cone the camera sees. Their faces are near black and their chamfers bright — see richness.js —
// which is what makes them read as glass rather than as more flat wall.
import { seedFacets } from './richness.js';

export default {
  id: 's01',
  level: [[1, 0.28], [8, 0.45], [25, 1.0]],
  build(builder) {
    // the empty field, in world units: measured from where the planes above actually land on the first frame
    seedFacets(builder, {
      count: 46,
      seed: 7,
      box: [[1.7, 7.6], [-4.2, 3.8], [-7.2, -6.0]],
      toward: [0.9, 0.05, 0.7],
      tone: [205, 158, 82],
      spread: 0.5,
      size: [0.9, 2.4],
      edge: 7,
      rim: 0.62,
    });
    // …and a thinner scatter behind the left-hand slabs, so the depth does not stop at one wall
    seedFacets(builder, {
      count: 24,
      seed: 23,
      box: [[-6.2, -0.4], [-3.6, 3.4], [-9.2, -7.8]],
      toward: [0.9, 0.05, 0.7],
      tone: [190, 148, 78],
      spread: 0.55,
      size: [0.8, 2.2],
      edge: 6,
      rim: 0.55,
    });
  },
};
