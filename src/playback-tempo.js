import { dampMotion } from './motion-easing.js';

// Shared film/video tempo. Integrate the damped rate analytically rather than
// multiplying by the end-of-frame rate (which makes timing depend on FPS).
export function createPlaybackTempo(initial=1){
 let rate=initial,velocity=0;
 const frequency=5;
 return {
  get rate(){return rate;},
  step(dt,target,advance=true){
   const elapsed=Math.max(0,Math.min(.1,dt));
   const offset=rate-target,impulse=velocity+frequency*offset,decay=Math.exp(-frequency*elapsed);
   const delta=target*elapsed+offset*(1-decay)/frequency+impulse*(1-(1+frequency*elapsed)*decay)/(frequency*frequency);
   const next=dampMotion(rate,velocity,target,elapsed,frequency);
   rate=next.position;velocity=next.velocity;
   return advance?delta:0;
  },
 };
}
