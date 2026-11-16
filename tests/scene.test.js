import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Vector3, Matrix4, Euler } from 'three';
import { mediaDimensions } from '../src/media-config.js';
import { sampleSpline, orbitOffsets } from '../src/choreography.js';
import { createTitleGeometry } from '../src/title-geometry.js';

test('whole image and video fit without stretching or cropping',()=>{
 for(const aspect of [1,16/9,4/3,2.39,9/16]){
  const {width,height}=mediaDimensions(aspect);
  assert.ok(width<=11.5 && height<=8.1+1e-9);
  assert.ok(Math.abs(width/height-aspect)<1e-10);
 }
 assert.throws(()=>mediaDimensions(0));
});
test('spline is continuous and has continuous velocity at intermediate knots',()=>{
 const knots=[[0,0,0,0],[2,4,-1,-7],[5,-3,1,-17],[8,0,0,-30]];
 for(const t of [2,5]){
  const h=1e-5,a=sampleSpline(knots,t-h),b=sampleSpline(knots,t),c=sampleSpline(knots,t+h);
  for(let j=0;j<3;j++)assert.ok(Math.abs((b[j]-a[j])/h-(c[j]-b[j])/h)<.001);
 }
});
test('beam travels in front, outside the screen edge, then behind inside the screen bounds',()=>{
 assert.ok(orbitOffsets[1][3]>0);
 assert.ok(Math.abs(orbitOffsets[2][1])>.5);
 const back=orbitOffsets[3];
 assert.ok(back[3]<0 && Math.abs(back[1])<.5 && Math.abs(back[2])<.5);
 const rotation=new Matrix4().makeRotationFromEuler(new Euler(.05,.2,.09));
 for(const [offset,x,y,z] of orbitOffsets){
  const local=new Vector3(x*11.5,y*6.47,z),world=local.clone().applyMatrix4(rotation);
  assert.ok(world.applyMatrix4(rotation.clone().invert()).distanceTo(local)<1e-10);
 }
});
test('Cyrillic final title has finite geometry, normals and bounds',()=>{
 const font=JSON.parse(fs.readFileSync(new URL('../src/fonts/title.json',import.meta.url)));
 const geometry=createTitleGeometry(font,'Янтарный циркуль');
 for(const attribute of Object.values(geometry.attributes))assert.ok(attribute.array.every(Number.isFinite));
 assert.ok(Number.isFinite(geometry.boundingSphere.radius) && geometry.boundingSphere.radius>0);
 assert.ok(geometry.boundingBox.max.x>4);
 geometry.dispose();
});

test('ten shot labels and timecodes match the brief, unspecified ends stay null',async()=>{
 const {shots,mediaSources}=await import('../src/media-config.js');
 assert.equal(shots.length,10);assert.equal(mediaSources.length,10);
 assert.deepEqual(shots.map(shot=>shot.label),['Шульган','Тихонова','Общий план зала','Зикеев','Боровская','Фотозона','Бейджи','Соболь/Анисимов','Юшкевичус','Все победители']);
 assert.equal(shots[0].in,85);assert.equal(shots[0].out,88);
 assert.equal(shots[7].in,85);
 assert.ok(shots.slice(1).every(shot=>shot.out===null));
});
test('panel and beam visibility fade continuously instead of switching at boundaries',async()=>{
 const {panelEnvelope,beamEnvelope,DURATION}=await import('../src/media-config.js');
 for(const envelope of [beamEnvelope,t=>panelEnvelope(4,t),t=>panelEnvelope(49,t)]){
  let previous=envelope(0);
  for(let t=.001;t<DURATION;t+=.001){
   const value=envelope(t);assert.ok(value>=0&&value<=1);
   assert.ok(Math.abs(value-previous)<.012);previous=value;
  }
  assert.equal(envelope(0),0);assert.equal(envelope(DURATION),0);
 }
});

test('camera passes panel edges without intersecting any photo and always looks forward',async()=>{
 const {travellingCameraPose}=await import('../src/choreography.js');
 const {MediaPanel}=await import('../src/media-panels.js');
 const {MeshPhysicalMaterial}=await import('three');
 const {PANEL_SPACING,SHOT_INTERVAL,FIRST_PANEL_Z,shots,mediaSources,DURATION,FINALE,smoothFade}=await import('../src/media-config.js');
 const panels=shots.map((shot,i)=>{
  const panel=new MediaPanel(i,new MeshPhysicalMaterial(),null,null);
  panel.setDimensions(mediaSources[i].aspect);panel.updateMatrixWorld(true);return panel;
 });

 for(let t=0;t<61;t+=.025){
  const position=travellingCameraPose(t,PANEL_SPACING,SHOT_INTERVAL,FIRST_PANEL_Z);
  position[0]*=1-smoothFade(FINALE.transition,FINALE.full,t);position[1]*=1-smoothFade(FINALE.transition,FINALE.full,t);
  assert.ok(position[5]<position[2]-10,'camera must look at least 10 units ahead, never back');
  for(const panel of panels){
   const local=panel.worldToLocal(new Vector3(...position.slice(0,3)));
   const intersects=Math.abs(local.z)<.75 && Math.abs(local.x)<panel.width/2+.45 && Math.abs(local.y)<panel.height/2+.45;
   assert.ok(!intersects,`camera intersects screen ${panel.index+1} at ${t}`);
  }
 }
 for(const panel of panels){
  assert.equal(panel.frame.geometry.parameters.shapes.holes.length,1,'frame must have a real media aperture');
  panel.frame.geometry.computeBoundingBox();
  assert.ok(panel.frame.geometry.boundingBox.max.z-panel.frame.geometry.boundingBox.min.z<.12,'edge must remain slim, not a heavy picture frame');
  assert.ok(panel.frame.geometry.boundingBox.max.x-panel.width/2<.12,'no broad golden picture-frame border');
  for(const attribute of Object.values(panel.frame.geometry.attributes))assert.ok(attribute.array.every(Number.isFinite));
 }
});

test('corridor has an irregular eight-sided profile, unequal bays, and no complete portal frames',async()=>{
 const {createGoldTunnel}=await import('../src/gold-tunnel.js');
 const {MeshPhysicalMaterial}=await import('three');
 let seed=73;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
 const tunnel=createGoldTunnel(random,[new MeshPhysicalMaterial(),new MeshPhysicalMaterial()],-240);
 assert.equal(tunnel.userData.profile.length,8);
 const lengths=tunnel.userData.rings.slice(1).map((ring,i)=>tunnel.userData.rings[i][0].z-ring[0].z);
 assert.ok(Math.max(...lengths)-Math.min(...lengths)>2);
 tunnel.traverse(object=>{
  if(!object.geometry)return;
  for(const attribute of Object.values(object.geometry.attributes))assert.ok(attribute.array.every(Number.isFinite));
  assert.notEqual(object.geometry.type,'ExtrudeGeometry','no closed extruded arch portals');
 });
});

