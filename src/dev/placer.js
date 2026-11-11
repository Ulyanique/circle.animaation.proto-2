// Placement tool of the dev server — key E, or `?edit` in the address.
//   · a photo or video dropped from the computer onto a window (or «Загрузить…») goes to public/media/ and into that
//     window; the list offers the files that are already there;
//   · the picture is dragged inside its window; the wheel zooms it, Alt (or Shift) + wheel turns it;
//   · «Сохранить» writes the lines of the changed windows into src/media.js.
// What is on the screen is what gets saved: the live values are kept at the precision of the saved line.
// The dev server's side is mediaServer.js. Loaded by main.js in dev mode only — not part of the build.

import { slots, placeAt, setFixed, fitParts, fixedByDefault, mediaFor, adoptSettings, CARD } from '../core/slots.js';
import { VIDEO_W, VIDEO_H, FPS, LAST_FRAME, clamp, lerp, timeToFrame, touch } from '../core/util.js';
import { MAX_UPLOAD, mediaLine, safeName } from './mediaLine.js';

const MAX_SIDE = 4096;      // longer side a photo keeps: the film puts no more than that on the GPU (core/assets.js)
const ZOOM_SLIDER = 4;      // the slider's right end (the wheel goes on to 8)

const CSS = `
#stage.placing #view { touch-action: none; }
#placer {
  position: absolute; top: 14px; right: 14px; width: 330px; max-width: calc(100% - 28px); max-height: calc(100% - 28px); overflow: auto;
  padding: 12px 14px 10px; border-radius: 14px; z-index: 5; box-sizing: border-box;
  background: rgba(12, 10, 6, 0.86); backdrop-filter: blur(8px); border: 1px solid rgba(201, 164, 90, 0.3);
  color: #d8bd84; font-size: 12px; line-height: 1.45; user-select: none;
}
#placer[hidden], #placer [hidden] { display: none !important; }
#placer header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; color: #f1d79a; font-size: 13px; }
#placer button, #placer select {
  font: inherit; color: #e6cb8f; background: rgba(201, 164, 90, 0.12); border: 1px solid rgba(201, 164, 90, 0.3);
  border-radius: 8px; padding: 4px 9px; cursor: pointer;
}
#placer button:hover:not(:disabled) { background: rgba(201, 164, 90, 0.26); }
#placer button:disabled, #placer select:disabled { opacity: 0.4; cursor: default; }
#placer header button { border: 0; background: transparent; font-size: 16px; line-height: 1; padding: 2px 6px; }
#placer .nav { display: flex; align-items: center; gap: 8px; }
#placer .nav button { display: flex; padding: 7px 8px; }
#placer .nav span { flex: 1; text-align: center; color: #f6e2ae; }
#placer .file { display: flex; gap: 6px; margin-top: 8px; }
#placer select { flex: 1; min-width: 0; background: #1c170d; padding: 4px 6px; }
#placer .vals { margin: 8px 0 4px; font-variant-numeric: tabular-nums; color: #f1d79a; min-height: 1.45em; }
#placer .vals i { font-style: normal; color: #a48a55; }
#placer label { display: flex; align-items: center; gap: 7px; margin: 3px 0; cursor: pointer; }
#placer label small { color: #a48a55; font-size: 11px; }
#placer label.sl { cursor: default; }
#placer label.sl span { width: 58px; color: #a48a55; }
#placer input[type=range] { flex: 1; min-width: 0; accent-color: #c9a45a; margin: 0; height: 16px; }
#placer input[type=checkbox] { accent-color: #c9a45a; margin: 0; }
#placer pre {
  margin: 8px 0; padding: 7px 8px; border-radius: 8px; background: rgba(0, 0, 0, 0.45); color: #f6e2ae; font: 11px/1.4 ui-monospace, Menlo, Consolas, monospace;
  white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; cursor: text;
}
#placer .acts { display: flex; gap: 6px; flex-wrap: wrap; }
#placer .acts.small { margin: 5px 0 6px; }
#placer .acts.small button { padding: 2px 8px; font-size: 11px; }
#placer .acts.main button { flex: 1; }
#placer .acts.main button:first-child { flex: 1 0 100%; background: rgba(201, 164, 90, 0.3); color: #fff3d0; }
#placer p { margin: 8px 0 0; color: #a48a55; font-size: 11px; }
#placer p.msg { color: #f1d79a; min-height: 1.45em; font-size: 12px; }
#placer p.msg.bad { color: #ff9c7a; }
#placer-tags { position: absolute; inset: 0; pointer-events: none; z-index: 4; }
#placer-tags[hidden] { display: none; }
#placer-tags span {
  position: absolute; transform: translate(-50%, -50%); padding: 2px 8px; border-radius: 999px; font-size: 11px; letter-spacing: 0.05em;
  background: rgba(12, 10, 6, 0.72); border: 1px solid rgba(201, 164, 90, 0.4); color: #d8bd84; white-space: nowrap;
}
#placer-tags span[hidden] { display: none; }
#placer-tags span.sel { border-color: #f6e2ae; color: #fff3d0; background: rgba(60, 44, 14, 0.85); }
#placer-tags span.still { opacity: 0.6; }
#placer-tags span.dirty::after { content: ' •'; color: #ffcf6a; }
#hud #placer-open svg { position: absolute; inset: 0; margin: auto; }
#hud #placer-open.on { background: rgba(201, 164, 90, 0.32); color: #fff3d0; }
#placer-tags span.hot { border-color: #fff; color: #fff; background: rgba(150, 108, 30, 0.95); opacity: 1; transform: translate(-50%, -50%) scale(1.25); }
`;

