import * as THREE from 'three';

export function createSceneTarget(width, height, pixelRatio, maxSamples, mobile = false) {
  const target = new THREE.WebGLRenderTarget(
    Math.max(1,Math.round(width*pixelRatio)),Math.max(1,Math.round(height*pixelRatio)),
    {type:THREE.HalfFloatType,samples:Math.min(mobile?2:4,Math.max(0,maxSamples)),depthBuffer:true},
  );
  target.texture.name='Cinema HDR multisample';
  return target;
}

// Rotation-minimizing transport avoids the world-up singularity at vertical tangents.
// Project the previous normal into the next tangent plane instead of rebuilding it.
export function transportNormal(tangent, normal, first = false) {
  if(first){
    normal.set(Math.abs(tangent.y)<.85?0:1,Math.abs(tangent.y)<.85?1:0,0);
  }
  normal.addScaledVector(tangent,-normal.dot(tangent));
  if(normal.lengthSq()<1e-10){
    normal.set(Math.abs(tangent.x)<.85?1:0,Math.abs(tangent.x)<.85?0:1,0);
    normal.addScaledVector(tangent,-normal.dot(tangent));
  }
  return normal.normalize();
}
