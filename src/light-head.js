// A photographic starburst: a tiny white core, long thin rays and a broad,
// very low-energy halo. No hard circular outline or square sprite edge.
export function starIntensity(x,y) {
  const radius=Math.hypot(x,y);
  if(radius>=1)return 0;
  let value=Math.exp(-radius*radius*650);
  for(let ray=0;ray<12;ray++){
    const angle=ray*Math.PI/12;
    const along=x*Math.cos(angle)+y*Math.sin(angle);
    const across=-x*Math.sin(angle)+y*Math.cos(angle);
    const length=ray%3===0?.83:ray%2===0?.63:.45;
    const width=.0025+.004*(1-radius);
    value+=Math.exp(-across*across/(width*width))*Math.exp(-Math.abs(along)/length*3)*(.22+(ray%3===0?.16:0));
  }
  value+=Math.exp(-radius*radius*26)*.028;
  return Math.min(1,value)*Math.pow(1-radius,1.2);
}

export function strandSpread(fraction) {
  const u=Math.max(0,Math.min(1,fraction/.3));
  return u*u*(3-2*u);
}
