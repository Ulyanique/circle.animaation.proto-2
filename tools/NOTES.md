# Working notes

How the scene was made from `video.mp4`, what the scripts in this folder do, and what was tried and dropped.
Nothing in `tools/` is needed to run or build the site. `bash tools/setup.sh` rebuilds the checking environment
(`/tmp/tools`, `/tmp/work`); only this repository survives between sessions, so anything worth keeping lives here.

## Conventions

- Film frame `f = t·24 + 1`, 1213 frames. Video pixels 1280×720. Vertical field of view 45° (focal length ≈ 869 px).
- Shots (first frame): s01 1, s02 48, s03 70, s04 142, s05 188, s06 232, s07 308, s08 335, s09 388, s10 469, s11a 522,
  s11b 533, s12 577, s13 656, s14 739, s16 902, s17 963 (flash peak 974, title to 1213).
- Hard cuts: 48, 70, 142, 188, 232, 308, 388, 522, 533, 902. Linked shots (one fly-through, dissolve through a second
  buffer): `LINKS` in `src/shots/index.js` — 335 (6 f), 469 (10), 577 (8, world map k 0.730), 656 (8), 739 (8).
- Windows with footage: s04 workers, s05 closeup, s06 plant, s08 substation, s09 lineman, s10 helmet, s11a field,
  s11b pylons + cabinet, s12 cabinet + pylons, s13 youngman, s14 turbines. None in s01–s03, s07, s16.
- Track keys in the shot definitions are `[frame, value, ease]`. Bloom: threshold 1.0, strength 0.45, radius 0.4.

## Running the tools

    bash tools/setup.sh
    npm run dev                                  # the tools render the dev server at :5173
    cd /tmp/tools && export LD_LIBRARY_PATH=/tmp/al2023/lib FONTCONFIG_PATH=/tmp/fonts
    node dumpposes.mjs /tmp/work/poses_flown.json            # camera as flown — input of heropath.py
    node seq.mjs F0 F1 STEP OUTDIR [W H]                     # frames r_<frame·100>.jpg; ≈ 0.3 s/frame at 640×360
    node boot.mjs                                            # load time + console messages
    node heroprobe.mjs 0.4                                   # the light as drawn, sub-frame steps
    cd /tmp/work && /tmp/tools/venv/bin/python /home/user/work/bin/<tool>.py …   # system python has no numpy

Full check (≈ 6 min; run it as a background process, and do not edit `src/` meanwhile):

    node seq.mjs 1 1213 1 /tmp/work/motion/NAME 640 360 && ls /tmp/work/motion/NAME | wc -l       # must be 1213
    python imgflow.py NAME render:/tmp/work/motion/NAME 1 1213 && python final_check.py NAME | head -50

`final_check` prints still frames (< 0.5 px/f) and pops (one-frame brightness jumps) per shot against the original
(original: 0 still frames before the title, 4 pops at f71, 669, 944, 953). Contact sheets: `rsheet.py DIR F1,F2,.. COLS
TILEW OUT.jpg`. Look at every sheet under a fresh file name.

## Shots: from video to data

- `shots/sNN.py` — the hand-made spec of a shot (reference frame, polygons, screens), `tracks/*.json` — feature tracks.
- `bake.py` → `src/shots/data/sNN.json` (`{id, range, ref, fov, cam, camRaw, polys, screens {name, o, u, v[, uv]}, flare,
  trails[, link]}`) and the stills in `public/footage/`. Then `smoothcam.py` (options per shot in
  `smoothcam_opts.json`), for s14 `uvtrack.py`, for the pair s11b/s12 `unify.py s11b s12 577`. `rebuild.sh` chains them.
- **Cautions.** A full `bake.py` rewrites the data JSON (drops `camRaw`, uv tracks, the unify result) AND the stills —
  the retouched ones would be overwritten. Use `--no-tex`. s08: `--trails-only` only. Never bake s16 (hand-made).
  s11b/s12: bake both → smoothcam both → unify. `smoothcam.py` works with rotation vectors: total rotation < 180°.
- `vite.config.js` strips `trails`, `camRaw`, `flare` from the shot JSON on import (they are tool inputs only).

## The hero light (`heropath.py` → `src/shots/data/hero.json` → `src/fx/hero.js`)

One authored light, f1–1003, replaces the 23 trail pieces tracked from the video (smoothing those never worked: jumps
at cuts, gaps, two trails at once).

- `WAYPOINTS` (rows `frame x y [weight]`, one commented block per shot) → least-jerk smoothing spline for the head.
  The tail is what the head leaves behind, carried by a "wind": the screen motion of the scene at the shot's nominal
  depth (0.7 × window depth), capped at 10 px/f, cross-faded ±6 f at shot borders. Life 44 f, at most 1000 px.
- Draw depth: nominal, or 0.78 × shard depth near a shard (in front of it), or 1.15 × while it PASSES behind one
  (`plan_events`; passes now: f34–39 s01/7, f159–161 s04/4, f259–266 s06/3). A run "head under a shard" that touches
  a dissolve is never turned into a pass (it would drop the light behind a shard it is already flying over).
