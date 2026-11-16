import { smoothMotion as smooth } from './motion-easing.js';
import * as THREE from 'three';
export const IMPACT_TIME=59.2;
export function impactEnvelope(time){
 const age=time-IMPACT_TIME;
 return {age,flash:smooth(0,.07,age)*(1-smooth(.14,.75,age)),sparks:smooth(0,.035,age)*(1-smooth(.3,1.65,age))};
}
export function impactPoint(time,speed=3.6){return [0,1.65,9-speed*time-19];}
export function createFinaleImpact(){
 const group=new THREE.Group();group.name='Final light arrival';
 const data=new Uint8Array(128*128*4);
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  const r=Math.hypot((x-63.5)/64,(y-63.5)/64),i=(y*128+x)*4;
  data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(Math.exp(-r*r*7)*Math.max(0,1-r)*255);
 }
 const map=new THREE.DataTexture(data,128,128);map.magFilter=THREE.LinearFilter;map.needsUpdate=true;
 const flare=new THREE.Sprite(new THREE.SpriteMaterial({map,color:new THREE.Color(12,10,6),transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false}));group.add(flare);
 const rays=96,positions=new Float32Array(rays*6);
 const lineGeometry=new THREE.BufferGeometry();lineGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
 const rayMaterial=new THREE.LineBasicMaterial({color:new THREE.Color(5,3.5,1.3),transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending});
 const lines=new THREE.LineSegments(lineGeometry,rayMaterial);lines.frustumCulled=false;group.add(lines);
 const wash=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({
  uniforms:{strength:{value:0},centre:{value:new THREE.Vector2(.5,.5)}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
  fragmentShader:`varying vec2 vUv;uniform float strength;uniform vec2 centre;
   void main(){float r=length((vUv-centre)*vec2(1.3,1.));float glow=exp(-r*r*3.);gl_FragColor=vec4(vec3(1.6,1.05,.42),strength*glow);}`,
  transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,
 }));wash.frustumCulled=false;group.add(wash);
 group.traverse(object=>{object.layers.set(1);object.renderOrder=120;});
 group.userData.update=(time,camera,options)=>{
  const {age,flash,sparks}=impactEnvelope(time);
  group.visible=options.finale&&options.finalFlash&&(flash>0||sparks>0);
  if(!group.visible)return;
  group.position.fromArray(impactPoint(time));group.quaternion.copy(camera.quaternion);
  flare.scale.setScalar(5+flash*9);flare.material.opacity=flash*options.flashStrength;
  wash.material.uniforms.strength.value=flash*.65*options.flashStrength;
  const point=group.position.clone().project(camera);
  wash.material.uniforms.centre.value.set(point.x*.5+.5,point.y*.5+.5);
  lines.visible=options.flashSparks;
  for(let i=0;i<rays;i++){
   const angle=i*2.399963,seed=(Math.sin(i*71.3)*43758.5453)%1,speed=5+Math.abs(seed)*12;
   const start=.15+Math.max(0,age)*speed,end=start+.2+Math.abs(seed)*1.4;
   positions[i*6]=Math.cos(angle)*start;positions[i*6+1]=Math.sin(angle)*start;positions[i*6+2]=0;
   positions[i*6+3]=Math.cos(angle)*end;positions[i*6+4]=Math.sin(angle)*end;positions[i*6+5]=0;
  }
  lineGeometry.attributes.position.needsUpdate=true;rayMaterial.opacity=sparks*.85*options.flashStrength;
 };
 return group;
}

// Finish recentering well before the beam reaches the lockup. Shared by the
// camera position, target and roll so none can keep moving during the reveal.
export function finalCameraBlend(time){return smooth(55.5,57.8,time);}
