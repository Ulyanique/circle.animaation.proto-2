// Shot 9 (f388–468): dark start with a glinting gold facet, the lineman footage appears (f401–405); a big gold plane
// slides in at the end.
export const goldPlane = {
  // boundary of the big foreground plane at f468; it slides in from the bottom right and keeps going in shot 10,
  // so both shots draw it from the same keys (the hand-over at f469 is a dissolve between the two)
  polys: [
    { pts: [[1050, -300], [1200, -300], [733, 1100], [-117, 1100]], tone: [150, 127, 84], glow: 0.04, bevel: 0.6, edge: 0.5 },
    { pts: [[1200, -300], [2600, -300], [2600, 1100], [733, 1100]], tone: [122, 104, 68], glow: 0.02, bevel: 0.6, edge: 0.5 },
  ],
  depth: 4, front: true,
  // x offset of the plane edge relative to its f468 position
  offset: [[430, [1044, 0]], [436, [820, 0]], [440, [650, 0]], [446, [450, 0]], [452, [360, 0]], [458, [260, 0]], [464, [110, 0]], [468, [0, 0]], [479, [-240, 0]]],
  level: [[440, 0.3], [446, 0.34], [452, 0.4], [458, 0.55], [464, 0.68], [468, 0.73], [479, 0.9]],
};

export default {
  id: 's09',
  screens: {
    lineman: {
      reveal: [[399, 0], [407, 1]],
      sepia: 0,
      gain: [[404, 1.0], [414, 1.2], [428, 1.08], [445, 1.0], [462, 1.12], [468, 1.25]],
    },
  },
  overlays: [{ ...goldPlane, visible: [428, 468] }],
};
