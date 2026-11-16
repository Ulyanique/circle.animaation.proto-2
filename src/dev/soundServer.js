// The dev server's side of the sound tool (sounder.js, key S): it lists the music files of public/media/, takes a
// dropped one into that folder and writes the soundtrack's settings into src/sound.js. A vite plugin, used by
// vite.config.js for `npm run dev` only — the build knows nothing of it.
//
// What a page can do through it: add a music file to public/media/ and change the settings' lines in src/sound.js.
// Nothing else — the lines are made here from checked values (soundLine.js), the soundtrack can only be pointed at a
// file that is in public/media/ (or keep the address the file names already, or go back to the film's own), and the
// file is replaced only if the new text, read back as a module, says exactly what was asked for: a sound.js written in
// a way the tool does not understand stays as it is. Who may write: the same pages as with the placement tool
// (mediaServer.js).

import fs from 'node:fs';
import path from 'node:path';
import { OWN_SOUND } from '../core/soundSettings.js';
import { ROOT, answerOf, listFiles, mayWrite, readJson, sameOrigin, takeFile } from './mediaServer.js';
import { MAX_UPLOAD, safeName } from './mediaLine.js';
import { SOUND_FILE, cleanSound, putSound, soundEntries, tidySound } from './soundLine.js';

const SETTINGS = path.join(ROOT, 'src', 'sound.js');
/** What a text of src/sound.js exports. */
const exported = async (text) => (await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(text)}`)).default;
const lines = (raw) => JSON.stringify(soundEntries(raw));

/** Writes the settings into src/sound.js. -> { ok, changed } or throws. */
async function saveSound(settings) {
  const want = tidySound(cleanSound(settings)), text = fs.readFileSync(SETTINGS, 'utf8');
  if (want.src !== OWN_SOUND) {
    let had = null;
    try { had = tidySound(await exported(text)).src; } catch { /* a file that cannot be read names no music */ }
    const inFolder = want.src.startsWith('media/') && listFiles(SOUND_FILE).some((f) => f.name === want.src.slice(6));
    if (!inFolder && want.src !== had) throw new Error(`no such music in public/media/: ${want.src}`);
  }
  const next = putSound(text, want);
  let got;
  try { got = await exported(next); } catch (e) { throw new Error(`src/sound.js cannot be read as a module (${String(e?.message || e).split('\n')[0]}) — the tool leaves it alone`); }
  if (lines(got) !== lines(want)) throw new Error('src/sound.js is written in a way the tool cannot change — it leaves the file alone');
  if (next === text) return { ok: true, changed: false };
  // in one step: written in place, the file would be empty for a moment, and the page would play that
  const tmp = `${SETTINGS}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, next, { mode: fs.statSync(SETTINGS).mode });
    fs.renameSync(tmp, SETTINGS);
  } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
  return { ok: true, changed: true };
}

export default function soundTool() {
  return {
    name: 'sound-tool',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__sound', (req, res) => {
        const reply = answerOf(res);
        try {
          const url = new URL(req.url || '/', 'http://dev');      // what follows /__sound
          const write = mayWrite(req);
          if (req.method === 'GET' && url.pathname === '/') return reply(200, { files: listFiles(SOUND_FILE), write, max: MAX_UPLOAD });
          if (req.method !== 'POST') return reply(405, { error: 'GET or POST' });
          if (!sameOrigin(req)) return reply(403, { error: 'cross-origin' });
          if (!write) return reply(403, { error: 'read-only' });
          if (url.pathname === '/file') {
            const name = safeName(url.searchParams.get('name'), SOUND_FILE);
            return name ? takeFile(req, res, name, reply) : reply(400, { error: 'not a music file' });
          }
          if (url.pathname !== '/') return reply(404, { error: 'not found' });
          readJson(req, reply, async (data) => {
            const out = await saveSound(data.settings);
            // the page may ask for the file again before the watcher has noticed the change
            if (out.changed) server.moduleGraph?.onFileChange?.(SETTINGS.split(path.sep).join('/'));
            reply(200, out);
          });
        } catch (e) { reply(400, { error: String(e?.message || e) }); }
      });
    },
  };
}
