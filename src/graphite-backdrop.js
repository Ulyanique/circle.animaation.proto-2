import * as THREE from 'three';

// A flat distant backdrop, not architecture. Static seeded facets avoid shimmer.
export function createGraphiteBackdrop(){
 const columns=7,rows=4,vertices=[],colors=[];
 const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
 const point=(x,y)=>[(x+(x>0&&x<columns?(hash(x,y)-.5)*.65:0))/columns*2-1,
  (y+(y>0&&y<rows?(hash(y+7,x)-.5)*.6:0))/rows*2-1];
 function triangle(a,b,c,shade){for(const p of [a,b,c]){vertices.push(p[0],p[1],0);colors.push(shade,shade,shade);}}
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
  const a=point(x,y),b=point(x+1,y),c=point(x+1,y+1),d=point(x,y+1);
  const shade=.35+hash(x+3,y+11)*.65;
  if((x+y)%2){triangle(a,b,d,shade);triangle(b,c,d,shade*.82);}
  else {triangle(a,b,c,shade);triangle(a,c,d,shade*.82);}
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 const material=new THREE.ShaderMaterial({
  uniforms:{base:{value:new THREE.Color('#080705')},strength:{value:1},opacity:{value:1},aspect:{value:1.5}},
  vertexColors:true,depthTest:false,depthWrite:false,transparent:true,
  vertexShader:`varying vec2 vUv;varying float vFacet;
   void main(){vUv=position.xy*.5+.5;vFacet=color.r;gl_Position=vec4(position.xy,.99999,1.);}`,
  fragmentShader:`uniform vec3 base;uniform float strength;uniform float opacity;uniform float aspect;
   varying vec2 vUv;varying float vFacet;
   void main(){
    vec2 p=(vUv-.5)*vec2(min(aspect,2.),1.);
    float wash=exp(-dot(p-vec2(-.58,.28),p-vec2(-.58,.28))*2.3);
    float vignette=1.-.38*smoothstep(.15,1.15,length(p));
    vec3 graphite=vec3(.012,.013,.015)*(.12+.88*vFacet);
    vec3 warm=vec3(.012,.007,.003)*wash;
    gl_FragColor=vec4(base+(graphite+warm)*strength*vignette,opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`,
 });
 const mesh=new THREE.Mesh(geometry,material);mesh.name='Distant graphite facets';mesh.frustumCulled=false;mesh.renderOrder=-10000;
 return mesh;
}
