// Shot 12 (f577–655): worker at the cabinet; the camera pulls back and rolls, the screen recedes into the dark.
export default {
  id: 's12',
  level: [[577, 1.0], [636, 1.0], [655, 0.7]],
  screens: {
    cabinet: { reveal: 1, sepia: [[577, 0.5], [592, 0]], gain: [[577, 1.0], [612, 1.1], [640, 1.0]] },
    pylons: { reveal: 1, sepia: 0, gain: 1 },      // the very shard of shot 11b (tools/unify.py)
  },
};
