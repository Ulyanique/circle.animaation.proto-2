import { smoothMotion as smooth } from './motion-easing.js';

// Blend optical power (inverse distance), not a hard nearest-object selection.
// Pure timeline evaluation: pausing, seeking and low FPS give the same focus.
export function cinematicFocus(time, subjects, finaleBlend=0) {
  let power=.015/12,weight=.015;
  for(const subject of subjects){
    if(!Number.isFinite(subject.depth) || subject.depth<=0)continue;
    const age=time-subject.revealTime;
    const influence=smooth(0,1.5,age)*(1-smooth(4.6,6.5,age))*smooth(2,7,subject.depth);
    const depth=Math.max(2,Math.min(90,subject.depth));
    power+=influence/depth;weight+=influence;
  }
  const mediaPower=power/weight;
  const final=Math.max(0,Math.min(1,finaleBlend));
  return 1/(mediaPower*(1-final)+final/19);
}
