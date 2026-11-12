import { mountCinemaView } from './cinema-view.js';
import { createPlaybackTempo } from './playback-tempo.js';
import { smoothMotion as smooth, dampMotion } from './motion-easing.js';
import * as THREE from 'three';
import { mediaWarning } from './media-diagnostics.js';
import { sourceClip, mediaPreviewTime } from './media-workflow.js';
import { bakeLightPath, createRenderGate } from './animation-runtime.js';
import { createFinaleImpact, impactPoint, IMPACT_TIME, finalCameraBlend } from './finale-impact.js';
import { createDraftingCompass, createFinalBackdrop, finaleFit } from './finale-design.js';
import { createMediaGaze, mediaReadingShot, mediaPlaybackFov, mediaAttentionWeight, mediaPassVisibility } from './media-direction.js';
import { createEdgeOrbits } from './edge-orbits.js';
import { loadSettings, mountSettings } from './settings.js';
import { starIntensity, strandSpread } from './light-head.js';
import { cinematicFocus } from './focus-pull.js';
import { createSceneTarget, transportNormal } from './render-quality.js';
import { createAtmosphere, createCompassEngraving } from './atmosphere.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { createTitleGeometry } from './title-geometry.js';
import titleFont from './fonts/title.json';
import { mediaSources, shots, DURATION, FINALE, SHOT_INTERVAL, PANEL_SPACING, FIRST_PANEL_Z, panelEnvelope, beamEnvelope } from './media-config.js';
import { MediaPanel } from './media-panels.js';
import { mediaOrbitKnots, travellingCameraPose, trailOpacity, lightBridgePoint } from './choreography.js';


