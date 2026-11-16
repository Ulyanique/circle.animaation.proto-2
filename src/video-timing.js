// Keep seeks inside the decoded duration, including clips shorter than authored inpoints.
export function videoTiming(duration, clipIn, clipOut, localTime) {
 if(!Number.isFinite(duration)||duration<=0)return {ready:false,start:0,end:0,time:0};
 const last=Math.max(0,duration-.001);
 const start=Math.min(last,Math.max(0,Number.isFinite(clipIn)?clipIn:0));
 const end=Math.min(duration,Math.max(start,Number.isFinite(clipOut)?clipOut:duration));
 const length=end-start;
 const elapsed=Math.max(0,Number.isFinite(localTime)?localTime:0);
 return {ready:true,start,end,time:length>.001?Math.min(last,start+elapsed%length):start};
}
