// Shot 3 (f70–141): the drone drifts past a wall of slabs, the light running along them.
//
// Seven planes over thirty-six units: the wall fills the top of the frame and everything under it is a dark field. A
// cluster of small facets stands in that field (richness.js), inside the cone the camera sweeps.
import { seedFacets } from './richness.js';

export default {
  id: 's03',
  build(builder) {
    // at z −9 the camera sees roughly x −5…3.3, y −2.4…2.5, and it sweeps left over the shot
    seedFacets(builder, {
      count: 40,
      seed: 47,
      box: [[-5.6, 3.6], [-2.6, 2.6], [-11.5, -9.0]],
      toward: [-0.8, 0, 1.1],
      tone: [198, 160, 94],
      spread: 0.55,
      size: [0.6, 2.0],
      edge: 8,
      rim: 0.6,
    });
  },
};
