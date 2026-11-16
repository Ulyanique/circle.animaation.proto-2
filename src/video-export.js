import { videoTiming } from './video-timing.js';

export function exportFramePlan(duration,fps=30){
 if(!Number.isFinite(duration)||duration<=0||!Number.isInteger(fps)||fps<1||fps>60)throw new Error('Invalid export timing');
 return {count:Math.ceil(duration*fps),frame(index){return {time:index/fps,timestamp:Math.round(index*1e6/fps),duration:Math.round((index+1)*1e6/fps)-Math.round(index*1e6/fps)};}};
}

export async function seekExportVideos(panels,time,signal){
 for(const panel of panels){
  const video=panel.video;if(!video)continue;video.pause();
  const timing=videoTiming(video.duration,panel.clipIn,panel.clipOut,Math.max(0,time-panel.revealTime));
  if(!timing.ready)throw new Error('Видео ещё не готово к экспорту. Дождитесь загрузки.');
  if(!video.seeking&&Math.abs(video.currentTime-timing.time)<1e-5&&video.readyState>=2)continue;
  await new Promise((resolve,reject)=>{
   const cleanup=()=>{clearTimeout(timer);video.removeEventListener('seeked',done);video.removeEventListener('error',fail);signal?.removeEventListener('abort',abort);};
   const done=()=>{cleanup();resolve();};
   const fail=()=>{cleanup();reject(new Error('Не удалось декодировать кадр исходного видео.'));};
   const abort=()=>{cleanup();reject(new DOMException('Экспорт отменён','AbortError'));};
   const timer=setTimeout(()=>{cleanup();reject(new Error('Превышено время ожидания кадра видео.'));},30000);
   video.addEventListener('seeked',done);video.addEventListener('error',fail);signal?.addEventListener('abort',abort,{once:true});
   if(signal?.aborted){abort();return;}video.currentTime=timing.time;
  });
  if(panel.face?.material.map)panel.face.material.map.needsUpdate=true;
 }
}

export async function exportFullHd({duration,renderFrame,onProgress,signal,fps=30}){
 if(!globalThis.VideoEncoder||!globalThis.VideoFrame)throw new Error('Нужен браузер с WebCodecs, например актуальный Chrome или Edge по HTTPS.');
 const base={width:1920,height:1080,bitrate:12000000,framerate:fps,latencyMode:'quality'};
 const mp4=await VideoEncoder.isConfigSupported({...base,codec:'avc1.420028'});
 const useMp4=mp4.supported;
 const fallback=useMp4?null:await VideoEncoder.isConfigSupported({...base,codec:'vp09.00.40.08'});
 const config=useMp4?mp4.config:(fallback.supported?fallback.config:null);
 if(!config)throw new Error('Браузер не поддерживает кодирование Full HD.');
 const lib=useMp4?await import('mp4-muxer'):await import('webm-muxer');
 const target=new lib.ArrayBufferTarget();
 const muxer=new lib.Muxer({target,video:{codec:useMp4?'avc':'V_VP9',width:1920,height:1080,frameRate:fps},...(useMp4?{fastStart:'in-memory'}:{}),firstTimestampBehavior:'offset'});
 let failure,encodedFrames=0;
 const encoder=new VideoEncoder({output:(chunk,meta)=>{try{muxer.addVideoChunk(chunk,meta);encodedFrames++;}catch(error){failure=error;}},error:error=>{failure=error;}});
 const plan=exportFramePlan(duration,fps);
 try{
  encoder.configure(config);
  for(let index=0;index<plan.count;index++){
   signal?.throwIfAborted();if(failure)throw failure;
   // Explicit backpressure: never discard frames or use a real-time capture clock.
   while(encoder.encodeQueueSize>3){await new Promise(resolve=>setTimeout(resolve,10));signal?.throwIfAborted();if(failure)throw failure;}
   const frame=plan.frame(index),canvas=await renderFrame(frame.time,signal);
   if(canvas.width!==1920||canvas.height!==1080)throw new Error('Неверный размер кадра экспорта: требуется 1920 × 1080.');
   const pixels=new VideoFrame(canvas,{timestamp:frame.timestamp,duration:frame.duration});
   try{encoder.encode(pixels,{keyFrame:index%(fps*2)===0});}finally{pixels.close();}
   onProgress?.(index+1,plan.count);
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  await encoder.flush();signal?.throwIfAborted();if(failure)throw failure;if(encodedFrames!==plan.count)throw new Error('Кодировщик вернул неполную последовательность кадров.');muxer.finalize();
  return {blob:new Blob([target.buffer],{type:useMp4?'video/mp4':'video/webm'}),extension:useMp4?'mp4':'webm',frames:plan.count};
 }finally{if(encoder.state!=='closed')encoder.close();}
}
