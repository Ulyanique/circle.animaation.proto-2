import * as THREE from 'three';

// Fixed world-space distribution: scrubbing never changes the constellation.
export function dustField(count, endZ, seed = 419) {
  const values = new Float32Array(count * 4);
  const next = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < count; i++) {
    values[i*4] = (next()-.5)*25;
    values[i*4+1] = (next()-.5)*17;
    values[i*4+2] = 12 + next()*(endZ-12);
    values[i*4+3] = next();
  }
  return values;
}

export function createAtmosphere(endZ, count = 640) {
  const field = dustField(count, endZ);
  const positions = new Float32Array(count*3), seeds = new Float32Array(count);
  for(let i=0;i<count;i++) { positions.set(field.subarray(i*4,i*4+3),i*3); seeds[i]=field[i*4+3]; }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('seed',new THREE.BufferAttribute(seeds,1));
  const material = new THREE.ShaderMaterial({
    uniforms:{time:{value:0},head:{value:new THREE.Vector3()},strength:{value:0},pixelRatio:{value:1}},
    vertexShader:`attribute float seed;
      uniform float time; uniform vec3 head; uniform float strength; uniform float pixelRatio;
      varying float alpha;
      void main(){
        vec3 p=position+vec3(sin(time*.13+seed*36.)*.12,cos(time*.17+seed*22.)*.09,0.);
        vec4 view=modelViewMatrix*vec4(p,1.);
        float illumination=exp(-dot(p-head,p-head)/24.);
        alpha=illumination*strength*(.12+seed*.2)*smoothstep(2.,7.,-view.z);
        gl_PointSize=clamp((22.+seed*25.)/max(1.,-view.z),.7,2.2)*pixelRatio;
        gl_Position=projectionMatrix*view;
      }`,
    fragmentShader:`varying float alpha;
      void main(){float r=length(gl_PointCoord-.5)*2.;
        float a=(1.-smoothstep(.05,1.,r))*alpha;
        if(a<.003)discard;
        gl_FragColor=vec4(1.,.77,.41,a);
      }`,
    transparent:true,depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending,
  });
  const points=new THREE.Points(geometry,material);
  points.layers.set(1);points.frustumCulled=false;
  return points;
}

// Open, broken instrument engraving, not a halo or a luminous orb.
export function createCompassEngraving(material) {
  const vertices=[];
  const line=(a,b)=>vertices.push(...a,...b);
  const centreY=1.48;
  for(const [start,end,radius] of [[.13,1.25,2.05],[1.85,3.02,2.05],[3.38,4.38,1.94],[5.03,6.1,1.94]]){
    const segments=48;
    for(let i=0;i<segments;i++){
      const a=start+(end-start)*i/segments,b=start+(end-start)*(i+1)/segments;
      line([Math.cos(a)*radius,centreY+Math.sin(a)*radius,-.18],[Math.cos(b)*radius,centreY+Math.sin(b)*radius,-.18]);
    }
  }
  for(let i=0;i<60;i++){
    if(i%15===0 || (i>39 && i<51))continue;
    const angle=i/60*Math.PI*2, r=2.14, length=i%5===0?.13:.055;
    line([Math.cos(angle)*r,centreY+Math.sin(angle)*r,-.18],[Math.cos(angle)*(r+length),centreY+Math.sin(angle)*(r+length),-.18]);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  return new THREE.LineSegments(geometry,material);
}
