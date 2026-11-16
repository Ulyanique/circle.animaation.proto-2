import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Low-poly folded metal bands, not circular portals. They cross above/below the camera lane.
export function createFoldedRibbons(materials, endZ) {
  const group=new THREE.Group();
  const segments=Math.ceil((18-endZ)/2.2);
  for(let band=0;band<2;band++){
    const vertices=[];
    function edge(i, side, back=false){
      const z=18-i*2.2;
      const angle=(band===0?2.65:5.55)+.23*Math.sin(z*.032+band);
      const x=13.1*Math.cos(angle), y=8.7*Math.sin(angle)-.5;
      const width=.38+.28*(.5+.5*Math.sin(z*.045+band));
      // Fold ridge and two irregular lips form an actual angular section.
      const lip=side*width;
      return new THREE.Vector3(x+Math.cos(angle)*lip*.7,y+Math.sin(angle)*lip*.7,z+side*.32+(back ? 0.12 : 0));
    }
    function tri(a,b,c){for(const v of [a,b,c])vertices.push(v.x,v.y,v.z);}
    for(let i=0;i<segments;i++){
      const a=edge(i,-1),b=edge(i,1),c=edge(i+1,-1),d=edge(i+1,1);
      const ridge=edge(i,0);ridge.x*=.97;ridge.y*=.97;
      const nextRidge=edge(i+1,0);nextRidge.x*=.97;nextRidge.y*=.97;
      tri(a,ridge,c);tri(ridge,nextRidge,c);tri(ridge,b,nextRidge);tri(b,d,nextRidge);
    }
    const source=new THREE.BufferGeometry();source.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    // Shared normals remove the sawtooth highlights of individually shaded triangles.
    const geometry=mergeVertices(source);geometry.computeVertexNormals();source.dispose();
    const mesh=new THREE.Mesh(geometry,materials[band]);group.add(mesh);
  }
  return group;
}
