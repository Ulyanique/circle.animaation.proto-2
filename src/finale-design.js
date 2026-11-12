import * as THREE from 'three';

function bevelShape(points,depth=.1){
 const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
 return new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:.012,bevelSize:.012,bevelSegments:3,curveSegments:24,steps:1});
}
export function createDraftingCompass(gold,dark,tip){
 const group=new THREE.Group();group.name='Solid drafting compass';
 for(const side of [-1,1]){
  const mesh=new THREE.Mesh(bevelShape([[side*.07,2.72],[side*.32,2.76],[side*1.16,.23],[side*1.04,-.06],[side*.86,.32]]),gold);
  mesh.position.z=-.045;group.add(mesh);
  const needle=new THREE.Mesh(bevelShape([[side*1.04,.16],[side*1.13,.12],[side*1.19,-.26]],.035),tip);needle.position.z=-.01;group.add(needle);
  for(const y of [1.1,2.2]){
   const x=side*(.19+(2.72-y)*.33);
   const pin=new THREE.Mesh(new THREE.CylinderGeometry(.024,.024,.13,16),dark);pin.rotation.x=Math.PI/2;pin.position.set(x,y,.04);group.add(pin);
  }
 }
 const ring=new THREE.Shape();ring.absarc(0,2.8,.32,0,Math.PI*2,false);
 const hole=new THREE.Path();hole.absarc(0,2.8,.18,0,Math.PI*2,true);ring.holes.push(hole);
 const pivot=new THREE.Mesh(new THREE.ExtrudeGeometry(ring,{depth:.13,bevelEnabled:true,bevelSize:.013,bevelThickness:.013,bevelSegments:3,curveSegments:40}),gold);pivot.position.z=.02;group.add(pivot);
 const grip=new THREE.Mesh(bevelShape([[-.065,3.08],[.065,3.08],[.055,3.48],[-.055,3.48]],.09),gold);group.add(grip);
 const bar=new THREE.Mesh(new THREE.CapsuleGeometry(.065,2.45,6,12),gold);bar.rotation.z=Math.PI/2;bar.position.set(0,.91,.13);group.add(bar);
 const slider=new THREE.Mesh(new THREE.BoxGeometry(.14,.39,.16),gold);slider.position.set(0,.91,.17);group.add(slider);
 const screw=new THREE.Mesh(new THREE.CylinderGeometry(.032,.032,.18,20),dark);screw.rotation.x=Math.PI/2;screw.position.set(0,.91,.22);group.add(screw);
 return group;
}

export function finaleFit(fov,aspect){
 const width=2*19*Math.tan(THREE.MathUtils.degToRad(fov/2))*aspect;
 return Math.min(1,width*.86/16);
}

export function createFinalBackdrop(){
 const material=new THREE.ShaderMaterial({
  uniforms:{opacity:{value:0}},transparent:true,depthWrite:false,depthTest:true,
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec2 vUv;uniform float opacity;
   void main(){vec2 p=(vUv-.5)*5.;float light=exp(-dot(p,p)*2.);
    vec3 graphite=mix(vec3(.006,.0064,.007),vec3(.027,.027,.026),light);
    gl_FragColor=vec4(graphite,opacity);}`,
 });
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(100,70),material);mesh.position.z=-2;mesh.renderOrder=-20;mesh.layers.set(1);return mesh;
}
