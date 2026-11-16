// Video tool of the dev server — key V, or `?video` in the address. The film as it stands on the page — the photos and
// videos in its windows (src/media.js), the title (src/brand.js, or what the title tool shows unsaved), the sound
// (src/sound.js, or what the sound tool plays unsaved), the bars if they are on (key B) — is saved as a video file:
//   · «Сохранить видео» draws every frame in its turn, at the size and frame rate chosen, and hands the file to the
//     browser as a download; «Проба» does the same for three seconds from the frame on the screen;
//   · while it works the film is not the user's: a veil lies over the page and only «Стоп» answers.
// The frames, the encoder and the file are filmFile.js; this is the panel. Loaded by main.js in dev mode only — not
// part of the build.

import { FPS, LAST_FRAME, clamp, timeToFrame, touch } from '../core/util.js';
import { OWN_SOUND } from '../core/soundSettings.js';
import { SOUND } from '../core/soundtrack.js';
import { TITLE } from '../fx/title.js';
import { FORMATS, RATES, SIZES, canMake, filmFile, frameCount, pictureBitrate, soundBitrate } from './filmFile.js';
import { addStyle, hudButton, megabytes, releaseKeys, tool, toolOpen } from './panel.js';

const SAMPLE = 3 * FPS;      // frames of the film in a «проба»
const LEVELS = ['обычное', 'высокое', 'наивысшее'];
const SIZE_NAMES = { '1280x720': 'HD', '1920x1080': 'Full HD', '2560x1440': '2K', '3840x2160': '4K' };
const DEFAULTS = { size: '1920x1080', fps: 24, level: 1, format: 'mp4', sound: true };

const CSS = `
#exporter label.sl span { width: 112px; flex: none; }
#exporter label.sl select { flex: 1; }
#exporter label small { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#exporter p.sum { color: #f1d79a; font-size: 12px; font-variant-numeric: tabular-nums; }
#exporter .acts.main { margin-top: 8px; }
#exporter .run { margin-top: 10px; }
#exporter .run .acts { align-items: center; justify-content: space-between; margin-top: 6px; color: #f1d79a; font-variant-numeric: tabular-nums; }
#exporter progress { display: block; width: 100%; height: 8px; appearance: none; border: 0; border-radius: 4px; overflow: hidden; background: rgba(201, 164, 90, 0.16); }
#exporter progress::-webkit-progress-bar { background: transparent; }
#exporter progress::-webkit-progress-value { background: #c9a45a; }
#exporter progress::-moz-progress-bar { background: #c9a45a; }
#exporter p.got { font-size: 12px; }
#exporter p.got a { color: #fff3d0; text-decoration: underline; text-underline-offset: 2px; overflow-wrap: anywhere; user-select: text; }
#exporter.busy :is(.set, .acts.main) { opacity: 0.4; pointer-events: none; }
#exporter-veil { position: absolute; inset: 0; z-index: 4; cursor: progress; }
#exporter-veil[hidden] { display: none; }
#stage.exporting #hud { visibility: hidden; }
`;

const ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 2.5v7.2M5.2 7.2 8 10l2.8-2.8M3 12.8h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const HTML = `
<header><b>Видеофайл</b><button data-a="close" title="Закрыть (V)" aria-label="Закрыть">×</button></header>
<div class="set">
<label class="sl"><span>размер</span><select data-a="size" aria-label="Размер кадра"></select></label>
<label class="sl"><span>кадров в секунду</span><select data-a="fps" aria-label="Кадров в секунду"></select></label>
<label class="sl"><span>качество</span><select data-a="level" aria-label="Качество"></select></label>
<label class="sl"><span>формат</span><select data-a="format" aria-label="Формат файла"></select></label>
<label><input type="checkbox" data-a="sound"> <span>со звуком</span><small data-a="which"></small></label>
</div>
<p class="sum"></p>
<div class="acts main"><button data-a="make">Сохранить видео</button><button data-a="sample" title="Три секунды с кадра, который сейчас на экране: посмотреть, каким выйдет файл">Проба: 3 секунды отсюда</button></div>
<div class="run" hidden><progress max="1000" value="0" aria-label="Готово"></progress><div class="acts"><span></span><button data-a="stop">Стоп</button></div></div>
<p class="msg" aria-live="polite"></p>
<p class="got" hidden><a data-a="file"></a></p>
<p class="hint"></p>
`;

