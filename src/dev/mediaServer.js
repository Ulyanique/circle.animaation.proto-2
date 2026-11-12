// The dev server's side of the placement tool (placer.js, key E): it lists the files of public/media/, takes a dropped
// photo or video into that folder and writes the windows' lines into src/media.js. A vite plugin, used by
// vite.config.js for `npm run dev` only — the build knows nothing of it.
//
// What a page can do through it: add a photo / video to public/media/ and change the windows' lines in src/media.js.
// Nothing else — the lines are made here from checked values (mediaLine.js), a window can only be pointed at a file
// that is in public/media/, and file names are reduced to a plain name with a known extension.
// Who may: the page itself (same origin), opened on this computer at localhost. The dev server listens on all
// interfaces and answers to any host name (vite.config.js), so for another machine, through a proxy, or under a host
// name that merely points here, the tool is read-only: it still shows the line to copy.
// `MEDIA_TOOL=remote npm run dev` lets those write too.
// The title tool's side (brandServer.js) answers by the same rules and uses the pieces exported here.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_UPLOAD, MEDIA_FILE, cleanSettings, dropLine, entryText, mediaLine, putLine, safeName } from './mediaLine.js';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const DIR = path.join(ROOT, 'public', 'media');
const SETTINGS = path.join(ROOT, 'src', 'media.js');
const WINDOW = /^w(0[1-9]|1[01])$/;

/** The files in public/media/ that a window can show (or those `allowed` names): [{ name, size }], by name. */
export function listFiles(allowed = MEDIA_FILE) {
  let found = [];
  try { found = fs.readdirSync(DIR, { withFileTypes: true }); } catch { /* no folder yet */ }
  return found.filter((d) => d.isFile() && !d.name.startsWith('.') && allowed.test(d.name))
    .map((d) => ({ name: d.name, size: fs.statSync(path.join(DIR, d.name)).size }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
}

/** Did the page itself send this (not a page of another site)? */
export function sameOrigin(req) {
  const site = req.headers['sec-fetch-site'], origin = req.headers.origin;
  if (site) return site === 'same-origin';
  if (!origin) return true;      // not a browser
  try { return [req.headers.host, req.headers['x-forwarded-host']].includes(new URL(origin).host); } catch { return false; }
}

/** Is the page open on this computer, at localhost, with no proxy in between? */
export function local(req) {
  const a = req.socket.remoteAddress || '', host = (req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
  // the host name too: another site's name can be made to point at 127.0.0.1, and its page would then be "the same origin"
  return (a === '::1' || a.startsWith('127.') || a.startsWith('::ffff:127.')) && ['localhost', '127.0.0.1', '[::1]'].includes(host)
    && !req.headers['x-forwarded-for'] && !req.headers.forwarded;
}

/** May the page that sent this change files? */
export const mayWrite = (req) => process.env.MEDIA_TOOL === 'remote' || local(req);

/** How the tools' addresses answer: JSON that is never kept. -> reply(status, data) */
export const answerOf = (res) => (code, data) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
};

/** The request's body as JSON -> done(data); a body that is too long or is not JSON is answered here. */
export function readJson(req, reply, done) {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => { body += chunk; if (body.length > 50000) req.destroy(); });
  req.on('end', () => {
    let data;
    try { data = JSON.parse(body); } catch { return reply(400, { error: 'not JSON' }); }
    Promise.resolve().then(() => done(data)).catch((e) => reply(400, { error: String(e?.message || e) }));
  });
}

/** Writes the entries [{ id, settings | null }] into src/media.js (null takes the window's line out). */
function saveEntries(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 11) throw new Error('no entries');
  const text = fs.readFileSync(SETTINGS, 'utf8'), files = new Set(listFiles().map((f) => f.name)), lines = [];
  let next = text;
  for (const entry of entries) {
    const id = entry?.id;
    if (!WINDOW.test(id)) throw new Error('unknown window');
    if (entry.settings === null) { next = dropLine(next, id); continue; }
    const cfg = cleanSettings(entry.settings);
    // a window can be pointed at a file of public/media/, or keep the address its line already has
    const had = entryText(text, id) || '';
    const inFolder = cfg.src.startsWith('media/') && files.has(cfg.src.slice(6));
    const kept = !/['"]/.test(cfg.src) && (had.includes(`'${cfg.src}'`) || had.includes(`"${cfg.src}"`));
    if (!inFolder && !kept) throw new Error(`no such file in public/media/: ${cfg.src}`);
    const line = mediaLine(id, cfg);
    next = putLine(next, id, line);
    lines.push(line);
  }
  if (next !== text) fs.writeFileSync(SETTINGS, next);
  return { ok: true, changed: next !== text, lines };
}

/** Streams the request body into public/media/<name> (`name`: a file name that safeName has passed). */
export function takeFile(req, res, name, reply) {
  if (Number(req.headers['content-length']) > MAX_UPLOAD) { res.setHeader('Connection', 'close'); return reply(413, { error: 'file too big' }); }
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = path.join(DIR, `.upload-${process.pid}-${Date.now()}`), out = fs.createWriteStream(tmp);
  let size = 0, done = false;
  const fail = (code, error) => {
    if (done) return;
    done = true;
    req.unpipe(out); req.resume();
    // The temporary file goes first and the answer after it: whoever asked finds the folder as it was. (Removed once
    // the stream has closed: a file that is still being opened would appear again after an earlier removal.)
    const drop = () => fs.rm(tmp, { force: true }, () => { if (!res.writableEnded) reply(code, { error }); });
    if (out.closed) drop(); else { out.once('close', drop); out.destroy(); }
  };
  req.on('data', (chunk) => { size += chunk.length; if (size > MAX_UPLOAD) fail(413, 'file too big'); });
  req.on('close', () => { if (!req.complete) fail(400, 'upload interrupted'); });
  req.on('error', () => fail(400, 'upload interrupted'));
  out.on('error', (e) => fail(500, String(e.message)));
  out.on('finish', () => {
    if (done) return;
    if (!size) return fail(400, 'empty file');
    done = true;
    const replaced = fs.existsSync(path.join(DIR, name));
    try { fs.renameSync(tmp, path.join(DIR, name)); } catch (e) { fs.rm(tmp, { force: true }, () => {}); return reply(500, { error: String(e.message) }); }
    reply(200, { ok: true, name, size, replaced });
  });
  req.pipe(out);
}

export default function mediaTool() {
  return {
    name: 'media-tool',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__media', (req, res) => {
        const reply = answerOf(res);
        try {
          const url = new URL(req.url || '/', 'http://dev');      // what follows /__media
          const write = mayWrite(req);
          if (req.method === 'GET' && url.pathname === '/') return reply(200, { files: listFiles(), write, max: MAX_UPLOAD });
          if (req.method !== 'POST') return reply(405, { error: 'GET or POST' });
          if (!sameOrigin(req)) return reply(403, { error: 'cross-origin' });
          if (!write) return reply(403, { error: 'read-only' });
          if (url.pathname === '/file') {
            const name = safeName(url.searchParams.get('name'));
            return name ? takeFile(req, res, name, reply) : reply(400, { error: 'not a photo or video a window can show' });
          }
          if (url.pathname !== '/') return reply(404, { error: 'not found' });
          readJson(req, reply, (data) => {
            const out = saveEntries(data.entries);
            // the page may ask for the file again before the watcher has noticed the change
            if (out.changed) server.moduleGraph?.onFileChange?.(SETTINGS.split(path.sep).join('/'));
            reply(200, out);
          });
        } catch (e) { reply(400, { error: String(e?.message || e) }); }
      });
    },
  };
}
