// Shot 11b (f533–576): pylons from a low angle; the camera pans left and the cabinet shard of shot 12 slides in.
export default {
  id: 's11b',
  screens: {
    pylons: { reveal: 1, sepia: 0, gain: 1 },
    cabinet: { reveal: [[552, 0], [566, 1]], sepia: [[558, 0.8], [577, 0.5]], gain: 1 },      // the very shard of shot 12 (tools/unify.py); its look carries on there
  },
};