const NO_ENCODER = 'Этот браузер не кодирует видео сам (WebCodecs): нужен свежий Chrome или Edge, а страница — по адресу localhost или https.';
const HINT = 'В файл попадает то, что показывает страница: свои фото и видео в окнах, титр, своя музыка (клавиша S), полосы 2,39:1 (клавиша B). Кадры рисуются по очереди, не в реальном времени: слабая видеокарта делает это дольше, но не хуже.';

const seconds = (s) => (s < 90 ? `${Math.max(1, Math.round(s))} с` : `${Math.round(s / 60)} мин`);
const decimal = (x, digits = 1) => x.toFixed(digits).replace('.', ',');
/** What an error of filmFile.js says, in the page's language. */
function why(e) {
  const text = String(e?.message || e);
  if (/context lost|dropped the picture|could not draw|picture came out/i.test(text)) return 'видеокарта не справилась с таким размером кадра — попробуйте размер поменьше';
  if (/not supported in this environment|is not supported/i.test(text)) return 'браузер не кодирует видео с такими настройками — попробуйте другой формат или размер';
  if (/out of memory|allocation failed|exceeded maximum size/i.test(text)) return 'не хватило памяти — попробуйте размер или качество поменьше';
  return text;
}
/** Why a file that was to have sound has none: what filmFile.js says (`soundError`), in the page's language. */
function noSound(error) {
  if (!error) return 'звук для такого формата этот браузер не кодирует';
  if (/^no sound in /.test(error)) return 'в файле музыки нет звука, который можно прочитать';
  if (/^cannot decode /.test(error)) return 'музыку в таком формате этот браузер не читает — возьмите MP3 или M4A';
  return `звуковая дорожка не прочиталась (${error})`;
}
/** A name for the file: the film's caption, the picture's size. */
export function fileName(caption, { width, height, fps, ext }, sample = false) {
  // (without what a file name cannot hold — control characters and \ / : * ? " < > |)
  const base = String(caption || '').replace(/[\u0000-\u001f\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '').slice(0, 60) || 'film';
  return `${base} ${width}x${height}${fps === FPS ? '' : ` ${fps}fps`}${sample ? ' проба' : ''}.${ext}`;
}

export function startExporter(player, stage, openNow = false) {
  addStyle(CSS);
  const stageEl = document.getElementById('stage');
  const panel = Object.assign(document.createElement('div'), { id: 'exporter', hidden: true, innerHTML: HTML });
  const veil = Object.assign(document.createElement('div'), { id: 'exporter-veil', hidden: true });
  stageEl.append(veil, panel);
  const TIP = 'Сохранить ролик как видео (V)';
  const opener = hudButton('exporter-open', TIP, 'Видеофайл: сохранить ролик как видео', ICON, () => setOpen(!open));
  tool('exporter', () => setOpen(false), false);      // (a file dropped while it is open goes where it would with no tool open)
  const $ = (q) => panel.querySelector(q);
  const el = {
    size: $('[data-a=size]'), fps: $('[data-a=fps]'), level: $('[data-a=level]'), format: $('[data-a=format]'), sound: $('[data-a=sound]'), which: $('[data-a=which]'),
    sum: $('.sum'), make: $('[data-a=make]'), sample: $('[data-a=sample]'), run: $('.run'), bar: $('progress'), left: $('.run span'),
    stop: $('[data-a=stop]'), msg: $('.msg'), got: $('.got'), file: $('[data-a=file]'), hint: $('.hint'),
  };
  const option = (node, value, label) => node.appendChild(Object.assign(document.createElement('option'), { value: String(value), textContent: label }));
  for (const [w, h] of SIZES) option(el.size, `${w}x${h}`, `${w}×${h}${SIZE_NAMES[`${w}x${h}`] ? ` · ${SIZE_NAMES[`${w}x${h}`]}` : ''}`);
  for (const r of RATES) option(el.fps, r, r === FPS ? `${r} — как в ролике` : r === 60 ? `${r} — плавнее` : String(r));
  LEVELS.forEach((label, i) => option(el.level, i, label));
  for (const [key, f] of Object.entries(FORMATS)) option(el.format, key, f.label);

  // ---- what is asked for --------------------------------------------------------------------------
  let opt = { ...DEFAULTS };
  try { opt = tidy({ ...DEFAULTS, ...JSON.parse(localStorage.getItem('exporter') || '{}') }); } catch { /* private mode, or not ours */ }
  /** Settings as the panel can show them; anything else falls back to the usual. */
  function tidy(o) {
    const size = /^\d+x\d+$/.test(o.size) ? o.size : DEFAULTS.size, [w, h] = size.split('x').map(Number);
    return {
      size: w >= 16 && w <= 7680 && w % 2 === 0 && h % 2 === 0 && Math.abs(w * 9 - h * 16) <= 16 ? size : DEFAULTS.size,
      fps: Number.isFinite(Number(o.fps)) && o.fps >= 1 && o.fps <= 120 ? Number(o.fps) : DEFAULTS.fps,
      level: [0, 1, 2].includes(Number(o.level)) ? Number(o.level) : DEFAULTS.level,
      format: FORMATS[o.format] ? o.format : DEFAULTS.format,
      sound: o.sound !== false,
    };
  }
  const keep = () => { try { localStorage.setItem('exporter', JSON.stringify(opt)); } catch { /* private mode */ } };
  const size = () => opt.size.split('x').map(Number);
  const bitrate = () => pictureBitrate(...size(), opt.fps, opt.level);
  const frame = () => clamp(Math.round(timeToFrame(player.time)), 1, LAST_FRAME);

  // what the browser can encode at this size: format → true / false; empty while it is being asked
  let support = {}, askedFor = '', encoder = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  /** The format the file will be in: the one asked for, or the other one if the browser cannot encode that. */
  const format = () => (support[opt.format] === false ? Object.keys(FORMATS).find((f) => support[f]) ?? null : opt.format);
  async function ask() {
    const key = `${opt.size}|${opt.fps}|${opt.level}`;
    if (!encoder || askedFor === key) return;
    askedFor = key;
    support = {};
    refresh();
    const [width, height] = size(), found = {};
    for (const f of Object.keys(FORMATS)) found[f] = await canMake({ width, height, format: f, bitrate: bitrate() });
    if (askedFor !== key) return;      // the choice moved on meanwhile
    support = found;
    refresh();
  }

  // ---- the work -----------------------------------------------------------------------------------
  let open = false, note = '', bad = false;
  let running = null;      // { stop, done, frames, since, sample }
  let result = null;       // the file that was made last: { name, url, bytes, … }
  const dropResult = () => { if (result) URL.revokeObjectURL(result.url); result = null; };

  /** `sample`: three seconds from the frame on the screen. `over`: other settings for this one file (the checking tools). */
  async function make(sample = false, over = {}) {
    if (running) return null;
    const o = tidy({ ...opt, ...over }), [width, height] = o.size.split('x').map(Number);
    const fmt = over.format ?? format();
    if (!fmt) return null;
    const from = over.from ?? (sample ? clamp(frame(), 1, LAST_FRAME - SAMPLE + 1) : 1), to = over.to ?? (sample ? from + SAMPLE - 1 : LAST_FRAME);
    dropResult();
    running = { stop: new AbortController(), done: 0, frames: frameCount(from, to, o.fps), since: performance.now(), sample };
    note = ''; bad = false;
    stageEl.classList.add('exporting');
    veil.hidden = false;
    refresh();
    let file = null;
    try {
      file = await filmFile(player, stage, {
        width, height, fps: o.fps, format: fmt, bitrate: over.bitrate ?? pictureBitrate(width, height, o.fps, o.level), sound: o.sound, from, to,
        signal: running.stop.signal,
        onProgress: (done) => { running.done = done; progress(); },
      });
      const name = fileName(TITLE.caption, file, sample);
      result = { ...file, name, url: URL.createObjectURL(file.blob), bytes: file.blob.size, from, to };
      const silent = !o.sound || file.sound ? '' : ` Файл без звука: ${noSound(file.soundError)}.`;
      note = `Готово за ${seconds(file.took)}.${silent} Если загрузка не началась сама — нажмите на имя файла.`;
    } catch (e) {
      if (e?.name === 'AbortError') note = 'Остановлено — файла нет.';
      else { note = `Не получилось: ${why(e)}.`; bad = true; console.error(e); }
    }
    running = null;
    veil.hidden = true;
    stageEl.classList.remove('exporting');
    touch();
    refresh();
    if (result && file) el.file.click();      // the browser takes the file as a download
    return file ? result : null;
  }
  function progress() {
    if (!running) return;
    const { done, frames, since } = running, spent = (performance.now() - since) / 1000;
    el.bar.value = Math.round((done / frames) * 1000);
    put(el.left, done < 1 ? 'готовлю…' : `кадр ${done} из ${frames}${done >= 8 && spent > 1.5 && done < frames ? ` · ещё ≈ ${seconds((spent / done) * (frames - done))}` : ''}`);
  }

  // ---- panel --------------------------------------------------------------------------------------
  const put = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  function refresh() {
    opener.classList.toggle('on', open);
    if (!open) return;
    const busy = !!running, fmt = format(), [width, height] = size();
    panel.classList.toggle('busy', busy);
    if (![...el.size.options].some((o) => o.value === opt.size)) option(el.size, opt.size, opt.size.replace('x', '×'));
    if (![...el.fps.options].some((o) => o.value === String(opt.fps))) option(el.fps, opt.fps, String(opt.fps));
    el.size.value = opt.size; el.fps.value = String(opt.fps); el.level.value = String(opt.level); el.sound.checked = opt.sound;
    for (const o of el.format.options) o.disabled = support[o.value] === false;
    el.format.value = fmt ?? opt.format;
    for (const node of [el.size, el.fps, el.level, el.format, el.sound]) node.disabled = busy;
    // which sound: said when it is not the film's own
    const which = SOUND.src === OWN_SOUND ? '' : `· ${SOUND.src.split('/').pop()}`;
    put(el.which, which);
    el.which.title = which ? `Музыка ролика — ${SOUND.src}: её ставит инструмент «Звук» (S)` : '';
    const frames = frameCount(1, LAST_FRAME, opt.fps), length = frames / opt.fps;
    const bytes = ((bitrate() + (opt.sound ? soundBitrate(fmt ?? opt.format) : 0)) * length) / 8;
    // the encoder is asked for so many bits a second and may stay below: a ceiling, not a promise
    put(el.sum, `${frames} кадров · ${decimal(length)} с · ${decimal(bitrate() / 1e6, bitrate() < 1e7 ? 1 : 0)} Мбит/с · до ≈ ${megabytes(bytes)}`);
    el.make.disabled = el.sample.disabled = busy || !encoder || !fmt || !Object.keys(support).length;
    el.run.hidden = !busy;
    if (busy) progress();
    const known = Object.keys(support).length > 0;
    let text = note;
    if (!encoder) text = NO_ENCODER;
    else if (!known) text = 'Спрашиваю браузер, что он умеет кодировать…';
    else if (!fmt) text = `В размере ${width}×${height} этот браузер видео не кодирует — выберите размер поменьше.`;
    else if (!note && fmt !== opt.format) text = `${FORMATS[opt.format].label} в таком размере этот браузер не кодирует — файл будет ${FORMATS[fmt].label}.`;
    el.msg.className = `msg${!busy && (bad || !encoder || (known && !fmt)) ? ' bad' : ''}`;
    put(el.msg, busy ? (running.sample ? 'Рисую пробу кадр за кадром…' : 'Рисую ролик кадр за кадром…') : text);
    el.got.hidden = !result || busy;
    if (result) {
      el.file.href = result.url;
      el.file.download = result.name;
      put(el.file, `${result.name} · ${megabytes(result.bytes)}`);
    }
    put(el.hint, HINT);
  }
  function setOpen(v) {
    if (running && !v) return;      // not while a file is being made
    open = v;
    toolOpen('exporter', v);      // the other tools close when this one opens
    panel.hidden = !v;
    if (v) ask();
    refresh();
  }
  function choose(values) {
    if (running) return;
    opt = tidy({ ...opt, ...values });
    note = ''; bad = false;
    keep();
    ask();
    refresh();
  }
  panel.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'close') setOpen(false);
    else if (a === 'make') make(false);
    else if (a === 'sample') make(true);
    else if (a === 'stop') running?.stop.abort();
  });
  panel.addEventListener('change', (e) => {
    const a = e.target.dataset.a;
    if (a === 'size') choose({ size: e.target.value });
    else if (a === 'fps') choose({ fps: Number(e.target.value) });
    else if (a === 'level') choose({ level: Number(e.target.value) });
    else if (a === 'format') choose({ format: e.target.value });
    else if (a === 'sound') choose({ sound: e.target.checked });
  });
  releaseKeys(panel);
  // keys pressed inside the panel are the panel's own (Space on «Стоп» does not start the film)
  panel.addEventListener('keydown', (e) => { if (e.code !== 'KeyV') e.stopPropagation(); });
  // while a file is being made the film answers to nothing: neither its own keys nor the other tools'
  window.addEventListener('keydown', (e) => {
    if (!running || panel.contains(e.target)) return;
    e.stopImmediatePropagation();
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !/^F\d+$/.test(e.code)) e.preventDefault();
  }, true);
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyV' || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    setOpen(!open);
  });
  // …and a file dropped onto the page then is not taken into a window or for the music
  for (const type of ['dragover', 'drop']) {
    window.addEventListener(type, (e) => {
      if (!running) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    }, true);
  }
  // another sound (src/sound.js was saved by hand): the panel names it
  window.addEventListener('sound-shown', () => refresh());
  // a page that is closed in the middle takes the unfinished file with it: the browser asks first
  window.addEventListener('beforeunload', (e) => { if (running) { e.preventDefault(); e.returnValue = ''; } });

  if (openNow) setOpen(true); else refresh();

  // for the checking tools (tools/exporttest.mjs)
  window.__exporter = {
    open: (v = true) => setOpen(v),
    make: (over = {}, sample = false) => make(sample, over),
    stop: () => running?.stop.abort(),
    file: () => result,
    state: () => ({
      open, running: running ? { done: running.done, frames: running.frames, sample: running.sample } : null, options: { ...opt }, format: format(), support: { ...support },
      note: el.msg.textContent, bad: el.msg.classList.contains('bad'), sum: el.sum.textContent, left: el.left.textContent, which: el.which.textContent,
      file: result ? { name: result.name, bytes: result.bytes, type: result.type, frames: result.frames, seconds: result.seconds, sound: result.sound, from: result.from, to: result.to } : null,
      veil: !veil.hidden, hold: !!player.hold,
    }),
  };
}
