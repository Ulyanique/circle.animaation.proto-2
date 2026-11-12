// What the two tools of the dev server have in common on the page — the placement tool (placer.js, key E) and the
// title tool (titler.js, key T): the look of their panels, their buttons in the player's bar, and the rule that one
// of them is open at a time. Not part of the build.

const P = ':is(#placer, #titler)', OPEN = '#hud :is(#placer-open, #titler-open)';
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
const closers = new Map();
let current = null;
/** A tool says how it is closed. */
export function tool(name, close) { closers.set(name, close); }
/** A tool says that it has opened (the other one then closes) or closed. */
export function toolOpen(name, on) {
  if (!on) { if (current === name) current = null; return; }
  if (current && current !== name) closers.get(current)?.();
  current = name;
}
/** The name of the tool that is open, or null. */
export const openTool = () => current;

export const megabytes = (n) => (n < 1e5 ? `${Math.max(1, Math.round(n / 1024))} КБ` : `${(n / 2 ** 20).toFixed(1).replace('.', ',')} МБ`);