test('travelling camera never stops, reverses or changes its forward speed',async()=>{
 const {travellingCameraPose}=await import('../src/choreography.js');
 const {PANEL_SPACING,SHOT_INTERVAL,FIRST_PANEL_Z,DURATION}=await import('../src/media-config.js');
 const speed=PANEL_SPACING/SHOT_INTERVAL,h=.001;
 for(let t=0;t<DURATION;t+=.02){
  const a=travellingCameraPose(t,PANEL_SPACING,SHOT_INTERVAL,FIRST_PANEL_Z);
  const b=travellingCameraPose(t+h,PANEL_SPACING,SHOT_INTERVAL,FIRST_PANEL_Z);
  assert.ok(Math.abs((a[2]-b[2])/h-speed)<1e-8);
  assert.ok(a[5]<a[2]-15);
 }
});

test('floor has actual height relief, not a flat triangulated plane, and ribbons are finite',async()=>{
 const {createGoldTunnel}=await import('../src/gold-tunnel.js');
 const {createFoldedRibbons}=await import('../src/folded-ribbons.js');
 const {MeshPhysicalMaterial}=await import('three');
 let seed=73;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
 const materials=[new MeshPhysicalMaterial(),new MeshPhysicalMaterial()];
 const tunnel=createGoldTunnel(random,materials,-240);
 const heights=tunnel.userData.rings.map(ring=>ring[1].y);
 assert.ok(Math.max(...heights)-Math.min(...heights)>2.5,'floor must change elevation substantially');
 const ribbons=createFoldedRibbons(materials,-240);
 assert.equal(ribbons.children.length,2);
 ribbons.traverse(object=>{if(object.geometry)for(const attribute of Object.values(object.geometry.attributes))assert.ok(attribute.array.every(Number.isFinite));});
});

test('light bridges stay in the forward view and the tail fades monotonically to zero',async()=>{
 const {travellingCameraPose,lightBridgePoint,trailOpacity}=await import('../src/choreography.js');
 const {PANEL_SPACING,SHOT_INTERVAL,FIRST_PANEL_Z}=await import('../src/media-config.js');
 const {PerspectiveCamera}=await import('three');
 for(const aspect of [.65,1.5,1.9])for(let i=0;i<10;i++){
  const pose=travellingCameraPose(6+i*5+4.2,PANEL_SPACING,SHOT_INTERVAL,FIRST_PANEL_Z);
  const camera=new PerspectiveCamera(aspect<1?68:46,aspect,.1,320);
  camera.position.fromArray(pose);camera.lookAt(pose[3],pose[4],pose[5]);camera.rotateZ(pose[6]);camera.updateMatrixWorld();
  const point=new Vector3(...lightBridgePoint(pose,i)).project(camera);
  assert.ok(Math.abs(point.x)<.9 && Math.abs(point.y)<.9 && point.z<1,'bridge must be framed, not off-screen');
 }
 assert.equal(trailOpacity(0),1);assert.equal(trailOpacity(1),0);
 let previous=1;for(let u=0;u<=1;u+=.01){assert.ok(trailOpacity(u)<=previous);previous=trailOpacity(u);}
});

test('media reveals geometry without making the whole photograph transparent',async()=>{
 const {revealTriangles}=await import('../src/media-reveal.js');
 const area=triangles=>{
  let sum=0;
  for(let i=0;i<triangles.length;i+=3){const [a,b,c]=triangles.slice(i,i+3);sum+=Math.abs((b.u-a.u)*(c.v-a.v)-(b.v-a.v)*(c.u-a.u))/2;}
  return sum;
 };
 for(const reverse of [false,true]){
  assert.equal(revealTriangles(0,reverse).length,0);
  const full=revealTriangles(1,reverse);
  assert.ok(full.every(vertex=>vertex.alpha===1));assert.ok(Math.abs(area(full)-1)<1e-10);
  let previousArea=0;
  for(let p=0;p<=1;p+=.01){
   const triangles=revealTriangles(p,reverse),coverage=area(triangles);
   assert.ok(triangles.length<=48);assert.ok(coverage>=previousArea-1e-9);previousArea=coverage;
   for(const vertex of triangles){
    assert.ok(vertex.u>=-1e-9&&vertex.u<=1+1e-9&&vertex.v>=-1e-9&&vertex.v<=1+1e-9);
    assert.ok(vertex.alpha>=0&&vertex.alpha<=1);
   }
  }
  assert.ok(revealTriangles(.5,reverse).some(vertex=>vertex.alpha===1),'already revealed region is fully opaque');
 }
});

test('atmospheric dust is deterministic, bounded and sparse; engraving stays behind instrument',async()=>{
 const {dustField,createAtmosphere,createCompassEngraving}=await import('../src/atmosphere.js');
 const {LineBasicMaterial}=await import('three');
 const a=dustField(640,-238),b=dustField(640,-238);
 assert.deepEqual(a,b);
 for(let i=0;i<640;i++){
  assert.ok(Math.abs(a[i*4])<=12.5 && Math.abs(a[i*4+1])<=8.5);
  assert.ok(a[i*4+2]>=-238 && a[i*4+2]<=12);
  assert.ok(a[i*4+3]>=0 && a[i*4+3]<=1);
 }
 const dust=createAtmosphere(-238);
 assert.equal(dust.geometry.attributes.position.count,640);
 assert.equal(dust.material.depthWrite,false);
 assert.equal(dust.layers.mask,2);
 const engraving=createCompassEngraving(new LineBasicMaterial());
 const positions=engraving.geometry.attributes.position;
 for(let i=0;i<positions.count;i++)assert.ok(Number.isFinite(positions.getX(i)) && positions.getZ(i)<0);
 dust.geometry.dispose();dust.material.dispose();engraving.geometry.dispose();engraving.material.dispose();
});

test('light flight has continuous velocity and acceleration through authored knots',async()=>{
 const {sampleLightSpline}=await import('../src/choreography.js');
 const knots=[[0,0,0,0],[1.1,3,-1,-5],[2.6,5,2,-9],[4,-2,1,-16],[5.3,1,0,-23]];
 const h=1e-4;
 for(const knot of knots.slice(1,-1)){
  const t=knot[0],a=sampleLightSpline(knots,t-h),b=sampleLightSpline(knots,t),c=sampleLightSpline(knots,t+h);
  for(let axis=0;axis<3;axis++){
   assert.ok(Math.abs(b[axis]-knot[axis+1])<1e-10);
   assert.ok(Math.abs((b[axis]-a[axis])/h-(c[axis]-b[axis])/h)<.001);
   assert.ok(Math.abs((a[axis]-2*b[axis]+c[axis])/(h*h))<.1);
  }
 }
 for(let t=0;t<=5.3;t+=.01)assert.ok(sampleLightSpline(knots,t).every(Number.isFinite));
});

test('HDR targets respect sample limits and transported frames stay stable through vertical turns',async()=>{
 const {createSceneTarget,transportNormal}=await import('../src/render-quality.js');
 const {HalfFloatType}=await import('three');
 for(const max of [0,1,2,4,8]){
  const target=createSceneTarget(800,600,1.5,max);
  assert.equal(target.width,1200);assert.equal(target.height,900);
  assert.equal(target.texture.type,HalfFloatType);assert.equal(target.samples,Math.min(4,max));
  target.dispose();
 }
 const normal=new Vector3();let previous;
 for(let i=0;i<=400;i++){
  const angle=-.5+i/400;
  const tangent=new Vector3(Math.sin(angle),Math.cos(angle),.001).normalize();
  transportNormal(tangent,normal,i===0);
  assert.ok(Math.abs(normal.length()-1)<1e-10);
  assert.ok(Math.abs(normal.dot(tangent))<1e-10);
  if(previous)assert.ok(previous.dot(normal)>.999,'no frame flip');
  previous=normal.clone();
 }
});

