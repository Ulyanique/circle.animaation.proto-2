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
const browser=await playwright.launch({
  executablePath:await Chromium.executablePath(),args:Chromium.args,headless:true,
  env:{...process.env,LD_LIBRARY_PATH:[join(libraries,'lib'),process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')},
});
const errors=[];
try {
  const desktop=process.env.BROWSER_DESKTOP==='1';
  const page=await browser.newPage({viewport:process.env.BROWSER_MOBILE==='1'?{width:390,height:844}:{width:1080,height:720},deviceScaleFactor:1,reducedMotion:'reduce',isMobile:!desktop,hasTouch:!desktop});
  page.setDefaultTimeout(120000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  if(process.env.BROWSER_RUNTIME==='1')await page.addInitScript(()=>{
    window.__drawCalls=0;
    for(const type of [window.WebGLRenderingContext,window.WebGL2RenderingContext]){
      if(!type)continue;
      for(const name of ['drawArrays','drawElements']){
        const original=type.prototype[name];
        type.prototype[name]=function(...args){window.__drawCalls++;return original.apply(this,args);};
      }
    }
  });
  await page.goto(process.env.PREVIEW_URL||'http://localhost:5173/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading.ready').waitFor();
  const times=(process.env.BROWSER_TIMES||'3,7,27,47,64').split(',').map(Number);
  const frames=[];
  for(const time of times){
    await page.locator('#timeline').evaluate((input,t)=>{input.value=t;input.dispatchEvent(new Event('input'));},time);
    await page.waitForFunction(t=>{
      const label=document.querySelector('#time').textContent;
      const stamp=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
      return label.startsWith(stamp);
    },time);
    const filename=`${desktop?'desktop':'software'}-${String(time).replace('.','_')}.png`;
    await page.screenshot({path:join(artifacts,filename),timeout:120000});
    frames.push(filename);console.log('Captured',filename);
  }
  if(process.env.BROWSER_RUNTIME==='1'){
    await page.waitForTimeout(1700);
    const before=await page.evaluate(()=>window.__drawCalls);
    await page.waitForTimeout(400);
    const after=await page.evaluate(()=>window.__drawCalls);
    if(after!==before)errors.push(`Paused scene kept drawing: ${before} → ${after}`);
    await page.locator('#timeline').evaluate(input=>{input.value=18;input.dispatchEvent(new Event('input'));});
    await page.waitForFunction(previous=>window.__drawCalls>previous,before);
    await page.waitForFunction(()=>document.querySelector('#time').textContent.startsWith('00:18'));
    console.log('Runtime: paused WebGL sleeps and timeline edits wake rendering');
  }
  if(process.env.BROWSER_VIDEO==='1'){
    await page.evaluate(async()=>{
      const {MediaPanel}=await import('/src/media-panels.js');
      const video={duration:2,currentTime:0,seeking:false,paused:true,play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;}};
      const panel={video,revealTime:5,clipIn:85,clipOut:88,visible:true};
      MediaPanel.prototype.syncVideo.call(panel,7,false,true);
      if(video.currentTime<0||video.currentTime>=2)throw new Error('Short video seek out of range');
      video.duration=120;panel.clipIn=85;panel.clipOut=88;
      MediaPanel.prototype.syncVideo.call(panel,12,false,true);
      if(video.currentTime!==86||!video.paused)throw new Error('Paused clip seek mismatch');
      panel.visible=false;video.paused=false;
      MediaPanel.prototype.syncVideo.call(panel,12,true);
      if(!video.paused)throw new Error('Invisible clip did not pause');
    });
    console.log('Video: short-file seek bounds, paused clip seek and invisible playback pause checked');
  }
  if(process.env.BROWSER_SETTINGS==='1'){
    await page.click('#settings-toggle');
    await page.locator('#settings-panel:popover-open').waitFor();
    const settingsCount=await page.locator('[data-setting]').count();
    if(settingsCount<40)errors.push(`Missing settings controls: ${settingsCount}`);
    await page.locator('#setting-beam').uncheck();
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('amber-scene-settings-v1')));
    if(stored.beam!==false)errors.push('Settings persistence failed');
    await page.locator('#setting-starSize').evaluate(input=>{input.value=5;input.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.keyboard.press('Escape');
    if(!await page.locator('#settings-panel').evaluate(panel=>!panel.matches(':popover-open')))errors.push('Escape failed');
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('#loading.ready').waitFor();
    await page.click('#settings-toggle');
    if(await page.locator('#setting-beam').isChecked())errors.push('Beam setting not restored on reload');
    if(await page.locator('#setting-starSize').inputValue()!=='5')errors.push('Slider not restored on reload');
    await page.click('#settings-reset');
    if(!await page.locator('#setting-beam').isChecked())errors.push('Reset failed');
    const downloadEvent=page.waitForEvent('download');await page.click('#settings-export');
    const download=await downloadEvent;
    if(download.suggestedFilename()!=='amber-settings.json')errors.push('Export filename failed');
    await page.locator('#settings-import').setInputFiles({name:'test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({settings:{beam:false,starSize:4.5}}))});
    await page.waitForFunction(()=>document.querySelector('.settings-status').textContent.includes('импортированы'));
    if(await page.locator('#setting-beam').isChecked())errors.push('Import failed');
    await page.click('#settings-reset');
    await page.screenshot({path:join(artifacts,'settings-panel.png'),timeout:120000});
    await page.click('#settings-close');
    // Direct icon-coordinate hit, keyboard activation and touch activation.
    const toggle=page.locator('#settings-toggle'),box=await toggle.boundingBox();
    await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
    await page.locator('#settings-panel:popover-open').waitFor();
    await page.click('#settings-close');
    await toggle.focus();await page.keyboard.press('Enter');
    await page.locator('#settings-panel:popover-open').waitFor();
    await page.keyboard.press('Escape');
    if(!desktop){await toggle.tap();await page.locator('#settings-panel:popover-open').waitFor();await page.click('#settings-close');}
    console.log('Settings: persistence, reset, import/export, icon hit, keyboard, mouse/keyboard opening checked');
  }
  await page.click('#media-toggle');
  const slotCount=await page.locator('.media-slot').count();
  if(slotCount!==10)errors.push(`Expected 10 media slots, got ${slotCount}`);
  if(process.env.BROWSER_MEDIA_LAYOUT==='1'){
    if(await page.locator('select[id^=media-layout-]').count()!==10)errors.push('Missing shot layout selectors');
    await page.selectOption('#media-layout-2','whole');
    await page.waitForFunction(()=>document.querySelector('#media-meta-2').textContent.includes('Цельный кадр'));
    await page.selectOption('#media-layout-2','diptych');
    await page.waitForFunction(()=>document.querySelector('#media-meta-2').textContent.includes('Две секции'));
    console.log('Media layouts: manual whole/diptych selection checked');
  }
  if(process.env.BROWSER_MEDIA_RESET==='1'){
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=32;c.height=24;const x=c.getContext('2d');x.fillStyle='#655438';x.fillRect(0,0,32,24);return c.toDataURL().split(',')[1];});
    await page.selectOption('#media-layout-0','whole');
    await page.selectOption('#media-layout-1','diptych');
    await page.locator('#media-file-0').setInputFiles({name:'reset-test.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.waitForFunction(()=>document.querySelector('#media-name-0').textContent==='reset-test.png');
    await page.waitForFunction(()=>!document.querySelector('#media-reset-0').disabled);
    await page.click('#media-reset-0');
    await page.waitForFunction(()=>document.querySelector('#media-name-0').textContent==='Шульган'&&!document.querySelector('#media-reset-0').disabled);
    if(await page.locator('#media-layout-0').inputValue()!=='auto')errors.push('Slot reset did not restore auto');
    if(await page.locator('#media-layout-1').inputValue()!=='diptych')errors.push('Slot reset changed another scene');
    if(await page.locator('#media-source-mode-0').inputValue()!=='clip')errors.push('Slot reset did not restore clip mode');
    if(await page.locator('.media-slot[aria-busy="true"]').count())errors.push('Slot remained busy');
    await page.screenshot({path:join(artifacts,'media-slot-reset.png'),timeout:120000});
    console.log('Media reset: image upload, individual restore, auto layout and adjacent slot isolation checked');
  }
  if(process.env.BROWSER_WORKFLOW==='1'){
    if(await page.locator('[id^=media-preview-]').count()!==10)errors.push('Missing scene previews');
    if(await page.locator('[id^=media-source-mode-]').count()!==10)errors.push('Missing source modes');
    await page.selectOption('#media-source-mode-0','recording');
    await page.locator('#media-source-mode-0').focus();
    const before=await page.locator('#timeline').inputValue();
    await page.keyboard.press('ArrowRight');
    if(await page.locator('#timeline').inputValue()!==before)errors.push('Select key moved film timeline');
    await page.click('#media-preview-2');
    await page.waitForFunction(()=>document.querySelector('#time').textContent.startsWith('00:17'));
    if(!await page.locator('#media-menu').evaluate(menu=>menu.hidden))errors.push('Preview did not close media');
    if(await page.locator('#play').getAttribute('aria-label')!=='Воспроизвести')errors.push('Preview not paused');
    await page.screenshot({path:join(artifacts,'workflow-preview.png'),timeout:120000});
    await page.click('#media-toggle');
    console.log('Workflow: ten preview/source controls, keyboard isolation and paused scene preview checked');
  }
  await page.click('#media-close');
  await page.click('#chapters-toggle');
  await page.locator('#chapters-menu:not([hidden])').waitFor();
  await page.click('#chapters-close');
  const result={browser:'Sparticuz Chromium',profile:desktop?'desktop effects / software WebGL':'coarse-pointer effects / software WebGL',frames,slotCount,errors,realGpuBenchmark:false};
  await writeFile(join(artifacts,`${desktop?'desktop':'software'}-report.json`),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  if(errors.length)process.exitCode=1;
} finally {await browser.close();}
