// Shot 10 (f469–521): the camera rolls and pulls back from the big gold plane; the white-helmet worker appears on a
// rotated screen (f488–497).
import { goldPlane } from './s09.js';

export default {
  id: 's10',
  level: [[469, 1.0], [505, 1.0], [521, 0.8]],
  screens: {
    helmet: { reveal: [[484, 0], [497, 1]], sepia: [[490, 0.6], [503, 0]], gain: [[490, 1.08], [503, 1.0]] },
  },
  // the big plane of shot 9 dissolves into this shot's shard cluster
  overlays: [{ ...goldPlane, visible: [469, 479], opacity: [[469, 1], [471, 0.85], [479, 0]] }],
};