test('architecture uses broad two-triangle folds instead of four-triangle spike fans',async()=>{
 const {createGoldTunnel}=await import('../src/gold-tunnel.js');
 const {MeshPhysicalMaterial}=await import('three');
 let seed=73;const random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};
 const material=new MeshPhysicalMaterial();
 const tunnel=createGoldTunnel(random,[material],-240);
 const rings=tunnel.userData.rings;
 const count=tunnel.children.reduce((sum,mesh)=>sum+mesh.geometry.attributes.position.count,0);
 assert.equal(count,(rings.length-1)*16*6);
 assert.ok(rings.length<40,'large unequal architectural bays');
 for(const ring of rings)for(const vertex of ring)assert.equal(vertex.z,ring[0].z,'no random longitudinal spikes');
 tunnel.traverse(object=>object.geometry?.dispose());material.dispose();tunnel.userData.seamMaterial.dispose();
});

test('finale uses licensed Cyrillic Prata outlines with complete title coverage',()=>{
 const font=JSON.parse(fs.readFileSync(new URL('../src/fonts/title.json',import.meta.url),'utf8'));
 assert.match(font.familyName,/Prata/);
 for(const character of 'Янтарный циркуль')assert.ok(font.glyphs[character],`missing ${character}`);
 const license=fs.readFileSync(new URL('../src/fonts/Prata-OFL.txt',import.meta.url),'utf8');
 assert.match(license,/SIL OPEN FONT LICENSE/);
});

test('grazing strip lights stay at perimeter, move continuously and fade out',async()=>{
 const {edgeLightPose,createEdgeLighting}=await import('../src/edge-lighting.js');
 for(const side of [-1,1])for(let t=0;t<71;t+=.1){
  const a=edgeLightPose(t,9-3.6*t,side),b=edgeLightPose(t+.001,9-3.6*(t+.001),side);
  assert.ok(a.position.every(Number.isFinite));
  assert.ok(Math.abs(a.position[0])>10 && Math.abs(a.position[0])<11);
  assert.ok(Math.abs(a.target[0])>Math.abs(a.position[0]),'aim outward, not across the photos');
  assert.ok(a.position.every((value,i)=>Math.abs(value-b.position[i])<.005));
 }
 const rig=createEdgeLighting();rig.userData.update(64,-221,0);
 assert.equal(rig.children.length,2);
 assert.ok(rig.children.every(light=>light.intensity===0));
 rig.userData.update(10,-27,1);
 assert.ok(rig.children.every(light=>light.intensity>0 && light.intensity<=1.1));
 rig.children.forEach(light=>light.dispose());
});

test('focus pulls are continuous, seek-independent and finish at actual lockup depth',async()=>{
 const {cinematicFocus}=await import('../src/focus-pull.js');
 const subjectsAt=t=>Array.from({length:10},(_,i)=>({revealTime:4+i*5,depth:39+i*18-t*3.6}));
 let previous=cinematicFocus(0,subjectsAt(0));
 for(let t=.001;t<59;t+=.001){
  const focus=cinematicFocus(t,subjectsAt(t));
  assert.ok(Number.isFinite(focus) && focus>=2 && focus<=90);
  assert.ok(Math.abs(focus-previous)<.08,'no hard focus switch');
  previous=focus;
 }
 const expected=cinematicFocus(27.4,subjectsAt(27.4));
 cinematicFocus(45,subjectsAt(45));
 assert.equal(cinematicFocus(27.4,subjectsAt(27.4)),expected);
 assert.equal(cinematicFocus(64,subjectsAt(64),1),19);
 assert.ok(Math.abs(cinematicFocus(0,[])-12)<1e-10);
 assert.ok(Math.abs(cinematicFocus(5,[{depth:NaN,revealTime:4},{depth:-2,revealTime:4}])-12)<1e-10);
});

test('leading starburst has a dominant core, long rays, no sprite border and convergent strands',async()=>{
 const {starIntensity,strandSpread}=await import('../src/light-head.js');
 assert.equal(starIntensity(0,0),1);
 assert.equal(starIntensity(1,0),0);assert.equal(starIntensity(.8,.8),0);
 assert.ok(starIntensity(.45,0)>starIntensity(.45,.025)*3,'visible narrow optical ray');
 for(let x=-1;x<=1;x+=.04)for(let y=-1;y<=1;y+=.04){
  const a=starIntensity(x,y);
  assert.ok(Number.isFinite(a)&&a>=0&&a<=1);
  assert.ok(Math.abs(a-starIntensity(-x,-y))<1e-10);
 }
 assert.equal(strandSpread(0),0);assert.equal(strandSpread(.3),1);
 let previous=0;for(let u=0;u<=1;u+=.01){assert.ok(strandSpread(u)>=previous);previous=strandSpread(u);}
});

test('active scene is an open media stage without tunnel or perimeter lighting',()=>{
 const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.ok(source.includes('mediaStage.add(panel)'));
 for(const removed of ['createGoldTunnel','createFoldedRibbons','createEdgeLighting','tunnelSoftbox','tunnelFill','architectureOpacity']){
  assert.ok(!source.includes(removed),`${removed} must not be instantiated by the active scene`);
 }
 assert.ok(source.includes('starIntensity'));
 assert.ok(source.includes('cinematicFocus'));
});

test('settings schema preserves defaults, clamps imports and tolerates unavailable storage',async()=>{
 const {settingGroups,defaultSettings,sanitizeSettings,loadSettings}=await import('../src/settings.js');
 const keys=settingGroups.flatMap(([,rows])=>rows.map(([key])=>key));
 assert.equal(keys.length,new Set(keys).size);
 assert.deepEqual(sanitizeSettings(),defaultSettings);
 assert.deepEqual(loadSettings(undefined),defaultSettings);
 assert.deepEqual(loadSettings({getItem(){throw new Error('blocked');}}),defaultSettings);
 assert.deepEqual(loadSettings({getItem(){return '{invalid';}}),defaultSettings);
 const result=sanitizeSettings({speed:99,exposure:-2,beam:false,pixelRatio:NaN,background:'#Ab1200',unknown:123,frames:'false'});
 assert.equal(result.speed,2);assert.equal(result.exposure,.2);assert.equal(result.beam,false);
 assert.equal(result.pixelRatio,defaultSettings.pixelRatio);assert.equal(result.background,'#Ab1200');
 assert.equal(result.frames,true);assert.ok(!Object.hasOwn(result,'unknown'));
 assert.equal(sanitizeSettings({background:'url(evil)'}).background,defaultSettings.background);
 assert.deepEqual(sanitizeSettings(null),defaultSettings);
});

test('every exposed setting is connected to the live scene',async()=>{
 const {defaultSettings}=await import('../src/settings.js');
 const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const orbitSource=fs.readFileSync(new URL('../src/edge-orbits.js',import.meta.url),'utf8')+fs.readFileSync(new URL('../src/finale-impact.js',import.meta.url),'utf8')+fs.readFileSync(new URL('../src/background-particles.js',import.meta.url),'utf8');
 for(const key of Object.keys(defaultSettings))assert.ok(source.includes(`settings.${key}`)||orbitSource.includes(`options.${key}`),`unwired setting: ${key}`);
});

