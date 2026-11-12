// Title tool of the dev server — key T, or `?title` in the address. The final title (src/brand.js) is set on the page:
//   · the caption and the second line are typed, and the film shows them as they are typed;
//   · a logo dropped from the computer onto the page (or «Загрузить…») goes to public/media/ and stands for the
//     emblem; the list offers the pictures that are already there;
//   · «Сохранить» writes the settings' lines into src/brand.js.
// What is on the screen is what gets saved: the settings are kept in the form of the saved lines (brandLine.js).
// The title is built anew under the running film (fx/title.js, shots/s17.js) — the page is not loaded again.
// In a window that is wide enough the panel stands beside the film, not over it: the title is there to be seen whole.
// The dev server's side is brandServer.js. Loaded by main.js in dev mode only — not part of the build.

import { brandFile, showTitle, titleScale, TITLE, TITLE_CENTRE } from '../fx/title.js';
import { pageNames, titleSettings } from '../fx/titleSettings.js';
import { VIDEO_H, FPS, LAST_FRAME, clamp, timeToFrame } from '../core/util.js';
import { MAX_UPLOAD, safeName } from './mediaLine.js';
import { EMBLEM_FILE, MAX_TEXT, brandBlock, brandEntries, tidyBrand } from './brandLine.js';
import { addStyle, hudButton, megabytes, openTool, releaseKeys, tool, toolOpen } from './panel.js';

const FROM = 963, DONE = 1060, STILL = 1100;      // the title's shot begins; both lines have come; the frame to judge it by
const UNDER = 1.6;                                // above this the letters do not grow while something stands over them (fx/title.js)
const BESIDE = 358, WIDE = 760;                   // the panel with the gaps around it; the width of a window that has that much to spare

const CSS = `
#titler label.tx { cursor: default; }
#titler label.tx span, #titler label.sl span { width: 100px; flex: none; color: #a48a55; }
#titler input[type=text] {
  flex: 1; min-width: 0; font: inherit; color: #f6e2ae; background: #1c170d; border: 1px solid rgba(201, 164, 90, 0.3);
  border-radius: 8px; padding: 4px 7px; user-select: text;
}
#titler input[type=text]:focus { outline: none; border-color: #f1d79a; }
#titler input[type=text]::placeholder { color: #6f5f3d; }
#titler output { width: 30px; flex: none; text-align: right; color: #f1d79a; font-variant-numeric: tabular-nums; }
#titler header b i { font-style: normal; font-weight: normal; color: #ffcf6a; }
#titler p.warn { color: #ffcf6a; font-size: 12px; }
#titler.hot { border-color: #fff; }
#titler.beside { right: ${14 - BESIDE}px; }
`;

const ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 5.3V3.5h9v1.8M8 3.5v9M6 12.5h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const HTML = `
<header><b>Титр<i></i></b><button data-a="close" title="Закрыть (T)" aria-label="Закрыть">×</button></header>
<label class="tx"><span>подпись</span><input type="text" data-a="caption" maxlength="${MAX_TEXT}" spellcheck="false" autocomplete="off" placeholder="без подписи"></label>
<label class="tx"><span>вторая строка</span><input type="text" data-a="tagline" maxlength="${MAX_TEXT}" spellcheck="false" autocomplete="off" placeholder="например: архитектурное бюро"></label>
<label class="sl"><span>размер букв</span><input type="range" data-a="size" min="0.5" max="3" step="0.05" aria-label="Размер букв"><output></output></label>
<div class="file"><select data-a="emblem" title="Что стоит над подписью: циркуль или картинка из public/media/" aria-label="Эмблема"></select><button data-a="pick" title="Логотип с компьютера — в public/media/ и в титр">Загрузить…</button>
<input type="file" hidden accept=".svg,.png,.webp,.avif,.gif,.jpg,.jpeg,image/svg+xml,image/png,image/webp,image/avif,image/gif,image/jpeg"></div>
<div class="pic">
<label class="sl"><span>размер эмблемы</span><input type="range" data-a="emblemSize" min="0.2" max="3" step="0.05" aria-label="Размер эмблемы"><output></output></label>
<label class="sl"><span>цвет эмблемы</span><select data-a="gold" aria-label="Цвет эмблемы"><option value="auto">золото, если она чёрная</option><option value="gold">залить золотом</option><option value="own">свои цвета</option></select></label>
</div>
<label><input type="checkbox" data-a="ring"> круг света вокруг эмблемы</label>
<label class="tx"><span>имя вкладки</span><input type="text" data-a="name" maxlength="${MAX_TEXT}" spellcheck="false" autocomplete="off"></label>
<pre></pre>
<div class="acts main"><button data-a="save">Сохранить в brand.js</button><button data-a="copy">Скопировать</button><button data-a="undo" title="Как в файле">Вернуть</button></div>
<div class="acts small"><button data-a="intro" title="Проиграть, как титр появляется">показать появление</button><button data-a="still" title="Готовый титр, на паузе">готовый титр</button></div>
<p class="msg" aria-live="polite"></p>
<p class="warn" aria-live="polite"></p>
<p class="hint"></p>
`;

