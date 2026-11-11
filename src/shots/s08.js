// Shot 8 (f335–387): the gold face turns into the substation footage, which tilts up to the chimney and the sky;
// a gold shard slides in from the left at the end.
export default {
  id: 's08',
  screens: {
    // the footage defocuses and darkens at the very end (the next shot starts in the dark)
    substation: { reveal: [[335, 0.42], [342, 1]], sepia: [[338, 1, 'smooth'], [346, 0]], gain: [[336, 1.25], [350, 1.0], [378, 1.0], [387, 0.5]] },
  },
  overlays: [{
    depth: 4,
    visible: [364, 387],
    level: 1.4,
    // boundary of the shard at f387; it slides in from the left
    offset: [[364, [-560, 60]], [372, [-410, 40]], [378, [-294, 20]], [382, [-200, 10]], [387, [0, 0]]],
    polys: [
      { pts: [[-900, -200], [505, -200], [560, 10], [470, 110], [545, 400], [440, 720], [400, 1000], [-900, 1000]], tone: [24, 20, 11], glow: 0.1, bevel: 0.5, edge: 0.8 },
      { pts: [[-900, -200], [330, -200], [390, 60], [130, 330], [-900, 420]], tone: [52, 43, 24], z: -0.01, glow: 0.2, bevel: 0.5, edge: 0.8 },
    ],
  }],
};