test('settings opening is declarative and independent of WebGL initialization',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/<button[^>]*id="settings-toggle"[^>]*popovertarget="settings-panel"/);
 assert.match(html,/<aside[^>]*id="settings-panel"[^>]*popover="auto"/);
 assert.match(html,/<button[^>]*id="settings-close"[^>]*popovertarget="settings-panel"[^>]*popovertargetaction="hide"/);
 const css=fs.readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 assert.ok(css.includes('.settings-toggle svg{pointer-events:none}'));
});


test('edge orbit dust is deterministic and camera-relative layout leaves the centre clear',async()=>{
 const {orbitDust,orbitLayout,createEdgeOrbits}=await import('../src/edge-orbits.js');
 const {PerspectiveCamera}=await import('three');
 assert.deepEqual(orbitDust(),orbitDust());
 for(let i=0,values=orbitDust();i<values.length;i+=4){
  const radius=Math.hypot(values[i],values[i+1]);
  assert.ok(radius>=3.49&&radius<=5.31);
  assert.ok(Math.abs(values[i+2])<=.31);
 }
 for(const aspect of [.46,.65,1.5,1.9]){
  const camera=new PerspectiveCamera(aspect<1?68:46,aspect,.1,320);
  const layout=orbitLayout(camera.fov,aspect);
  assert.ok(Number.isFinite(layout.halfWidth)&&layout.size<=2.5);
  const root=createEdgeOrbits(null);
  root.userData.update(camera,10,{edgeOrbits:true,orbitSize:1,orbitSpeed:1,orbitBrightness:1,orbitParticles:true});
  for(const group of root.children){
   assert.ok(Math.abs(group.position.x)>layout.halfWidth);
   assert.ok(Math.abs(group.position.y)>layout.halfHeight);
   assert.ok(Math.abs(group.position.x)-5.3*layout.size>layout.halfWidth*.25,'central media lane stays clear');
  }
  root.userData.update(camera,10,{edgeOrbits:false});assert.equal(root.visible,false);
  root.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
 }
});

test('hero media sections preserve complete UV coverage, fade geometry and deterministic assembly',async()=>{
 const {sectionedTriangles,assemblyProgress,heroShotWeight}=await import('../src/sectioned-media.js');
 const area=vertices=>{let sum=0;for(let i=0;i<vertices.length;i+=3){const [a,b,c]=vertices.slice(i,i+3);sum+=Math.abs((b.u-a.u)*(c.v-a.v)-(b.v-a.v)*(c.u-a.u))/2;}return sum;};
 for(const reverse of [false,true])for(let i=0;i<=100;i++){
  const p=i/100,vertices=sectionedTriangles(p,reverse,.7);
  assert.ok(vertices.length<=192);
  const {revealTriangles}=await import('../src/media-reveal.js');
  assert.ok(Math.abs(area(vertices)-area(revealTriangles(p,reverse)))<1e-10,'no source crop or duplicated regions');
  for(const vertex of vertices)assert.ok(Object.values(vertex).every(Number.isFinite)&&vertex.u>=-1e-10&&vertex.u<=1+1e-10&&vertex.alpha>=0&&vertex.alpha<=1);
 }
 assert.equal(assemblyProgress(3.8,5.4),0);assert.equal(assemblyProgress(7.1,5.4),1);
 assert.equal(heroShotWeight(0),0);assert.equal(heroShotWeight(7),1);assert.equal(heroShotWeight(10),0);
 assert.ok(Math.abs(area(sectionedTriangles(1))-1)<1e-10);
});

test('solid finale compass has finite bevels and larger title fits portrait and landscape',async()=>{
 const {createDraftingCompass,finaleFit,createFinalBackdrop}=await import('../src/finale-design.js');
 const {MeshPhysicalMaterial,Box3}=await import('three');
 const gold=new MeshPhysicalMaterial(),dark=gold.clone(),tip=gold.clone();
 const compass=createDraftingCompass(gold,dark,tip);
 const box=new Box3().setFromObject(compass);
 assert.ok(box.max.z-box.min.z>.2,'real instrument depth');
 compass.traverse(object=>{if(object.geometry)for(const attribute of Object.values(object.geometry.attributes))assert.ok(attribute.array.every(Number.isFinite));});
 for(const aspect of [.46,.65,1,1.5,1.9]){
  const fov=aspect<1?68:46,scale=finaleFit(fov,aspect);
  const width=2*19*Math.tan(fov*Math.PI/360)*aspect;
  assert.ok(scale>0&&scale<=1&&16*scale<=width*.861);
 }
 const backdrop=createFinalBackdrop();assert.equal(backdrop.material.depthWrite,false);assert.equal(backdrop.layers.mask,2);
 compass.traverse(object=>object.geometry?.dispose());gold.dispose();dark.dispose();tip.dispose();backdrop.geometry.dispose();backdrop.material.dispose();
});


test('finale beam arrives at the moving logo, makes one bounded flash, and reveals stationary geometry',async()=>{
 const {impactPoint,impactEnvelope,IMPACT_TIME}=await import('../src/finale-impact.js');
 const {beamEnvelope,FINALE}=await import('../src/media-config.js');
 for(let t=56;t<=62;t+=.01){
  const point=impactPoint(t),envelope=impactEnvelope(t);
  assert.ok(Math.abs(point[2]-(9-3.6*t-19))<1e-10);
  assert.ok(envelope.flash>=0&&envelope.flash<=1&&envelope.sparks>=0&&envelope.sparks<=1);
 }
 assert.equal(beamEnvelope(IMPACT_TIME),1);
 assert.equal(beamEnvelope(IMPACT_TIME+.3),0);
 assert.equal(impactEnvelope(IMPACT_TIME-.1).flash,0);
 assert.equal(impactEnvelope(IMPACT_TIME+2).flash,0);
 assert.ok(impactEnvelope(IMPACT_TIME+.1).flash>.9);
 assert.ok(FINALE.reveal>IMPACT_TIME);
 const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.ok(source.includes('finale.rotation.set(0,0,0)')&&source.includes('compass.rotation.set(0,0,0)'));
 assert.ok(!source.includes('finale.rotation.y=')&&!source.includes('compass.rotation.z='));
});

test('final logo projection is invariant before and after impact, including cursor movement',async()=>{
 const {finalCameraBlend,IMPACT_TIME}=await import('../src/finale-impact.js');
 const {travellingCameraPose}=await import('../src/choreography.js');
 const {PerspectiveCamera}=await import('three');
 const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.ok(source.includes('const finish=finalCameraBlend(t)'));
 assert.ok(!source.includes('finalFrame'));
 const camera=new PerspectiveCamera(46,1.5,.1,320);let previous;
 for(let t=57.8;t<70;t+=.037){
  const blend=finalCameraBlend(t),pose=travellingCameraPose(t,18,5,-30);
  assert.equal(blend,1);assert.ok(t<IMPACT_TIME||blend===1);
  camera.position.set(pose[0]*(1-blend)+Math.sin(t)*.23*(1-blend),pose[1]*(1-blend),pose[2]);
  camera.lookAt(pose[3]*(1-blend),pose[4]*(1-blend),pose[5]);camera.rotateZ(pose[6]*(1-blend));camera.updateMatrixWorld();
  const projected=new Vector3(0,1.65,pose[2]-19).project(camera);
  if(previous)assert.ok(previous.distanceTo(projected)<1e-10);
  previous=projected;
 }
});

