import * as THREE from 'three';

// Side-facing strip sources, not frontal fill. They illuminate the architectural
// perimeter while keeping the centre lane dark. Analytic motion is seek-safe.
export function edgeLightPose(time, cameraZ, side) {
  const phase=time*.16+side*.7;
  return {
    position:[side*(10.4+.3*Math.sin(phase)),1.1+Math.sin(phase*.8)*1.2,cameraZ-10],
    target:[side*15,2.2+Math.sin(phase)*1.4,cameraZ-19],
    intensity:side<0?1.1:.65,
  };
}

export function createEdgeLighting() {
  const group=new THREE.Group();
  for(const side of [-1,1]) {
    const light=new THREE.RectAreaLight(side<0?0xf0cf94:0xc5cbd1,0,.45,8);
    light.userData.side=side;group.add(light);
  }
  group.userData.update=(time,cameraZ,visibility)=>{
    for(const light of group.children){
      const pose=edgeLightPose(time,cameraZ,light.userData.side);
      light.position.fromArray(pose.position);light.lookAt(...pose.target);
      light.intensity=pose.intensity*Math.max(0,Math.min(1,visibility));
    }
  };
  return group;
}
