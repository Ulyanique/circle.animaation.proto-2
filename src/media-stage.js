import { smoothMotion } from './motion-easing.js';

// Keep a clear camera lane while fitting the two-sided stage on portrait screens.
export function mediaStageFit(aspect){
 const safe=Number.isFinite(aspect)&&aspect>0?aspect:1.5;
 const blend=smoothMotion(.55,1.4,safe);
 // Compensate for wide desktop framing instead of shrinking content to one side.
 const wide=Math.max(1,Math.min(1.6,safe/1.5));
 return {offset:(2.6+2.2*blend)*wide,scale:(.28+.4*blend)*wide};
}
