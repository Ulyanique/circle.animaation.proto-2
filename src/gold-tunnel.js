import * as THREE from 'three';

// An offset eight-sided passage: no central apex, triangular portals or repeating full ribs.
export function createGoldTunnel(random, materials, endZ=-240) {
  const group=new THREE.Group();
  const profile=[[-12,-6.8],[12.8,-6.2],[14.2,-1.8],[11.6,5.8],[4.1,8.8],[-5.7,7.2],[-13.4,3.6],[-14.6,-2.5]];
  const rings=[];
  let z=16;
  while(z>endZ){
    // Unequal chambers expand and contract rather than reading as a long extruded tube.
    const chamber=1.08+.12*Math.sin(z*.075)+.07*Math.sin(z*.16+1);
    const width=chamber+random()*.05,height=1+.12*Math.cos(z*.082)+random()*.07;
    const shiftX=Math.sin(z*.041)*.65,shiftY=Math.cos(z*.053)*.22,twist=Math.sin(z*.035)*.055;
    const corners=profile.map(([x,y])=>{
      const px=x*width+(random()-.5)*.25;
      let py=y*height+(random()-.5)*.25;
      if(y<-6)py=Math.min(-3.9,py+Math.sin(z*.23+x*.12)*1.25+(random()-.5)*1.3);
      return new THREE.Vector3(px*Math.cos(twist)-py*Math.sin(twist)+shiftX,px*Math.sin(twist)+py*Math.cos(twist)+shiftY,z);
    });
    const ring=[];
    for(let i=0;i<corners.length;i++){
      const a=corners[i],b=corners[(i+1)%corners.length];ring.push(a);
      const midpoint=a.clone().lerp(b,.5);
      const radial=new THREE.Vector3(midpoint.x,midpoint.y,0).normalize();
      midpoint.addScaledVector(radial,i===0?Math.sin(z*.12)*.9:Math.sin(z*.065+i*1.8)*.6);
      if(i===0){midpoint.y=Math.min(-3.7,midpoint.y+Math.sin(z*.29)*1.35);midpoint.x+=(random()-.5)*2;}
      ring.push(midpoint);
    }
    rings.push(ring);z-=7+random()*5;
  }
  const positions=materials.map(()=>[]);
  function triangle(a,b,c,materialIndex){
    const bucket=positions[materialIndex];
    for(const vertex of [a,b,c])bucket.push(vertex.x,vertex.y,vertex.z);
  }
  const edgeCount=rings[0].length;
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<edgeCount;j++){
    const k=(j+1)%edgeCount,a=rings[i][j],b=rings[i][k],c=rings[i+1][j],d=rings[i+1][k];
    // Two broad planar facets, not four spiky triangles meeting at a random peak.
    // Alternate diagonals only by architectural bay, never by surface colour.
    const alloy=Math.floor(j/2)%materials.length;
    if(i%2){triangle(a,b,c,alloy);triangle(b,d,c,alloy);}
    else{triangle(a,b,d,alloy);triangle(a,d,c,alloy);}

  }
  positions.forEach((vertices,i)=>{
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,materials[i]);mesh.receiveShadow=true;group.add(mesh);
  });
  const seamMaterial=new THREE.MeshPhysicalMaterial({color:0xb89b60,metalness:.86,roughness:.32,emissive:0x4d3717,emissiveIntensity:.055});
  group.userData.seamMaterial=seamMaterial;
  group.userData.profile=profile;
  group.userData.rings=rings;
  return group;
}
