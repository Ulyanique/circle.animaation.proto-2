// The dev server's side of the title tool (titler.js, key T): it lists the pictures of public/media/ that can stand for
// the emblem, takes a dropped one into that folder and writes the title's settings into src/brand.js. A vite plugin,
// used by vite.config.js for `npm run dev` only — the build knows nothing of it.
//
// What a page can do through it: add a picture to public/media/ and change the settings' lines in src/brand.js.
// Nothing else — the lines are made here from checked values (brandLine.js), the emblem can only be pointed at a
// picture that is in public/media/ (or keep the address the file names already), and the file is replaced only if the
// new text, read back as a module, says exactly what was asked for: a brand.js written in a way the tool does not
// understand stays as it is. Who may write: the same pages as with the placement tool (mediaServer.js).

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, answerOf, listFiles, mayWrite, readJson, sameOrigin, takeFile } from './mediaServer.js';
import { MAX_UPLOAD, safeName } from './mediaLine.js';
import { EMBLEM_FILE, brandEntries, cleanBrand, putBrand, tidyBrand } from './brandLine.js';

const SETTINGS = path.join(ROOT, 'src', 'brand.js');
/** What a text of src/brand.js exports. */
const exported = async (text) => (await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(text)}`)).default;
const lines = (raw) => JSON.stringify(brandEntries(raw));

/** Writes the settings into src/brand.js. -> { ok, changed } or throws. */
async function saveBrand(settings) {
  const want = tidyBrand(cleanBrand(settings)), text = fs.readFileSync(SETTINGS, 'utf8');
  if (want.emblem !== 'compass' && want.emblem !== 'none') {
    let had = null;
    try { had = tidyBrand(await exported(text)).emblem; } catch { /* a file that cannot be read names no picture */ }
    const inFolder = want.emblem.startsWith('media/') && listFiles(EMBLEM_FILE).some((f) => f.name === want.emblem.slice(6));
    if (!inFolder && want.emblem !== had) throw new Error(`no such picture in public/media/: ${want.emblem}`);
  }
  const next = putBrand(text, want);
  let got;
  try { got = await exported(next); } catch (e) { throw new Error(`src/brand.js cannot be read as a module (${String(e?.message || e).split('\n')[0]}) — the tool leaves it alone`); }
  if (lines(got) !== lines(want)) throw new Error('src/brand.js is written in a way the tool cannot change — it leaves the file alone');
  if (next === text) return { ok: true, changed: false };
  // in one step: written in place, the file would be empty for a moment, and the page would show that
  const tmp = `${SETTINGS}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, next, { mode: fs.statSync(SETTINGS).mode });
    fs.renameSync(tmp, SETTINGS);
  } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
  return { ok: true, changed: true };
}

export default function titleTool() {
  return {
    name: 'title-tool',
    apply: 'serve',
    configureServer(server) {
      // A picture for the emblem may be an SVG, and an SVG opened as a page of its own may carry a script. The film
      // reads pictures as images, where nothing runs; opened by its address, a file of public/media/ runs nothing either.
      server.middlewares.use((req, res, next) => {
        if (/^\/media\/[^?#]*\.svg([?#]|$)/i.test(req.url || '')) res.setHeader('Content-Security-Policy', "script-src 'none'");
        next();
      });
      server.middlewares.use('/__brand', (req, res) => {
        const reply = answerOf(res);
        try {
          const url = new URL(req.url || '/', 'http://dev');      // what follows /__brand
          const write = mayWrite(req);
          if (req.method === 'GET' && url.pathname === '/') return reply(200, { files: listFiles(EMBLEM_FILE), write, max: MAX_UPLOAD });
          if (req.method !== 'POST') return reply(405, { error: 'GET or POST' });
          if (!sameOrigin(req)) return reply(403, { error: 'cross-origin' });
          if (!write) return reply(403, { error: 'read-only' });
          if (url.pathname === '/file') {
            const name = safeName(url.searchParams.get('name'), EMBLEM_FILE);
            return name ? takeFile(req, res, name, reply) : reply(400, { error: 'not a picture that can stand for the emblem' });
          }
          if (url.pathname !== '/') return reply(404, { error: 'not found' });
          readJson(req, reply, async (data) => {
            const out = await saveBrand(data.settings);
            // the page may ask for the file again before the watcher has noticed the change
            if (out.changed) server.moduleGraph?.onFileChange?.(SETTINGS.split(path.sep).join('/'));
            reply(200, out);
          });
        } catch (e) { reply(400, { error: String(e?.message || e) }); }
      });
    },
  };
}