test('diptych partition preserves the complete source through reveal and layout choices protect portraits',async()=>{
 const {sectionedTriangles,choosePresentation,seamEndpoints}=await import('../src/sectioned-media.js');
 const {revealTriangles}=await import('../src/media-reveal.js');
 const area=vertices=>{let sum=0;for(let i=0;i<vertices.length;i+=3){const [a,b,c]=vertices.slice(i,i+3);sum+=Math.abs((b.u-a.u)*(c.v-a.v)-(b.v-a.v)*(c.u-a.u))/2;}return sum;};
 for(const mode of ['diptych','triptych'])for(const reverse of [false,true])for(let p=0;p<=1;p+=.01){
  const vertices=sectionedTriangles(p,reverse,.65,mode);
  assert.ok(vertices.length<=192&&vertices.every(v=>Object.values(v).every(Number.isFinite)));
  assert.ok(Math.abs(area(vertices)-area(revealTriangles(p,reverse)))<1e-9);
 }
 assert.equal(choosePresentation(0,16/9),'triptych');assert.equal(choosePresentation(1,16/9),'whole');assert.equal(choosePresentation(2,1),'diptych');
 for(let i=0;i<10;i++)assert.equal(choosePresentation(i,9/16),'whole');
 assert.equal(choosePresentation(0,9/16,'diptych'),'diptych');
 const [a,b]=seamEndpoints(.5,'diptych');assert.equal(a.v,0);assert.equal(b.v,1);
});

test('uploaded aspect and manual presentation changes rebuild the matching seams without changing source fit',async()=>{
 const {MediaPanel}=await import('../src/media-panels.js');const {MeshPhysicalMaterial}=await import('three');
 const material=new MeshPhysicalMaterial(),panel=new MediaPanel(2,material,null,null);
 panel.setDimensions(9/16);assert.equal(panel.presentation,'whole');assert.equal(panel.sectionSeams.length,0);
 const width=panel.width,height=panel.height;
 panel.setLayout('diptych');assert.equal(panel.presentation,'diptych');assert.equal(panel.sectionSeams.length,2);
 assert.equal(panel.width,width);assert.equal(panel.height,height);
 panel.setPresentation(18,true);assert.equal(panel.sectioned,true);
 panel.setPresentation(18,false);assert.equal(panel.sectioned,false);
 panel.setLayout('auto');assert.equal(panel.presentation,'whole');assert.equal(panel.sectionSeams.length,0);
 panel.traverse(object=>{object.geometry?.dispose();});panel.frame.material.dispose();panel.face.material.dispose();panel.back.material.dispose();material.dispose();
});

test('all media get smooth non-overlapping reading windows and safe fitted lenses',async()=>{
 const {mediaReadingShot,mediaReadingFov}=await import('../src/media-direction.js');
 const {travellingCameraPose}=await import('../src/choreography.js');
 const {MediaPanel}=await import('../src/media-panels.js');
 const {MeshPhysicalMaterial,PerspectiveCamera}=await import('three');
 const material=new MeshPhysicalMaterial();
 const panels=Array.from({length:10},(_,i)=>new MediaPanel(i,material,null,null));
 for(const panel of panels)panel.updateMatrixWorld(true);
 for(let i=0;i<10;i++){
  const t=7+i*5,reading=mediaReadingShot(t,panels);
  assert.equal(reading.index,i);assert.equal(reading.weight,1);
  const pose=travellingCameraPose(t,18,5,-30);
  for(const aspect of [.46,1.5,1.9]){
   const camera=new PerspectiveCamera(46,aspect,.1,320);camera.position.fromArray(pose);
   camera.lookAt(panels[i].position);camera.updateMatrixWorld();
   assert.ok(panels[i].position.z<camera.position.z,'look remains forward');
   const fov=mediaReadingFov(camera,panels[i],aspect<1);
   assert.ok(Number.isFinite(fov)&&fov>=52&&fov<=90);
  }
 }
 let previous=0;
 for(let t=0;t<60;t+=.001){const {weight}=mediaReadingShot(t,panels);assert.ok(Math.abs(weight-previous)<.002);previous=weight;}
 assert.deepEqual(mediaReadingShot(64,panels),{index:-1,weight:0});
 panels.forEach(panel=>{panel.traverse(object=>object.geometry?.dispose());panel.frame.material.dispose();panel.face.material.dispose();panel.back.material.dispose();});material.dispose();
});

test('passed media releases its rear silhouette smoothly before the next reading shot',async()=>{
 const {mediaPassVisibility}=await import('../src/media-direction.js');
 assert.equal(mediaPassVisibility(-34.2,-30),0);
 assert.equal(mediaPassVisibility(-16.2,-30),1);
 let previous=1;
 for(let z=-18;z>=-33;z-=.001){const value=mediaPassVisibility(z,-30);assert.ok(value<=previous+1e-12&&Math.abs(value-previous)<.001);previous=value;}
 assert.equal(previous,0);
});

test('baked beam lookup tracks authored positions and can reuse its output buffer',async()=>{
 const {bakeLightPath}=await import('../src/animation-runtime.js');
 const {sampleLightSpline}=await import('../src/choreography.js');
 const knots=[[0,0,1,0],[1.1,5,3,-5],[2,8,0,-10],[3,-1,2,-13],[3.65,-4,1,-14],[4.2,0,0,-19],[5,2,3,-22]];
 const baked=bakeLightPath(knots),buffer=new Float64Array(3);
 for(let t=.01;t<4.99;t+=.0013){
  const result=baked.sample(t,buffer),expected=sampleLightSpline(knots,t);
  assert.equal(result,buffer);
  for(let axis=0;axis<3;axis++)assert.ok(Math.abs(result[axis]-expected[axis])<.00002);
 }
 assert.deepEqual(Array.from(baked.sample(-10)),knots[0].slice(1));
 assert.deepEqual(Array.from(baked.sample(12)),knots.at(-1).slice(1));
});

test('render gate sleeps on pause, wakes for edits and preserves settling after source changes',async()=>{
 const {createRenderGate}=await import('../src/animation-runtime.js');const gate=createRenderGate();
 assert.equal(gate.shouldRender(0,false),true);assert.equal(gate.shouldRender(1,false),false);
 assert.equal(gate.shouldRender(2,true),true);
 gate.invalidate(10,2300);assert.equal(gate.shouldRender(100,false),true);
 assert.equal(gate.shouldRender(2309,false),true);assert.equal(gate.shouldRender(2311,false),false);
 gate.invalidate(2400);assert.equal(gate.shouldRender(2500,false,true),false);
 assert.equal(gate.shouldRender(2501,false),true);
});

import { videoTiming } from '../src/video-timing.js';
test('video timing stays inside short files and handles invalid or reversed clips',()=>{
 for(const duration of [.0001,.01,1,12,400]){
  for(const clipIn of [-5,0,85,Infinity])for(const clipOut of [null,-1,3,88]){
   for(const local of [-1,0,5,1000]){
    const sample=videoTiming(duration,clipIn,clipOut,local);
    assert.equal(sample.ready,true);
    assert.ok(sample.time>=0&&sample.time<duration);
    assert.ok(sample.end>=sample.start);
   }
  }
 }
 for(const duration of [NaN,Infinity,0,-1])assert.equal(videoTiming(duration,0,null,1).ready,false);
});
test('video clip looping is deterministic across timeline seeks',()=>{
 assert.equal(videoTiming(120,85,88,0).time,85);
 assert.equal(videoTiming(120,85,88,2.5).time,87.5);
 assert.equal(videoTiming(120,85,88,3).time,85);
 assert.equal(videoTiming(120,85,88,7).time,86);
});