const ARROW = (d) => `<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const HTML = `
<header><b>Подгонка кадра</b><button data-a="close" title="Закрыть (E)" aria-label="Закрыть">×</button></header>
<div class="nav"><button data-a="prev" title="Предыдущее окно" aria-label="Предыдущее окно">${ARROW('M6.5 1.5 3 5l3.5 3.5')}</button><span></span><button data-a="next" title="Следующее окно" aria-label="Следующее окно">${ARROW('M3.5 1.5 7 5 3.5 8.5')}</button></div>
<div class="file"><select data-a="file" title="Что показывает окно: файл из public/media/"></select><button data-a="pick" title="Фото или видео с компьютера — в public/media/ и в это окно">Загрузить…</button>
<input type="file" hidden accept="image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm,video/quicktime,.m4v,.mov,.ogv"></div>
<div class="vals"></div>
<label class="sl"><span>крупнее</span><input type="range" data-a="zoom" min="0" max="1000" step="1" aria-label="Увеличение"></label>
<label class="sl"><span>поворот</span><input type="range" data-a="turn" min="-300" max="300" step="1" aria-label="Поворот"></label>
<div class="acts small"><button data-a="level" title="Выровнять кадр по горизонту экрана (rotate: 'level')">По горизонту</button><button data-a="reset" title="Середина кадра, без увеличения, поворота и движения">Сбросить</button></div>
<label><input type="checkbox" data-a="fixed"> закрепить на экране <small>fixed</small></label>
<label><input type="checkbox" data-a="move"> движение, пока окно на экране <small>to</small></label>
<div class="acts small ends"><button data-a="start" title="К началу окна: там правится, откуда кадр выходит">к началу</button><button data-a="end" title="К концу окна: там правится, куда кадр приходит">к концу</button></div>
<pre></pre>
<div class="acts main"><button data-a="save">Сохранить в media.js</button><button data-a="copy">Скопировать строку</button><button data-a="undo" title="Как в файле">Вернуть</button></div>
<p class="msg" aria-live="polite"></p>
<p class="hint"></p>
`;

const round = (v, digits) => Number(v.toFixed(digits));
const megabytes = (n) => (n < 1e5 ? `${Math.max(1, Math.round(n / 1024))} КБ` : `${(n / 2 ** 20).toFixed(1).replace('.', ',')} МБ`);
const READ_ONLY = 'Запись выключена: она работает по адресу localhost на том компьютере, где запущен сервер. Строку можно скопировать в src/media.js.';

/**
 * A photo bigger than the film can use, scaled down for the upload (JPEG, sRGB, upright; its camera data — the place
 * it was taken at included — does not travel along). Resolves to { blob, from, to } or null: the file goes as it is.
 */
async function shrink(file) {
  if (!/^image\/(jpeg|webp|avif)$/.test(file.type)) return null;
  // through an <img>, as the film itself reads photos (core/assets.js): drawn from there, a photo is upright and in
  // sRGB in every browser
  const url = URL.createObjectURL(file), pic = new Image();
  try {
    pic.src = url;
    await pic.decode();
    let src = pic, w = pic.naturalWidth, h = pic.naturalHeight;
    if (Math.max(w, h) <= MAX_SIDE) return null;
    const from = `${w}×${h}`;
    // by halves, then the rest: one big step would alias where the browser only filters bilinearly (and no step
    // bigger than 16 megapixels: phones give a canvas no more)
    while (Math.max(w, h) > MAX_SIDE) {
      const k = Math.min(Math.max(0.5, MAX_SIDE / Math.max(w, h)), Math.sqrt(16e6 / (w * h))), c = document.createElement('canvas');
      c.width = w = Math.max(1, Math.round(w * k)); c.height = h = Math.max(1, Math.round(h * k));
      const g = c.getContext('2d', { alpha: false });
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, w, h);
      if (src !== pic) src.width = src.height = 0;
      src = c;
    }
    const blob = await new Promise((done) => src.toBlob(done, 'image/jpeg', 0.9));
    src.width = src.height = 0;
    return blob ? { blob, from, to: `${w}×${h}` } : null;
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}

export function startPlacer(player, openNow = false) {
  const canvas = document.getElementById('view'), stageEl = document.getElementById('stage');
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: CSS }));
  const panel = Object.assign(document.createElement('div'), { id: 'placer', hidden: true, innerHTML: HTML });
  const tags = Object.assign(document.createElement('div'), { id: 'placer-tags', hidden: true });
  stageEl.append(tags, panel);
  // the way in for those who do not know the key: a button in the player's bar
  const opener = Object.assign(document.createElement('button'), {
    id: 'placer-open', title: 'Свои фото и видео в окнах: подгонка кадра (E)',
    innerHTML: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/>'
      + '<path d="M3.5 11.5 6.5 8l2 2 1.5-1.5 2.5 3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/><circle cx="10.8" cy="5.8" r="1" fill="currentColor"/></svg>',
  });
  opener.setAttribute('aria-label', 'Подгонка кадра в окнах');
  document.getElementById('hud')?.appendChild(opener);
  opener.addEventListener('click', () => setOpen(!open));
  const $ = (q) => panel.querySelector(q);
  const el = {
    name: $('.nav span'), file: $('select'), pick: $('[data-a=pick]'), input: $('input[type=file]'), vals: $('.vals'),
    zoom: $('[data-a=zoom]'), turn: $('[data-a=turn]'), level: $('[data-a=level]'), reset: $('[data-a=reset]'),
    fixed: $('[data-a=fixed]'), move: $('[data-a=move]'), ends: $('.ends'), line: $('pre'),
    save: $('[data-a=save]'), copy: $('[data-a=copy]'), undo: $('[data-a=undo]'), msg: $('.msg'), hint: $('.hint'),
  };

  const all = () => Object.values(slots).sort((a, b) => a.id.localeCompare(b.id));
  const own = (r) => !!(r && r.place);      // the window shows media that can be placed, not a placeholder still
  const cfgOf = (r) => r.cfg || mediaFor(r.name) || {};      // its line of media.js (also when the file did not open)
  const frame = () => clamp(timeToFrame(player.time), 1, LAST_FRAME);
  const userAt = (r, f) => r.users.find((u) => f >= u.ask.span[0] && f < u.ask.span[1] + 1) || null;      // the shot that draws it now
  const snap = (r) => JSON.stringify({ place: r.place, fixed: r.fixed });
  const loaded = new Map();      // window -> its placement as the file has it
  const reread = (names) => { for (const r of all()) if (own(r) && (!names || names.includes(r.name))) loaded.set(r.name, snap(r)); };
  reread();
  const dirty = (r) => own(r) && snap(r) !== loaded.get(r.name);
  let server = { files: [], write: false, max: MAX_UPLOAD };
  let open = false, sel = null, drag = null, hot = null, busy = null, lastFrame = -1, note = '', bad = false, listKey = '';

  // ---- geometry -------------------------------------------------------------------------------
  const toVideo = (e) => { const b = canvas.getBoundingClientRect(); return [((e.clientX - b.left) / b.width) * VIDEO_W, ((e.clientY - b.top) / b.height) * VIDEO_H]; };
  /** the window under picture point (x, y), or null */
  function pick(x, y) {
    const f = frame();
    for (const r of all()) {
      const u = userAt(r, f), h = u && u.ask.uv(f, x, y);
      if (h && u.ask.inside(h[0], h[1])) return r;
    }
    return null;
  }
  /** the point of the window's box (uv 0..1) under picture point (x, y); with `fixed` the box is the picture itself */
  function boxPoint(r, f, x, y) {
    if (r.fixed) return [x / VIDEO_W, y / VIDEO_H];
    const u = userAt(r, f), h = u && u.ask.uv(f, x, y), b = r.box;
    return h ? [(h[0] - b[0]) / (b[1] - b[0]), (h[1] - b[2]) / (b[3] - b[2])] : null;
  }
  const parts = (r, p) => fitParts(r.fixed ? VIDEO_W / VIDEO_H : r.aspect, 1, r.shape, p);
  /** media uv shown at box point b */
  const mediaAt = (m, p, b) => [
    m.a * b[0] + m.b * b[1] + lerp(m.x0, m.x1, clamp(p.x)) - (m.a + m.b) / 2,
    m.c * b[0] + m.d * b[1] + lerp(m.y0, m.y1, clamp(p.y)) - (m.c + m.d) / 2,
  ];
  /** the x, y that put media point `target` at box point b (where the media has no room to move, x / y stay) */
  function solve(m, p, b, target) {
    const fx = target[0] - (m.a * b[0] + m.b * b[1]) + (m.a + m.b) / 2, fy = target[1] - (m.c * b[0] + m.d * b[1]) + (m.c + m.d) / 2;
    return { x: m.x1 - m.x0 > 1e-6 ? clamp((fx - m.x0) / (m.x1 - m.x0)) : p.x, y: m.y1 - m.y0 > 1e-6 ? clamp((fy - m.y0) / (m.y1 - m.y0)) : p.y };
  }
  /** how far the window's time on screen has run at frame f, 0..1 */
  const phase = (r, f) => clamp((f - r.f0) / Math.max(1, r.f1 - r.f0));
  /** with a `to` move: is it the end of the move that is edited at frame f (the second half of the window's time)? */
  const atEnd = (r, f) => !!r.place.end && phase(r, f) >= 0.5;
  /**
   * Makes the values shown at frame f equal to `want` ({ x, y, zoom, rotate }, any of them). With a `to` move the key
   * nearer in time is changed — the start in the first half of the window's time, the end in the second.
   */
  function setNow(r, f, want) {
    const P = r.place, end = atEnd(r, f), key = end ? P.end : P.base, other = P.end ? (end ? P.base : P.end) : null;
    const w = P.end ? (end ? phase(r, f) : 1 - phase(r, f)) : 1;      // weight of the edited key in what is shown now
    const angle = (v) => (v === 'level' ? (r.fixed ? 0 : -r.tilt) : Number(v) || 0);
    const lim = { x: [0, 1], y: [0, 1], zoom: [1, 8], rotate: [-180, 180] };
    for (const k of Object.keys(want)) {
      const o = other ? (k === 'rotate' ? angle(other[k]) : other[k]) : 0;
      key[k] = round(clamp((want[k] - o * (1 - w)) / w, lim[k][0], lim[k][1]), k === 'rotate' ? 1 : 3);
    }
  }

  // ---- the line for src/media.js ----------------------------------------------------------------
  function settingsOf(r) {
    const { base, end } = r.place, out = { src: r.cfg.src || 'media/…', x: base.x, y: base.y, zoom: base.zoom, rotate: base.rotate };
    if (end) {
      const to = {};
      for (const k of ['x', 'y', 'zoom', 'rotate']) if (end[k] !== base[k]) to[k] = end[k];
      if (Object.keys(to).length) out.to = to;
    }
    if (r.fixed !== fixedByDefault(r.id)) out.fixed = r.fixed;
    for (const k of ['start', 'rate', 'sharpen']) if (Number.isFinite(r.cfg[k])) out[k] = r.cfg[k];
    if (r.cfg.loop === false) out.loop = false;
    return out;
  }
  const lineOf = (r) => mediaLine(r.id, settingsOf(r));
  /** what «Сохранить» would write: every window that was moved and has a file */
  const pending = () => all().filter((r) => dirty(r) && r.cfg.src).map((r) => ({ id: r.id, settings: settingsOf(r) }));

  // ---- the dev server ---------------------------------------------------------------------------
  const api = (rest = '') => new URL(`__media${rest}`, document.baseURI);
  async function send(entries) {
    try {
      const res = await fetch(api(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }) });
      const data = await res.json().catch(() => ({}));
      return res.ok && data.ok ? data : { error: data.error === 'read-only' ? 'запись выключена' : data.error || `ответ ${res.status}` };
    } catch (e) { return { error: e.message }; }
  }
  const keep = (key, value) => { try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch { /* private mode */ } };
  const remember = () => keep('placer', JSON.stringify({ open, sel }));

  async function save() {
    const entries = pending();
    if (!entries.length) return;
    player.pause();
    say('Сохраняю…');
    const names = all().filter((r) => entries.some((e) => e.id === r.id)).map((r) => r.name);
    const stamp = new Map(names.map((n) => [n, snap(slots[n])]));
    const out = await send(entries);
    if (out.error) return say(`Сохранить не удалось (${out.error}). Строку можно скопировать и вставить в src/media.js.`, true);
    for (const [n, s] of stamp) loaded.set(n, s);
    // the file now says what was on the screen when it was sent: its change coming back must not move pictures again
    for (const e of entries) { const r = all().find((x) => x.id === e.id); if (r) adoptSettings(r.name, e.settings); }
    say(entries.length > 1 ? `Сохранено в src/media.js: ${entries.map((e) => e.id).join(', ')}.` : 'Сохранено в src/media.js.');
  }
  /**
   * Puts file `src` ('media/…'; null — back to the placeholder) into window r. The page is then loaded again (pictures
   * are read at the start); what was moved in other windows is saved along.
   */
  async function assign(r, src, done, uploaded = false) {
    player.pause();
    const entries = pending().filter((e) => e.id !== r.id), had = cfgOf(r).src || null;
    if (src === null) { if (had) entries.push({ id: r.id, settings: null }); }
    else if (src === had) { if (dirty(r)) entries.push({ id: r.id, settings: settingsOf(r) }); }
    else entries.push({ id: r.id, settings: own(r) && !r.cfg.src ? { ...settingsOf(r), src } : { src } });      // a placed test card passes its placement on
    if (!entries.length && !uploaded) return refresh();
    player.keepFrame?.();
    keep('placer-note', done);
    const out = entries.length ? await send(entries) : { ok: true, changed: false };
    if (out.error) { keep('placer-note', null); return say(`Не получилось (${out.error}).`, true); }
    say('Обновляю страницу…');
    // a changed media.js reloads the page by itself (core/slots.js); the timer is for a page without that connection
    setTimeout(() => location.reload(), out.changed ? 1500 : 0);
  }
  async function upload(file, r, more = 0) {
    if (!server.write) return say(READ_ONLY, true);
    let name = safeName(file.name);
    if (!name) {
      return say(/\.hei[cf]$/i.test(file.name) ? 'HEIC браузеры не показывают — сохраните фото как JPEG.'
        : `«${file.name}» в окно не поставить: нужны jpg, png, webp, avif или mp4, webm.`, true);
    }
    player.pause();
    say(`Загружаю ${name}…`);
    let body = file;
    const what = [];
    const small = await shrink(file);
    if (small) { body = small.blob; name = name.replace(/\.[^.]+$/, '.jpg'); what.push(`уменьшен: ${small.from} → ${small.to}`); }
    if (body.size > server.max) return say(`Файл больше ${Math.round(server.max / 2 ** 20)} МБ — окну на несколько секунд столько не нужно. Сожмите его.`, true);
    try {
      const res = await fetch(api(`/file?name=${encodeURIComponent(name)}`), { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error === 'read-only' ? 'запись выключена' : data.error || `ответ ${res.status}`);
      name = data.name;
      if (data.replaced) what.push('заменил прежний файл с этим именем');
    } catch (e) { return say(`Загрузить не удалось (${e.message}).`, true); }
    if (more) what.push('из нескольких файлов взят первый');
    await assign(r, `media/${name}`, `${name} — в окне ${r.id}${what.length ? ` (${what.join('; ')})` : ''}.`, true);
  }

  // ---- panel ----------------------------------------------------------------------------------
  const put = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  function say(text, isBad = false) { note = text; bad = isBad; refresh(); }
  function fillList(r, src) {
    const key = JSON.stringify([r.id, src, server.files]);
    if (key === listKey) return;
    listKey = key;
    el.file.textContent = '';
    const add = (value, label) => el.file.appendChild(Object.assign(document.createElement('option'), { value, textContent: label }));
    add('', CARD ? 'разметка 16:9 (?card)' : 'заглушка — кадр ролика');
    if (src && !server.files.some((f) => `media/${f.name}` === src)) add(src, src);
    for (const f of server.files) add(`media/${f.name}`, `${f.name} · ${megabytes(f.size)}`);
    el.file.value = src;
  }
  function refresh() {
    const r = sel && slots[sel], f = frame();
    lastFrame = f;
    touch();      // whatever was changed, the paused film has to be drawn again
    if (!r) return;
    const mine = own(r), src = cfgOf(r).src || '', on = f >= r.f0 - 1 && f <= r.f1 + 1, todo = pending();
    put(el.name, `${r.id} · кадры ${r.f0}–${r.f1}`);
    fillList(r, src);
    el.file.disabled = el.pick.disabled = !server.write;
    put(el.hint, `${server.write ? 'Перетащите файл на окно · т' : 'Т'}яните кадр мышью · колесо — крупнее · Alt + колесо — поворот`);
    for (const b of [el.zoom, el.turn, el.level, el.reset, el.fixed, el.move, el.copy]) b.disabled = !mine;
    el.save.disabled = !server.write || !todo.length;
    put(el.save, todo.length > 1 ? `Сохранить в media.js (${todo.length})` : 'Сохранить в media.js');
    el.undo.disabled = !dirty(r);
    el.ends.hidden = !(mine && r.place.end);
    el.msg.className = `msg${bad ? ' bad' : ''}`;
    if (!mine) {
      el.vals.dataset.v = el.vals.textContent = '';
      el.fixed.checked = el.move.checked = false;
      put(el.line, src ? `${r.id}: { src: '${src}' },` : `${r.id}: { src: 'media/имя-файла.jpg' },`);
      put(el.msg, note || (src ? `Файл ${src} не открылся — в окне осталась заглушка.`
        : server.write ? `В окне ${r.id} — заглушка. Перетащите на него фото или видео с компьютера или выберите файл в списке.`
          : `В окне ${r.id} — заглушка. Положите файл в public/media/ и добавьте в src/media.js такую строку.`));
      return;
    }
    const p = placeAt(r, f);
    const vals = `<i>x</i> ${p.x.toFixed(3)} &nbsp; <i>y</i> ${p.y.toFixed(3)} &nbsp; <i>zoom</i> ${p.zoom.toFixed(3)} &nbsp; <i>поворот</i> ${round(p.rotate, 1)}°`;
    if (el.vals.dataset.v !== vals) { el.vals.dataset.v = vals; el.vals.innerHTML = vals; }
    if (busy !== el.zoom) el.zoom.value = String(Math.round((1000 * Math.log(clamp(p.zoom, 1, ZOOM_SLIDER))) / Math.log(ZOOM_SLIDER)));
    if (busy !== el.turn) el.turn.value = String(Math.round(clamp(p.rotate, -30, 30) * 10));
    el.fixed.checked = r.fixed; el.move.checked = !!r.place.end;
    put(el.line, lineOf(r));
    const moved = all().filter(dirty).map((x) => x.id);
    put(el.msg, note || (!on ? `Окно ${r.id} сейчас не на экране — стрелки вверху переходят к окну.`
      : r.place.end ? `Движение: сейчас правится ${atEnd(r, f) ? 'конец — куда кадр приходит' : 'начало — откуда кадр выходит'}.`
        : !server.write ? READ_ONLY
          : !r.cfg.src ? 'Это разметка: выберите файл — он встанет так же.'
            : moved.length ? `Не сохранено: ${moved.join(', ')}.` : ''));
  }
  function select(name) {
    if (name !== sel) note = '';
    sel = name;
    remember();
    refresh();
  }
  function setOpen(v) {
    open = v;
    panel.hidden = tags.hidden = !v;
    stageEl.classList.toggle('placing', v);
    opener.classList.toggle('on', v);
    if (!v) canvas.style.cursor = '';
    if (v && !(sel && slots[sel])) {
      const f = frame(), seen = all().filter((r) => f >= r.f0 && f <= r.f1);
      sel = (seen.find(own) || seen[0] || all().find(own) || all()[0])?.name ?? null;
    }
    remember();
    refresh();
  }
  const seekTo = (f) => { player.pause(); player.seek((Math.round(f) - 1) / FPS); };
  function go(step) {
    const list = all(), i = list.findIndex((r) => r.name === sel), r = list[(Math.max(i, 0) + (i < 0 ? 0 : step) + list.length) % list.length];
    seekTo((r.f0 + r.f1) / 2);
    select(r.name);
  }
  async function copy() {
    const text = el.line.textContent;
    try { await navigator.clipboard.writeText(text); say('Строка скопирована.'); } catch {
      const range = document.createRange();
      range.selectNodeContents(el.line);
      getSelection().removeAllRanges(); getSelection().addRange(range);
      say('Строка выделена — нажмите Ctrl + C.');
    }
  }
  function undo(r) {
    const s = JSON.parse(loaded.get(r.name));
    r.place.base = s.place.base; r.place.end = s.place.end;
    setFixed(r, s.fixed);
    say('Возвращено как в файле.');
  }
  panel.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a, r = sel && slots[sel];
    if (a === 'close') return setOpen(false);
    if (a === 'prev') return go(-1);
    if (a === 'next') return go(1);
    if (a === 'save') return save();
    if (a === 'pick') return el.input.click();
    if (!own(r)) return;
    if (a === 'copy') copy();
    else if (a === 'undo') undo(r);
    else if (a === 'level') { (atEnd(r, frame()) ? r.place.end : r.place.base).rotate = 'level'; say(r.fixed ? 'У закреплённого кадра горизонт и так ровный.' : ''); }
    else if (a === 'reset') { r.place.base = { x: 0.5, y: 0.5, zoom: 1, rotate: 0 }; r.place.end = null; say(''); }
    else if (a === 'start') { seekTo(lerp(r.f0, r.f1, 0.1)); say(''); }
    else if (a === 'end') { seekTo(lerp(r.f0, r.f1, 0.9)); say(''); }
  });
  panel.addEventListener('input', (e) => {
    const a = e.target.dataset.a, r = sel && slots[sel];
    if (!own(r) || (a !== 'zoom' && a !== 'turn')) return;
    busy = e.target;
    player.pause();
    setNow(r, frame(), a === 'zoom' ? { zoom: Math.exp((Number(e.target.value) / 1000) * Math.log(ZOOM_SLIDER)) } : { rotate: Number(e.target.value) / 10 });
    say('');
  });
  panel.addEventListener('change', (e) => {
    const a = e.target.dataset.a, r = sel && slots[sel];
    if (e.target === el.input) {
      const file = el.input.files[0];
      el.input.value = '';
      if (file && r) upload(file, r);
      return;
    }
    if (a === 'zoom' || a === 'turn') { busy = null; return refresh(); }
    if (!r) return;
    if (a === 'file') {
      const src = el.file.value || null;
      listKey = '';      // the list shows the file's state again if this does not go through
      return assign(r, src, src ? `${src.replace(/^media\//, '')} — в окне ${r.id}.` : `В окне ${r.id} снова заглушка.`);
    }
    if (!own(r)) return;
    if (a === 'fixed') { setFixed(r, e.target.checked); say(''); }
    else if (a === 'move') {
      r.place.end = e.target.checked ? { ...r.place.base } : null;
      say(e.target.checked ? 'Поставьте кадр в начале окна и в конце — кнопки «к началу» и «к концу».' : '');
    }
  });
  // keys pressed inside the panel are the panel's own (arrows move a slider, they do not wind the film)
  panel.addEventListener('keydown', (e) => { if (e.code !== 'KeyE' || /^(INPUT|SELECT)$/.test(e.target.tagName)) e.stopPropagation(); });

  // ---- mouse on the picture ---------------------------------------------------------------------
  canvas.addEventListener('pointerdown', (e) => {
    if (!open || e.button !== 0) return;
    const [x, y] = toVideo(e), r = pick(x, y);
    if (!r) return;
    select(r.name);
    if (!own(r)) return;
    player.pause();
    const f = frame(), p = placeAt(r, f), b = boxPoint(r, f, x, y);
    if (!b) return;
    drag = { r, media: mediaAt(parts(r, p), p, b) };      // the point of the picture that was grabbed
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    if (note) say('');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!open) return;
    const [x, y] = toVideo(e);
    if (!drag) { const r = pick(x, y); canvas.style.cursor = r ? (own(r) ? 'grab' : 'pointer') : 'default'; return; }
    const { r } = drag, f = frame(), b = boxPoint(r, f, x, y);
    if (!b) return;
    const p = placeAt(r, f);
    setNow(r, f, solve(parts(r, p), p, b, drag.media));
    refresh();
  });
  const drop = () => { if (drag) canvas.style.cursor = 'grab'; drag = null; };
  canvas.addEventListener('pointerup', drop);
  canvas.addEventListener('pointercancel', drop);
  canvas.addEventListener('wheel', (e) => {
    if (!open) return;
    const [x, y] = toVideo(e), under = pick(x, y), r = under || (sel && slots[sel]);
    if (!own(r)) return;
    e.preventDefault();
    if (r.name !== sel) select(r.name);
    player.pause();
    const turn = e.altKey || e.shiftKey;      // with Shift some systems turn the wheel sideways
    const d = (turn ? e.deltaY || e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    // about the point under the cursor; with the cursor off the window, about the middle of the window
    const f = frame(), p = placeAt(r, f), b = (under && boxPoint(r, f, x, y)) || [0.5, 0.5], grabbed = mediaAt(parts(r, p), p, b);
    if (turn) setNow(r, f, { rotate: p.rotate + d * 0.02 });
    else setNow(r, f, { zoom: p.zoom * Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0012)) });      // ctrl: a pinch on a touchpad
    const q = placeAt(r, f);
    setNow(r, f, solve(parts(r, q), q, b, grabbed));
    note = '';
    refresh();
  }, { passive: false });
  // a click on the picture pauses / plays the film; not while pictures are being placed
  stageEl.addEventListener('click', (e) => { if (open && e.target === canvas) e.stopPropagation(); }, true);
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    setOpen(!open);
  });

  // ---- a file dropped from the computer -----------------------------------------------------------
  const carriesFile = (e) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  window.addEventListener('dragover', (e) => {
    if (!carriesFile(e)) return;
    e.preventDefault();      // or the browser would open the file in place of the page
    e.dataTransfer.dropEffect = server.write ? 'copy' : 'none';
    if (!open) setOpen(true);
    const [x, y] = toVideo(e);
    hot = pick(x, y)?.name ?? null;
  });
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) hot = null; });
  window.addEventListener('drop', (e) => {
    if (!carriesFile(e)) return;
    e.preventDefault();
    hot = null;
    const [x, y] = toVideo(e), r = pick(x, y) || (sel && slots[sel]), files = e.dataTransfer.files;
    if (!files.length || !r) return;
    select(r.name);
    upload(files[0], r, files.length - 1);
  });

  // ---- name tags on the windows ----------------------------------------------------------------
  const tagOf = new Map();
  function placeTags() {
    const f = frame(), box = canvas.getBoundingClientRect(), base = stageEl.getBoundingClientRect(), pb = panel.getBoundingClientRect();
    // the panel's place in picture coordinates: a tag under it would not be seen
    const k = VIDEO_W / box.width, px0 = (pb.left - box.left) * k - 40, px1 = (pb.right - box.left) * k + 40, py0 = (pb.top - box.top) * k - 20, py1 = (pb.bottom - box.top) * k + 20;
    for (const r of all()) {
      let t = tagOf.get(r.name);
      if (!t) { t = document.createElement('span'); t.textContent = r.id; tags.appendChild(t); tagOf.set(r.name, t); }
      const u = userAt(r, f);
      let best = null;
      if (u && f >= r.f0 - 1 && f <= r.f1 + 1) {
        // a point of the window that is in the picture, as close to the window's middle as there is
        const c = u.ask.centre(f, r.box), pts = [[c.x, c.y]];
        for (let y = 60; y < VIDEO_H; y += 120) for (let x = 80; x < VIDEO_W; x += 160) pts.push([x, y]);
        let bd = Infinity;
        for (const [x, y] of pts) {
          if (!(x >= 30 && x <= VIDEO_W - 30 && y >= 20 && y <= VIDEO_H - 20) || (x > px0 && x < px1 && y > py0 && y < py1)) continue;
          const d = (x - c.x) ** 2 + (y - c.y) ** 2;
          if (d >= bd) continue;
          const h = u.ask.uv(f, x, y);
          if (h && u.ask.inside(h[0], h[1])) { bd = d; best = [x, y]; }
        }
      }
      t.hidden = !best;
      if (!best) continue;
      const cls = [r.name === sel && 'sel', !own(r) && 'still', dirty(r) && 'dirty', r.name === hot && 'hot'].filter(Boolean).join(' ');
      if (t.className !== cls) t.className = cls;
      t.style.left = `${box.left - base.left + (best[0] / VIDEO_W) * box.width}px`;
      t.style.top = `${box.top - base.top + (best[1] / VIDEO_H) * box.height}px`;
    }
  }
  (function tick() {
    if (open) { placeTags(); if (frame() !== lastFrame) refresh(); }
    requestAnimationFrame(tick);
  })();

  // media.js was edited and its numbers taken over under the running film (core/slots.js): for the windows it moved,
  // what is on the screen is now what the file says
  window.addEventListener('media-settings', (e) => { reread(e.detail || []); refresh(); });

  let stored = null;
  try { stored = JSON.parse(sessionStorage.getItem('placer') || 'null'); note = sessionStorage.getItem('placer-note') || ''; } catch { /* private mode */ }
  keep('placer-note', null);
  if (stored?.sel && slots[stored.sel]) sel = stored.sel;
  if (openNow || stored?.open) setOpen(true);
  const asked = fetch(api()).then((res) => (res.ok ? res.json() : null)).then((data) => { if (data) server = data; }).catch(() => {}).then(refresh);

  // for the checking tools (tools/placertest.mjs)
  window.__placer = {
    open: (v = true) => setOpen(v), select, asked,
    state: () => ({ open, sel, line: sel && own(slots[sel]) ? lineOf(slots[sel]) : null, note: el.msg.textContent, bad, write: server.write, files: server.files.map((x) => x.name), unsaved: all().filter(dirty).map((r) => r.id) }),
    /** the window under picture point (x, y) and the point of its media shown there */
    probe: (x, y) => {
      const r = pick(x, y);
      if (!r || !own(r)) return r ? { id: r.id } : null;
      const f = frame(), p = placeAt(r, f), b = boxPoint(r, f, x, y);
      return { id: r.id, media: mediaAt(parts(r, p), p, b), place: p, base: { ...r.place.base }, end: r.place.end && { ...r.place.end }, fixed: r.fixed };
    },
  };
}
