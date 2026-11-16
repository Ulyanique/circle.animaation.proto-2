// Sound tool of the dev server — key S, or `?sound` in the address. The film's soundtrack (src/sound.js) is set on the
// page:
//   · a music file dropped from the computer onto the page (or «Загрузить…») goes to public/media/ and becomes the
//     soundtrack; the list offers the music that is already there, and the film's own sound;
//   · two strips show where the music lies under the film. The upper one is the film, second by second, with its cuts
//     and its flash marked: the music is dragged along it until an accent meets one. The lower one is the whole music
//     with the film's fifty seconds as a frame on it: the frame is put where the wanted piece is;
//   · loudness and the fades at both ends are sliders; «Сохранить» writes the settings' lines into src/sound.js.
// What sounds is what gets saved: the settings are kept in the form of the saved lines (soundLine.js), and the page's
// player follows every change at once (core/soundtrack.js) — as does a video file made meanwhile (filmFile.js).
// The dev server's side is soundServer.js. Loaded by main.js in dev mode only — not part of the build.

import { urlOf } from '../core/assets.js';
import { FILM_END, OWN_SOUND, gainAt, soundSettings } from '../core/soundSettings.js';
import { showSound, soundFile } from '../core/soundtrack.js';
import { DURATION, FPS, clamp } from '../core/util.js';
import { MAX_UPLOAD, safeName } from './mediaLine.js';
import { SOUND_FILE, soundBlock, soundEntries, tidySound } from './soundLine.js';
import { addStyle, audioDragged, claim, dropTool, hudButton, landed, megabytes, releaseKeys, takesMusic, tool, toolOpen } from './panel.js';

const FILM_H = 58, GAP = 8, MUSIC_H = 26;      // the two strips, CSS px
const PER = 100;                               // loudness values kept per second of music
const MAX_DECODE = 200 * 2 ** 20;              // a larger file is not decoded for its picture
const FLASH = 974;                             // the frame the flash is brightest at (shots/s17.js)

const CSS = `
#sounder .strips { position: relative; margin: 8px 0 4px; height: ${FILM_H + GAP + MUSIC_H}px; touch-action: none; }
#sounder .strips canvas { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 6px; }
#sounder .strips i { position: absolute; width: 1px; background: #fff; pointer-events: none; }
#sounder .strips i.film { top: 0; height: ${FILM_H}px; }
#sounder .strips i.music { top: ${FILM_H + GAP}px; height: ${MUSIC_H}px; }
#sounder .strips .a, #sounder .strips .b { position: absolute; left: 0; right: 0; }
#sounder .strips .a { top: 0; height: ${FILM_H}px; cursor: ew-resize; }
#sounder .strips .b { top: ${FILM_H + GAP}px; height: ${MUSIC_H}px; cursor: pointer; }
#sounder .vals { margin: 0 0 6px; font-variant-numeric: tabular-nums; color: #f1d79a; min-height: 1.45em; }
#sounder label.sl span { width: 78px; flex: none; }
#sounder label.nm { cursor: default; }
#sounder label.nm span { flex: 1; color: #a48a55; }
#sounder input[type=number] {
  width: 76px; flex: none; font: inherit; color: #f6e2ae; background: #1c170d; border: 1px solid rgba(201, 164, 90, 0.3);
  border-radius: 8px; padding: 3px 6px; user-select: text; font-variant-numeric: tabular-nums;
}
#sounder input[type=number]:focus { outline: none; border-color: #f1d79a; }
#sounder output { width: 44px; flex: none; text-align: right; color: #f1d79a; font-variant-numeric: tabular-nums; }
#sounder header b i { font-style: normal; font-weight: normal; color: #ffcf6a; }
#sounder.hot { border-color: #fff; }
`;

const ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6.2 11.6V3.8l6-1.3v7.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="4.6" cy="11.7" rx="1.7" ry="1.4" fill="currentColor"/><ellipse cx="10.6" cy="10.2" rx="1.7" ry="1.4" fill="currentColor"/></svg>';
const HTML = `
<header><b>Звук<i></i></b><button data-a="close" title="Закрыть (S)" aria-label="Закрыть">×</button></header>
<div class="file"><select data-a="src" title="Что звучит: дорожка ролика или музыка из public/media/" aria-label="Музыка"></select><button data-a="pick" title="Музыка с компьютера — в public/media/">Загрузить…</button>
<input type="file" hidden accept=".mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac,audio/*"></div>
<div class="strips"><canvas aria-hidden="true"></canvas><i class="film"></i><i class="music"></i>
<div class="a" title="Ролик по секундам. Белые риски — склейки, золотая — вспышка перед названием. Потяните музыку вбок, чтобы акцент попал на риску (с Shift — точнее). Щелчок ставит ролик на это место."></div>
<div class="b" title="Вся музыка; рамка — то, что слышно в ролике. Поставьте рамку на нужное место."></div></div>
<p class="vals"></p>
<label class="nm"><span>ролик начинается с секунды музыки</span><input type="number" data-a="start" step="0.05" aria-label="С какой секунды музыки начинается ролик"></label>
<label class="sl"><span>громкость</span><input type="range" data-a="volume" min="0" max="1" step="0.01" aria-label="Громкость"><output></output></label>
<label class="sl"><span>нарастание</span><input type="range" data-a="fadeIn" min="0" max="10" step="0.1" aria-label="Нарастание в начале, секунд"><output></output></label>
<label class="sl"><span>затихание</span><input type="range" data-a="fadeOut" min="0" max="10" step="0.1" aria-label="Затихание к концу, секунд"><output></output></label>
<pre></pre>
<div class="acts main"><button data-a="save">Сохранить в sound.js</button><button data-a="copy">Скопировать</button><button data-a="undo" title="Как в файле">Вернуть</button></div>
<div class="acts small"><button data-a="head" title="Проиграть ролик с первого кадра">с начала</button><button data-a="tail" title="Проиграть последние секунды: как музыка уходит">конец ролика</button></div>
<p class="msg" aria-live="polite"></p>
<p class="hint"></p>
`;

const READ_ONLY = 'Запись выключена: она работает по адресу localhost на том компьютере, где запущен сервер. Блок можно скопировать в src/sound.js.';
/** What the dev server answered, in the page's language. */
const why = (error) => (error === 'read-only' ? 'запись выключена'
  : /^no such music/.test(error) ? 'такого файла нет в public/media/'
    : /^src\/sound\.js/.test(error) ? 'src/sound.js написан не так, как его умеет менять инструмент: каждая настройка должна стоять на своей строке'
      : error);

const comma = (v, digits = 1) => v.toFixed(digits).replace('.', ',');
/** Seconds as the eye reads them: 7,5 с — 1:45,3 */
const clock = (s) => (s < 60 ? `${comma(s)} с` : `${Math.floor(s / 60)}:${comma(s % 60).padStart(4, '0')}`);

/**
 * How loud a music file is, moment by moment: { peak, power, seconds } — the largest sample and the mean square of
 * every 1/PER s. Decoded by the browser at a low rate: the picture of a waveform needs no more (a drum's stroke is
 * still a stroke at 16 kHz), and it is a third of the memory.
 */
async function loudness(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  if (Number(res.headers.get('content-length')) > MAX_DECODE) throw new Error('too large');
  const Context = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  let context;
  try { context = new Context(1, 1, 16000); } catch { context = new Context(1, 1, 44100); }      // (a browser that has no such low rate)
  const audio = await context.decodeAudioData(await res.arrayBuffer());
  const step = audio.sampleRate / PER, n = Math.ceil(audio.length / step), peak = new Float32Array(n), power = new Float32Array(n);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const x = audio.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const from = Math.floor(i * step), end = Math.min(x.length, Math.floor((i + 1) * step));
      let most = peak[i], sum = 0;
      for (let j = from; j < end; j++) { const v = x[j] < 0 ? -x[j] : x[j]; if (v > most) most = v; sum += v * v; }
      peak[i] = most;
      if (end > from) power[i] += sum / (end - from) / audio.numberOfChannels;
    }
  }
  return { peak, power, seconds: audio.duration };
}

