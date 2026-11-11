// Shot list: each shot = hand written look/timing (sXX.js) + reconstructed geometry/camera (data/sXX.json).

import { makeShot, linkRigs } from './shot.js';

const defs = import.meta.glob('./s[0-9][0-9]*.js', { eager: true, import: 'default' });
const datas = import.meta.glob('./data/*.json', { eager: true, import: 'default' });

export const FOOTAGE = [...new Set(Object.values(datas).flatMap((d) => (d.screens || []).map((s) => s.name)))];

export function buildShots(assets, stage) {
  const shots = [];
  for (const [path, def] of Object.entries(defs)) {
    if (def.make) { shots.push(def.make(assets, stage)); continue; }   // custom shots (burst, title)
    const data = datas[`./data/${def.id}.json`];
    if (!data) { console.warn('no data for shot', def.id, path); continue; }
    shots.push(makeShot(def, data, assets));
  }
  return shots.sort((a, b) => a.range[0] - b.range[0]);
}

/**
 * Shot borders that the film flies through without a cut: `at` = first frame of the incoming shot, `n` = half-width
 * in frames. The camera eases from one shot's flight path into the next over at-n .. at+n and the player dissolves
 * between the two shots meanwhile, so the picture neither jumps nor changes speed at the border.
 * Where both shots show the same shards (s11b/s12) their worlds are unified by tools/unify.py, which also stores the
 * world A -> world B transform in the incoming shot's data (`link`); the dissolve is then invisible.
 * (All other borders — f48, f70, f142, f188, f232, f308, f388, f522, f533, f902 — are real cuts in the film.)
 */
export const LINKS = [
  { at: 335, n: 6 },
  { at: 469, n: 10 },
  { at: 577, n: 8 },
  { at: 656, n: 8 },
  { at: 739, n: 8 },
];

export function linkShots(shots) {
  return LINKS.map(({ at, n }) => {
    const i = shots.findIndex((s) => s.range[0] === at);
    const a = shots[i - 1], b = shots[i];
    if (!a?.rig || !b?.rig) { console.warn('cannot link shots at frame', at); return null; }
    const glue = b.data?.link?.from === a.id && b.data.link.at === at ? b.data.link : null;
    linkRigs(a.rig, b.rig, at, n, glue);
    return { at, n, a, b };
  }).filter(Boolean);
}
