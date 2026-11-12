import { revealTriangles } from './media-reveal.js';

export function choosePresentation(index,aspect,requested='auto'){
 if(['whole','triptych','diptych'].includes(requested))return requested;
 if(aspect<.85)return 'whole';
 return index===0?'triptych':index===2?'diptych':'whole';
}
export function sectionLayout(mode='triptych'){
 return mode==='diptych'?{axis:'u',slope:.08,cuts:[.5],count:2}:{axis:'v',slope:.14,cuts:[.34,.69],count:3};
}
function clip(polygon,threshold,below,layout){
 const score=vertex=>layout.axis==='u'?vertex.u+layout.slope*(vertex.v-.5):vertex.v+layout.slope*(vertex.u-.5);
 const result=[];
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length],sa=score(a),sb=score(b);
  const insideA=below?sa<=threshold:sa>=threshold,insideB=below?sb<=threshold:sb>=threshold;
  if(insideA)result.push(a);
  if(insideA!==insideB){
   const t=(threshold-sa)/(sb-sa);
   result.push({u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t,alpha:a.alpha+(b.alpha-a.alpha)*t});
  }
 }
 return result;
}
export function sectionOffset(index,assembly=1,mode='triptych'){
 const remaining=1-Math.max(0,Math.min(1,assembly));
 if(mode==='diptych')return {x:(index-.5)*(.055+.18*remaining),y:(index-.5)*.05*remaining,z:(index-.5)*(.035+.12*remaining)};
 return {x:(index===1?-.06:.06)*remaining,y:(index-1)*(.035+.08*remaining),z:(index-1)*.018+.1*remaining*(index===1?-1:1)};
}

// Partition the complete source: separation creates seams, never cropping or duplicating texels.
export function sectionedTriangles(progress,reverse=false,assembly=1,mode='triptych'){
 const source=revealTriangles(progress,reverse),result=[],layout=sectionLayout(mode);
 for(let section=0;section<layout.count;section++){
  for(let i=0;i<source.length;i+=3){
   let polygon=source.slice(i,i+3);
   if(section>0)polygon=clip(polygon,layout.cuts[section-1],false,layout);
   if(section<layout.count-1)polygon=clip(polygon,layout.cuts[section],true,layout);
   for(let j=1;j<polygon.length-1;j++)for(const vertex of [polygon[0],polygon[j],polygon[j+1]])result.push({...vertex,section,...sectionOffset(section,assembly,mode)});
  }
 }
 return result;
}
export function assemblyProgress(time,revealTime){
 // Pre-roll assembly under the early reveal; do not move a fully readable image.
 const u=Math.max(0,Math.min(1,(time-(revealTime-1.6))/3.2));
 return u*u*u*(10-15*u+6*u*u);
}
export function seamEndpoints(cut,mode='triptych'){
 const layout=sectionLayout(mode);
 return layout.axis==='u'?[{u:cut+layout.slope*.5,v:0},{u:cut-layout.slope*.5,v:1}]:[{u:0,v:cut+layout.slope*.5},{u:1,v:cut-layout.slope*.5}];
}
export function heroShotWeight(time){
 const smooth=(a,b)=>{const u=Math.max(0,Math.min(1,(time-a)/(b-a)));return u*u*(3-2*u);};
 return smooth(5.3,6.5)*(1-smooth(7.6,9.1));
}
