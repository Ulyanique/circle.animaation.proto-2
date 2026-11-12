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
    node slotshot.mjs F1,F2,.. OUTDIR [W H]                  # single frames with window videos settled (see Window slots)
    node boxcheck.mjs; node slotinfo.mjs; node vsync.mjs     # window boxes, numbers of the README table, video clock
    node heroprobe.mjs 0.4                                   # the light as drawn, sub-frame steps
    node titleshot.mjs OUTDIR; node buildtest.mjs            # the final title with other settings; what the build ships (see The final title)
    node /home/user/circle.animaation.proto-2/tools/captiontest.mjs      # the title's text, no browser (from the repo: it needs three.js)
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

## Window slots (`src/media.js` → `src/core/slots.js`)

Any photo or video in any window. User-facing description: README, «Свои фото и видео в окнах»; map of the windows:
`docs/windows.jpg`.

- **Settings.** Default export of `src/media.js`, keys `w01 … w11` (`SLOTS` maps them to the screen names of the shot
  data: workers, closeup, plant, substation, lineman, helmet, field, pylons, cabinet, youngman, turbines).
  `core/assets.js` then loads a photo (`loadPhoto`, scaled down by halves to 4096 px) or a video (`loadVideo`: muted
  `VideoTexture`, mip-mapped, resolves once the frame at `start` is decoded, gives up after 12 s) instead of
  `public/footage/<name>.jpg`. A file that fails → the still stays + a console warning. Own textures carry
  `userData.media`.
- **Box.** Media is fitted to the part of the window that the picture ever shows, not to the window's outline: the
  camera flies so close that w02, w10, w11 are never seen whole (w11: only u 0.25…0.92 of its outline). `makeShot` gives
  every screen to `registerSlot` with callbacks; after `linkShots` (the hand-over changes the flight) `finishSlots()`
  asks each shot for its part (`seenPart`: 48×48 grid over the facets, every 2nd frame from 2 before the reveal to the
  shot's last frame, widened by the dissolve frames at linked borders, 24 px margin), unions the parts over the shots
  that share a window (w08, w09: s11b + s12, same screen uv in both), adds 2 % and points `uScrO/U/V` at the result.
  About 55 ms at boot. `tools/boxcheck.mjs` checks the invariant (no window point in the picture lies outside its box).
- **Frames.** A window's time on screen (`__slots[name].f0 … f1`: the `to` move and the video's timeline) starts when
  its reveal reaches 0.02 and ends at the last frame at which a ray from a 16×12 grid of picture points still hits it
  (`frames()` in `makeShot`): w08 is 533–598, although s12 lasts to 655 — it has left the frame by then.
- **Fit.** `fitMatrix(W, H, aspect, { x, y, zoom, rotate })` → `uScrA` / `uScrT` every frame: cover fit that also holds
  when rotated; x / y as CSS object-position; `to` = linear move over the window's frames; `'level'` = minus the tilt of
  the window's x axis in the middle of its main shot. `tools/fittest.mjs` is its property test (200,000 random cases).
- **`fixed`.** uv from the fragment's place in the picture (`vClip` varying, `uScrFixed`), box = the picture: the media
  stands still on the screen and the window is a cut-out over it. Default for w04 (`FIXED` in `slots.js`): that window
  fills the picture with the camera right over it — pinned to the window, a 16:9 photo would have to be 6700–7900 px
  wide to be shown 1:1 at 1080p, and only a sliding piece of it would ever be seen.
- **Shader** (`fx/shards.js`): `uScrOwn` 0 placeholder / 1 photo / 2 video; `uScrFixed`; `uSharp[2]` (0.6 for the
  placeholders, the `sharpen` setting — default 0 — for own media). With own media `inside` is always 1: past the box
  the clamped edge texels go on (never seen, by the invariant above).
- **Video colour.** three.js uploads video frames as plain RGBA8 and decodes sRGB only in its own materials
  (`DECODE_VIDEO_TEXTURE`); a ShaderMaterial has to do it itself (`texel()`), otherwise the video is washed out — the
  same card as a photo and as a clip differed by 15 of 255 on average, 1 after the fix. A clip encoded from full-range
  RGB without colour tags (ffmpeg default from a JPEG: `yuvj420p, bt470bg`) still comes out lighter — that is the file.
