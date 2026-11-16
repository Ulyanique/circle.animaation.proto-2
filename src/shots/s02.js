// Shot 2 (f48–69): a lit block turning in the dark, the light sliding across its faces.
//
// Eight planes over twelve units of world leave the frame mostly one big slab and a dark field around it. A cluster of
// small facets sits behind them (richness.js) so the shot has depth to read instead of a flat backdrop.
import { seedFacets } from './richness.js';

export default {
  id: 's02',
  build(builder) {
    // the cone behind the block: at z −9 the camera sees roughly x −3.5…3.9, y −2.1…2.0
    seedFacets(builder, {
      count: 34,
      seed: 31,
      box: [[-3.4, 4.0], [-2.2, 2.2], [-11.0, -9.0]],
      toward: [0.2, 0, 0.4],
      tone: [200, 162, 96],
      spread: 0.55,
      size: [0.5, 1.7],
      edge: 8,
      rim: 0.6,
    });
  },
};
