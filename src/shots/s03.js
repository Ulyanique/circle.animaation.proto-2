// Shot 3 (f70–141): monoliths on a dark floor, the camera drifts past them.
export default {
  id: 's03',
  level: [[70, 1.1], [80, 1.25], [141, 1.35]],
  fog: 0.02,
  build(b, { THREE }) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    b.addFacet([V(-40, -1.25, 10), V(40, -1.25, 10), V(40, -1.25, -60), V(-40, -1.25, -60)], { color: [0.016, 0.014, 0.009], bevel: 0, toward: V(0, 5, -10) });
  },
};