import { sourceClip, mediaPreviewTime } from '../src/media-workflow.js';
test('video workflow preserves authored inpoints only for full recordings',()=>{
 const expected=[85,214,216,232,291,341,7,85,299,344];
 for(let i=0;i<10;i++){
  assert.deepEqual(sourceClip(i,'clip'),{clipIn:0,clipOut:null});
  assert.deepEqual(sourceClip(i,'recording'),{clipIn:expected[i],clipOut:i===0?88:null});
  assert.ok(mediaPreviewTime(i)>=5.3+i*5&&mediaPreviewTime(i)<=9.1+i*5);
 }
 assert.throws(()=>sourceClip(10,'clip'),RangeError);
 assert.throws(()=>mediaPreviewTime(-1),RangeError);
});

import { mediaWarning } from '../src/media-diagnostics.js';
test('media diagnostics distinguish too-short recordings from ready-cut clips',()=>{
 assert.match(mediaWarning(0,'video','recording',84),/короче/);
 assert.match(mediaWarning(0,'video','recording',85),/короче/);
 assert.match(mediaWarning(0,'video','recording',87),/раньше/);
 assert.equal(mediaWarning(0,'video','recording',88),'');
 assert.equal(mediaWarning(0,'video','clip',3),'');
 assert.equal(mediaWarning(0,'image','recording',3),'');
 assert.equal(mediaWarning(0,'video','recording',NaN),'');
 assert.equal(mediaWarning(1,'video','recording',215),'');
 assert.match(mediaWarning(1,'video','recording',214),/короче/);
});

import { smoothMotion, dampMotion } from '../src/motion-easing.js';
test('motion envelopes join with zero velocity and acceleration',()=>{
 const h=1e-4;
 assert.equal(smoothMotion(0,1,-1),0);assert.equal(smoothMotion(0,1,2),1);
 for(const t of [0,1]){
  const left=smoothMotion(0,1,t-h),centre=smoothMotion(0,1,t),right=smoothMotion(0,1,t+h);
  assert.ok(Math.abs((right-left)/(2*h))<1e-5);
  assert.ok(Math.abs((right-2*centre+left)/(h*h))<.01);
 }
 let previous=0;for(let t=0;t<=1;t+=.001){const value=smoothMotion(0,1,t);assert.ok(value>=previous);previous=value;}
});
test('cursor damping is frame-rate independent and starts without a velocity jump',()=>{
 const run=(fps)=>{let p=0,v=0;for(let i=0;i<fps;i++){const next=dampMotion(p,v,1,1/fps);p=next.position;v=next.velocity;assert.ok(p>=0&&p<=1);}return p;};
 assert.ok(Math.abs(run(30)-run(120))<1e-12);
 assert.ok(dampMotion(0,0,1,1e-5).velocity<.001);
 assert.ok(run(60)>.98);
});

test('media playback has no per-card zoom pulses and only restrained camera attention',async()=>{
 const {mediaPlaybackFov,mediaAttentionWeight}=await import('../src/media-direction.js');
 for(let t=0;t<55.5;t+=.013){assert.equal(mediaPlaybackFov(t),60);assert.equal(mediaPlaybackFov(t,true),78);}
 assert.equal(mediaPlaybackFov(64),46);assert.equal(mediaPlaybackFov(64,true),68);
 assert.equal(mediaAttentionWeight(1),.45);assert.equal(mediaAttentionWeight(1,1),0);
});
test('section assembly does not move the parent placeholder transform',async()=>{
 const {MediaPanel}=await import('../src/media-panels.js');const {MeshPhysicalMaterial}=await import('three');
 const material=new MeshPhysicalMaterial(),panel=new MediaPanel(0,material,null,null);
 const position=panel.position.clone(),rotation=panel.rotation.clone();
 for(let t=0;t<12;t+=.01){panel.setPresentation(t,true);assert.ok(panel.position.equals(position));assert.ok(panel.rotation.equals(rotation));}
 panel.traverse(object=>{object.geometry?.dispose();});panel.frame.material.dispose();panel.face.material.dispose();panel.back.material.dispose();material.dispose();
});

test('card release lasts nearly two seconds rather than a half-second near-camera snap',async()=>{
 const {mediaPassVisibility}=await import('../src/media-direction.js');
 const speed=18/5,duration=7/speed;
 assert.ok(duration>1.9);
 assert.equal(mediaPassVisibility(-19,-30),1);
 assert.equal(mediaPassVisibility(-26,-30),0);
 assert.ok(Math.abs(mediaPassVisibility(-22.5,-30)-.5)<1e-10);
});

test('media camera stays in one side lane with slow bounded drift instead of slalom',async()=>{
 const {travellingCameraPose}=await import('../src/choreography.js');
 const h=.001;
 for(let t=6;t<55.5;t+=.023){
  const a=travellingCameraPose(t,18,5,-30),b=travellingCameraPose(t+h,18,5,-30),c=travellingCameraPose(t-h,18,5,-30);
  assert.ok(a[0]>=-8.55&&a[0]<=-8.05);
  assert.ok(Math.abs((b[0]-c[0])/(2*h))<=.030001,'lateral speed is restrained');
  assert.ok(Math.abs((b[0]-2*a[0]+c[0])/(h*h))<.004,'no lateral acceleration kick');
  assert.ok(Math.abs(a[6])<=.004,'roll is restrained');
 }
});

test('continuous media gaze has no per-shot depth pulls and C2 joins',async()=>{
 const {createMediaGaze}=await import('../src/media-direction.js');
 const {travellingCameraPose}=await import('../src/choreography.js');
 const panels=Array.from({length:10},(_,i)=>({position:{x:Math.sin(i)*2,y:Math.cos(i)}}));
 const gaze=createMediaGaze(panels),pose=t=>travellingCameraPose(t,18,5,-30);
 for(let t=0;t<55;t+=.017){const p=pose(t),aim=gaze(t,p);assert.equal(aim[2],p[5]);assert.ok(aim.every(Number.isFinite));}
 const h=.0001;
 for(let i=0;i<10;i++){
  const t=7.2+i*5,a=gaze(t-h,pose(t-h)),b=gaze(t,pose(t)),c=gaze(t+h,pose(t+h));
  for(let axis=0;axis<2;axis++)assert.ok(Math.abs((c[axis]-2*b[axis]+a[axis])/(h*h))<.1);
 }
 assert.ok(gaze(64,pose(64),1).slice(0,2).every(value=>value===0));
 assert.equal(gaze(64,pose(64),1)[2],pose(64)[5]);
 assert.deepEqual(gaze(20,pose(20),0,false),pose(20).slice(3,6));
});

