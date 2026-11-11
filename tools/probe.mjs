import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
const exe = await chromium.executablePath();
console.log('exe', exe);
console.log('default args', chromium.args.join(' '));
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: 'shell',
  args: chromium.args,
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
});
console.log('version', await browser.version());
const page = await browser.newPage();
await page.setContent('<canvas id=c width=64 height=64></canvas>');
const info = await page.evaluate(() => {
  const c = document.getElementById('c');
  const gl = c.getContext('webgl2');
  if (!gl) return { webgl2: false, webgl1: !!c.getContext('webgl') };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    webgl2: true,
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    floatExt: !!gl.getExtension('EXT_color_buffer_float'),
    halfFloatExt: !!gl.getExtension('EXT_color_buffer_half_float'),
    linearFloat: !!gl.getExtension('OES_texture_float_linear'),
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