let savedStorage;try{savedStorage=localStorage;}catch{}
const settings=loadSettings(savedStorage);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(pointer: coarse)').matches;
let assetsReady = false;
const assetManager = new THREE.LoadingManager();
const $ = (s) => document.querySelector(s);
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
catch (error) { $('#loading').hidden = true; $('#error').hidden = false; throw error; }
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.4 : 1.8));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
$('#scene').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080705);
scene.fog = new THREE.FogExp2(0x080705, 0.014);
const camera = new THREE.PerspectiveCamera(49, innerWidth / innerHeight, 0.1, 320);
const pmrem = new THREE.PMREMGenerator(renderer);
// A black photographic studio with long softboxes, not the default room cubemap.
const studio = new THREE.Scene(); studio.background = new THREE.Color(0x221b12);
const softboxes = [
 [-5, 4, 3, 2, 10, 0xffefd5, 5],
 [6, 1, -2, .65, 14, 0xd6dfef, 7],
 [0, 7, -4, 12, 2, 0xffe0a6, 4],
 [-4,-3,-5, 1, 8, 0xb18a52, 2]
];
for (const [x,y,z,w,h,color,power] of softboxes) {
 const card = new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(power),side:THREE.DoubleSide}));
 card.position.set(x,y,z);card.lookAt(0,0,0);studio.add(card);
}
const environment = pmrem.fromScene(studio, 0.055);
scene.environment = environment.texture;
scene.environmentIntensity = 0.16;
studio.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});pmrem.dispose();
scene.environmentRotation.set(0, 0.55, 0.12);
// Renderer antialiasing alone does not affect the offscreen composer buffers.
const sceneTarget=createSceneTarget(innerWidth,innerHeight,renderer.getPixelRatio(),renderer.capabilities.maxSamples,mobile);
const composer = new EffectComposer(renderer,sceneTarget);
// Explicit target dimensions are physical pixels; composer sizing uses CSS pixels.
composer.setSize(innerWidth,innerHeight);
composer.addPass(new RenderPass(scene, camera));
const contactShadows = new SSAOPass(scene, camera, Math.round(innerWidth / 2), Math.round(innerHeight / 2), 16);
contactShadows.enabled = !mobile;
contactShadows.kernelRadius = 0.65;
contactShadows.minDistance = 0.002;
contactShadows.maxDistance = 0.075;
composer.addPass(contactShadows);
const depthOfField = new BokehPass(scene, camera, { focus: 12, aperture: 0.00007, maxblur: 0.005 });
composer.addPass(depthOfField);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.4, 1.15);
composer.addPass(bloom);
// Subtle cinematic edge falloff; keeps the centre clear against the dark stage.
const vignette = new ShaderPass({
 uniforms: { tDiffuse: { value: null } },
 vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
 fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
 void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  vec2 p = (vUv - 0.5) * vec2(1.1, 0.9);
  float shade = 1.0 - smoothstep(0.16, 0.72, length(p)) * 0.5;
  gl_FragColor = vec4(color.rgb * shade, color.a);
 }`
});
composer.addPass(vignette);
composer.addPass(new OutputPass());
// Multisampling on the renderer alone cannot smooth edges created by post-processing.
const antialias = new SMAAPass(innerWidth, innerHeight);
composer.addPass(antialias);
scene.add(new THREE.AmbientLight(0xffd696, 0.08));
const key = new THREE.DirectionalLight(0xffdf9d, 1.7); key.position.set(3, 8, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0xaaa4c8, 0.45); fill.position.set(-9, 2, -5); scene.add(fill);
key.castShadow = false;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -16; key.shadow.camera.right = 16;
key.shadow.camera.top = 14; key.shadow.camera.bottom = -14;
key.shadow.camera.near = 0.5; key.shadow.camera.far = 55;
key.shadow.normalBias = 0.035; key.shadow.bias = -0.00015;
key.shadow.radius = 3;
scene.add(key.target);
const movingLight = new THREE.PointLight(0xffd18a, 0, 28, 2); scene.add(movingLight);
const pathLight=new THREE.SpotLight(0xffdf9f,0,36,.72,.85,2);
scene.add(pathLight,pathLight.target);
const atmosphere=createAtmosphere(FINALE.z-30);scene.add(atmosphere);
let seed = 73;
const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
// Smooth polished metal: no tiled high-frequency bump map to alias in motion.
const metalProperties = { metalness: 1, clearcoat: 0.16, clearcoatRoughness: 0.3 };
const gold = new THREE.MeshPhysicalMaterial({ ...metalProperties, color: 0xa78a52, roughness: 0.3 });
// Open stage: media only, no enclosing corridor, floor or perimeter ribbons.
const mediaStage = new THREE.Group();scene.add(mediaStage);
const loader = new THREE.TextureLoader(assetManager);
const panels = [];
let snakePath=[],bakedSnakePath;
const pathSampleBuffer=new Float64Array(3);
const renderGate=createRenderGate();
function invalidateScene(duration=1400){renderGate.invalidate(performance.now(),duration);}
function rebuildSnakePath() {
 snakePath=[[0,-2,-1,5],[1.4,2.6,-.8,-3],[2.6,3.4,1.4,-8],[3.7,-.6,1.7,-11],[4.8,-4.2,-.8,-12.5]];
 for(const panel of panels){
  panel.updateMatrixWorld(true);
  for(const [offset,x,y,z] of mediaOrbitKnots(panel.index)){
   let localX=x,localY=y,localZ=z;
   const point=new THREE.Vector3(localX*panel.width,localY*panel.height,localZ).applyMatrix4(panel.matrixWorld);
   snakePath.push([6+panel.index*SHOT_INTERVAL+offset,point.x,point.y,point.z]);
  }
  // Between media loops, bring the ember back into the next forward composition.
  // These are world-space bridge knots, not a screen-space overlay or teleport.
  const bridgeTime=6+panel.index*SHOT_INTERVAL+4.2;
  const pose=cameraPose(bridgeTime);
  snakePath.push([bridgeTime,...lightBridgePoint(pose,panel.index)]);
 }
 snakePath.push([56.5,-3,1,cameraPose(56.5)[2]-13],[58,-1,1.8,cameraPose(58)[2]-18],[IMPACT_TIME,...impactPoint(IMPACT_TIME)],[60,...impactPoint(60)]);
 bakedSnakePath=bakeLightPath(snakePath);invalidateScene(2300);
}
for (let i=0;i<shots.length;i++) {
 const panel = new MediaPanel(i, gold, loader, () => {rebuildSnakePath();updateMediaUI();},()=>invalidateScene());
 panel.setViewportAspect(innerWidth/innerHeight);
 mediaStage.add(panel);panels.push(panel);
}
rebuildSnakePath();
const mediaGaze=createMediaGaze(panels);
Promise.allSettled(panels.map((panel,i)=>panel.setSource(mediaSources[i]))).then(results=>{
 for(const panel of panels){if(panel.face.material.map)renderer.initTexture(panel.face.material.map);}
 invalidateScene(2300);assetsReady=true;$('#loading').classList.add('ready');
 if(results.some(result=>result.status==='rejected')) $('#media-status').textContent='Часть исходных материалов не загрузилась. Можно заменить их своими файлами.';
});
// Two authored viewpoints per media bay, joined with continuous position and target velocity.
function cameraPose(t) {return travellingCameraPose(t,PANEL_SPACING,SHOT_INTERVAL,FIRST_PANEL_Z);}
function snakePoint(t,target=new THREE.Vector3()) {return target.fromArray(bakedSnakePath.sample(t,pathSampleBuffer));}
const trail=new THREE.Group();scene.add(trail);
const ribbonSegments=320, ribbonSides=12;
const ribbons=[];
for(let strand=0;strand<5;strand++) {
 const positions=new Float32Array((ribbonSegments+1)*ribbonSides*3);
 const indices=[];
 for(let j=0;j<ribbonSegments;j++)for(let k=0;k<ribbonSides;k++){
  const a=j*ribbonSides+k,b=j*ribbonSides+(k+1)%ribbonSides,c=a+ribbonSides,d=b+ribbonSides;
  indices.push(a,b,c,b,d,c);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(indices);
 const alpha=new Float32Array((ribbonSegments+1)*ribbonSides);
 for(let j=0;j<=ribbonSegments;j++)for(let k=0;k<ribbonSides;k++)alpha[j*ribbonSides+k]=trailOpacity(j/ribbonSegments);
 geometry.setAttribute('trailAlpha',new THREE.BufferAttribute(alpha,1));
 const color=new THREE.Color(strand===0?0xfff0be:0xffbc41).multiplyScalar(strand===0?4:2);
 const material=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:strand===0?1:.48,blending:THREE.AdditiveBlending,depthWrite:false});
 material.onBeforeCompile=shader=>{
  shader.vertexShader='attribute float trailAlpha; varying float vTrailAlpha;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTrailAlpha=trailAlpha;');
  shader.fragmentShader='varying float vTrailAlpha;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>','#include <dithering_fragment>\ngl_FragColor.a *= vTrailAlpha;');
 };
 material.customProgramCacheKey=()=> 'energy-tail-fade-v1';
 const ribbon=new THREE.Mesh(geometry,material);ribbon.frustumCulled=false;ribbon.renderOrder=100;trail.add(ribbon);ribbons.push(ribbon);
}
const tangent=new THREE.Vector3(),normal=new THREE.Vector3(),binormal=new THREE.Vector3();
const tailPoint=new THREE.Vector3(),tailBefore=new THREE.Vector3(),tailAfter=new THREE.Vector3();
const headPoint=new THREE.Vector3(),flightVector=new THREE.Vector3(),flightBefore=new THREE.Vector3();
const sparkPoint=new THREE.Vector3(),sparkBefore=new THREE.Vector3(),sparkDirection=new THREE.Vector3();
function updateSnake(t) {
 const length=Math.min(2.15,Math.max(0,t-.4));
 for(let j=0;j<=ribbonSegments;j++){
  const u=j/ribbonSegments, sampleTime=t-u*length;
  const point=snakePoint(sampleTime,tailPoint);
  tangent.copy(snakePoint(sampleTime+.012,tailAfter)).sub(snakePoint(sampleTime-.012,tailBefore)).normalize();
  transportNormal(tangent,normal,j===0);binormal.crossVectors(tangent,normal).normalize();
  const taper=Math.pow(1-u,.65);
  ribbons.forEach((ribbon,strand)=>{
   const positions=ribbon.geometry.attributes.position;
   const spread=strandSpread(u);
   const offset=strand*.022*Math.sin(u*4+strand)*spread;
   for(let k=0;k<ribbonSides;k++){
    const angle=k/ribbonSides*Math.PI*2;
    const radius=((strand===0?.016:.005)*taper+.0001)*settings.tailWidth;
    const n=Math.cos(angle)*radius+offset*taper, b=Math.sin(angle)*radius+strand*.017*taper*spread;
    positions.setXYZ(j*ribbonSides+k,point.x+normal.x*n+binormal.x*b,point.y+normal.y*n+binormal.y*b,point.z+normal.z*n+binormal.z*b);
   }
  });
 }
 ribbons.forEach(r=>r.geometry.attributes.position.needsUpdate=true);
}
function glowTexture(){ const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');const g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'#fffce4');g.addColorStop(.08,'#fff5bf');g.addColorStop(.22,'#ffcf6188');g.addColorStop(1,'#ffc44d00');x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c); }
const glowMap=glowTexture();
const edgeOrbits=createEdgeOrbits(glowMap);scene.add(edgeOrbits);
function starTexture(){
 const size=512,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d'),image=ctx.createImageData(size,size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=(x-size/2)/(size/2),v=(y-size/2)/(size/2);
  const value=starIntensity(u,v);
  const i=(y*size+x)*4;
  image.data[i]=255;image.data[i+1]=242;image.data[i+2]=207;
  image.data[i+3]=Math.round(value*255);
 }
 ctx.putImageData(image,0,0);return new THREE.CanvasTexture(canvas);
}
const opticalStar=new THREE.Sprite(new THREE.SpriteMaterial({map:starTexture(),color:new THREE.Color(4.5,3.7,2.3),toneMapped:false,transparent:true,blending:THREE.AdditiveBlending,depthTest:true,depthWrite:false}));
opticalStar.renderOrder=104;scene.add(opticalStar);
const headCore=new THREE.Mesh(new THREE.SphereGeometry(.055,20,12),new THREE.MeshBasicMaterial({color:new THREE.Color(18,15,9),transparent:true,depthWrite:false}));
headCore.renderOrder=103;scene.add(headCore);
const flare=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,color:0xffda82,blending:THREE.AdditiveBlending,depthWrite:false}));flare.scale.set(4,4,1);scene.add(flare);
const streak=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,color:0xffe5ae,blending:THREE.AdditiveBlending,depthWrite:false,rotation:-.18}));streak.scale.set(9,.065,1);scene.add(streak);
flare.renderOrder=102;streak.renderOrder=102;
const particleCount=1000, particlePositions=new Float32Array(particleCount*3);
for(let i=0;i<particleCount;i++){particlePositions[i*3]=(random()-.5)*32;particlePositions[i*3+1]=(random()-.5)*20;particlePositions[i*3+2]=-random()*95;}
const particleGeo=new THREE.BufferGeometry();particleGeo.setAttribute('position',new THREE.BufferAttribute(particlePositions,3));
const particles=new THREE.Points(particleGeo,new THREE.PointsMaterial({color:0xe8b661,size:.035,map:glowMap,transparent:true,opacity:.65,blending:THREE.AdditiveBlending,depthWrite:false}));particles.renderOrder=100;scene.add(particles);particles.visible=false;
// Particles have an emission time, a velocity and a lifetime: they drift away from the moving ray.
const sparkCount=700,sparkGeo=new THREE.BufferGeometry();
const sparkPositions=new Float32Array(sparkCount*3),sparkAlpha=new Float32Array(sparkCount);
const sparkParams=Array.from({length:sparkCount},()=>[random(),random(),random(),random()]);
sparkGeo.setAttribute('position',new THREE.BufferAttribute(sparkPositions,3));
sparkGeo.setAttribute('lifeAlpha',new THREE.BufferAttribute(sparkAlpha,1));
const sparkMaterial=new THREE.ShaderMaterial({
 uniforms:{sprite:{value:glowMap},pixelRatio:{value:renderer.getPixelRatio()}},
 vertexShader:`attribute float lifeAlpha; varying float vAlpha; uniform float pixelRatio;
 void main(){vAlpha=lifeAlpha;vec4 viewPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*viewPosition;gl_PointSize=clamp(31.*pixelRatio/max(1.,-viewPosition.z),1.,4.);}`,
 fragmentShader:`uniform sampler2D sprite;varying float vAlpha;void main(){vec4 glow=texture2D(sprite,gl_PointCoord);gl_FragColor=vec4(vec3(1.,.69,.24)*1.8,glow.a*vAlpha);}`,
 transparent:true,depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending
});
const sparks=new THREE.Points(sparkGeo,sparkMaterial);sparks.frustumCulled=false;sparks.renderOrder=101;scene.add(sparks);
// Transparent light sprites must not become opaque quads in normal/depth passes.
// Beauty renders both layers; AO and DOF build geometry buffers from solid media and the final title only.
camera.layers.enable(1);
for (const effect of [trail, flare, streak, particles, sparks, headCore, opticalStar]) {
 effect.traverse(object => object.layers.set(1));
}
for (const pass of [contactShadows, depthOfField]) {
 const render = pass.render.bind(pass);
 pass.render = (...args) => {
  const previousMask = camera.layers.mask;
  camera.layers.set(0);
  try { render(...args); } finally { camera.layers.mask = previousMask; }
 };
}
// Real extruded lettering and a physical drafting compass, not a flattened greeting card.
const finale = new THREE.Group();finale.position.set(0,0,FINALE.z);scene.add(finale);
const finalMaterials=[];
function finaleMaterial(color=0xbda169,roughness=.24){
 const material=new THREE.MeshPhysicalMaterial({color,metalness:1,roughness,envMapIntensity:.5,clearcoat:.15,transparent:true,opacity:0});
 finalMaterials.push(material);return material;
}
const titleMaterial=finaleMaterial(0xc8b27d,.23);
// A tiny base lift keeps lettering readable between specular sweeps, without a glowing outline.
titleMaterial.emissive.set(0x9b7941);titleMaterial.emissiveIntensity=.22;titleMaterial.envMapIntensity=2;
const titleGeometry=createTitleGeometry(titleFont,'Янтарный циркуль');
const title=new THREE.Mesh(titleGeometry,titleMaterial);title.position.y=-1.85;
const titleWidth=titleGeometry.boundingBox.max.x-titleGeometry.boundingBox.min.x;
title.scale.setScalar(16/titleWidth);finale.add(title);
const engravingMaterial=new THREE.LineBasicMaterial({color:0x9a8151,transparent:true,opacity:0,depthWrite:false});
finalMaterials.push(engravingMaterial);
finale.add(createCompassEngraving(engravingMaterial));
const compassGold=finaleMaterial(0xbfa063,.34),compassDark=finaleMaterial(0x332b1d,.3),compassTip=finaleMaterial(0xc0c2bf,.2);
const compass=createDraftingCompass(compassGold,compassDark,compassTip);compass.position.y=.1;finale.add(compass);
const finalBackdrop=createFinalBackdrop();finale.add(finalBackdrop);
const finaleImpact=createFinaleImpact();scene.add(finaleImpact);
RectAreaLightUniformsLib.init();
const finalSoftbox=new THREE.RectAreaLight(0xfff0d6,0,12,6);
finalSoftbox.position.set(-1,1,FINALE.z+9);finalSoftbox.lookAt(0,.4,FINALE.z);scene.add(finalSoftbox);
const finalKey=new THREE.PointLight(0xffe4ac,0,20,2);finalKey.position.set(-3,3,FINALE.z+6);scene.add(finalKey);
const finalRim=new THREE.PointLight(0xb8c9ec,0,20,2);finalRim.position.set(5,1,FINALE.z+2);scene.add(finalRim);
const clamp=THREE.MathUtils.clamp, lerp=THREE.MathUtils.lerp;
let time=0,playing=!reducedMotion,last=performance.now();
const playbackTempo=createPlaybackTempo(settings.speed);
const pointer = new THREE.Vector2(), smoothedPointer = new THREE.Vector2(), pointerVelocity = new THREE.Vector2();
let chapterMenuWasPlaying=false;
window.addEventListener('pointermove', event => {
 if (event.pointerType === 'touch' || !event.target.closest?.('#scene')) return;
 invalidateScene();
 pointer.set(event.clientX/innerWidth*2-1, 1-event.clientY/innerHeight*2);
});
document.addEventListener('pointerleave',()=>{pointer.set(0,0);invalidateScene();});
function formatTime(t){return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;}
const timeline=$('#timeline');timeline.max=DURATION;
function render(t, dt=1/60){
 for(const axis of ['x','y']){const next=dampMotion(smoothedPointer[axis],pointerVelocity[axis],pointer[axis],dt);smoothedPointer[axis]=next.position;pointerVelocity[axis]=next.velocity;}
 const finish=finalCameraBlend(t);
 const pose=cameraPose(t);
 const parallax = reducedMotion || mobile || !settings.parallax ? 0 : 0.23*(1-finish);
 camera.position.set(pose[0]*(1-finish)+smoothedPointer.x*parallax,pose[1]*(1-finish)+smoothedPointer.y*parallax*.6,pose[2]);
 const reading=mediaReadingShot(t,panels);
 const hero=settings.cameraGuidance&&settings.media?mediaAttentionWeight(reading.weight,finish):0;
 const gaze=mediaGaze(t,pose,finish,settings.cameraGuidance&&settings.media);
 camera.lookAt(...gaze);
 camera.updateMatrixWorld();
 // Follow the camera with a bounded light rig.
 key.position.set(camera.position.x + 5, 8, camera.position.z + 1);
 key.target.position.set(0, 0, camera.position.z - 16);
 key.target.updateMatrixWorld();
 const focusSubjects=[];
 const focusPosition=new THREE.Vector3();
 mediaStage.visible=settings.media;
 for (const panel of panels) {
  // Leave each screen fully opaque for the front-to-back light pass; fade only at shot edges.
  // Release a passed source before its dark rear face can mask the next shot.
  const passVisibility=mediaPassVisibility(camera.position.z,panel.position.z);
  const visibility=panelEnvelope(panel.revealTime,t);
  panel.setPresentation(t,settings.sectionedMedia);
  panel.setVisibility(visibility,dt,passVisibility);
  if(!settings.mediaReveal && panel.visible)panel.setVisibility(1,0,passVisibility);
  panel.frame.visible=settings.frames;
  panel.face.material.color.setHex(0xece9e2).multiplyScalar(settings.mediaBrightness);
  if(panel.video)panel.video.playbackRate=playbackTempo.rate;
  panel.syncVideo(t,playing&&settings.media);
  panel.getWorldPosition(focusPosition).applyMatrix4(camera.matrixWorldInverse);
  focusSubjects.push({depth:-focusPosition.z,revealTime:panel.revealTime});
 }

 depthOfField.uniforms.focus.value = cinematicFocus(t,focusSubjects,finish);
 depthOfField.uniforms.aperture.value = lerp(0.00007, 0.000025, finish);
 camera.rotateZ(settings.cameraRoll?pose[6]*(1-finish):0);
 camera.updateMatrixWorld();
 camera.fov=mediaPlaybackFov(t,innerWidth<700)+settings.fovOffset;camera.updateProjectionMatrix();
 trail.visible=settings.beam&&settings.tail;
 const snakeVisibility=settings.beam?beamEnvelope(t):0;
 ribbons.forEach((r,i)=>{r.material.opacity=snakeVisibility*settings.tailStrength*(i===0?.72:.28);});
 updateSnake(t);
 const head=snakePoint(t,headPoint);
 atmosphere.visible=settings.beam&&settings.dust;
 sparks.visible=settings.beam&&settings.sparks;
 atmosphere.material.uniforms.time.value=t;
 atmosphere.material.uniforms.head.value.copy(head);
 atmosphere.material.uniforms.strength.value=snakeVisibility*(1-finish);
 atmosphere.material.uniforms.pixelRatio.value=renderer.getPixelRatio();
 flare.position.copy(head);streak.position.copy(head);movingLight.position.copy(head);
 // Compact white-hot leading ember, with local physical light rather than an orange billboard.
 headCore.visible=settings.head;opticalStar.visible=settings.star;flare.visible=settings.halo;streak.visible=settings.streak;
 headCore.position.copy(head);headCore.material.opacity=snakeVisibility;
 headCore.material.color.setRGB(18*settings.headStrength,15*settings.headStrength,9*settings.headStrength);
 opticalStar.position.copy(head);opticalStar.scale.setScalar(settings.starSize);
 opticalStar.material.opacity=snakeVisibility*settings.starStrength;
 headCore.scale.setScalar(1+.05*Math.sin(t*9));
 flare.scale.setScalar(1.1);flare.material.color.setHex(0xffe7b4);flare.material.opacity=snakeVisibility*.32;
 streak.scale.set(5,.032,1);streak.material.opacity=snakeVisibility*.16;
 movingLight.intensity=(56+4*Math.sin(t*1.8))*snakeVisibility*(settings.localLight?1:0);
 pathLight.position.copy(head);
 const flightDirection=snakePoint(t+.06,flightVector).sub(snakePoint(t-.06,flightBefore)).normalize();
 pathLight.target.position.copy(head).addScaledVector(flightDirection,12);
 pathLight.intensity=42*snakeVisibility*(settings.localLight?1:0);
 for(let i=0;i<sparkParams.length;i++){
  const [phase,speed,angle,lifetimeSeed]=sparkParams[i];
  const lifetime=1.4+lifetimeSeed*2.1,age=(t+phase*lifetime)%lifetime,birth=t-age;
  const v=snakePoint(birth,sparkPoint),before=snakePoint(birth-.03,sparkBefore),direction=sparkDirection.copy(v).sub(before).normalize();
  const theta=angle*Math.PI*2,drift=(.12+speed*.55)*age;
  sparkPositions[i*3]=v.x+direction.x*age*.25+Math.cos(theta)*drift;
  sparkPositions[i*3+1]=v.y+direction.y*age*.25+Math.sin(theta)*drift-age*age*.035;
  sparkPositions[i*3+2]=v.z+direction.z*age*.25+(speed-.5)*age*.45;
  sparkAlpha[i]=beamEnvelope(birth)*smooth(0,.08,age)*Math.pow(1-age/lifetime,1.7)*.48*settings.sparkStrength;
 }
 sparkGeo.attributes.position.needsUpdate=true;sparkGeo.attributes.lifeAlpha.needsUpdate=true;
 particles.rotation.z=Math.sin(t*.05)*.06;
 const finalReveal=smooth(FINALE.reveal,FINALE.full,t)*(1-smooth(FINALE.fade,DURATION,t));
 finale.visible=settings.finale&&t>57.5;
 title.visible=settings.title;compass.visible=settings.compass;
 finale.scale.setScalar(finaleFit(camera.fov,camera.aspect));
 finalBackdrop.visible=settings.finalBackdrop;finalBackdrop.material.uniforms.opacity.value=finalReveal;
 finalMaterials.forEach(material=>{material.opacity=finalReveal;});
 engravingMaterial.opacity=settings.engraving?finalReveal*.1:0;
 finale.rotation.set(0,0,0);
 finale.position.y=0;
 const lockupZ=camera.position.z-19;
 finale.position.z=lockupZ;
 finalSoftbox.position.z=lockupZ+9;finalSoftbox.lookAt(0,.4,lockupZ);
 finalKey.position.z=lockupZ+6;finalRim.position.z=lockupZ+2;
 compass.rotation.set(0,0,0);
 finalSoftbox.intensity=finalReveal*1.8;
 finalKey.intensity=finalReveal*14;finalRim.intensity=finalReveal*10;
 finalKey.position.x=-5+smooth(59,68,t)*9;
 finalSoftbox.position.x=-2+smooth(60,67,t)*3;
 key.intensity=lerp(.22,.35,finish)*settings.keyLight;
 renderer.toneMappingExposure=settings.exposure;
 scene.background.set(settings.background);scene.fog.color.set(settings.background);scene.fog.density=settings.fog ? .014 : 0;
 scene.environmentIntensity=settings.environment;
 bloom.enabled=settings.bloom;bloom.strength=lerp(.3,.18,finish)*settings.bloomStrength;
 depthOfField.enabled=settings.dof;depthOfField.uniforms.aperture.value*=settings.dofStrength;
 contactShadows.enabled=settings.ao&&!mobile;vignette.enabled=settings.vignette;antialias.enabled=settings.smaa;
 edgeOrbits.userData.update(camera,t,settings,smooth(0,2,t)*(1-smooth(69.5,DURATION,t))*(1-.65*hero));
 finaleImpact.userData.update(t,camera,settings);
 composer.render();
 timeline.value=t;timeline.style.setProperty('--progress',`${t/DURATION*100}%`);
 $('#time').innerHTML=`${formatTime(t)} <em>/ ${formatTime(DURATION)}</em>`;
 $('#chapter').textContent=t<6?'01 / ПРОСТРАНСТВО':t<54?'02 / МЕДИА':t<59?'03 / СВЕТОВОЙ СЛЕД':'04 / ЯНТАРНЫЙ ЦИРКУЛЬ';
}
function setPlaying(value){invalidateScene();playing=value;for(const panel of panels)panel.syncVideo(time,value,true);$('#play').textContent=playing?'Ⅱ':'▶';$('#play').setAttribute('aria-label',playing?'Пауза':'Воспроизвести');}
setPlaying(playing);
mountCinemaView({togglePlayback:()=>setPlaying(!playing)});
$('#play').onclick=()=>setPlaying(!playing);

function toggleChapters(open) {
 if(open){chapterMenuWasPlaying=playing;setPlaying(false);}
 $('#chapters-menu').hidden=!open;
 $('#chapters-toggle').setAttribute('aria-expanded',String(open));
 if(open) $('#chapters-close').focus();
 else {setPlaying(chapterMenuWasPlaying);$('#chapters-toggle').focus();}
}
$('#chapters-toggle').onclick=()=>toggleChapters($('#chapters-menu').hidden);
$('#chapters-close').onclick=()=>toggleChapters(false);
for (const button of document.querySelectorAll('.chapter-link')) {
 button.onclick=()=>{time=Number(button.dataset.time);toggleChapters(false);setPlaying(true);};
}
$('#restart').onclick=()=>{time=0;setPlaying(true);};
timeline.addEventListener('input',()=>{invalidateScene();time=Number(timeline.value);for(const panel of panels)panel.syncVideo(time,playing,true);});
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#app').requestFullscreen();}catch(e){console.warn('Fullscreen unavailable',e);}};
let resumeAfterReference=false;
$('#compare').onclick=()=>{resumeAfterReference=playing;setPlaying(false);$('#reference').hidden=false;const video=$('#reference video');video.currentTime=time;video.play().catch(()=>{});$('#compare').setAttribute('aria-pressed','true');};
function closeReference(){$('#reference video').pause();$('#reference').hidden=true;$('#compare').setAttribute('aria-pressed','false');setPlaying(resumeAfterReference);}
$('#close-reference').onclick=closeReference;
window.addEventListener('keydown',e=>{if(e.code==='Escape'){if(!$('#reference').hidden)closeReference();else if(!$('#chapters-menu').hidden)toggleChapters(false);else if(!$('#media-menu').hidden)toggleMedia(false);}if(e.target.closest('input,button,video,select,textarea,[contenteditable=true]'))return;if(e.code==='Space'){e.preventDefault();setPlaying(!playing);}if(e.code==='ArrowRight')time=Math.min(DURATION,time+5);if(e.code==='ArrowLeft')time=Math.max(0,time-5);});
window.addEventListener('resize',()=>{
 let changed=false;for(const panel of panels)changed=panel.setViewportAspect(innerWidth/innerHeight)||changed;
 if(changed)rebuildSnakePath();
 camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);});
renderer.setAnimationLoop(now=>{
 const dt=Math.min((now-last)/1000,.1);last=now;
 if(assetsReady&&!document.hidden){
  time+=playbackTempo.step(dt,settings.speed,playing);
  if(playing&&time>DURATION){if(settings.loop)time=0;else{time=DURATION;setPlaying(false);}}
 }
 if(renderGate.shouldRender(now,assetsReady&&(playing||panels.some(panel=>panel.sourceBlend<1)),document.hidden))render(time,dt);
});


let mediaWasPlaying=false;
function toggleMedia(open){
 if(open){mediaWasPlaying=playing;setPlaying(false);}
 $('#media-menu').hidden=!open;$('#media-toggle').setAttribute('aria-expanded',String(open));
 if(open)$('#media-close').focus();else{setPlaying(mediaWasPlaying);$('#media-toggle').focus();}
}
function setSlotBusy(index,busy){
 const slot=$(`#media-file-${index}`).closest('.media-slot');
 slot.setAttribute('aria-busy',String(busy));
 for(const control of slot.querySelectorAll('input,select,button'))control.disabled=busy;
 $('#media-reset').disabled=!!document.querySelector('.media-slot[aria-busy="true"]');
}
function updateMediaUI(){
 for(const panel of panels){
  const name=document.querySelector(`#media-name-${panel.index}`);
  const meta=document.querySelector(`#media-meta-${panel.index}`);
  if(name)name.textContent=panel.label||'Исходный материал';
  const warning=$(`#media-warning-${panel.index}`);
  if(warning){const mode=$(`#media-source-mode-${panel.index}`)?.value;warning.textContent=mediaWarning(panel.index,panel.mediaType,mode,panel.video?.duration);warning.hidden=!warning.textContent;}

  if(meta)meta.textContent=`${panel.mediaType==='video'?'Видео':panel.mediaType==='placeholder'?'Плейсхолдер':'Фото'} · ${panel.aspect?.toFixed(2)||'—'}:1 · ${{whole:'Цельный кадр',triptych:'Три секции',diptych:'Две секции'}[panel.presentation]}`;
 }
}
for(const panel of panels){
 const slot=document.createElement('div');slot.className='media-slot';
 slot.innerHTML=`<span>${String(panel.index+1).padStart(2,'0')} · ${shots[panel.index].timecode}</span><label id="media-name-${panel.index}" for="media-file-${panel.index}">${shots[panel.index].label}</label><input id="media-file-${panel.index}" type="file" accept="image/*,video/*" aria-label="Фото или видео для сцены ${panel.index+1}"><span id="media-meta-${panel.index}" class="media-meta"></span>`;
 slot.querySelector('input').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  if(!file.type.startsWith('image/')&&!file.type.startsWith('video/')){$('#media-status').textContent='Выберите изображение или видео.';return;}
  $('#media-status').textContent='Загружаем материал…';setSlotBusy(panel.index,true);
  try{await panel.setSource({type:file.type.startsWith('video/')?'video':'image',file,...sourceClip(panel.index,sourceMode.value)});$('#media-status').textContent=`Сцена ${panel.index+1}: материал заменён.`;}
  catch(error){$('#media-status').textContent=error.message||'Не удалось открыть файл';}
  finally{setSlotBusy(panel.index,false);event.target.value='';}
 });
 const layoutLabel=document.createElement('label');layoutLabel.className='layout-label';layoutLabel.htmlFor=`media-layout-${panel.index}`;layoutLabel.textContent='Постановка';
 const layoutSelect=document.createElement('select');layoutSelect.id=`media-layout-${panel.index}`;layoutSelect.setAttribute('aria-label',`Постановка сцены ${panel.index+1}`);
 for(const [value,label] of [['auto','Автоматически'],['whole','Цельный кадр'],['triptych','Три секции'],['diptych','Две секции']]){
  const option=document.createElement('option');option.value=value;option.textContent=label;layoutSelect.append(option);
 }
 layoutSelect.onchange=()=>panel.setLayout(layoutSelect.value);
 const modeLabel=document.createElement('label');modeLabel.className='layout-label';modeLabel.htmlFor=`media-source-mode-${panel.index}`;modeLabel.textContent='Таймкод видео';
 const sourceMode=document.createElement('select');sourceMode.id=`media-source-mode-${panel.index}`;sourceMode.setAttribute('aria-label',`Источник видео сцены ${panel.index+1}`);
 for(const [value,label] of [['clip','Готовый фрагмент · с начала'],['recording',`Полная запись · ${shots[panel.index].timecode}`]]){
  const option=document.createElement('option');option.value=value;option.textContent=label;sourceMode.append(option);
 }
 sourceMode.onchange=()=>{
  if(panel.mediaType!=='video')return;
  Object.assign(panel,sourceClip(panel.index,sourceMode.value));panel.syncVideo(time,false,true);invalidateScene();updateMediaUI();
 };
 const preview=document.createElement('button');preview.type='button';preview.id=`media-preview-${panel.index}`;preview.className='media-preview';preview.textContent='Смотреть сцену ↗';preview.setAttribute('aria-label',`Смотреть сцену ${panel.index+1}: ${shots[panel.index].label}`);
 preview.onclick=()=>{time=mediaPreviewTime(panel.index);mediaWasPlaying=false;toggleMedia(false);setPlaying(false);$('#play').focus();};
 const warning=document.createElement('p');warning.id=`media-warning-${panel.index}`;warning.className='media-warning';warning.setAttribute('role','status');warning.hidden=true;
 const reset=document.createElement('button');reset.type='button';reset.id=`media-reset-${panel.index}`;reset.className='media-slot-reset';reset.textContent='Восстановить эту сцену';reset.setAttribute('aria-label',`Восстановить исходный материал сцены ${panel.index+1}`);
 reset.onclick=async()=>{
  setSlotBusy(panel.index,true);$('#media-status').textContent=`Восстанавливаем сцену ${panel.index+1}…`;
  const previous=panel.layoutOverride;
  try{
   panel.layoutOverride='auto';await panel.setSource(mediaSources[panel.index]);
   layoutSelect.value='auto';sourceMode.value='clip';updateMediaUI();
   $('#media-status').textContent=`Сцена ${panel.index+1}: исходный материал восстановлен.`;
  }catch(error){panel.layoutOverride=previous;$('#media-status').textContent=error.message||'Не удалось восстановить материал';}
  finally{setSlotBusy(panel.index,false);}
 };
 slot.append(layoutLabel,layoutSelect,modeLabel,sourceMode,warning,preview,reset);
 $('#media-slots').appendChild(slot);
}
$('#media-toggle').onclick=()=>toggleMedia($('#media-menu').hidden);
$('#media-close').onclick=()=>toggleMedia(false);
$('#media-reset').onclick=async()=>{
 $('#media-status').textContent='Восстанавливаем…';
 for(const panel of panels)setSlotBusy(panel.index,true);
 for(const panel of panels){panel.layoutOverride='auto';$(`#media-layout-${panel.index}`).value='auto';$(`#media-source-mode-${panel.index}`).value='clip';}
 const results=await Promise.allSettled(panels.map((panel,i)=>panel.setSource(mediaSources[i])));
 for(const panel of panels)setSlotBusy(panel.index,false);
 updateMediaUI();
 $('#media-status').textContent=results.some(result=>result.status==='rejected')?'Не все исходные файлы удалось загрузить.':'Исходные материалы восстановлены.';
};