const READ_ONLY = 'Запись выключена: она работает по адресу localhost на том компьютере, где запущен сервер. Блок можно скопировать в src/brand.js.';
/** What the dev server answered, in the page's language. */
const why = (error) => (error === 'read-only' ? 'запись выключена'
  : /^no such picture/.test(error) ? 'такой картинки нет в public/media/'
    : /^src\/brand\.js/.test(error) ? 'src/brand.js написан не так, как его умеет менять инструмент: каждая настройка должна стоять на своей строке'
      : error);

/** `reserve(px)`: main.js keeps that much of the window's right side free of the film. */
export function startTitler(player, stage, openNow = false, reserve = () => {}) {
  addStyle(CSS);
  const stageEl = document.getElementById('stage');
  const panel = Object.assign(document.createElement('div'), { id: 'titler', hidden: true, innerHTML: HTML });
  stageEl.append(panel);
  const TIP = 'Своё название и логотип в финале: титр (T)';
  const opener = hudButton('titler-open', TIP, 'Титр: название и логотип', ICON, () => setOpen(!open, true));
  tool('titler', () => setOpen(false));
  const $ = (q) => panel.querySelector(q);
  const el = {
    mark: $('header i'), caption: $('[data-a=caption]'), tagline: $('[data-a=tagline]'), name: $('[data-a=name]'),
    size: $('[data-a=size]'), emblem: $('[data-a=emblem]'), pick: $('[data-a=pick]'), input: $('input[type=file]'), pic: $('.pic'),
    emblemSize: $('[data-a=emblemSize]'), gold: $('[data-a=gold]'), ring: $('[data-a=ring]'), block: $('pre'),
    save: $('[data-a=save]'), undo: $('[data-a=undo]'), msg: $('.msg'), warn: $('.warn'), hint: $('.hint'),
  };
  const TEXT = ['caption', 'tagline', 'name'];

  const frame = () => clamp(timeToFrame(player.time), 1, LAST_FRAME);
  const lines = (raw) => JSON.stringify(brandEntries(raw));
  let file = tidyBrand(brandFile.raw);      // what src/brand.js says
  let now = { ...file };                    // what the tool shows; the texts as they are typed
  const dirty = () => lines(now) !== lines(file);
  let server = { files: [], write: false, max: MAX_UPLOAD };
  let open = false, note = '', bad = false, due = 0, cost = 0, anew = false, listKey = '', seen = '';
  let sending = null;                       // what is on its way into the file
  let info = window.__title?.info ?? null, shownFor = TITLE;      // what the title on the screen says of itself, and the settings it was built for

  // ---- the film ---------------------------------------------------------------------------------
  const seekTo = (f) => player.seek((f - 1) / FPS);
  /** The finished title on the screen, paused: what is being set has to be seen. */
  function seeTitle() {
    player.pause();
    if (frame() < DONE) seekTo(STILL);
  }
  /**
   * Shows the title as the tool has it. At once — unless building it takes long (a long line at a size it was not
   * yet made at): then when the typing, or the slider, pauses; the field itself must never lag behind the keys.
   */
  function show() {
    const slow = cost > 40;
    if (due && !slow) return;
    clearTimeout(due);
    due = setTimeout(() => {
      due = 0;
      const t0 = performance.now();
      showTitle(now, anew);
      anew = false;
      cost = performance.now() - t0;
    }, slow ? 140 : 0);
  }
  const keep = (key, value) => { try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch { /* private mode */ } };
  // what is not saved yet lives through a page that loads again — as long as the file is what it was
  const remember = () => keep('titler', JSON.stringify({ open, now: dirty() ? now : null, base: lines(file) }));
  /** Other values for some of the settings: the title follows. */
  function edit(values, text = '') {
    Object.assign(now, values);
    note = text; bad = false;
    seeTitle();
    show();
    remember();
    refresh();
  }

  // ---- the dev server ---------------------------------------------------------------------------
  const api = (rest = '') => new URL(`__brand${rest}`, document.baseURI);
  const ask = () => fetch(api()).then((res) => (res.ok ? res.json() : null)).then((data) => { if (data) server = data; }).catch(() => {}).then(refresh);
  async function save() {
    if (!dirty()) return;
    const sent = tidyBrand(now);
    say('Сохраняю…');
    sending = sent;      // the file's change may come back to the page before the answer does (brandFile.changed below)
    let out;
    try {
      const res = await fetch(api(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: sent }) });
      const data = await res.json().catch(() => ({}));
      out = res.ok && data.ok ? data : { error: why(data.error || `ответ ${res.status}`) };
    } catch (e) { out = { error: e.message }; }
    sending = null;
    if (out.error) return say(`Сохранить не удалось (${out.error}). Блок можно скопировать и вставить в src/brand.js.`, true);
    file = sent;
    remember();
    say('Сохранено в src/brand.js.');
  }
  async function upload(picked, more = 0) {
    if (!server.write) return say(READ_ONLY, true);
    const name = safeName(picked.name, EMBLEM_FILE);
    if (!name) return say(`«${picked.name}» эмблемой не поставить: нужна картинка — SVG, PNG или WebP с прозрачным фоном.`, true);
    if (picked.size > server.max) return say(`Файл больше ${Math.round(server.max / 2 ** 20)} МБ — для логотипа это слишком.`, true);
    say(`Загружаю ${name}…`);
    let data;
    try {
      const res = await fetch(api(`/file?name=${encodeURIComponent(name)}`), { method: 'POST', body: picked });
      data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(why(data.error || `ответ ${res.status}`));
    } catch (e) { return say(`Загрузить не удалось (${e.message}).`, true); }
    await ask();
    anew = true;      // a file of this name may have been shown before: it is read again
    const what = [data.replaced && 'заменил прежний файл с этим именем', more && 'из нескольких файлов взят первый'].filter(Boolean);
    edit({ emblem: `media/${data.name}` }, `${data.name} — эмблема титра${what.length ? ` (${what.join('; ')})` : ''}.`);
  }

  // ---- panel ----------------------------------------------------------------------------------
  const put = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  function say(text, isBad = false) { note = text; bad = isBad; refresh(); }
  function fillList(emblem, picture) {
    const key = JSON.stringify([emblem, server.files]);
    if (key === listKey) return;
    listKey = key;
    el.emblem.textContent = '';
    const add = (value, label) => el.emblem.appendChild(Object.assign(document.createElement('option'), { value, textContent: label }));
    add('compass', 'эмблема — циркуль');
    add('none', 'без эмблемы');
    if (picture && !server.files.some((f) => `media/${f.name}` === emblem)) add(emblem, emblem);
    for (const f of server.files) add(`media/${f.name}`, `${f.name} · ${megabytes(f.size)}`);
    el.emblem.value = emblem;
  }
  /** What the title as it is set cannot do, in words. */
  function warnings(s, picture) {
    const out = [], lack = info?.lacking ?? [];
    if (lack.length) out.push(`В шрифте титра нет ${lack.length > 1 ? 'знаков' : 'знака'} ${lack.join(' ')} — в титре ${lack.length > 1 ? 'их' : 'его'} не будет.`);
    if (picture && info?.pictureMissing) out.push(`Картинка ${s.emblem} не открылась или пуста — вместо неё циркуль.`);
    if (s.size > UNDER && (s.emblem !== 'none' || s.ring)) out.push(`Под эмблемой и под кругом буквы не растут дальше ${UNDER}.`);
    const bars = stage.final.uniforms.uBars.value;
    // the block grows to the end of the film: its lowest line is lowest on the last frame
    if (bars > 0 && Number.isFinite(info?.bottom) && TITLE_CENTRE[1] - titleScale(LAST_FRAME) * info.bottom > VIDEO_H * (1 - bars)) {
      out.push('С полосами 2,39:1 (клавиша B) нижняя строка к концу ролика уходит под полосу.');
    }
    return out.join(' ');
  }
  function refresh() {
    const unsaved = dirty();
    // the film may be showing what the file does not say: the button tells, also while the panel is closed
    opener.classList.toggle('unsaved', unsaved);
    opener.title = unsaved ? `${TIP} — есть несохранённые изменения` : TIP;
    if (!open) return;
    const s = tidyBrand(now), picture = s.emblem !== 'compass' && s.emblem !== 'none';
    seen = `${frame() < FROM}|${stage.final.uniforms.uBars.value}`;
    put(el.mark, unsaved ? ' · не сохранено' : '');
    for (const k of TEXT) if (el[k].value !== now[k]) el[k].value = now[k];      // (what is being typed is `now` already)
    el.name.placeholder = pageNames(titleSettings({ ...now, name: '' })).tab;
    for (const [k, node] of [['size', el.size], ['emblemSize', el.emblemSize]]) {
      if (node.value !== String(s[k])) node.value = String(s[k]);
      put(node.nextElementSibling, String(s[k]));
    }
    fillList(s.emblem, picture);
    el.pic.hidden = !picture;
    el.gold.value = s.emblemGold === null ? 'auto' : s.emblemGold ? 'gold' : 'own';
    el.ring.checked = s.ring;
    put(el.block, brandBlock(now));
    el.save.disabled = !server.write || !unsaved;
    el.undo.disabled = !unsaved;
    el.pick.disabled = !server.write;
    put(el.hint, server.write ? 'Логотип можно перетащить на страницу: SVG, PNG или WebP с прозрачным фоном.' : 'Логотип кладётся в public/media/ — и выбирается в списке.');
    el.msg.className = `msg${bad ? ' bad' : ''}`;
    put(el.msg, note || (frame() < FROM ? `Титр начинается с кадра ${FROM} — кнопки выше показывают его.` : unsaved && !server.write ? READ_ONLY : ''));
    const warn = warnings(s, picture);
    put(el.warn, warn);
    el.warn.hidden = !warn;
  }
  /** Where the panel stands: beside the film if the window can spare the room, else over its corner. */
  function place() {
    const beside = open && window.innerWidth >= WIDE;
    panel.classList.toggle('beside', beside);
    reserve(beside ? BESIDE : 0);
  }
  window.addEventListener('resize', place);
  /** `byHand`: the user opened it — the title comes onto the screen (a page that loads again stays where it was). */
  function setOpen(v, byHand = false) {
    open = v;
    toolOpen('titler', v);      // the placement tool closes when this one opens
    panel.hidden = !v;
    opener.classList.toggle('on', v);
    place();
    if (v && byHand && frame() < DONE) seeTitle();
    if (v) ask();
    remember();
    refresh();
  }
  async function copy() {
    const text = el.block.textContent;
    try { await navigator.clipboard.writeText(text); say('Блок скопирован: замените им export default { … } в src/brand.js.'); } catch {
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
    else if (a === 'intro') { seekTo(FROM); player.play(); say(''); }
    else if (a === 'still') { player.pause(); seekTo(STILL); say(''); }
  });
  panel.addEventListener('input', (e) => {
    const a = e.target.dataset.a;
    if (TEXT.includes(a)) edit({ [a]: e.target.value });
    else if (a === 'size' || a === 'emblemSize') edit({ [a]: Number(e.target.value) });
  });
  panel.addEventListener('change', (e) => {
    const a = e.target.dataset.a;
    if (e.target === el.input) {
      const picked = el.input.files[0];
      el.input.value = '';
      if (picked) upload(picked);
    } else if (TEXT.includes(a)) { now[a] = tidyBrand(now)[a]; remember(); refresh(); }      // the field is left: the text as it will be written
    else if (a === 'emblem') { anew = true; listKey = ''; edit({ emblem: e.target.value }); }
    else if (a === 'gold') edit({ emblemGold: e.target.value === 'auto' ? null : e.target.value === 'gold' });
    else if (a === 'ring') edit({ ring: e.target.checked });
    else if (a === 'size' || a === 'emblemSize') refresh();
  });
  releaseKeys(panel);
  const field = (node) => /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName) && node.type !== 'range';
  const SLIDER_KEY = /^(Arrow|Home|End|Page)/;
  // keys pressed inside the panel are the panel's own (a letter typed into the caption does not start the film)
  panel.addEventListener('keydown', (e) => {
    // Enter or Esc leaves a field — T, Space … are keys again (not an Enter that ends the composing of a character)
    if ((e.code === 'Enter' || e.code === 'Escape') && e.target.type === 'text' && !e.isComposing) e.target.blur();
    // a slider that was dragged keeps the keyboard for its arrows; any other key is the film's or a tool's as ever
    if (e.target.type === 'range' && !SLIDER_KEY.test(e.code)) return;
    if (e.code !== 'KeyT' || field(e.target)) e.stopPropagation();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyT' || e.ctrlKey || e.metaKey || e.altKey || field(e.target)) return;
    setOpen(!open, true);
  });

  // ---- a logo dropped from the computer (while this tool is open; otherwise a dropped file is for a window) --------
  const carriesFile = (e) => openTool() === 'titler' && !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  window.addEventListener('dragover', (e) => {
    if (!carriesFile(e)) return;
    e.preventDefault();      // or the browser would open the file in place of the page
    e.dataTransfer.dropEffect = server.write ? 'copy' : 'none';
    panel.classList.add('hot');
  });
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) panel.classList.remove('hot'); });
  window.addEventListener('drop', (e) => {
    panel.classList.remove('hot');
    if (!carriesFile(e)) return;
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length) upload(files[0], files.length - 1);
  });

  // ---- what happens outside the panel -------------------------------------------------------------
  // the title was built anew (shots/s17.js): what it could not show is known now
  window.addEventListener('title-shown', (e) => { info = e.detail.info; shownFor = e.detail.settings; refresh(); });
  // src/brand.js was saved. By this tool: nothing new. By hand: the file is right — the title and the panel follow it
  brandFile.changed = (raw) => {
    const next = tidyBrand(raw);
    if (lines(next) === lines(file) || (sending && lines(next) === lines(sending))) { file = next; remember(); return refresh(); }
    file = next; now = { ...next };
    note = 'src/brand.js изменился — показано то, что в файле.'; bad = false;
    showTitle(raw);
    remember();
    refresh();
  };
  (function tick() {
    if (open && seen !== `${frame() < FROM}|${stage.final.uniforms.uBars.value}`) refresh();
    requestAnimationFrame(tick);
  })();

  let stored = null;
  try { stored = JSON.parse(sessionStorage.getItem('titler') || 'null'); } catch { /* private mode */ }
  if (stored?.now && stored.base === lines(file) && lines(stored.now) !== lines(file)) { now = tidyBrand(stored.now); showTitle(now); }
  const asked = ask();
  if (openNow || stored?.open) setOpen(true, openNow); else refresh();

  // for the checking tools (tools/titlertest.mjs)
  window.__titler = {
    open: (v = true) => setOpen(v, true), asked,
    state: () => ({
      open, now: tidyBrand(now), file, unsaved: dirty(), block: el.block.textContent, note: el.msg.textContent, warn: el.warn.textContent, bad,
      write: server.write, files: server.files.map((f) => f.name), info,
      settled: !due && shownFor === TITLE,      // the title on the screen is the one that was asked for last
    }),
  };
}
