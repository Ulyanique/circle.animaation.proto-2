import { sampleLightSpline } from './choreography.js';

// Bake only when authored knots/source dimensions change, never during playback.
// Shared endpoint derivatives give a C1 lookup with negligible interpolation error.
export function bakeLightPath(knots,rate=240){
 const start=knots[0][0],end=knots.at(-1)[0],steps=Math.ceil((end-start)*rate),step=(end-start)/steps;
 const positions=new Float64Array((steps+1)*3),velocities=new Float64Array((steps+1)*3),distances=new Float64Array(steps+1),epsilon=1e-4;
 for(let i=0;i<=steps;i++){
  const time=start+i*step,point=sampleLightSpline(knots,time);
  const before=sampleLightSpline(knots,time-epsilon),after=sampleLightSpline(knots,time+epsilon);
  for(let axis=0;axis<3;axis++){positions[i*3+axis]=point[axis];velocities[i*3+axis]=(after[axis]-before[axis])/(2*epsilon);}
  if(i>0)distances[i]=distances[i-1]+Math.hypot(...point.map((value,axis)=>value-positions[(i-1)*3+axis]));
 }
 return {
  distanceAt(time){
   const f=(Math.max(start,Math.min(end,time))-start)/step,i=Math.min(steps-1,Math.floor(f)),u=f-i;
   return distances[i]+(distances[i+1]-distances[i])*u;
  },
  timeAtDistance(distance){
   if(distance<=0)return start;
   if(distance>=distances[steps])return end;
   let low=0,high=steps;
   while(high-low>1){const middle=(low+high)>>1;if(distances[middle]<=distance)low=middle;else high=middle;}
   const span=distances[high]-distances[low];
   return start+(low+(span>0?(distance-distances[low])/span:0))*step;
  },
  sample(time,target=new Float64Array(3)){
   const bounded=Math.max(start,Math.min(end,time)),f=(bounded-start)/step,i=Math.min(steps-1,Math.floor(f)),u=f-i;
   if(time<=start||time>=end){const offset=time<=start?0:steps*3;for(let axis=0;axis<3;axis++)target[axis]=positions[offset+axis];return target;}
   const u2=u*u,u3=u2*u,h0=2*u3-3*u2+1,h1=u3-2*u2+u,h2=-2*u3+3*u2,h3=u3-u2;
   for(let axis=0;axis<3;axis++)target[axis]=h0*positions[i*3+axis]+h1*step*velocities[i*3+axis]+h2*positions[(i+1)*3+axis]+h3*step*velocities[(i+1)*3+axis];
   return target;
  },
 };
}

export function createRenderGate(){
 let dirty=true,settleUntil=0;
 return {
  invalidate(now,duration=1400){dirty=true;settleUntil=Math.max(settleUntil,now+duration);},
  shouldRender(now,playing,hidden=false){
   if(hidden)return false;
   const render=playing||dirty||now<settleUntil;
   if(render)dirty=false;
   return render;
  },
 };
}
