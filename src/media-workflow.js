import { shots, SHOT_INTERVAL } from './media-config.js';

export function sourceClip(index, mode) {
 const shot=shots[index];
 if(!shot)throw new RangeError('Unknown media slot');
 return mode==='recording'?{clipIn:shot.in,clipOut:shot.out}:{clipIn:0,clipOut:null};
}

// Centre of the existing reading window, after the assembly has unfolded.
export function mediaPreviewTime(index) {
 if(!shots[index])throw new RangeError('Unknown media slot');
 return 7.2+index*SHOT_INTERVAL;
}