export function startSounder(player, openNow = false) {
  addStyle(CSS);
  const stageEl = document.getElementById('stage');
  const panel = Object.assign(document.createElement('div'), { id: 'sounder', hidden: true, innerHTML: HTML });
  stageEl.append(panel);
  const TIP = 'Своя музыка в ролике: звук (S)';
  const opener = hudButton('sounder-open', TIP, 'Звук: своя музыка', ICON, () => setOpen(!open, true));
  tool('sounder', () => setOpen(false));
  const $ = (q) => panel.querySelector(q);
  const el = {
    mark: $('header i'), src: $('[data-a=src]'), pick: $('[data-a=pick]'), input: $('input[type=file]'),
    strips: $('.strips'), canvas: $('canvas'), a: $('.strips .a'), b: $('.strips .b'), atFilm: $('i.film'), atMusic: $('i.music'), vals: $('.vals'),
    start: $('[data-a=start]'), volume: $('[data-a=volume]'), fadeIn: $('[data-a=fadeIn]'), fadeOut: $('[data-a=fadeOut]'), block: $('pre'),
    save: $('[data-a=save]'), undo: $('[data-a=undo]'), msg: $('.msg'), hint: $('.hint'),
  };
  // the film's cuts, seconds: where a shot begins that the film does not fly into without a seam (shots/index.js)
  const seamless = new Set(player.links.map((l) => l.at));
  const cuts = player.shots.map((s) => s.range[0]).filter((f) => f > 1 && !seamless.has(f)).map((f) => (f - 1) / FPS);
  const flash = (FLASH - 1) / FPS;

  const lines = (raw) => JSON.stringify(soundEntries(raw));
  let file = tidySound(soundFile.raw);      // what src/sound.js says
  let now = { ...file };                    // what the tool has, and the page plays
  const dirty = () => lines(now) !== lines(file);
  let server = { files: [], write: false, max: MAX_UPLOAD };
  let open = false, note = '', bad = false, listKey = '', drawn = '', span = null, stripW = 0;
  let sending = null;                       // what is on its way into the file
  let wave = null;                          // { src, peak, power, seconds } | { src, failed } | { src } while it is being read

  // ---- the music itself ---------------------------------------------------------------------------
  /** The music's length in seconds, or null while nobody knows. */
  const length = () => (wave?.src === now.src && wave.seconds ? wave.seconds : Number.isFinite(player.audio?.duration) && player.audio.duration > 0 ? player.audio.duration : null);
  /** Reads the music for its picture (again, if the file was replaced under its name). */
  function look(anew = false) {
    if (!open || (wave?.src === now.src && !anew)) return;
    const src = now.src, mine = (wave = { src });
    loudness(urlOf(src)).then((got) => { if (wave === mine) wave = { src, ...got }; }, () => { if (wave === mine) wave = { src, failed: true }; }).then(refresh);
  }
  const keep = (key, value) => { try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch { /* private mode */ } };
  // what is not saved yet lives through a page that loads again — as long as the file is what it was
  const remember = () => keep('sounder', JSON.stringify({ open, now: dirty() ? now : null, base: lines(file) }));
  /** Other values for some of the settings: the page plays them at once. `anew`: the file itself is another one now. */
  function edit(values, text = '', anew = false) {
    now = tidySound({ ...now, ...values });
    note = text; bad = false;
    showSound(now, anew);
    look(anew);
    remember();
    refresh();
  }
  /** The furthest the music can be moved either way: a second of it stays under the film. */
  const bounds = () => [1 - FILM_END, Math.max(0, (length() ?? 3600) - 1)];
  const moveTo = (start) => { const [lo, hi] = bounds(); edit({ start: clamp(start, lo, hi) }); };

  // ---- the dev server ---------------------------------------------------------------------------
  const api = (rest = '') => new URL(`__sound${rest}`, document.baseURI);
  const ask = () => fetch(api()).then((res) => (res.ok ? res.json() : null)).then((data) => { if (data) server = data; }).catch(() => {}).then(refresh);
  async function save() {
    if (!dirty()) return;
    const sent = tidySound(now);
    say('Сохраняю…');
    sending = sent;      // the file's change may come back to the page before the answer does (soundFile.changed below)
    let out;
    try {
      const res = await fetch(api(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: sent }) });
      const data = await res.json().catch(() => ({}));
      out = res.ok && data.ok ? data : { error: why(data.error || `ответ ${res.status}`) };
    } catch (e) { out = { error: e.message }; }
    sending = null;
    if (out.error) return say(`Сохранить не удалось (${out.error}). Блок можно скопировать и вставить в src/sound.js.`, true);
    file = sent;
    remember();
    say('Сохранено в src/sound.js.');
  }
  async function upload(picked, more = 0) {
    if (!server.write) return say(READ_ONLY, true);
    const name = safeName(picked.name, SOUND_FILE);
    if (!name) return say(`«${picked.name}» музыкой не поставить: нужен звуковой файл — MP3, M4A, WAV, OGG, Opus или FLAC.`, true);
    if (picked.size > server.max) return say(`Файл больше ${Math.round(server.max / 2 ** 20)} МБ — возьмите MP3 или M4A вместо WAV.`, true);
    say(`Загружаю ${name}…`);
    let data;
    try {
      const res = await fetch(api(`/file?name=${encodeURIComponent(name)}`), { method: 'POST', body: picked });
      data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(why(data.error || `ответ ${res.status}`));
    } catch (e) { return say(`Загрузить не удалось (${e.message}).`, true); }
    await Promise.all([ask(), landed(`media/${data.name}`)]);      // (the dev server needs a moment before it serves a new file)
    const what = [data.replaced && 'заменил прежний файл с этим именем', more && 'из нескольких файлов взят первый'].filter(Boolean);
    // (a file of this name may have sounded before: it is read again)
    edit({ src: `media/${data.name}`, start: 0 }, `${data.name} — музыка ролика${what.length ? ` (${what.join('; ')})` : ''}.`, true);
  }

  // ---- the strips -----------------------------------------------------------------------------------
  const heard = [0, 0];
  /**
   * The music between its seconds m0 and m1: its largest sample and its level (root mean square), 0…1, left in
   * `heard`. False where there is no music.
   */
  function loud(m0, m1, total) {
    if (m1 <= 0 || m0 >= total) return false;
    heard[0] = 0.5; heard[1] = 0.5;      // not read (yet): a plain band shows where the music lies
    if (!wave?.peak || wave.src !== now.src) return true;
    const from = Math.max(0, Math.floor(m0 * PER)), end = Math.min(wave.peak.length, Math.max(from + 1, Math.ceil(m1 * PER)));
    let most = 0, sum = 0;
    for (let i = from; i < end; i++) { if (wave.peak[i] > most) most = wave.peak[i]; sum += wave.power[i]; }
    heard[0] = Math.min(1, most); heard[1] = end > from ? Math.min(1, Math.sqrt(sum / (end - from))) : 0;
    return true;
  }
  /** What the lower strip spans, in seconds of music: the whole music and the whole film, wherever they lie. */
  const musicSpan = (total) => span ?? [Math.min(0, now.start), Math.max(total, now.start + FILM_END)];
  function draw() {
    const width = (stripW = el.strips.clientWidth), total = length() ?? FILM_END + Math.max(0, now.start), ratio = Math.min(3, window.devicePixelRatio || 1);
    const [b0, b1] = musicSpan(total), set = soundSettings(now);
    const key = JSON.stringify([width, ratio, now, total, b0, b1, wave?.src === now.src && (wave.peak ? 1 : wave.failed ? 2 : 0)]);
    if (key === drawn || width < 2) return;
    drawn = key;
    const c = el.canvas, cols = Math.round(width * ratio), g = c.getContext('2d');
    if (c.width !== cols || c.height !== Math.round((FILM_H + GAP + MUSIC_H) * ratio)) { c.width = cols; c.height = Math.round((FILM_H + GAP + MUSIC_H) * ratio); }
    g.clearRect(0, 0, c.width, c.height);
    const top = Math.round((FILM_H + GAP) * ratio), hA = Math.round(FILM_H * ratio), hB = c.height - top;
    g.fillStyle = 'rgba(0, 0, 0, 0.45)';
    g.fillRect(0, 0, cols, hA); g.fillRect(0, top, cols, hB);
    // a column of a waveform: the largest sample dim, the level bright over it
    const column = (x, mid, half, gain, dim, bright) => {
      const h = Math.max(1, Math.round(heard[0] * gain * half)), body = Math.max(1, Math.round(heard[1] * gain * half));
      g.fillStyle = dim; g.fillRect(x, mid - h, 1, 2 * h);
      g.fillStyle = bright; g.fillRect(x, mid - body, 1, 2 * body);
    };
    // the film: what is heard at each of its moments, as loud as it will be
    for (let x = 0; x < cols; x++) {
      const t0 = (x / cols) * FILM_END, t1 = ((x + 1) / cols) * FILM_END;
      if (loud(t0 + now.start, t1 + now.start, total)) column(x, Math.round(hA / 2), hA / 2 - 2 * ratio, gainAt((t0 + t1) / 2, set), 'rgba(201, 164, 90, 0.5)', '#f1d79a');
    }
    const line = Math.max(1, Math.round(ratio));
    g.fillStyle = 'rgba(255, 255, 255, 0.6)';
    for (const t of cuts) g.fillRect(Math.round((t / FILM_END) * cols), 0, line, hA);
    // the flash: the film's one loud moment — a gold line with a head
    const xf = Math.round((flash / FILM_END) * cols);
    g.fillStyle = '#ffcf6a';
    g.fillRect(xf, 0, line, hA);
    g.beginPath(); g.moveTo(xf - 4 * ratio, 0); g.lineTo(xf + line + 4 * ratio, 0); g.lineTo(xf + line / 2, 6 * ratio); g.closePath(); g.fill();
    // the music: all of it, and the film's frame on it
    const x0 = ((now.start - b0) / (b1 - b0)) * cols, x1 = ((now.start + FILM_END - b0) / (b1 - b0)) * cols;
    for (let x = 0; x < cols; x++) {
      const m0 = b0 + (x / cols) * (b1 - b0), m1 = b0 + ((x + 1) / cols) * (b1 - b0), inside = x + 1 > x0 && x < x1;
      if (loud(m0, m1, total)) column(x, top + Math.round(hB / 2), hB / 2 - 2 * ratio, 1, inside ? 'rgba(201, 164, 90, 0.5)' : 'rgba(201, 164, 90, 0.22)', inside ? '#f1d79a' : 'rgba(201, 164, 90, 0.5)');
    }
    g.strokeStyle = '#f6e2ae'; g.lineWidth = line;
    g.strokeRect(Math.round(x0) + g.lineWidth / 2, top + g.lineWidth / 2, Math.max(2, Math.round(x1 - x0) - g.lineWidth), hB - g.lineWidth);
  }
  /** The film's moment on both strips. */
  let handsAt = '';
  function hands() {
    const total = length() ?? FILM_END + Math.max(0, now.start), [b0, b1] = musicSpan(total), t = Math.min(player.time, DURATION);
    const a = ((t / FILM_END) * stripW).toFixed(1), b = (((t + now.start - b0) / (b1 - b0)) * stripW).toFixed(1);
    if (handsAt === `${a} ${b}`) return;
    handsAt = `${a} ${b}`;
    el.atFilm.style.left = `${a}px`;
    el.atMusic.style.left = `${b}px`;
  }
  // the upper strip: the music is dragged under the film; a click puts the film there
  let grab = null;
  el.a.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    el.a.setPointerCapture(e.pointerId);
    grab = { x: e.clientX, start: now.start, moved: false };
  });
  el.a.addEventListener('pointermove', (e) => {
    if (!grab) return;
    const dx = e.clientX - grab.x;
    if (!grab.moved && Math.abs(dx) < 3) return;
    grab.moved = true;
    // the music goes where the hand goes: to the right — it comes in later
    moveTo(grab.start - (dx / el.strips.clientWidth) * FILM_END * (e.shiftKey ? 0.1 : 1));
  });
  const letGo = (e) => {
    if (!grab) return;
    if (!grab.moved && e.type === 'pointerup') player.seek(Math.min(DURATION, clamp((e.clientX - el.strips.getBoundingClientRect().left) / el.strips.clientWidth, 0, 1) * FILM_END));
    grab = null;
  };
  el.a.addEventListener('pointerup', letGo);
  el.a.addEventListener('pointercancel', letGo);
  // the lower strip: the film's frame is put on the music — taken where it is, or brought under the hand
  let frame = null;
  el.b.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    el.b.setPointerCapture(e.pointerId);
    const total = length() ?? FILM_END + Math.max(0, now.start);
    span = musicSpan(total);      // the strip keeps its scale while the frame is being moved
    const at = span[0] + ((e.clientX - el.strips.getBoundingClientRect().left) / el.strips.clientWidth) * (span[1] - span[0]);
    const inside = at >= now.start && at <= now.start + FILM_END;
    frame = { x: e.clientX, start: inside ? now.start : at - FILM_END / 2 };
    if (!inside) moveTo(frame.start);
  });
  el.b.addEventListener('pointermove', (e) => {
    if (frame) moveTo(frame.start + ((e.clientX - frame.x) / el.strips.clientWidth) * (span[1] - span[0]));
  });
  const drop = () => { if (frame) { frame = null; span = null; refresh(); } };
  el.b.addEventListener('pointerup', drop);
  el.b.addEventListener('pointercancel', drop);

  // ---- panel ----------------------------------------------------------------------------------
  let wasOn = player.sound;
  /** The tool turns the sound on: it is there to be listened to. */
  const soundOn = () => { if (!player.sound) player.setSound(true); wasOn = true; };
  const put = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  function say(text, isBad = false) { note = text; bad = isBad; refresh(); }
  function fillList() {
    const key = JSON.stringify([now.src, server.files]);
    if (key === listKey) return;
    listKey = key;
    el.src.textContent = '';
    const add = (value, label) => el.src.appendChild(Object.assign(document.createElement('option'), { value, textContent: label }));
    add(OWN_SOUND, 'звук исходного ролика');
    if (now.src !== OWN_SOUND && !server.files.some((f) => `media/${f.name}` === now.src)) add(now.src, now.src);
    for (const f of server.files) add(`media/${f.name}`, `${f.name} · ${megabytes(f.size)}`);
    el.src.value = now.src;
  }
  /** Where the music lies under the film, in words. */
  function where() {
    const total = length(), s = now.start;
    if (total === null) return wave?.failed ? '' : 'читаю музыку…';
    const out = [`музыка ${clock(total)}`];
    if (s < 0) out.push(`вступает на ${comma(-s)} с ролика`);
    if (total - s < FILM_END - 0.05) out.push(`кончается на ${comma(total - s)} с ролика`);
    else if (s > 0) out.push(`в ролике — с ${clock(s)} по ${clock(s + FILM_END)}`);
    return out.join(' · ');
  }
  function refresh() {
    const unsaved = dirty();
    // the film may be sounding as the file does not say: the button tells, also while the panel is closed
    opener.classList.toggle('unsaved', unsaved);
    opener.title = unsaved ? `${TIP} — есть несохранённые изменения` : TIP;
    opener.classList.toggle('on', open);
    if (!open) return;
    put(el.mark, unsaved ? ' · не сохранено' : '');
    fillList();
    if (document.activeElement !== el.start) el.start.value = String(now.start);
    for (const [k, text] of [['volume', `${Math.round(now.volume * 100)} %`], ['fadeIn', `${comma(now.fadeIn)} с`], ['fadeOut', `${comma(now.fadeOut)} с`]]) {
      if (el[k].value !== String(now[k])) el[k].value = String(now[k]);
      put(el[k].nextElementSibling, text);
    }
    put(el.vals, where());
    put(el.block, soundBlock(now));
    el.save.disabled = !server.write || !unsaved;
    el.undo.disabled = !unsaved;
    el.pick.disabled = !server.write;
    put(el.hint, server.write ? 'Музыку можно перетащить на страницу: MP3, M4A, WAV, OGG, Opus, FLAC. Она попадёт и в видеофайл (V).' : 'Музыка кладётся в public/media/ — и выбирается в списке.');
    // (a file the browser cannot play is the first thing to know, whatever else there is to say)
    const mute = player.audio?.error ? `«${now.src}» этот браузер не проигрывает: файла нет на месте или формат ему незнаком. Надёжнее всего MP3 и M4A.` : '';
    el.msg.className = `msg${mute || bad ? ' bad' : ''}`;
    put(el.msg, mute || note || (wave?.src === now.src && wave.failed ? 'Картинку звука построить не удалось — файл слишком велик или необычен. На слух это не влияет.'
      : !player.sound ? 'Звук выключен — клавиша M.' : unsaved && !server.write ? READ_ONLY : ''));
    draw();
    hands();
  }
  /** `byHand`: the user opened it — with a key or a click, so the browser lets the sound be turned on. */
  function setOpen(v, byHand = false) {
    open = v;
    toolOpen('sounder', v);      // another tool closes when this one opens
    panel.hidden = !v;
    if (v && byHand) soundOn();
    if (v) { ask(); look(); }
    remember();
    refresh();
  }
  async function copy() {
    const text = el.block.textContent;
    try { await navigator.clipboard.writeText(text); say('Блок скопирован: замените им export default { … } в src/sound.js.'); } catch {
      const range = document.createRange();
      range.selectNodeContents(el.block);
      getSelection().removeAllRanges(); getSelection().addRange(range);
      say('Блок выделен — нажмите Ctrl + C.');
    }
  }
  panel.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'close') setOpen(false);
    else if (a === 'save') save();
    else if (a === 'copy') copy();
    else if (a === 'pick') el.input.click();
    else if (a === 'undo') edit({ ...file }, 'Возвращено как в файле.');
    else if (a === 'head' || a === 'tail') {
      // to be heard: these two are for the ear
      soundOn();
      player.seek(a === 'head' ? 0 : Math.max(0, DURATION - Math.max(4, now.fadeOut + 2)));
      player.play();
      say('');
    }
  });
  panel.addEventListener('input', (e) => {
    const a = e.target.dataset.a;
    if (a === 'start') { if (e.target.value.trim() !== '' && Number.isFinite(Number(e.target.value))) moveTo(Number(e.target.value)); }
    else if (a === 'volume' || a === 'fadeIn' || a === 'fadeOut') edit({ [a]: Number(e.target.value) });
  });
  panel.addEventListener('change', (e) => {
    const a = e.target.dataset.a;
    if (e.target === el.input) {
      const picked = el.input.files[0];
      el.input.value = '';
      if (picked) upload(picked);
    } else if (a === 'src') { listKey = ''; edit({ src: e.target.value, start: 0 }); }      // another music: from its beginning
    else if (a === 'start') { el.start.value = String(now.start); refresh(); }           // the field is left: the number as it will be written
  });
  releaseKeys(panel);
  const field = (node) => /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName) && node.type !== 'range';
  const SLIDER_KEY = /^(Arrow|Home|End|Page)/;
  // keys pressed inside the panel are the panel's own (an arrow in the number's field does not move the film)
  panel.addEventListener('keydown', (e) => {
    if ((e.code === 'Enter' || e.code === 'Escape') && e.target.type === 'number') e.target.blur();
    // a slider that was dragged keeps the keyboard for its arrows; any other key is the film's or a tool's as ever
    if (e.target.type === 'range' && !SLIDER_KEY.test(e.code)) return;
    if (e.code !== 'KeyS' || field(e.target)) e.stopPropagation();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyS' || e.ctrlKey || e.metaKey || e.altKey || field(e.target)) return;
    setOpen(!open, true);
  });

  // ---- music dropped from the computer: while this tool is open, or — a sound file — while none is ----------------
  const carriesFile = (e) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files') && (dropTool() === 'sounder' || (!dropTool() && audioDragged(e)));
  window.addEventListener('dragover', (e) => {
    if (!carriesFile(e)) return;
    e.preventDefault();      // or the browser would open the file in place of the page
    e.dataTransfer.dropEffect = server.write ? 'copy' : 'none';
    if (!open) setOpen(true);
    panel.classList.add('hot');
  });
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) panel.classList.remove('hot'); });
  /** A file from the computer is to be the music: the tool opens, the sound comes on. */
  const take = (picked, more = 0) => {
    if (!open) setOpen(true);
    soundOn();
    return upload(picked, more);
  };
  window.addEventListener('drop', (e) => {
    panel.classList.remove('hot');
    if (!carriesFile(e) || !claim(e)) return;
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length) take(files[0], files.length - 1);
  });
  takesMusic(take);      // …and music dropped on another tool comes here as well (panel.js: offerMusic)

  // ---- what happens outside the panel -------------------------------------------------------------
  // src/sound.js was saved. By this tool: nothing new. By hand: the file is right — the sound and the panel follow it
  soundFile.changed = (raw) => {
    const next = tidySound(raw);
    if (lines(next) === lines(file) || (sending && lines(next) === lines(sending))) { file = next; remember(); return refresh(); }
    file = next; now = { ...next };
    note = 'src/sound.js изменился — звучит то, что в файле.'; bad = false;
    showSound(raw);
    look();
    remember();
    refresh();
  };
  // the music's length is known now — or that the browser cannot play it
  for (const type of ['durationchange', 'loadedmetadata', 'error', 'emptied']) player.audio?.addEventListener(type, () => { drawn = ''; refresh(); });
  window.addEventListener('resize', refresh);
  (function tick() {
    if (open) {
      hands();
      // the sound was turned on or off (key M, the button in the bar): that is what the panel has to say now
      if (player.sound !== wasOn) { wasOn = player.sound; note = ''; bad = false; refresh(); }
    }
    requestAnimationFrame(tick);
  })();

  let stored = null;
  try { stored = JSON.parse(sessionStorage.getItem('sounder') || 'null'); } catch { /* private mode */ }
  if (stored?.now && stored.base === lines(file) && lines(stored.now) !== lines(file)) { now = tidySound(stored.now); showSound(now); }
  const asked = ask();
  if (openNow || stored?.open) setOpen(true); else refresh();

  // for the checking tools (tools/soundtest.mjs)
  window.__sounder = {
    open: (v = true) => setOpen(v, true), asked,
    set: (values) => edit(values),      // as if set in the panel
    state: () => ({
      open, now: tidySound(now), file, unsaved: dirty(), block: el.block.textContent, note: el.msg.textContent, vals: el.vals.textContent, bad: el.msg.classList.contains('bad'),
      write: server.write, files: server.files.map((f) => f.name), length: length(), cuts: cuts.map((t) => Math.round(t * FPS) + 1), flash: FLASH,
      wave: wave?.src !== now.src ? null : wave.peak ? { values: wave.peak.length, seconds: wave.seconds, most: wave.peak.reduce((a, b) => Math.max(a, b), 0) } : wave.failed ? 'failed' : 'reading',
    }),
  };
}