- `hero.json`: `{f0, f1, n: 23, step: 2, life: 44, lmax: 1000, q: 16, zq: 512, xy: base64 int16 [frame][n][x, y]·16,
  z: base64 uint16 [frame][n] depth·512, vis[], zl[], lit[], gain[], size[], events}`; point k is 2k frames old.
  `zl`/`lit` are the eased depth and strength of the light as a LAMP for the gold (the draw depth steps from shard to
  shard — lighting from it made big facets flicker).
- `heropath.py --dry` prints the tables without writing; `--save=T.npy` keeps the simulated tail for the checks;
  `--sheet=F1,F2,..` draws it. Without `--dry` it rewrites `hero.json`. It is deterministic.
- Checks: `facecheck.py [T.npy] [-v SHOT]` — closest approach of head and bright tail to every FACE in the windows, in
  face radii (now ≥ 1.27: white helmet 1.27, close-up 1.47, young man 1.68, lineman 1.77, workers 1.93 / 2.15,
  cabinet 4.79). The `FACES` table holds centre and radius of each face IN ITS STILL — when a still is rebuilt, look
  again: the new helmet still shows the whole face (centre (630, 660), r 170 instead of (720, 470), r 100), and the
  old route turned out to pass under the chin at 0.75 r. Re-routed: 15 px/f down the right side and along the bottom
  (y 656–660), right of x = 820 until f502, under him only when he has risen; then one round turn (centre (500, 375),
  r 280) at 26 px/f through shots 11a/11b back into the old top leg at f558; `offcheck.py T.npy [F0 F1]` — where the tail is outside the frame ("LEAVES AND RETURNS" = its
  middle is outside); `faceplot.py T.npy OUT.jpg F1,F2,..` — outlines + tail; `heroprobe.mjs` — the light as drawn.
- **Rules that came out of the re-routes.** Design a route in the SCENE frame (screen velocity − wind): a turn made
  while the scene moves with the head collapses into a hairpin; legs of a loop ≥ 200 px apart in that frame. Keep ≥ 10
  px/f against the wind. Waypoints on an even 4-frame grid (uneven spacing → acceleration spikes). Routes over windows
  are drawn against the PICTURE, not the outline: the tail rides with the picture, so whatever the head crosses stays
  crossed for two seconds. s14 start: the camera closes in (outflow up to 8.5 px/f) — keep the head at y ≤ 500 during
  f736–760 or the tail is swept out through the bottom.
- `hero.js`: ribbon in screen space (one quad per segment with ONE depth — a slanted quad pierces the shard and shows
  a notch), premultiplied body, a `GreaterDepth` pass at 20 % (a light cut hard behind a shard reads as a lost tail),
  and a MULTIPLY pass under ribbon and head (`SHADE`) because additive light vanishes on a white picture.
- Numbers of the current bake (`heroprobe.mjs 0.4`): head 10.6–26.7 px/f (final dash 38.4), acceleration ≤ 3.40 px/f²
  (dash 8.86), turn ≤ 13.6°/f (dash 25.1), tail ≥ 509 px once it has appeared, sharpest joint ≤ 36°.

## Stills

- `texgrid.py NAME [box|-] [scale] [src]` — a still with a pixel grid; `texclean.py NAME "shapes" [--view] [--radius=]
  [--blur=]` — inpaints hand-marked shapes (kept in `texclean_shapes.json`); `restitch.py SHOT SCREEN F0 F1
  [--ref=A-B] [--out=] [--excl=]` — re-stitches a still from a frame range.
- Retouched this way: `workers` (texclean), `substation` (only the clean middle of a re-stitch composited over the old
  still); `pylons` was, and has since been rebuilt (next section). The untouched originals were not kept; `bake.py`
  can regenerate them — into a COPY of the repo.
- Dark bands and diagonal seams inside windows (closeup, cabinet, pylons, substation) are the faceted glass of the
  original video, not artefacts.

## Stills, second generation: one sharp frame + repairs (`still_*.py`)

A median over a shot (bake.py, restitch.py) smears: in several windows the original's light trail never leaves a band
of the picture, and the picture may slide or scale inside its shard. Four stills are now built differently:

    python regstill.py NAME FRAME --poly=<window in that frame, video px> [--view=SHEET.jpg]   # frame → still homography
    python stillstack.py NAME FRAME F0 F1 --poly=…      # other frames registered to it BY CONTENT → /tmp/work/st/NAME_stack.npz
    python still_NAME.py [--out=PATH] [--view=SHEET.jpg]                    # writes public/footage/NAME.jpg

