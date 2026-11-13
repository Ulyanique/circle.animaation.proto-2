import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import mediaTool from './src/dev/mediaServer.js';      // dev server only: the placement tool (key E on the page)
import titleTool from './src/dev/brandServer.js';      // dev server only: the title tool (key T)
import { titleSettings, titleChars, keepGlyphs, pageHtml } from './src/fx/titleSettings.js';

// The shot data files (src/shots/data/sNN.json) also carry what only the tools need: the raw tracked camera, the light
// trails tracked in the reference video and its flare track. The player reads none of it, so it is not shipped.
const slimShotData = () => ({
  name: 'slim-shot-data',
  enforce: 'pre',
  transform(code, id) {
    if (!/\/src\/shots\/data\/s\w+\.json$/.test(id.split('?')[0])) return null;
    const data = JSON.parse(code);
    for (const key of ['trails', 'camRaw', 'flare']) delete data[key];
    return { code: JSON.stringify(data), map: null };
  },
});

// The final title's settings (src/brand.js) outside the film:
//   · the page's own name — browser tab, description, loading screen — follows them, in the dev server and the build;
//   · the font file holds every glyph (570 kB), so that any caption can be tried at once; the build ships only the
//     glyphs the caption and the tagline are written with, and the font's licence next to them.
const brand = () => {
  let root = process.cwd(), building = false, settings = null;
  // read anew each time: the dev server must not be restarted for a new caption
  const read = async () => titleSettings((await import(`${pathToFileURL(resolve(root, 'src/brand.js')).href}?t=${Date.now()}`)).default);
  return {
    name: 'brand',
    enforce: 'pre',
    configResolved(config) { root = config.root; building = config.command === 'build'; },
    async buildStart() { if (building) settings = await read(); },
    async transformIndexHtml(html) {
      if (settings) return pageHtml(html, settings);
      try { return pageHtml(html, await read()); } catch { return html; }      // a broken brand.js is reported on the page itself
    },
    transform(code, id) {
      if (!building || !/\/src\/fx\/fonts\/title-serif-600\.json$/.test(id.split('?')[0])) return null;
      const { font, missing } = keepGlyphs(JSON.parse(code), titleChars(settings));
      if (missing.length) this.warn(`src/brand.js: the title's font has no glyphs for ${missing.join(' ')} — they are left out of the title`);
      return { code: JSON.stringify(font), map: null };
    },
    generateBundle() {
      if (building) this.emitFile({ type: 'asset', fileName: 'LICENSE-playfair-display.txt', source: readFileSync(resolve(root, 'src/fx/fonts/LICENSE-playfair-display.txt')) });
    },
  };
};

export default defineConfig({
  base: './',
  plugins: [slimShotData(), brand(), mediaTool(), titleTool()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // allow tunnelled / proxied preview hosts
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  // dev server only: the video tool (key V) fetches mediabunny when it is opened for the first time. Prepared with
  // the server's start — found only then, it would make the page load again under the open tool
  optimizeDeps: { include: ['mediabunny'] },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