- **Video clock.** `syncVideos(f, playing, speed)` once per rendered frame: target `start + (f − f0) / 24 · rate`
  (looped); the video plays only while the film plays inside the window's frames (± 16 for the dissolve tails),
  otherwise it is paused and seeked. While playing it is steered by `playbackRate` (± 40 %, on above 0.04 s off, off
  below 0.01 s) and jumps only when more than 0.5 s off. `speed` = how fast the film runs against the wall clock
  (`dt / raw` in the tick, 1 unless frames take over 100 ms) is fed forward — without it the video ran ahead and jumped
  back about once a second under the software renderer. Hidden tab → videos paused. `tools/vsync.mjs` measures it.
- **Tuning conveniences.** Dev server only: a paused film keeps `?f=N&paused` in the address (`rememberFrame` in
  `main.js`), so a reload after an edit of `media.js` returns to the same frame. An edit that only moves pictures
  (x, y, zoom, rotate, to, fixed) does not reload at all: `slots.js` accepts the hot update of `media.js` and puts the
  new numbers into the live records (`r.place = { base, end }`, `setFixed`); anything else — another file, a video's
  timing — calls `location.reload()`. `?card` puts a 16:9 test card (`makeCard` in `assets.js`) into every window,
  placed by the window's own settings.
- **Photos** (`loadPhoto` / `develop` in `assets.js`) go to the GPU through a 2D canvas, not straight from the
  `<img>`: three.js sets `UNPACK_COLORSPACE_CONVERSION_WEBGL` to NONE, so an image with an embedded profile was
  uploaded as raw numbers — an Adobe RGB test chart came out duller by 6 of 255 on average, up to 61
  (`phototest.mjs`). A canvas converts to sRGB and applies the EXIF orientation in every browser; untagged upright
  photos come out pixel-identical to the direct upload. Cap 4096 px, in steps of at most ×0.5 and at most 16 MP
  (phone canvas limit); `alpha: false`, so see-through PNGs sit on black. Each canvas is emptied right after
  `initTexture` (one alive at a time, not eleven); the `<img>` is kept, and `restorePhotos()` re-develops the photos
  after a lost WebGL context (`webglcontextrestored`, registered after three.js's own listener).
  `tools/phototest.py` makes the test photos (it writes its own minimal Adobe RGB ICC profile),
  `tools/phototest.mjs` compares the frames: tagged vs converted beforehand 0 / 0; EXIF-turned vs upright 0.04 mean;
  context lost and restored → the same screen.
- **A paused film is not redrawn.** The loop in `main.js` draws when the film plays, when the frame changed or when
  something called `touch()` (`util.js`: page size, bars, `setFixed`, hot update of `media.js`, the placement tool's
  `refresh()`, a restored context, a tab coming back) — three frames, plus one 300 ms later for anything that arrives
  late; `syncVideos()` returns true while a video's window is near the screen, and that keeps it drawing. Before,
  every display frame was drawn while paused — and pictures are placed with the film paused. In the headless tools
  it also mattered: the single-process software renderer queued those frames, and leaving the page (a reload) took
  20–30 s instead of 0.1 s. `player.renders` counts drawn frames; `placertest.mjs` checks both directions (at rest
  nothing is drawn; a moved picture is drawn and shows on the screen). Anything new that changes the picture
  without changing the frame must call `touch()`.
- **Placement tool** (`src/dev/`, key E or `?edit`; dev server only — `main.js` imports it under
  `import.meta.env.DEV`, the server side is a vite plugin with `apply: 'serve'`):
  - `placer.js` — the panel. Picking: `slots[name].users[i].ask.uv(f, x, y)` (ray through a picture point → the
    window's uv, `planeUv` in `shot.js`) + `inside(u, v)`. A drag keeps the grabbed media point under the cursor: media
    uv = linear part × box point + focus (`fitParts` in `slots.js`), solved for x / y; the wheel changes zoom or
    rotation and then re-solves x / y for the point under the cursor. Live values are rounded to what the line holds
    (3 decimals, rotation 1), so the saved line reloads to the identical picture. With a `to` move the key nearer in
    time is edited (start before the middle of the window's frames, end after), by the weight it has at that frame.
  - `mediaLine.js` — shared by page and server: `mediaLine(id, cfg)` (one line, defaults left out), `cleanSettings`,
    `safeName`, `putLine` / `dropLine` / `entryText` on the text of `src/media.js` (one window per line; entries of
    several lines and trailing comments are handled; commented-out entries are left alone).
  - `mediaServer.js` — `GET /__media` → `{ files, write, max }`; `POST /__media` `{ entries: [{ id, settings | null }] }`
    → one write of `src/media.js`; `POST /__media/file?name=` (raw body) → `public/media/<safe name>`, 95 MB at most.
    A window can only be pointed at a file that is in `public/media/` (or keep the address its line already has).
    POST needs the same origin and a client on this machine with no proxy headers; otherwise the page gets
    `write: false` and the panel only shows the line. `MEDIA_TOOL=remote` lifts the "this machine" part — **start the
    dev server that way for the Arena preview** (`MEDIA_TOOL=remote npm run dev`), where the user sits behind a proxy.
  - A new file means a reload (pictures are loaded at boot): the page keeps its frame (`player.keepFrame()`), the
    panel its state and a note (sessionStorage). Photos over 4096 px are scaled down in the page before the upload
    (canvas → JPEG 0.9; orientation applied, colours converted to sRGB, camera data dropped).
  - Unsaved moves are never undone by news from the file: a hot update re-places only the windows whose line changed
    (`applySettings` compares the normalized placement), and after a save the tool tells `slots.js` what the file
    now says (`adoptSettings`), so the watcher's echo of that save changes nothing.
  - Tests: `node tools/linetest.mjs` (plain node; the line and the file's text) and `placertest.mjs` (headless, about
    4 min: the server's refusals, a real mouse on the page, pixel comparison of a drag, the idle loop, saving without
    reload, files from the list / the button / dropped / shrunk and turned upright, the read-only page). `placertest`
    makes its own `_test_*` pictures and puts `src/media.js` back as it found it; with the dev server in
    `MEDIA_TOOL=remote` mode it skips the read-only checks. `placershot.mjs PHOTO OUT.png` makes `docs/placer.jpg`.
- **Tools.** `slotshot.mjs F1,F2,.. OUTDIR [W H]` (frames with the videos settled; prints `window.__slots`; `QUERY=card`),
  `slotinfo.mjs` (the numbers of the README table), `slotmap.py NOW_DIR CARD_DIR OUT.jpg` (the map):

      node slotshot.mjs 172,215,285,362,415,508,528,552,610,710,870 /tmp/work/map_now            # empty media.js
      QUERY=card node slotshot.mjs 172,215,285,362,415,508,528,552,610,710,870 /tmp/work/map_card
      python tools/slotmap.py /tmp/work/map_now /tmp/work/map_card docs/windows.jpg

  Test media: anything named `public/media/_test_*` is git-ignored. A numbered card: any image with a grid and corner
  labels; a clip with something moving at a known speed:
  `ffmpeg -loop 1 -i _test_card.jpg -f lavfi -i color=c=red:s=60x60:r=24 -filter_complex "[0:v]scale=1280:720:out_range=tv:out_color_matrix=bt709,format=yuv420p[bg];[bg][1:v]overlay=x='100+t*150':y=40,format=yuv420p" -t 6 -r 24 -c:v libx264 -color_range tv -colorspace bt709 -movflags +faststart _clip.mp4`.
- **Numbers** (`slotinfo.mjs`; aspect of the seen box, share of the picture covered, width of a 16:9 photo shown 1:1
  on a 1920 px picture — median / closest): w01 0.86, 35 %, 1980 / 2140; w02 1.74, 95 %, 2310 / 2390; w03 0.78, 33 %,
  2090 / 2770; w04 1.01, 100 %, 6670 / 7920 (hence fixed); w05 1.02, 44 %, 2380 / 6480; w06 0.90, 31 %, 2400 / 4320;
  w07 1.87, 73 %, 2370 / 2420; w08 1.23, 58 % in s11b, 2310 / 2420; w09 1.47, 17 % in s11b and 51 % in s12,
  2100 / 2130; w10 0.74, 41 %, 2970 / 3820; w11 0.75, 60 %, 4160 / 4450.
  Tilt of the window's x axis on the screen, start → middle → end of the shot, degrees clockwise: w04 −19 → −1 → 2;
  w05 −17 → 0 → 4; w06 11 → 8 → 15; w07 9 → 4 → 0; w08 7 → 3 → 0, then to −52 while it leaves in s12; w09 10 → 7 in
  s11b, 7 → −1 → −44 in s12; w10 −2 → −1 → −19 (its verticals stay within ± 3); w01–w03, w11 within ± 1.
- **Checked** (headless, test card + test clips + one architecture photo): media covers every window with no gap at
  any setting; x: 0 / 1 show the card's edges at the edge of what is seen; numeric rotate, `'level'`, `to` pan and zoom;
  6400×3600 photo → 4096×2304 on the GPU; mp4 (H.264) and webm (VP9) play, colours equal to the photo's; missing photo,
  missing video, unknown key → warning + placeholder; no jump through the dissolve at f577 with media in w08 + w09;
  a video stays within ± 0.06 s of the film's clock at the display rate and is exact after a pause; empty settings →
  the full render is bit-identical to the one before slots (`new12` = `new11`, all 1213 frames at 640×360).
- **Still tied to the placeholders:** `FACES` in `facecheck.py` (the light's route avoids the faces of the stills, not
  whatever a custom picture shows); s13's camera (tracked on the picture); the uv glide of a still inside its facet
  (skipped for own media); the per-screen `reveal` / `sepia` / `gain` keys of the shot definitions — these stay on
  for own media on purpose (the gold-to-colour reveal is part of the look). At most two screens per shot.

## The final title (`src/brand.js` → `src/fx/title.js`)

- **What it is.** Caption, second line and emblem of the final title are settings: `src/brand.js` (Russian header with
  the keys). `src/fx/titleSettings.js` fills in the defaults; it is plain JS with no three.js and no browser in it
  because three parties read it: the page (`fx/title.js`), the dev server and the build (`vite.config.js`, plugin
  `brand`: the page's own name in index.html, the glyphs to ship, the font licence into `dist/`) and the checks.
- **Text.** `textLine` in `title.js`: capitals `cap` px high, spread to `LINE_W` = 800 px by letter-spacing within
  `TRACK` (in cap heights), never wider than `LINE_MOST` = 1000 px — past that the line is scaled down. The rule itself
  is `fitLine` in `fx/caption.js`. The cap height is a constant (`CAP_UNITS` = 1002 font units: «Я», the letter the
  title was drawn with, 983 + the 19 its leg dips below the line) and not measured from a glyph: the build may not
  ship «Я». With the placeholder the arithmetic is the old one operation for operation, so its frames did not change.
  Text is normalised to NFC (a Mac may hold «й» as «и» + a breve; the font has «й», not the breve).
  Rows: `textRows()`; with nothing above (no emblem, no circle) the lines take the middle of the frame and may be
  130 px high instead of 70. The sparkle of s17 (`glint`) is authored for the placeholder and moved by `title.info`.
- **Font.** `src/fx/fonts/title-serif-600.json`: all 581 glyphs of Playfair Display SemiBold (@fontsource 5.3.0,
  subsets latin, cyrillic, latin-ext, vietnamese), 570 kB, one glyph per line. The dev server serves it whole, the
  build keeps the glyphs of caption + tagline (`keepGlyphs`) and warns about characters the font lacks. To make it
  again: `mkdir /tmp/fontwork && cd /tmp/fontwork && npm install opentype.js @fontsource/playfair-display@5.3.0`,
  copy `tools/font2json.mjs` there (it finds opentype.js next to itself), then the command in its header.
  three.js adds `_cachedOutline` to every glyph object it has used: compare glyphs from a fresh parse of the file.
- **Emblem picture.** `loadEmblem` in `core/assets.js`: a 512 px draft shows where the ink is → that part alone is
  drawn at up to 1024 px (vector art at full size, a bitmap never enlarged) → a DataTexture that stores
  enc(lin(rgb) · alpha): the GPU decodes it on sampling, so filtering and mip-maps work on premultiplied linear light
  and edges get no dark fringe. `makePicture` in `title.js` draws it with `premultipliedAlpha`, in its own colours or
  with `goldFace` over its alpha. Gold by default only if the ink is nearly black (mean linear luminance < 0.03) and
  not a filled rectangle. Size: the farthest inked texel from the middle of the ink's box lands on 0.86 of the
  circle's radius (fitting the box's diagonal instead left stars and round seals small).
- **Second line.** Capitals 0.42 of the caption's, spread to the caption's width within 0.08–0.55 cap; fades in
  f1032–1056 (s17). A soft dark plate behind it (`shade`, 60 % at most) — without it the small letters vanish where
  they cross the beams' hot spots. No tagline → no plate, and the placeholder's frames stay as they were. A line the
  font has not one glyph for is not a line (the emblem then takes the middle); a tagline without a caption is drawn
  as the caption.
  - Dead end: `drawImage` with a source rectangle on an SVG that declares no width / height (only a viewBox) — in
    Chromium the cropped pass came out empty, while SVGs that declare a size were fine. The whole picture is drawn
    instead, with a destination rectangle that puts the wanted part on the canvas; that works for both.
  - Not an option: `texture.premultiplyAlpha` with an sRGB texture — the encoded values get multiplied, edges darken.
- **Checks.** `node tools/captiontest.mjs` (plain node, from the repo: settings, page name, `fitLine`, the font file,
  the glyphs a build keeps). `titleshot.mjs OUTDIR` (headless, needs the dev server; 19 variants + `hot` + `lost`, about 3 min;
  pictures for the eye in OUTDIR; `ONLY=long,hot` for a few; `QUERY=scope` adds to the page's address; one custom
  variant: `titleshot.mjs OUTDIR '{"caption":"…"}' 1010,1100`,
  test pictures `media/_test_mark_colour.svg`, `_black.svg`, `_white.svg`, `_padded.png` exist while it runs).
  `buildtest.mjs [OUTDIR]` (two builds into /tmp, `vite preview` on 4174, the title of the built site). The last two
  rewrite `src/brand.js` and put the user's file back, also after a failure.
  - `hot` first failed with "Execution context was destroyed": the open page loaded twice after one save (the dev
    server logged two reloads within a second). Now the tools replace the file by rename instead of writing it in
    place, and wait for the new text at `/src/brand.js` itself (not at a URL with a unique query); the page loads
    once, and `hot` checks that. Which of the two changes cured it was not isolated.
  - A WebGL canvas can be read (`toDataURL`, `drawImage`) only in the task that drew it; later it is blank.
  - Frame 1213 is black by design (the film ends on a black frame): for "the title at its largest" look at 1212.

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

- Slots: fitting media to the window's outline (bounding box of its facets) — in w11 a third of a 16:9 frame went to
  parts of the window that never enter the picture, and `x: 0` showed nothing of the left edge; fit to the seen part.
  Video sync by a hard jump at 0.25 s drift → visible jumps back whenever frames are slow; proportional steering alone
  → a standing lead (0.26 s at 0.7× film speed); it needs the film's speed fed forward. `rig.project(f, w, out)` takes
  an array `[x, y, z]`, not a `Vector3` (→ NaN), and fills only `out.x`, `out.y`. A paused video seeks asynchronously:
  capture tools must render, wait, render again (`slotshot.mjs`). A GLSL comment with a back-tick inside the shader's
  template string ends the string («Unexpected identifier»).

## Accepted differences

s03 middle slower than the original; s14a a single turning plate instead of the spinning prism; stills (not live
video) in the windows; turbine blades static; the light's route is authored, not the video's; the final dash into the
centre is deliberately fast; the tail's middle grazes the frame edge at f110–118, 257–268, 609–617, 761–765 (the part
that returns is at envelope ≤ 0.05 once the centre line is further out than the ribbon's half-width).

## Log of full renders (still frames before the title / pops outside cuts)

`new4` 0 / 1 (tracked trails, smoothed) · `new5` 0 / 7 (first hero light; lamp flicker) · `new6` 0 / 0 (lamp fix) ·
`new7` 0 / 0 (s13 re-routed round the face) · `new8` 0 / 0 (s05, s09, s10 re-routed round faces) · `new9` 0 / 0 (shade
pass) · `new10` 0 / 0 (four stills rebuilt) · `new11` 0 / 0 (s10–s11b re-routed for the whole helmet face) · `new12` 0 / 0 (window slots, empty `media.js`:
bit-identical to `new11`). Build 1,133 kB (gzip 363), boot 4–5 s on the dev server without console messages.
