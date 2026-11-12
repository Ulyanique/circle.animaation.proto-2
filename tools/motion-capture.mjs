import { chromium as playwright } from '@playwright/test';
import Chromium from '@sparticuz/chromium';
import { brotliDecompressSync } from 'node:zlib';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const require=createRequire(import.meta.url);
const run=promisify(execFile);
const root=resolve(dirname(new URL(import.meta.url).pathname),'..');
const artifacts=join(root,'.reference','browser');
await mkdir(artifacts,{recursive:true});
// The npm binary includes the missing NSS/NSPR libraries; no apt or browser-CDN download needed.
const moduleRoot=resolve(dirname(require.resolve('@sparticuz/chromium')),'..');
const libraries=join(tmpdir(),'amber-sparticuz-libs');
await mkdir(libraries,{recursive:true});
const archive=join(libraries,'libraries.tar');
await writeFile(archive,brotliDecompressSync(await readFile(join(moduleRoot,'bin','al2023.tar.br'))));
await run('tar',['xf',archive,'-C',libraries]);
const start=Number(process.env.CAPTURE_START??4),end=Number(process.env.CAPTURE_END??20),fps=Number(process.env.CAPTURE_FPS??24);
if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>70.58||end<=start||!Number.isInteger(fps)||fps<1||fps>60)throw new Error('Invalid capture range or fps');
const frameCount=Math.round((end-start)*fps)+1;
const runName=`motion-${start}-${end}-${fps}`;
const browser=await playwright.launch({
  executablePath:await Chromium.executablePath(),args:Chromium.args,headless:true,
  env:{...process.env,LD_LIBRARY_PATH:[join(libraries,'lib'),process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')},
});
const framesDir=join(artifacts,runName);await mkdir(framesDir,{recursive:true});
const errors=[],samples=[];
try{
 const page=await browser.newPage({viewport:{width:640,height:360},deviceScaleFactor:1,reducedMotion:'reduce'});
 page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('amber-scene-settings-v1',JSON.stringify({pixelRatio:.75,ao:false,dof:false,parallax:false})));
 await page.goto('http://localhost:5173/?motionCapture',{waitUntil:'domcontentloaded'});
 await page.locator('#loading.ready').waitFor();
 // Fixed-time sampling; software rendering wall-clock speed is deliberately irrelevant.
 for(let frame=0;frame<frameCount;frame++){
  const time=start+frame/fps;
  const positions=await page.evaluate(t=>window.__captureMotion(t),time);
  samples.push({time,positions});
  await page.locator('#scene canvas').screenshot({path:join(framesDir,`${String(frame).padStart(4,'0')}.png`),timeout:120000});
  if(frame%(fps*2)===0)console.log('Captured',time.toFixed(2));
 }
 await writeFile(join(artifacts,`${runName}-samples.json`),JSON.stringify({fps,start,end,frameCount,errors,samples},null,2));
 if(errors.length)throw new Error(errors.join('\n'));
}finally{await browser.close();}
