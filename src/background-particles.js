import * as THREE from 'three';

export function backgroundParticleField(count=1000){
 let seed=731;const next=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};
 const positions=new Float32Array(count*3),seeds=new Float32Array(count);
 for(let i=0;i<count;i++){positions.set([(next()-.5)*2.16,(next()-.5)*2.16,65+next()*100],i*3);seeds[i]=next();}
 return {positions,seeds};
}

export function createBackgroundParticles(){
 const field=backgroundParticleField(),geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(field.positions,3));
 geometry.setAttribute('seed',new THREE.BufferAttribute(field.seeds,1));
 const material=new THREE.ShaderMaterial({
  uniforms:{time:{value:0},span:{value:new THREE.Vector2()},strength:{value:1},pixelRatio:{value:1}},
  vertexShader:`attribute float seed;uniform float time;uniform vec2 span;uniform float strength;uniform float pixelRatio;
   varying float alpha;varying float warmth;
   void main(){
    vec2 p=position.xy+vec2(sin(time*.045+seed*29.),cos(time*.035+seed*41.))*.026;
    float depth=position.z;
    gl_Position=projectionMatrix*vec4(p*span*depth,-depth,1.);
    float soft=step(.965,seed);
    gl_PointSize=mix(1.4+seed*2.8,13.,soft)*pixelRatio;
    float centre=mix(.38,1.,smoothstep(.15,.85,length(p)));
    alpha=(.24+seed*.36)*centre*strength*mix(1.,.35,soft);
    warmth=seed;
   }`,
  fragmentShader:`varying float alpha;varying float warmth;
   void main(){float r=length(gl_PointCoord-.5)*2.;float glow=exp(-r*r*4.)*(1.-smoothstep(.7,1.,r));
    gl_FragColor=vec4(mix(vec3(.52,.45,.33),vec3(.9,.59,.22),warmth),alpha*glow);
   }`,
  transparent:true,depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending,
 });
 const points=new THREE.Points(geometry,material);points.name='Distant floating dust';points.frustumCulled=false;points.layers.set(1);points.renderOrder=5;
 points.userData.update=(camera,time,options,pixelRatio,visibility)=>{
  points.visible=options.backgroundParticles&&visibility>0;
  geometry.setDrawRange(0,Math.round(field.seeds.length*options.backgroundParticleDensity));
  const half=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
  material.uniforms.span.value.set(half*camera.aspect,half);
  material.uniforms.time.value=time;material.uniforms.strength.value=options.backgroundParticleBrightness*visibility;material.uniforms.pixelRatio.value=pixelRatio;
 };
 return points;
}
