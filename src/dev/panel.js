// What the tools of the dev server have in common on the page — the placement tool (placer.js, key E), the title
// tool (titler.js, key T), the sound tool (sounder.js, key S) and the video tool (exporter.js, key V): the look of
// their panels, their buttons in the player's bar, and the rule that one of them is open at a time. Not part of the
// build.

import { SOUND_FILE } from './soundLine.js';

const P = ':is(#placer, #titler, #sounder, #exporter)', OPEN = '#hud :is(#placer-open, #titler-open, #sounder-open, #exporter-open)';
const CSS = `
${P} {
  position: absolute; top: 14px; right: 14px; width: 330px; max-width: calc(100% - 28px); max-height: calc(100% - 28px); overflow: auto;
  padding: 12px 14px 10px; border-radius: 14px; z-index: 5; box-sizing: border-box;
  background: rgba(12, 10, 6, 0.86); backdrop-filter: blur(8px); border: 1px solid rgba(201, 164, 90, 0.3);
  color: #d8bd84; font-size: 12px; line-height: 1.45; user-select: none;
}
${P}[hidden], ${P} [hidden] { display: none !important; }
${P} header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; color: #f1d79a; font-size: 13px; }
${P} button, ${P} select {
  font: inherit; color: #e6cb8f; background: rgba(201, 164, 90, 0.12); border: 1px solid rgba(201, 164, 90, 0.3);
  border-radius: 8px; padding: 4px 9px; cursor: pointer;
}
${P} button:hover:not(:disabled) { background: rgba(201, 164, 90, 0.26); }
${P} button:disabled, ${P} select:disabled { opacity: 0.4; cursor: default; }
${P} header button { border: 0; background: transparent; font-size: 16px; line-height: 1; padding: 2px 6px; }
${P} .file { display: flex; gap: 6px; margin-top: 8px; }
${P} select { flex: 1; min-width: 0; background: #1c170d; padding: 4px 6px; }
${P} label { display: flex; align-items: center; gap: 7px; margin: 3px 0; cursor: pointer; }
${P} label small { color: #a48a55; font-size: 11px; }
${P} label.sl { cursor: default; }
${P} label.sl span { width: 58px; color: #a48a55; }
${P} input[type=range] { flex: 1; min-width: 0; accent-color: #c9a45a; margin: 0; height: 16px; }
${P} input[type=checkbox] { accent-color: #c9a45a; margin: 0; }
${P} pre {
  margin: 8px 0; padding: 7px 8px; border-radius: 8px; background: rgba(0, 0, 0, 0.45); color: #f6e2ae; font: 11px/1.4 ui-monospace, Menlo, Consolas, monospace;
  white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; cursor: text;
}
${P} .acts { display: flex; gap: 6px; flex-wrap: wrap; }
${P} .acts.small { margin: 5px 0 6px; }
${P} .acts.small button { padding: 2px 8px; font-size: 11px; }
${P} .acts.main button { flex: 1; }
${P} .acts.main button:first-child { flex: 1 0 100%; background: rgba(201, 164, 90, 0.3); color: #fff3d0; }
${P} p { margin: 8px 0 0; color: #a48a55; font-size: 11px; }
${P} p.msg { color: #f1d79a; min-height: 1.45em; font-size: 12px; }
${P} p.msg.bad { color: #ff9c7a; }
${OPEN} svg { position: absolute; inset: 0; margin: auto; }
${OPEN}.on { background: rgba(201, 164, 90, 0.32); color: #fff3d0; }
${OPEN}.unsaved::after { content: ''; position: absolute; top: 2px; right: 2px; width: 7px; height: 7px; border-radius: 50%; background: #ffcf6a; }
`;

/** Adds a tool's own style rules to the page, after the rules the tools share. */
export function addStyle(css) {
  if (!document.getElementById('tool-style')) document.head.appendChild(Object.assign(document.createElement('style'), { id: 'tool-style', textContent: CSS }));
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }));
}

