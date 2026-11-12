import { smoothMotion } from './motion-easing.js';
import * as THREE from 'three';
import { videoTiming } from './video-timing.js';
import { mediaStageFit } from './media-stage.js';
import { travellingCameraPose } from './choreography.js';
import { revealTriangles } from './media-reveal.js';
import { sectionedTriangles, assemblyProgress, sectionOffset, seamEndpoints, choosePresentation, sectionLayout } from './sectioned-media.js';
import { mediaDimensions, SHOT_INTERVAL, PANEL_SPACING, FIRST_PANEL_Z } from './media-config.js';

export class MediaPanel extends THREE.Group {
  constructor(index, frameMaterial, loader, onChange, onFrame) {
    super();
    this.index = index;
    this.loader = loader;
    this.onChange = onChange;
    this.onFrame = onFrame;
    this.revealTime = index===0?4.6:4 + index * SHOT_INTERVAL;
    this.layoutOverride="auto";this.presentation="whole";this.sectioned=index===0;this.assembly=0;this.lastAssembly=-1;this.sectionSeams=[];
    this.sourceBlend = 1;
    this.width = 11.5; this.height = 6.47;
    this.basePresentationScale=[1,.83,1.04,.9,.98,.8,1.02,.88,.95,1.02][index%10];
    this.viewportScale=.68;this.presentationScale=this.basePresentationScale*this.viewportScale;
    this.frame = new THREE.Mesh(new THREE.BoxGeometry(), frameMaterial.clone());
    this.frame.material.transparent = true;
    this.frame.material.opacity = 0;
    this.frame.renderOrder = 20+(10-index)*2;
    this.frame.receiveShadow = true;
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({
      color: 0xece9e2, vertexColors:true, transparent: true, opacity: 1, depthWrite: true, side: THREE.FrontSide,
    }));
    this.face.renderOrder = this.frame.renderOrder+1;
    this.face.position.z = .082;this.face.frustumCulled=false;
    this.back = new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshPhysicalMaterial({color:0x29251c,metalness:.85,roughness:.35,side:THREE.BackSide,transparent:true,opacity:0}));
    this.back.position.z=-.06;this.back.renderOrder=this.face.renderOrder;
    this.add(this.frame, this.face, this.back);
    const placementY=[.6,-.25,.4,1,-.55,.7,-.6,.2,1.2,-.15];
    const readingTime=7.2+index*SHOT_INTERVAL;
    const viewer=travellingCameraPose(readingTime,PANEL_SPACING,SHOT_INTERVAL,FIRST_PANEL_Z);
    const side=index%2===0?1:-1;
    this.position.set(-8.3+side*4.8,placementY[index%10],FIRST_PANEL_Z-index*PANEL_SPACING);
    // Static front-facing staging, authored at the reading moment. Never billboard
    // during playback: the camera advances without turning the card in its wake.
    this.lookAt(new THREE.Vector3(viewer[0],viewer[1],viewer[2]));
    this.setDimensions(16/9);
    this.version = 0;
  }

  setViewportAspect(aspect){
    const fit=mediaStageFit(aspect);
    if(Math.abs(fit.scale-this.viewportScale)<1e-6)return false;
    this.viewportScale=fit.scale;this.presentationScale=this.basePresentationScale*fit.scale;
    this.position.x=-8.3+(this.index%2===0?1:-1)*fit.offset;
    const viewer=travellingCameraPose(7.2+this.index*SHOT_INTERVAL,PANEL_SPACING,SHOT_INTERVAL,FIRST_PANEL_Z);
    this.lookAt(new THREE.Vector3(viewer[0],viewer[1],viewer[2]));
    this.setDimensions(this.aspect||16/9);
    return true;
  }

  setDimensions(aspect) {
    const fitted=mediaDimensions(aspect);
    const width=fitted.width*this.presentationScale,height=fitted.height*this.presentationScale;
    this.width = width; this.height = height;
    // An irregular outer silhouette surrounds a safe full-image rectangle.
    // The image remains complete; slanted wings and cut corners belong to the structure.
    const safeX=width/2, safeY=height/2;
    const shape = new THREE.Shape();
    // A narrow cut-metal edge, not a chunky decorative picture frame.
    shape.moveTo(-safeX-.065,-safeY-.055);
    shape.lineTo(safeX+.055,-safeY-.055);
    shape.lineTo(safeX+.095,safeY+.065);
    shape.lineTo(-safeX-.075,safeY+.065);
    shape.closePath();
    // An actual open frame: there is NO solid golden face underneath the media.
    const hole=new THREE.Path();
    hole.moveTo(-safeX,-safeY);hole.lineTo(-safeX,safeY);hole.lineTo(safeX,safeY);hole.lineTo(safeX,-safeY);hole.closePath();
    shape.holes.push(hole);
    this.face.geometry.dispose();
    this.face.geometry=new THREE.BufferGeometry();
    this.face.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(192*3),3).setUsage(THREE.DynamicDrawUsage));
    this.face.geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(192*2),2).setUsage(THREE.DynamicDrawUsage));
    this.face.geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(192*4),4).setUsage(THREE.DynamicDrawUsage));
    const normals=new Float32Array(192*3);for(let i=0;i<192;i++)normals[i*3+2]=1;
    this.face.geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
    this.face.geometry.setDrawRange(0,0);this.lastReveal=-1;
    this.back.geometry.dispose();this.back.geometry=new THREE.PlaneGeometry(width,height);
    this.frame.geometry.dispose();
    for(const child of [...this.frame.children]){child.geometry?.dispose();this.frame.remove(child);}
    this.frame.geometry = new THREE.ExtrudeGeometry(shape, {depth:.09,bevelEnabled:true,bevelThickness:.008,bevelSize:.007,bevelSegments:2,steps:1});
    this.frame.position.z = -.09;
    this.frame.material.color.setHex(0x76603b);
    this.frame.material.emissiveIntensity=0;
    this.frame.material.roughness=.21;this.frame.material.metalness=1;
    // A slender oblique facet behind one side catches the moving light without enclosing the image.
    const side=this.index%2?1:-1,edge=side*(safeX+.11);
    const finShape=new THREE.Shape();
    finShape.moveTo(edge,-safeY-.2);
    finShape.lineTo(edge+side*.12,-safeY+.05);
    finShape.lineTo(edge+side*.3,safeY+.55);
    finShape.lineTo(edge+side*.07,safeY+.22);finShape.closePath();
    const fin=new THREE.Mesh(new THREE.ExtrudeGeometry(finShape,{depth:.045,bevelEnabled:false,steps:1}),this.frame.material);
    fin.position.z=-.11;fin.renderOrder=this.frame.renderOrder;this.frame.add(fin);
    this.presentation=choosePresentation(this.index,aspect,this.layoutOverride);
    this.sectionSeams=[];
    if(this.presentation!=='whole'){
      const layout=sectionLayout(this.presentation);
      const seams=layout.cuts.flatMap((cut,index)=>[[index,cut],[index+1,cut]]);
      for(const [section,cut] of seams){
        const [a,b]=seamEndpoints(cut,this.presentation);
        const curve=new THREE.LineCurve3(new THREE.Vector3((a.u-.5)*width,(a.v-.5)*height,0),new THREE.Vector3((b.u-.5)*width,(b.v-.5)*height,0));
        const seam=new THREE.Mesh(new THREE.TubeGeometry(curve,1,.012,6,false),this.frame.material);
        seam.renderOrder=this.frame.renderOrder;seam.userData.section=section;
        this.frame.add(seam);this.sectionSeams.push(seam);
      }
    }
    this.aspect = aspect;
  }

  releaseCurrent() {
    if(this.video) {
      this.video.onseeked = this.video.onloadeddata = this.video.onerror = null;
      this.video.pause(); this.video.removeAttribute('src'); this.video.load(); this.video = null;
    }
    this.face.material.map?.dispose();
    this.face.material.map = null;
    if(this.objectURL) URL.revokeObjectURL(this.objectURL);
    this.objectURL = null;
  }

  async setSource(source) {
    const version = ++this.version;
    const objectURL = source.file ? URL.createObjectURL(source.file) : null;
    const url = objectURL || source.url;
    let video = null, texture;
    try {
      if(source.type === 'placeholder') {
        const canvas=document.createElement('canvas');
        canvas.width=1280;canvas.height=Math.round(1280/(source.aspect||16/9));
        const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
        const gradient=ctx.createLinearGradient(0,0,w,h);gradient.addColorStop(0,'#29271f');gradient.addColorStop(.6,'#141512');gradient.addColorStop(1,'#3c3220');
        ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
        ctx.strokeStyle='#d0b77828';ctx.lineWidth=1;
        for(let k=-2;k<8;k++){ctx.beginPath();ctx.moveTo(k*w/5,0);ctx.lineTo(k*w/5-h*.4,h);ctx.stroke();}
        ctx.fillStyle='#b79c67';ctx.font='20px Arial';ctx.fillText(String(this.index+1).padStart(2,'0')+' / 10',64,68);
        const labelY=h*(this.index===0?.48:.54);
        ctx.fillStyle='#e2d5b5';ctx.font=`${Math.min(55,w/(source.label.length*.64))}px Arial`;ctx.fillText(source.label,64,labelY);
        ctx.fillStyle='#b8a17a';ctx.font='25px Arial';ctx.fillText(source.timecode,64,labelY+55);
        ctx.fillStyle='#877c63';ctx.font='16px Arial';ctx.fillText('МЕСТО ДЛЯ ВИДЕО / ФОТО',64,h-55);
        texture=new THREE.CanvasTexture(canvas);
        await Promise.resolve();
      } else if(source.type === 'video') {
        video = document.createElement('video');
        video.muted = true; video.playsInline = true; video.loop = true; video.preload = 'auto';
        video.crossOrigin = 'anonymous';
        await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(new Error('Видео не загрузилось за 30 секунд')),30000);
          video.onloadeddata=()=>{clearTimeout(timer);resolve();};
          video.onerror=()=>{clearTimeout(timer);reject(new Error('Формат видео не поддерживается браузером'));};
          video.src=url;video.load();
        });
        texture = new THREE.VideoTexture(video);
      } else texture = await this.loader.loadAsync(url);
      if(version !== this.version) {
        texture.dispose(); if(video){video.removeAttribute('src');video.load();}
        if(objectURL) URL.revokeObjectURL(objectURL);
        return;
      }
      this.releaseCurrent();
      this.video = video; this.objectURL = objectURL;
      if(video){video.onloadeddata=null;video.onerror=null;video.onseeked=()=>{if(this.video===video)this.onFrame?.();};}
      this.clipIn=source.clipIn||0;this.clipOut=source.clipOut??null;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      this.face.material.map = texture; this.face.material.needsUpdate = true;
      this.setDimensions(video ? video.videoWidth/video.videoHeight : texture.image.width/texture.image.height);
      this.label = source.file?.name || source.label || url.split('/').pop();
      this.mediaType = source.type;
      this.sourceBlend = source.type==='placeholder'?1:0;
      this.onChange?.(this);
    } catch(error) {
      if(video){video.pause();video.removeAttribute('src');video.load();}
      texture?.dispose(); if(objectURL) URL.revokeObjectURL(objectURL);
      throw error;
    }
  }

  setLayout(mode){
    this.layoutOverride=['whole','triptych','diptych'].includes(mode)?mode:'auto';
    this.setDimensions(this.aspect);this.onChange?.(this);
  }

  setPresentation(time,enabled=true){
    const sectioned=this.presentation!=='whole'&&enabled;
    if(this.sectioned!==sectioned){this.sectioned=sectioned;this.lastReveal=-1;}
    this.assembly=assemblyProgress(time,this.revealTime);
    for(const seam of this.sectionSeams){
      const offset=sectionOffset(seam.userData.section,this.assembly,this.presentation);
      seam.visible=sectioned;
      // Parent frame sits at -.09; place seam just in front of the media surface.
      seam.position.set(offset.x,offset.y,.176+offset.z);
    }
  }

  setVisibility(opacity, dt=1/60, release=1) {
    this.sourceBlend=Math.min(1,this.sourceBlend+dt/1.6);
    const fade=smoothMotion(0,1,this.sourceBlend);
    opacity*=fade;
    this.visible = opacity*release > .001 && Boolean(this.face.material.map);
    // Depth writes let the beam go behind the screen instead of being composited on top.
    this.face.material.opacity = release;
    if(Math.abs(opacity-this.lastReveal)>1e-5 || (this.sectioned&&Math.abs(this.assembly-this.lastAssembly)>1e-5)){
      const vertices=this.sectioned?sectionedTriangles(opacity,this.index%2===1,this.assembly,this.presentation):revealTriangles(opacity,this.index%2===1);
      const attributes=this.face.geometry.attributes;
      vertices.forEach(({u,v,alpha,x=0,y=0,z=0},i)=>{
        attributes.position.setXYZ(i,(u-.5)*this.width+x,(v-.5)*this.height+y,z);
        attributes.uv.setXY(i,u,v);attributes.color.setXYZW(i,1,1,1,alpha);
      });
      attributes.position.needsUpdate=attributes.uv.needsUpdate=attributes.color.needsUpdate=true;
      this.face.geometry.setDrawRange(0,vertices.length);this.lastReveal=opacity;this.lastAssembly=this.assembly;
    }
    this.back.visible=opacity>.999&&!this.sectioned;
    this.back.material.opacity = opacity*release;this.back.material.depthWrite=opacity>.999;
    this.frame.material.opacity = opacity*opacity*.78*release;
    this.frame.castShadow = opacity > .99;
    // Fading screens cannot leave an invisible depth-blocking plate over the next screen.
    this.frame.material.depthWrite = opacity > .999;
    this.face.material.depthWrite = true;
  }

  syncVideo(filmTime, playing, forceSeek = false) {
    if(!this.video) return;
    const video = this.video;
    const localTime = Math.max(0,filmTime-this.revealTime);
    const timing=videoTiming(video.duration,this.clipIn,this.clipOut,localTime);
    if(!timing.ready){if(!video.paused)video.pause();return;}
    const desired=timing.time;
    const shouldPlay = playing && this.visible && filmTime >= this.revealTime && !document.hidden;
    // Re-sync after timeline jumps or a loop, not on every frame (which would stutter).
    if(forceSeek || Math.abs(video.currentTime-desired)>.7) {
      if(!video.seeking) video.currentTime = desired;
    }
    if(shouldPlay && video.paused && !this.playPending) {
      this.playPending = true;
      video.play().catch(()=>{}).finally(()=>{this.playPending=false;});
    } else if(!shouldPlay && !video.paused) video.pause();
  }
}
