import { smoothMotion } from './motion-easing.js';
export const SHOT_INTERVAL = 5;
export const PANEL_SPACING = 18;
export const FIRST_PANEL_Z = -30;
export const DURATION = 70.58;
export const FINALE = { transition: 56, mediaOut: 58, reveal: 59.35, full: 61.3, fade: 69.5, z: -208 };
// Order and source in-points supplied by the client. Null out-points are intentionally unspecified.
export const shots = [
  { label: 'Шульган', timecode: '01:25–01:28', in: 85, out: 88 },
  { label: 'Тихонова', timecode: '03:34', in: 214, out: null },
  { label: 'Общий план зала', timecode: '03:36', in: 216, out: null },
  { label: 'Зикеев', timecode: '03:52', in: 232, out: null },
  { label: 'Боровская', timecode: '04:51', in: 291, out: null },
  { label: 'Фотозона', timecode: '05:41', in: 341, out: null },
  { label: 'Бейджи', timecode: '00:07', in: 7, out: null },
  { label: 'Соболь/Анисимов', timecode: '01:25', in: 85, out: null },
  { label: 'Юшкевичус', timecode: '04:59', in: 299, out: null },
  { label: 'Все победители', timecode: '05:44', in: 344, out: null },
];
// Replace an entry with {type:'video', url:'/media/clip.mp4'} for a pre-cut clip.
// For a full recording: add clipIn: shots[i].in, clipOut: shots[i].out.
export const mediaSources = shots.map((shot, i) => ({
  type: 'placeholder', label: shot.label, timecode: shot.timecode,
  aspect: [2,5,6,9].includes(i) ? 1 : 16/9,
}));

export function mediaDimensions(aspect) {
  if (!Number.isFinite(aspect) || aspect <= 0) throw new Error('Invalid media aspect ratio');
  const width = Math.min(11.5, 8.1 * aspect);
  return { width, height: width / aspect };
}

export function smoothFade(a, b, time) {
  return smoothMotion(a,b,time);
}
export function panelEnvelope(revealTime, time) {
  return smoothFade(revealTime, revealTime+2, time)
    * (1-smoothFade(revealTime+9,revealTime+11,time))
    * (1-smoothFade(FINALE.transition,FINALE.mediaOut,time));
}
export function beamEnvelope(time) {
  return smoothFade(.4,3.4,time)*(1-smoothFade(59.2,59.45,time));
}
