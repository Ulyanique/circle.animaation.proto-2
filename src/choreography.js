// Time-parametrised C1-continuous cubic interpolation. Independent of the renderer.
export function sampleSpline(knots, time) {
  let i = 0;
  while (i < knots.length - 2 && time > knots[i + 1][0]) i++;
  const a = knots[i], b = knots[i + 1];
  const previous = knots[Math.max(0, i - 1)], next = knots[Math.min(knots.length - 1, i + 2)];
  const duration = b[0] - a[0];
  const u = Math.max(0, Math.min(1, (time - a[0]) / duration));
  const u2 = u * u, u3 = u2 * u;
  return a.slice(1).map((value, j) => {
    const m0 = (b[j + 1] - previous[j + 1]) / (b[0] - previous[0]) * duration;
    const m1 = (next[j + 1] - a[j + 1]) / (next[0] - a[0]) * duration;
    return (2*u3-3*u2+1)*value + (u3-2*u2+u)*m0 + (-2*u3+3*u2)*b[j+1] + (u3-u2)*m1;
  });
}

export const orbitOffsets = [
  // time, normalised local x/y, local z. First in front, then around the edge, then behind.
  [0, -.68, -.43, 1.2],
  [1.1, .08, -.43, 1.3],
  [2, .68, -.43, .4],
  [3, .2, .42, -3],
  [3.65, -.64, .40, -1.1],
];

// Mirror the loop with the stage: enter from the central lane on either side.
export function mediaOrbitKnots(index){
 const side=index%2===0?1:-1;
 return orbitOffsets.map(([time,x,y,z])=>[time,x*side,y,z]);
}

// A travelling rig, not a sequence of dolly stops. Longitudinal speed is constant.
export function travellingCameraPose(time, spacing, interval, firstPanelZ) {
  const speed=spacing/interval, z=9-speed*time;
  // One side of the stage, not alternating slaloms between successive media.
  // A small, slow drift provides life without a five-second direction reversal.
  const intro=Math.max(0,Math.min(1,time/6));
  const envelope=intro*intro*intro*(10-15*intro+6*intro*intro);
  const x=(-8.3+.25*Math.sin(time*.12))*envelope;
  const y=-.65+.18*Math.sin(time*.15);
  return [x,y,z,x,.3+.07*Math.sin(time*.12),z-21,Math.sin(time*.12)*.004];
}


export function trailOpacity(fraction) {
  return Math.pow(Math.max(0,1-Math.max(0,Math.min(1,fraction))),1.65);
}

export function lightBridgePoint(pose, index) {
  return [pose[0]+(index%2?1.2:-1.2),.65+Math.sin(index)*.55,pose[2]-14];
}

// Quintic Hermite flight: common velocity and zero acceleration at each authored knot.
// Unlike cubic interpolation, the acceleration does not jump when entering a new arc.
export function sampleLightSpline(knots, time) {
  let i=0;
  while(i<knots.length-2 && time>knots[i+1][0])i++;
  const a=knots[i],b=knots[i+1];
  const previous=knots[Math.max(0,i-1)],next=knots[Math.min(knots.length-1,i+2)];
  const duration=b[0]-a[0],u=Math.max(0,Math.min(1,(time-a[0])/duration));
  const u2=u*u,u3=u2*u,u4=u3*u,u5=u4*u;
  return a.slice(1).map((value,j)=>{
    const v0=(b[j+1]-previous[j+1])/(b[0]-previous[0])*duration;
    const v1=(next[j+1]-a[j+1])/(next[0]-a[0])*duration;
    return value*(1-10*u3+15*u4-6*u5)+b[j+1]*(10*u3-15*u4+6*u5)
      +v0*(u-6*u3+8*u4-3*u5)+v1*(-4*u3+7*u4-3*u5);
  });
}