test('entire camera run has bounded frame-to-frame rotation including finale settling',async()=>{
 const {createMediaGaze}=await import('../src/media-direction.js');
 const {travellingCameraPose}=await import('../src/choreography.js');
 const {finalCameraBlend}=await import('../src/finale-impact.js');
 const {MediaPanel}=await import('../src/media-panels.js');
 const {PerspectiveCamera,MeshPhysicalMaterial}=await import('three');
 const material=new MeshPhysicalMaterial(),panels=Array.from({length:10},(_,i)=>new MediaPanel(i,material,null,null));
 const gaze=createMediaGaze(panels),camera=new PerspectiveCamera(),h=1/240;
 let previous=null,maxStep=0,maxTime=0;
 for(let t=0;t<=70.58;t+=h){
  const pose=travellingCameraPose(t,18,5,-30),finish=finalCameraBlend(t);
  camera.position.set(pose[0]*(1-finish),pose[1]*(1-finish),pose[2]);
  camera.lookAt(...gaze(t,pose,finish));camera.rotateZ(pose[6]*(1-finish));
  if(previous){const angle=camera.quaternion.angleTo(previous);if(angle>maxStep){maxStep=angle;maxTime=t;}}
  previous=camera.quaternion.clone();
 }
 assert.ok(maxStep/h<.35,`angular speed exceeded 20 degrees/s at ${maxTime}: ${maxStep/h}`);
 for(const panel of panels){panel.traverse(object=>object.geometry?.dispose());panel.frame.material.dispose();panel.face.material.dispose();panel.back.material.dispose();}material.dispose();
});

test('cards alternate screen sides and face the viewer without tracking rotations',async()=>{
 const {MediaPanel}=await import('../src/media-panels.js');
 const {createMediaGaze}=await import('../src/media-direction.js');
 const {travellingCameraPose}=await import('../src/choreography.js');
 const {MeshPhysicalMaterial,PerspectiveCamera}=await import('three');
 const material=new MeshPhysicalMaterial(),panels=Array.from({length:10},(_,i)=>new MediaPanel(i,material,null,null));
 const gaze=createMediaGaze(panels),camera=new PerspectiveCamera(60,1.5,.1,320);
 for(const panel of panels){
  const t=7.2+panel.index*5,pose=travellingCameraPose(t,18,5,-30);
  camera.position.fromArray(pose);camera.lookAt(...gaze(t,pose));camera.updateMatrixWorld();panel.updateMatrixWorld(true);
  const projected=panel.position.clone().project(camera);
  assert.ok(panel.index%2===0?projected.x>0:projected.x<0,'alternate in screen space');
  const normal=new Vector3(0,0,1).applyQuaternion(panel.quaternion),toward=camera.position.clone().sub(panel.position).normalize();
  assert.ok(normal.dot(toward)>.999,'front faces viewer at reading moment');
  for(const x of [-panel.width/2,panel.width/2])for(const y of [-panel.height/2,panel.height/2]){
   const corner=new Vector3(x,y,0).applyMatrix4(panel.matrixWorld).project(camera);
   assert.ok(Math.abs(corner.x)<.98&&Math.abs(corner.y)<.85,'complete source fits reading composition');
  }
  panel.traverse(object=>object.geometry?.dispose());panel.frame.material.dispose();panel.face.material.dispose();panel.back.material.dispose();
 }
 material.dispose();
});

test('sections are motionless before full reveal and remain settled in reading windows',async()=>{
 const {assemblyProgress,sectionOffset}=await import('../src/sectioned-media.js');
 for(let i=0;i<10;i++){
  const reveal=i===0?4.6:4+i*5;
  assert.equal(assemblyProgress(reveal+1.7,reveal),1);
  for(const mode of ['triptych','diptych'])for(let section=0;section<(mode==='triptych'?3:2);section++){
   const settled=sectionOffset(section,1,mode);
   for(let t=reveal+2;t<reveal+4.2;t+=.05)assert.deepEqual(sectionOffset(section,assemblyProgress(t,reveal),mode),settled);
  }
 }
});

test('media beam loops protect the central image and mirror into both stage sides',async()=>{
 const {mediaOrbitKnots,sampleLightSpline}=await import('../src/choreography.js');
 const right=mediaOrbitKnots(0),left=mediaOrbitKnots(1);
 for(let i=0;i<right.length;i++){
  assert.equal(left[i][1],-right[i][1]);assert.equal(left[i][2],right[i][2]);assert.equal(left[i][3],right[i][3]);
 }
 for(let t=0;t<=2;t+=.002){
  const [x,y,z]=sampleLightSpline(right,t);
  assert.ok(z>0,'front portion stays in front');
  assert.ok(Math.abs(x)>.5||y<-.35,'bright core does not cross the central image on front pass');
 }
});

test('portrait stage preserves alternating placement, full-image fit and camera clearance',async()=>{
 const {MediaPanel}=await import('../src/media-panels.js');
 const {travellingCameraPose}=await import('../src/choreography.js');
 const {createMediaGaze}=await import('../src/media-direction.js');
 const {MeshPhysicalMaterial,PerspectiveCamera}=await import('three');
 const material=new MeshPhysicalMaterial(),panels=Array.from({length:10},(_,i)=>new MediaPanel(i,material,null,null));
 for(const panel of panels)panel.setViewportAspect(390/844);
 const gaze=createMediaGaze(panels),camera=new PerspectiveCamera(78,390/844,.1,320);
 for(const panel of panels){
  const pose=travellingCameraPose(7.2+panel.index*5,18,5,-30);
  camera.position.fromArray(pose);camera.lookAt(...gaze(7.2+panel.index*5,pose));camera.updateMatrixWorld();panel.updateMatrixWorld(true);
  for(const x of [-panel.width/2,panel.width/2])for(const y of [-panel.height/2,panel.height/2]){
   const p=new Vector3(x,y,0).applyMatrix4(panel.matrixWorld).project(camera);
   assert.ok(Math.abs(p.x)<.98&&Math.abs(p.y)<.85,'portrait source fits');
  }
  for(let t=8+panel.index*5;t<13+panel.index*5;t+=.02){
   const pose=travellingCameraPose(t,18,5,-30),local=panel.worldToLocal(new Vector3(...pose.slice(0,3)));
   assert.ok(!(Math.abs(local.z)<.75&&Math.abs(local.x)<panel.width/2+.45&&Math.abs(local.y)<panel.height/2+.45),'portrait camera clearance');
  }
  assert.equal(panel.setViewportAspect(390/844),false,'no rebuild on unchanged viewport');
  assert.equal(panel.setViewportAspect(1.5),true);assert.ok(Math.abs(panel.viewportScale-.68)<1e-10);
  panel.traverse(object=>object.geometry?.dispose());panel.frame.material.dispose();panel.face.material.dispose();panel.back.material.dispose();
 }
 material.dispose();
});

import { createPlaybackTempo } from '../src/playback-tempo.js';
test('tempo changes ramp continuously with frame-independent film timing',()=>{
 const run=fps=>{const tempo=createPlaybackTempo(1);let time=0;for(let i=0;i<fps*2;i++)time+=tempo.step(1/fps,2);return {time,rate:tempo.rate};};
 const a=run(30),b=run(120);
 assert.ok(Math.abs(a.time-b.time)<1e-11);assert.ok(Math.abs(a.rate-b.rate)<1e-11);
 const tempo=createPlaybackTempo(1);assert.equal(tempo.step(0,2),0);assert.equal(tempo.rate,1);
 tempo.step(1/60,2);assert.ok(tempo.rate>1&&tempo.rate<1.01);
 for(let i=0;i<240;i++){
  tempo.step(1/60,i<120?2:.25);
  assert.ok(tempo.rate>=.25&&tempo.rate<=2);
 }
 assert.equal(tempo.step(.1,1,false),0,'pause cannot advance timeline');
});

