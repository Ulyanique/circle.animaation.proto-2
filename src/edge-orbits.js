import * as THREE from 'three';

export function orbitDust(count=200,seed=829){
 const values=new Float32Array(count*4);
 const random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};
 for(let i=0;i<count;i++){
  const angle=random()*Math.PI*2,radius=4.4+(random()-.5)*1.8;
  values[i*4]=Math.cos(angle)*radius;
  values[i*4+1]=Math.sin(angle)*radius;
  values[i*4+2]=(random()-.5)*.6;
  values[i*4+3]=.15+random()*.7;
 }
 return values;
}

export function orbitLayout(fov,aspect,scale=1){
 const halfHeight=Math.tan(THREE.MathUtils.degToRad(fov/2))*24;
 const halfWidth=halfHeight*aspect;
 // Keep the centre clear even on portrait displays: ornaments become smaller.
 const size=Math.min(1,aspect/.95)*scale*1.85;
 return {halfWidth,halfHeight,size};
}

export function createEdgeOrbits(glowMap){
 const root=new THREE.Group();root.name='Edge orbital ornaments';
 const pixels=new Uint8Array(32*32*4);
 for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const r=Math.hypot((x-15.5)/16,(y-15.5)/16),i=(y*32+x)*4;
  pixels[i]=pixels[i+1]=pixels[i+2]=255;
  pixels[i+3]=Math.round(Math.exp(-r*r*5)*Math.max(0,1-r)*255);
 }
 const dustMap=new THREE.DataTexture(pixels,32,32);dustMap.magFilter=THREE.LinearFilter;dustMap.needsUpdate=true;
 root.userData.dustMap=dustMap;
 const assemblies=[];
 for(let side=0;side<2;side++){
  const group=new THREE.Group(),materials=[],dustObjects=[];
  for(const [index,radius] of [3.65,4.4,5.2].entries()){
   const positions=[];
   // Broken arcs leave breathing room and reveal rotation without a solid hoop.
   for(const [start,end] of [[.08,2.62],[2.82,4.12],[4.46,6.1]]){
    const curve=new THREE.EllipseCurve(0,0,radius,radius,start,end,false,0);
    const points=curve.getPoints(112);
    for(let i=0;i<points.length-1;i++)positions.push(points[i].x,points[i].y,0,points[i+1].x,points[i+1].y,0);
   }
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
   const options={color:new THREE.Color(1.9,1.17,.39),transparent:true,opacity:1,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending};
   const material=index===1?new THREE.LineDashedMaterial({...options,dashSize:.1,gapSize:.075}):new THREE.LineBasicMaterial(options);
   const line=new THREE.LineSegments(geometry,material);line.computeLineDistances();
   line.rotation.z=index*.6;line.userData.baseOpacity=index===0?.45:index===1?.18:.26;
   materials.push([material,line.userData.baseOpacity]);group.add(line);
  }
  const dust=orbitDust(480,829+side*77),positions=[],colors=[];
  for(let i=0;i<dust.length;i+=4){
   positions.push(dust[i],dust[i+1],dust[i+2]);
   colors.push(dust[i+3]*2.5,dust[i+3]*1.48,dust[i+3]*.48);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const material=new THREE.PointsMaterial({map:dustMap,vertexColors:true,size:.13,transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending});
  const points=new THREE.Points(geometry,material);points.frustumCulled=false;group.add(points);materials.push([material,.7]);dustObjects.push(points);
  for(let i=0;i<4;i++){
   const node=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,color:new THREE.Color(2.4,1.65,.68),transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false}));
   const angle=i*1.83+side*.8,radius=i%2?5.2:3.65;
   node.position.set(Math.cos(angle)*radius,Math.sin(angle)*radius,.03);node.scale.setScalar(i===0?.32:.18);
   group.add(node);materials.push([node.material,.65]);
  }
  root.add(group);assemblies.push({group,materials,dustObjects});
 }
 root.traverse(object=>{object.layers.set(1);object.renderOrder=110;});
 root.userData.update=(camera,time,options,visibility=1)=>{
  root.visible=options.edgeOrbits;
  if(!root.visible)return;
  camera.updateMatrixWorld();root.position.copy(camera.position);root.quaternion.copy(camera.quaternion);
  const {halfWidth,halfHeight,size}=orbitLayout(camera.fov,camera.aspect,options.orbitSize);
  assemblies.forEach(({group,materials,dustObjects},index)=>{
   const sign=index===0?-1:1;
   group.position.set(sign*(halfWidth+.7*size),-sign*(halfHeight+.7*size),-24);
   group.scale.setScalar(size);group.rotation.set(.12*sign,.14*sign,sign*time*.045*options.orbitSpeed+index*.9);
   materials.forEach(([material,base])=>{material.opacity=base*options.orbitBrightness*visibility;});
   dustObjects.forEach(object=>{object.visible=options.orbitParticles;});
  });
 };
 return root;
}
