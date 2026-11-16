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
try{
 const html=(await readFile('index.html','utf8')).replace(/<script type="module"[^>]*><\/script>/,'').replace(/<link rel="stylesheet"[^>]*>/,'');
 const css=await readFile('src/style.css','utf8');
 // No scene script at all: native opening must not depend on initialization.
 const page=await browser.newPage({viewport:{width:1362,height:824},hasTouch:true});
 await page.setContent(html);await page.addStyleTag({content:css});
 for(const width of [1362,390]){
  await page.setViewportSize({width,height:824});
  const toggle=page.locator('#settings-toggle');
  await toggle.click();await page.locator('#settings-panel:popover-open').waitFor();
  const box=await page.locator('#settings-panel').boundingBox();
  if(box.y<0||box.y+box.height>825||box.x<0||box.x+box.width>width+1)throw new Error('Panel outside viewport');
  await page.click('#settings-close');
  await toggle.focus();await page.keyboard.press('Enter');await page.locator('#settings-panel:popover-open').waitFor();
  await page.keyboard.press('Escape');
  await toggle.tap();await page.locator('#settings-panel:popover-open').waitFor();await page.click('#settings-close');
  console.log(`PASS ${width}px: click, Enter, Escape, touch, viewport bounds — without scene JavaScript`);
 }
}finally{await browser.close();}