| still | base | repairs | set-up |
| --- | --- | --- | --- |
| `cabinet` | f603 | cabinet under the trail: 8th percentile over 590–636 (+ 5×5 median, vertical-median line removal, haze desaturated); sleeve: `directional_fill` along it (dx/dy −0.69); below the frame's edge: last rows drawn down | `regstill.py cabinet 603 --poly=218,22,648,0,700,0,775,270,830,420,880,560,950,660,1000,720,60,720,95,500,135,300,200,100`; `stillstack.py cabinet 603 584 640 --poly=(same)` |
| `lineman` | f426 | patch under trail + flare from later frames (lift 446–449, sky 452–460), toned to f426 per glass facet (ratio carried in from a ring around the patch); top strip from 450–460 | `regstill.py lineman 426 --poly=400,2,745,2,912,298,700,718,95,718 --ratio=0.8`; `stillstack.py lineman 426 402 466 --poly=(same)` |
| `pylons` | plate: 12th percentile over 536–572 (base f554 only for registration) | band under the trail all shot long: trail = median ALONG its direction of (plate − smooth sky), subtracted; bright leftovers → sky; grey opening right of the pylons; burnt-out lattice put back from the washed-out frames 578–582 | `regstill.py pylons 554 --poly=575,50,1278,8,1278,716,405,716`; `stillstack.py pylons 554 534 576 --poly=(same)`; then `stillstack.py pylons 554 566 590 --poly=(same)` saved as `pylons_stack_late.npz` (rename the first one aside while it runs) |
| `helmet` | f507 | trail band → `band_fill` (cross-fade of its two sides, half desaturated); flare veil in the lower left: low frequencies pressed down, burnt core → soft fill; tip in the upper right → soft fill | homography of f505 from the TRACKED camera (`rect.view(505)` → `/tmp/work/st/helmet_f505.npy`; SIFT against the old blurry still finds nothing), then `stillstack.py helmet 505 494 512 --poly=690,240,945,95,900,480,880,718,320,718,335,620` |

`rect.py SHOT SCREEN F1,F2,..` shows frames in a still's space via the tracked camera; `ogrid.py FRAME OUT [box] [scale]`
and `osheet.py F1,F2,.. COLS TILEW OUT` show original frames with a grid / as a sheet; `stillkit.py` has the pieces
(`colour_match`, `low_percentile`, `directional_fill`, `band_fill`, `vmedian_lines`, `fill_outside`).
The outline of a shard in its still = uv of the polygon's points × still size (see the `POLY` constants).

What did not work: a low percentile also collects the codec's dark ringing dots next to a bright line (→ 5×5 median);
"mean of the darker quarter" brings the trail back; the lower percentile picks a dark shard that hangs in front of a
window for a part of the shot (pylons, left edge → that spot is filled); later frames have another tone because the
glass facets change brightness with the camera angle (lineman → carry the ratio, per facet); the sky under the pylons'
trail is saturated in most frames (→ lattice from the washed-out late frames); a blur-fill next to a trail takes on its
yellow halo (helmet → band_fill from beyond the halo + desaturate).
After a still changes, look at `s10.js`-style `gain` keys: they were tuned for the old, paler stills (helmet: 1.25 → 1.08).
`public/footage/cabinetA.jpg`, `pylonsB.jpg` (pre-unify bake output, unused by the site) were deleted; bake.py makes them again.

## Dead ends (do not retry)

- Hero planner: bounded least squares → wiggly path. Tail fixed in the shot's world → hairpins at cuts, collapse at
  low relative speed, > 2000 px stretch in whip pans. Wind sampled at each point's own depth → bends of 180–320°.
- Ribbon as one strip with per-vertex depth → dark notch. Purely additive ribbon → invisible on bright footage.
- Lamp at the light's draw depth → flicker (7 pops). Reveal mixed in linear light → first-frame pop (`pow(reveal, 2.2)`).
  Linear flash ramp → one-frame step at its end. Full-size warm-up under software GL → 25 s boot (warm up a thumbnail).
- `texclean.py` auto-detection flagged 44 % of a still → mark shapes by hand. `restitch.py` plain median → ghosting;
  weighted → exposure bands.
- LK optical flow is unreliable on flat gold, inside dissolves and near flares → judge by mean |Δ| per frame + sheets.
  Positions read off small sheet tiles are ±30–40 px → use full-resolution crops / `texgrid.py`.
- Tooling: `grep -c` with 0 matches exits 1; a puppeteer `evaluate` that draws hundreds of frames times out (probes
  compute only); `imgflow.py` wants `render:DIR`; `seq.mjs` can crash transiently → always count the frames; a contact
  sheet drawn on one canvas lets polygons spill into neighbouring tiles.

## Accepted differences

s03 middle slower than the original; s14a a single turning plate instead of the spinning prism; stills (not live
video) in the windows; turbine blades static; the light's route is authored, not the video's; the final dash into the
centre is deliberately fast; the tail's middle grazes the frame edge at f110–118, 257–268, 609–617, 761–765 (the part
that returns is at envelope ≤ 0.05 once the centre line is further out than the ribbon's half-width).

## Log of full renders (still frames before the title / pops outside cuts)

`new4` 0 / 1 (tracked trails, smoothed) · `new5` 0 / 7 (first hero light; lamp flicker) · `new6` 0 / 0 (lamp fix) ·
`new7` 0 / 0 (s13 re-routed round the face) · `new8` 0 / 0 (s05, s09, s10 re-routed round faces) · `new9` 0 / 0 (shade
pass) · `new10` 0 / 0 (four stills rebuilt) · `new11` (s10–s11b re-routed for the whole helmet face): see the report. Build 1,123.86 kB (gzip 359.09), boot 3–4 s without console messages.