/** The way into a tool for those who do not know its key: a button in the player's bar. */
export function hudButton(id, title, label, icon, onClick) {
  const button = Object.assign(document.createElement('button'), { id, title, innerHTML: icon });
  button.setAttribute('aria-label', label);
  document.getElementById('hud')?.appendChild(button);
  button.addEventListener('click', onClick);
  return button;
}

/**
 * A button or a box of the panel that was clicked with the mouse does not keep the keyboard: the next Space is the
 * film's again, not a second press of that button. (Reached with Tab and pressed with a key, it keeps it: such a
 * click has no `detail`.)
 */
export function releaseKeys(panel) {
  panel.addEventListener('click', (e) => {
    const at = document.activeElement;
    if (e.detail > 0 && at && panel.contains(at) && (at.tagName === 'BUTTON' || at.type === 'checkbox')) at.blur();
  });
}

// ---- one tool at a time: their panels stand in the same place, and a dropped file goes to the one that is open ----
const closers = new Map(), takers = new Set();
let current = null;
/** A tool says how it is closed, and whether a file dropped on the page is its business while it is open. */
export function tool(name, close, takesFiles = true) { closers.set(name, close); if (takesFiles) takers.add(name); }
/** A tool says that it has opened (the other one then closes) or closed. */
export function toolOpen(name, on) {
  if (!on) { if (current === name) current = null; return; }
  if (current && current !== name) closers.get(current)?.();
  current = name;
}
/** The name of the tool that is open, or null. */
export const openTool = () => current;
/**
 * The tool a dropped file belongs to because it is open, or null: then the file's kind decides — a picture or a video
 * is for a window (placer.js), music for the soundtrack (sounder.js).
 */
export const dropTool = () => (takers.has(current) ? current : null);
/**
 * Is it a sound file that is being dragged over the page? Then it is for the sound tool, not for a window. (While a
 * file is still in the air a browser tells its kind, not its name; one that tells nothing answers false — and the
 * file finds its way once it is dropped: offerMusic.)
 */
export const audioDragged = (e) => [...(e.dataTransfer?.items ?? [])].some((item) => item.kind === 'file' && item.type.startsWith('audio/'));
let music = null;
/** The sound tool says how it takes a music file from the computer. */
export const takesMusic = (take) => { music = take; };
/**
 * A file was dropped on a tool that has no use for music (a window takes pictures, the title a logo): if it is music
 * by its name, the sound tool gets it. -> was it taken?
 */
export function offerMusic(file, more = 0) {
  if (!music || !SOUND_FILE.test(file?.name || '')) return false;
  music(file, more);
  return true;
}

const dropped = new WeakSet();
/**
 * One dropped file, one tool: the first tool to take a drop has it. (Taking it may open another tool — music dropped
 * on the placement tool opens the sound tool — and that one, asked next about the same drop, would take the file a
 * second time.) -> may the asker have it?
 */
export function claim(e) {
  if (dropped.has(e)) return false;
  dropped.add(e);
  return true;
}

/**
 * A file that has only just landed in public/media/ is not there for the page at once: the dev server learns of a new
 * file from its file watcher, a moment later, and until then answers for the file's address with the page itself — a
 * picture or a music asked for in that moment would come out "broken". Waits until the file itself is served (a few
 * milliseconds as a rule; three seconds at most — then the caller goes on and the browser says what it finds).
 * `src`: the file under public/, as media.js names it.
 */
export async function landed(src, patience = 3000) {
  const url = new URL(src, document.baseURI);
  for (const t0 = performance.now(); performance.now() - t0 < patience;) {
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (res.ok && !(res.headers.get('content-type') || '').startsWith('text/html')) return true;
    } catch { /* the server is busy: once more */ }
    await new Promise((r) => setTimeout(r, 30));
  }
  return false;
}

export const megabytes = (n) => (n < 1e5 ? `${Math.max(1, Math.round(n / 1024))} КБ` : `${(n / 2 ** 20).toFixed(1).replace('.', ',')} МБ`);
