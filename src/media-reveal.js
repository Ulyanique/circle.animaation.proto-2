// Clip a unit image along a softly feathered diagonal. Geometry, UVs and depth share one silhouette.
export function revealTriangles(progress, reverse=false, feather=.055) {
  const p=Math.max(0,Math.min(1,progress));
  if(p===0)return [];
  if(p===1)return [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]].map(([u,v])=>({u,v,alpha:1}));
  const score=([u,v])=>.82*(reverse?1-u:u)+.18*(1-v);
  const edge=p*(1+2*feather)-feather;
  const quad=[[0,0],[1,0],[1,1],[0,1]];
  function clip(polygon,threshold,keepBelow) {
    const result=[];
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length];
      const sa=score(a),sb=score(b),insideA=keepBelow?sa<=threshold:sa>=threshold,insideB=keepBelow?sb<=threshold:sb>=threshold;
      if(insideA)result.push(a);
      if(insideA!==insideB){const t=(threshold-sa)/(sb-sa);result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
    }
    return result;
  }
  const result=[];
  function triangulate(polygon,opaque){
    for(let i=1;i<polygon.length-1;i++)for(const [u,v] of [polygon[0],polygon[i],polygon[i+1]]){
      result.push({u,v,alpha:opaque?1:Math.max(0,Math.min(1,(edge-score([u,v]))/feather))});
    }
  }
  triangulate(clip(quad,edge-feather,true),true);
  triangulate(clip(clip(quad,edge,true),edge-feather,false),false);
  return result;
}