import { capturePng, frameFilename } from '../src/frame-export.js';
test('frame export reports PNG failure and names the exact captured timestamp',async()=>{
 assert.equal(frameFilename(7.2),'amber-00-07-200.png');
 assert.equal(frameFilename(64.125),'amber-01-04-125.png');
 assert.equal(frameFilename(NaN),'amber-00-00-000.png');
 const blob=new Blob(['test'],{type:'image/png'});
 assert.equal(await capturePng({toBlob(callback,type){assert.equal(type,'image/png');callback(blob);}}),blob);
 await assert.rejects(capturePng({toBlob(callback){callback(null);}}),/сохранить кадр/);
 await assert.rejects(capturePng({toBlob(){throw new Error('SecurityError');}}),/SecurityError/);
});

test('baked arc-length lookup is monotonic, reversible and safe on stationary spans',async()=>{
 const {bakeLightPath}=await import('../src/animation-runtime.js');
 const path=bakeLightPath([[0,0,0,0],[1,2,0,0],[2,10,3,-2],[4,11,3,-2]]);
 let last=0;
 for(let t=0;t<4;t+=.003){
  const distance=path.distanceAt(t);assert.ok(distance>=last);last=distance;
  assert.ok(Math.abs(path.timeAtDistance(distance)-t)<1e-9);
 }
 assert.equal(path.timeAtDistance(-1),0);assert.equal(path.timeAtDistance(1e6),4);
 const still=bakeLightPath([[0,1,2,3],[1,1,2,3]]);
 assert.ok(still.distanceAt(.5)<1e-10);assert.ok(Number.isFinite(still.timeAtDistance(0)));
});

test('cards finish fading before close camera approach while retaining a full reading moment',async()=>{
 const {mediaPassVisibility}=await import('../src/media-direction.js');
 const {travellingCameraPose}=await import('../src/choreography.js');
 for(let i=0;i<10;i++){
  const panelZ=-30-i*18,pose=travellingCameraPose(7.2+i*5,18,5,-30);
  assert.equal(mediaPassVisibility(pose[2],panelZ),1,'fully visible at reading midpoint');
  assert.equal(mediaPassVisibility(panelZ+4,panelZ),0,'gone before near-plane enlargement');
 }
});

test('early media reveal keeps a complete source silhouette instead of a clipped fragment',async()=>{
 const {MediaPanel}=await import('../src/media-panels.js');const {MeshPhysicalMaterial,Texture}=await import('three');
 const material=new MeshPhysicalMaterial(),panel=new MediaPanel(1,material,null,null);panel.face.material.map=new Texture();
 for(const progress of [.01,.1,.4,1]){
  panel.setVisibility(progress,0,1);
  assert.equal(panel.face.geometry.drawRange.count,6);
  const uv=panel.face.geometry.attributes.uv;
  const points=Array.from({length:6},(_,i)=>[uv.getX(i),uv.getY(i)]);
  assert.ok(points.some(([u,v])=>u===0&&v===0));assert.ok(points.some(([u,v])=>u===1&&v===1));
  assert.equal(panel.face.material.opacity,progress);
  assert.equal(panel.face.material.depthWrite,progress>.999);
  assert.ok(panel.frame.material.opacity<=progress*.38+1e-12);
 }
 panel.setVisibility(1,0,.5);assert.equal(panel.face.material.depthWrite,false);
 assert.equal(panel.frame.children.length,0,'no broad side fin before media');
 panel.face.material.map.dispose();panel.traverse(object=>object.geometry?.dispose());panel.frame.material.dispose();panel.face.material.dispose();panel.back.material.dispose();material.dispose();
});

test('graphite background is deterministic distant flat geometry without shimmer or depth blocking',async()=>{
 const {createGraphiteBackdrop}=await import('../src/graphite-backdrop.js');
 const a=createGraphiteBackdrop(),b=createGraphiteBackdrop();
 assert.deepEqual(a.geometry.attributes.position.array,b.geometry.attributes.position.array);
 assert.equal(a.material.depthWrite,false);assert.equal(a.material.depthTest,false);
 assert.ok(a.renderOrder<0);assert.ok(!a.material.uniforms.time);
 const positions=a.geometry.attributes.position;
 for(let i=0;i<positions.count;i++){
  assert.ok(Math.abs(positions.getX(i))<=1&&Math.abs(positions.getY(i))<=1);
  assert.equal(positions.getZ(i),0);
 }
 a.geometry.dispose();a.material.dispose();b.geometry.dispose();b.material.dispose();
});

import { exportFramePlan } from '../src/video-export.js';
test('Full HD export timestamps cover every frame with no gaps or duplicate times',()=>{
 const plan=exportFramePlan(70.58,30);assert.equal(plan.count,2118);
 let end=0;for(let i=0;i<plan.count;i++){const frame=plan.frame(i);assert.equal(frame.timestamp,end);end+=frame.duration;assert.equal(frame.time,i/30);}
 assert.equal(end,70600000);assert.throws(()=>exportFramePlan(1,0));
});

test('offline video export awaits decoded source seeks instead of sampling an old frame',async()=>{
 const {seekExportVideos}=await import('../src/video-export.js');
 class Clip extends EventTarget{
  duration=120;readyState=2;seeking=false;value=0;paused=false;
  pause(){this.paused=true;}
  get currentTime(){return this.value;}
  set currentTime(value){this.seeking=true;queueMicrotask(()=>{this.value=value;this.seeking=false;this.dispatchEvent(new Event('seeked'));});}
 }
 const video=new Clip(),panel={video,revealTime:5,clipIn:85,clipOut:88};
 await seekExportVideos([panel],7,new AbortController().signal);
 assert.equal(video.currentTime,87);assert.equal(video.seeking,false);assert.equal(video.paused,true);
 const abort=new AbortController();abort.abort();video.value=0;
 await assert.rejects(seekExportVideos([panel],8,abort.signal),error=>error.name==='AbortError');
});

test('background particles are deterministic, distant and independently adjustable',async()=>{
 const {backgroundParticleField,createBackgroundParticles}=await import('../src/background-particles.js');
 const {PerspectiveCamera}=await import('three');
 const a=backgroundParticleField(),b=backgroundParticleField();assert.deepEqual(a.positions,b.positions);
 for(let i=0;i<a.seeds.length;i++)assert.ok(a.positions[i*3+2]>=65&&a.positions[i*3+2]<=165);
 const points=createBackgroundParticles();assert.equal(points.material.depthWrite,false);assert.equal(points.material.depthTest,true);
 const options={backgroundParticles:true,backgroundParticleDensity:.5,backgroundParticleBrightness:.7};
 points.userData.update(new PerspectiveCamera(60,1.5),10,options,1,1);assert.equal(points.geometry.drawRange.count,300);
 assert.equal(points.material.uniforms.strength.value,.7);
 points.userData.update(new PerspectiveCamera(),10,{...options,backgroundParticles:false},1,1);assert.equal(points.visible,false);
 points.geometry.dispose();points.material.dispose();
});
