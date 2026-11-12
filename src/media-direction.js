import { sampleLightSpline } from './choreography.js';
import { smoothMotion as smooth } from './motion-easing.js';
import * as THREE from 'three';

// Attention windows precede the camera crossing. No stops or backwards targets.
// At most one shot has influence; all joins have zero envelope velocity.
export function mediaReadingShot(time,panels){
 let index=-1,weight=0;
 for(let i=0;i<panels.length;i++){
  const start=4.8+i*5;
  const influence=smooth(start,start+2,time)*(1-smooth(start+2.8,start+4.8,time));
  if(influence>weight){index=i;weight=influence;}
 }
 return {index,weight};
}

// Frame a complete image in view space, including its real rotation. This changes
// the lens, never the source aspect or camera's longitudinal path.
export function mediaReadingFov(camera,panel,mobile=false){
 const halfX=panel.width/2,halfY=panel.height/2;
 let tangent=0;
 for(const x of [-halfX,halfX])for(const y of [-halfY,halfY]){
  const point=new THREE.Vector3(x,y,.15).applyMatrix4(panel.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
  const depth=Math.max(2,-point.z);
  tangent=Math.max(tangent,Math.abs(point.y)/depth,Math.abs(point.x)/depth/camera.aspect);
 }
 const fitted=THREE.MathUtils.radToDeg(2*Math.atan(tangent/.84));
 return Math.max(mobile?68:52,Math.min(mobile?90:68,fitted));
}

export function mediaPassVisibility(cameraZ,panelZ){return smooth(-.5,6.5,cameraZ-panelZ);}

// A fixed lens during media playback: live corner fitting caused visible zoom
// pulses as a source approached, even though the panel itself was stationary.
export function mediaPlaybackFov(time,mobile=false){
 return (mobile?78:60)+(mobile?-10:-14)*smooth(55.5,57.8,time);
}
export function mediaAttentionWeight(weight,finish=0){return .45*weight*(1-finish);}

// One authored gaze track, not ten on/off steering envelopes. Fixed forward
// look distance also prevents the apparent dolly/perspective kick near a card.
export function createMediaGaze(panels){
 const knots=panels.map((panel,i)=>{
  const partner=panels[i%2===0?Math.min(i+1,panels.length-1):i-1];
  return [7.2+i*5,(panel.position.x+partner.position.x)/2,panel.position.y];
 });
 if(!knots.length)return (time,pose,finish=0)=>[pose[3]*(1-finish),pose[4]*(1-finish),pose[5]];
 knots.unshift([0,...knots[0].slice(1)]);
 knots.push([70.58,...knots.at(-1).slice(1)]);
 return (time,pose,finish=0,enabled=true)=>{
  const point=sampleLightSpline(knots,time),weight=enabled ? .45*smooth(0,6,time):0;
  return [(pose[3]+(point[0]-pose[3])*weight)*(1-finish),
   (pose[4]+(point[1]-pose[4])*weight)*(1-finish),pose[5]];
 };
}
