export function frameFilename(time){
 const milliseconds=Math.round(Math.max(0,Number.isFinite(time)?time:0)*1000);
 const minutes=Math.floor(milliseconds/60000),seconds=Math.floor(milliseconds/1000)%60,rest=milliseconds%1000;
 return `amber-${String(minutes).padStart(2,'0')}-${String(seconds).padStart(2,'0')}-${String(rest).padStart(3,'0')}.png`;
}

export function capturePng(canvas){
 // Call immediately after rendering: no preserveDrawingBuffer / permanent GPU copy.
 return new Promise((resolve,reject)=>{
  canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Браузер не смог сохранить кадр. Попробуйте снизить качество рендера.')),'image/png');
 });
}

export function downloadFrame(blob,filename){
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
 // Leave time for browsers that start the download asynchronously.
 setTimeout(()=>URL.revokeObjectURL(url),10000);
}