// Resolution changes allocate GPU buffers only when the setting actually changes.
let lastResolution=0;
mountSettings(settings,()=>{
 invalidateScene();
 const ratio=Math.min(settings.pixelRatio,mobile?1.4:2.5);
 if(ratio===lastResolution)return;lastResolution=ratio;
 renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight);
 composer.setPixelRatio(ratio);composer.setSize(innerWidth,innerHeight);
 sparkMaterial.uniforms.pixelRatio.value=ratio;
});

// UI-only actions do not need WebGL. Visual interactions explicitly wake the scene.
for(const eventName of ['input','change','pointerleave','keydown']){
 document.addEventListener(eventName,()=>invalidateScene(),{passive:true});
}
window.addEventListener('resize',()=>invalidateScene());
document.addEventListener('visibilitychange',()=>{
 last=performance.now();
 invalidateScene();
 for(const panel of panels)panel.syncVideo(time,playing,!document.hidden);
});

// Explicit development-only offline capture; never shipped as a production API.
if(import.meta.env.DEV&&new URLSearchParams(location.search).has('motionCapture')){
 window.__captureMotion=(stamp)=>{
  time=stamp;playing=false;render(stamp,1/24);
  return panels.map(panel=>{
   const centre=panel.position.clone().project(camera);
   return {index:panel.index,x:centre.x,y:centre.y,visible:panel.visible};
  });
 };
}
