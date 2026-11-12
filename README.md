# Янтарный циркуль

Realtime 3D-film on Three.js. Gold architectural facets, ten photo/video screens, a light trail that travels in front of and behind the screens, authored camera moves, and a final 3D drafting compass above the title «Янтарный циркуль».

## Run

```sh
npm ci
npm run dev
npm test
npm run build
```

Vite binds to `0.0.0.0`; preview hosts under `.e2b.app` are allowed. `npm run preview` serves the production build.

## Replace photos or videos

### In the browser

Open **МЕДИА**. Each of ten slots accepts an image or a browser-supported MP4/WebM video. Landscape and square sources are shown in their entirety: screen geometry changes to match the actual aspect ratio, rather than stretching or cropping the source. Portrait images also preserve their proportions.

- Uploads stay local in the browser through object URLs. They are not sent to a server or retained after refresh.
- Videos are muted, use `VideoTexture`, and play only while the film is playing and their screen is visible.
- Pausing, seeking, switching scenes, and backgrounding the tab synchronise/pause the videos. Video playback starts at the screen's reveal time and loops if the clip is shorter than the shot.
- Replacing a source disposes its old texture/video and revokes its object URL.
- A failed replacement leaves the previous media in place.

### Permanent project configuration

Put media files under `public/media/` and change `src/media-config.js`:

```js
export const mediaSources = [
  { type: 'image', url: '/media/photo.jpg' },
  { type: 'video', url: '/media/clip.mp4' },
  // Ten entries total, in scene order.
];
```

Local files avoid CORS problems. External media must explicitly allow CORS. The current defaults are generated, named placeholders matching the ten requested cuts. They are not cuts from an event recording. To use actual footage, supply the recording or pre-cut clips. Placeholder labels/timecodes are part of each media texture and disappear when a slot is replaced.

## Film and controls

- Play/pause: button or Space.
- Scrub: timeline; arrow keys move five seconds.
- **СЦЕНЫ**: jump to the four main sections.
- **Референс**: original video for comparison, separate from the rendered 3D film.
- Fullscreen button.
- Subtle pointer parallax on desktop. With reduced-motion preferences the film begins paused and parallax is disabled.

The film loops after 70.58 seconds. There are no promotional intro texts, intermediate captions or Energy Day greetings; the only title inside the 3D film is the final «Янтарный циркуль». There is no soundtrack.

## Rendering

PBR metallic geometry, procedural softbox environment, soft shadows, SSAO on desktop, subtle depth of field, SMAA, bloom and vignette. The compass and final Cyrillic title are actual geometry. The local subset of DejaVu Sans includes its license in `src/fonts/LICENSE.txt`; regeneration script: `tools/make-title-font.py` (optional Python/fonttools dependency, not needed to run/build).

The light path is built in panel-local coordinates and transformed to world space. Its head crosses the screen front, passes outside its edge, then goes behind the screen. Panels write depth and the light is depth-tested, so the trail is genuinely occluded, not painted over the pictures. The large circular orange flare was removed, and no sprite flare appears in the finale.

## Checks

`npm test` checks media proportions, spline position/velocity continuity, the front/edge/back light path, and finite Cyrillic title geometry.

Headless Chromium smoke checks (software WebGL): initial loading, square-image replacement, 16:9 MP4 replacement, scrubbing, and control frames at 8, 9 and 44 seconds. Final frame rechecked without JS/WebGL console errors. Ten-slot menu and frames at 8, 52 and 64 seconds checked after the ten-scene update, including correct media/depth ordering. Production build passes. Performance on a real GPU is not benchmarked.

`public/video.mp4` is a symbolic link to the repository's original reference. Vite includes the reference in production output; `dist/` is ignored.


## Cut list and timing

The authoritative list is `shots` in `src/media-config.js`, in the exact requested order:

| # | Source timecode | Placeholder |
|---|---|---|
| 01 | 01:25–01:28 | Шульган |
| 02 | 03:34 | Тихонова |
| 03 | 03:36 | Общий план зала |
| 04 | 03:52 | Зикеев |
| 05 | 04:51 | Боровская |
| 06 | 05:41 | Фотозона |
| 07 | 00:07 | Бейджи |
| 08 | 01:25 | Соболь/Анисимов |
| 09 | 04:59 | Юшкевичус |
| 10 | 05:44 | Все победители |

Only the first cut has a specified out-point. All other `out` values are `null`; their exact cut lengths are not invented. Source times are distinct from the animation's five-second shot spacing. The composition now lasts 70.58 seconds to give ten screens room to breathe.

Uploading a file in a slot treats it as an already-cut clip, starting at zero. To reference a full recording in code, use `{type:'video', url:'/media/event.mp4', clipIn:shots[i].in, clipOut:shots[i].out}`. An unspecified `clipOut` means playback continues up to the source file end; the panel's visibility still follows the composition's shot envelope.

Photo and structure share one smooth visibility envelope. Metadata/first-frame readiness is awaited before assigning a new video, GPU textures are primed before the initial loading overlay is removed, and file replacements get an additional source fade. Fading screens stop writing depth so an invisible plaque cannot mask the next photo. Fully revealed screens write depth to occlude the beam. Each screen's frame and image are rendered together, back to front.

Irregular asymmetrical frame wings/cut corners surround a safe rectangular image area, preserving the full image. The light grows a short tail at birth, fades globally over several seconds, and emits particles with individual velocities, ages and soft lifetimes. Particles remain alive after the ray's emission fades, rather than disappearing with its group.

## Triangular corridor revision

The repeated upright sheets have been replaced by a closed triangular low-poly vault (`src/gold-tunnel.js`). Unequal bay lengths, jittered subdivisions, diagonal flips and a seven-material gold palette vary the facets. Sparse ribs do not occur at every bay. Two camera-following area lights illuminate the inside of the tunnel.

Panels are now 18 world units apart. Each camera shot has a front oblique waypoint and a side-clearance waypoint behind the image, alternating passage sides. A regression test samples all camera positions against every panel with a safety margin; no photo-plane intersections occur on the default composition.

The metal frame is a genuine extruded ring with an aperture: there is no solid gold face behind the image. It fades more slowly than the media (`opacity²` versus `opacity`), so media never waits for an already visible gold slab. Rear views show a dark metallic backing, not mirrored lettering. Screens remain visible longer for the behind-screen passes.

Browser check after corridor construction: 3, 7.2 and 9.7-second views, ten media slots, no JS/WebGL console errors. Interior lighting and rear-panel treatment were adjusted afterwards; a further headless browser launch crashed at process startup, so those final visual adjustments were not re-captured. Build and seven automated tests pass.

### Readable arch composition

The latest introductory composition is centred down the triangular vault rather than looking along a nearby wall. Broad facets use a warmer, lighter gold palette, and substantial open triangular portals establish the perspective. The opening light path has a curved sweep rather than a nearly straight segment. Re-captured the revised 3-second frame in Chromium successfully: the gold portals, floor and curved trail are visible; no JS/WebGL console errors. Eight automated tests cover the current implementation, including finite tunnel geometry and open arch portals.

### Current: irregular tunnel, forward-only camera

Supersedes the triangular-vault revisions above. The current tunnel has an asymmetric eight-sided section with a sloping, offset ceiling, varying wall heights, unequal longitudinal bays and independently changing section dimensions. All full triangular portal frames have been removed. Sparse partial seams remain on selected wall/ceiling edges only.

At each clearance waypoint the camera now looks 14 units further down the passage rather than back at the departing panel. Its continuous spline is sampled against every panel in the regression test, which verifies both photo clearance and a forward look target throughout the entire camera path. The beam's own behind-screen motion is unchanged; only the camera stops looking back.

Current browser check: frames at 3 and 9.7 seconds show the irregular corridor and onward view of the next panel, with no JS/WebGL console errors. Build and eight tests pass.

### Current reference-led faceted passage and continuous travelling rig

The new reference is interpreted as a connected, folded gold interior at a lower brightness. The eight base sides now have irregular intermediate vertices and non-planar quad centres. Each section is subdivided into raised/recessed facets, including the ceiling; all applied seam rods are removed. A warmer gold palette and filled studio reflection environment lift the surfaces without raising bloom or blowing out the light trail.

The former camera beat spline is retired. `travellingCameraPose` advances at exactly `PANEL_SPACING / SHOT_INTERVAL` (3.6 world units/second) for the whole composition, including the finale. Lateral clearance follows a sinusoid; a quintic entrance envelope avoids an initial snap. The target stays 21 units ahead. The first panel is at z=-30, so it is properly revealed before the rig approaches it. The finale lockup travels alongside the camera, rather than requiring the camera to stop. During the transition, lateral movement smoothly centres while forward speed remains unchanged.

Nine tests now verify proportions, fades, finite geometry, media ordering, clearance, continuous forward look, and constant nonzero longitudinal speed. Browser views checked at 3, 7 and 64 seconds; the latest gold lighting was re-captured at 3 seconds, without JS/WebGL console errors. No real-GPU frame-rate benchmark is claimed.

## Reproducible portable browser check

Sparticuz Chromium and Playwright are installed as development dependencies and pinned by `package-lock.json`. No separate Playwright browser download or apt installation is needed in this Linux environment. The runner extracts the NSS/NSPR libraries shipped with the portable Chromium package into the temporary directory.

```sh
npm run dev -- --port 5173
# In another terminal:
npm run test:browser
BROWSER_DESKTOP=1 BROWSER_TIMES=7,27 npm run test:browser
```

`PREVIEW_URL` can override the URL. `BROWSER_TIMES` specifies seconds to capture. Screenshots and JSON reports are written to ignored `.reference/browser/`. The default run checks coarse-pointer effects at 3, 7, 27, 47 and 64 seconds; the desktop mode enables the full post-processing stack. Both use software WebGL here, not a real GPU benchmark.

### Sculptural space pass

The floor is no longer a nearly planar triangulated walkway. Floor corners, midpoints and quad centres have independent height displacement, with peaks capped below the camera lane. Chamber width and height now vary slowly along the passage. Two folded metallic bands weave through the roof/wall/floor perimeter, giving foreground crossings and additional depth layers. Media screens have different scales, heights, side offsets and inclinations; the front gold frame is subdued. Forward camera speed stays constant while gentle lateral/vertical motion and softbox intensity change continuously.

Checked in installed Sparticuz Chromium: five coarse-pointer frames and two desktop-effects frames, ten media slots and both menus, no JS/WebGL console errors. The two desktop frames were captured after the final media composition changes. Build and ten unit tests pass. Screens still contain labelled placeholders; real footage and additional authored shot transitions remain important for the final film's quality.

### Current lighting and media structures

The tunnel is now a subdued background: reflection-environment intensity reduced from .85 to .38, wall emission from .11 to .025, and the camera softboxes/key fill reduced substantially. The folded floor/walls remain visible without competing with the light ribbon.

Each media surround is a thick, asymmetric seven-sided open extrusion, with unequal cut wedges, variable upper projection and a folded cap. It still contains a true aperture with no solid gold face underneath the image, and its geometry changes with source proportions. Images remain full-frame. Frame/source visibility is still linked to the same fade envelope.

The leading ember now has an HDR white-hot physical core, a compact soft halo, a local point light and a wide soft forward spotlight that follow the actual ray head/tangent. Both lights fade with the ray, and the ray/ember remain depth-tested behind media screens. The finale has no floating ember orb.

Sparticuz Chromium desktop-effects check passed for 3, 7 and 27 seconds, ten media slots and both menus, with zero JS/WebGL console errors. Screenshots inspected after the lighting/structure changes. Ten unit tests and the production build pass.

### Reference correction: dark surroundings, slender media edges

The thick sculptural picture surrounds are superseded. Media now use a narrow irregular cut-metal edge (0.09 extrusion depth, less than 0.12 edge width), plus one slender oblique side facet behind the image. The broad top/side wedges and warped heavy cap have been removed. Regression assertions enforce the thin profile and true open aperture.

The tunnel's ambient/reflection fill is reduced further: environment intensity .16, a dark studio background, no wall self-emission, much lower softboxes/key, and darker near-metallic wall colours. The leading ember and its local lights remain bright, so the scene reads through local highlights rather than a uniformly orange corridor.

Rechecked in installed Sparticuz Chromium with desktop effects at 3, 27 and 45 seconds after these changes. Captures inspected, no JS/WebGL console errors. Production build and all ten tests pass.

### Light choreography refinement

After each media loop, a C1-continuous world-space bridge returns the leading ember toward the next forward composition, before it approaches the next screen. The screen-front / edge / behind waypoints remain physical world points, and occlusion is unchanged. Bridge framing is tested at portrait and landscape aspect ratios.

Each light filament now has per-vertex opacity decay as well as geometric taper: the tail becomes progressively fainter rather than having uniform radiance. A small six-ray procedural diffraction glint accompanies the head and obeys depth testing; no overlay is painted through photos. Head particles and local illumination remain in place. The dark tunnel and slim media edges are unchanged.

Sparticuz desktop-effects captures at 27 and 45 seconds passed without console errors; the head is now visible in the 45-second composition rather than entirely off-screen. Eleven unit tests cover the current implementation.

### Media reveal instead of glass-like dissolves

Media now reveal across a narrow feathered diagonal rather than applying uniform opacity to the entire image. The already revealed area is fully opaque, preserving source contrast and correctly occluding the ray. Only the moving feather band blends with the scene. The same clipped geometry is used by beauty, AO and depth-of-field, avoiding a hidden full rectangular plane in geometry-buffer passes. The dark rear backing appears only once the source is fully revealed.

`src/media-reveal.js` clips the unit-image polygon and preserves original UVs; reveal direction alternates by slot. This works with both images and VideoTexture and does not stretch the source. Tests verify zero/full coverage, monotonic area, finite bounded UV/alpha values and fully opaque revealed regions. The dark tunnel, thin edging and constant-forward camera are unchanged.

Sparticuz desktop-effects captures at 5, 27 and 45 seconds passed without JS/WebGL console errors. Screenshots inspected. Twelve unit tests and production build pass.

### Atmosphere and instrument detail

Added 640 deterministic world-space dust motes, lit only within the travelling ember's vicinity. Their low-alpha, depth-tested pass has no depth writes and is excluded from AO/DOF geometry buffers; it fades out before the final lockup. There are no full-screen fog overlays or new ambient light sources. The final compass now has restrained broken engraving arcs and fine instrument ticks behind the solid metal object, at 24% opacity. Media autofocus uses view-space panel depth rather than world-Z distance during lateral dolly travel.

Validation: 13 unit tests pass, production build passes (existing bundle-size warning remains). Desktop-effects Sparticuz Chromium captures at 27 and 64 seconds inspected, ten media slots and zero console/page errors. This is software WebGL validation, not a real-GPU performance benchmark. Event media remain replaceable placeholders.

### Screenshot-driven visual cleanup

Reduced the patchwork effect: all triangles in each folded tunnel sheet now share one alloy, with a narrower gold palette and less central-vertex relief. Folded perimeter ribbons use shared vertex normals instead of isolated triangle normals to remove sawtooth specular bands. Reduced emitted sparks from 1800 to 700 and their peak alpha, disabled the old unlit ambient point cloud (the localized atmosphere remains). The leading halo is smaller and much less opaque; the compact HDR core and optical rays remain.

Thirteen tests and build pass. Sparticuz desktop captures at 7 and 19 seconds returned no errors; the 19-second composition was inspected. Shared ribbon normals were a subsequent cleanup, covered by unit/build validation.

### Continuous light acceleration

The light path now uses a dedicated quintic Hermite interpolator with shared knot velocities and zero knot acceleration, so acceleration is continuous at authored joins. Camera interpolation remains unchanged. The return leg around each image has more time (3.65 seconds instead of 3.3), with a higher, more open arc. Trail history shortened from 2.5 to 2.15 seconds, retaining the existing opacity taper.

Fourteen unit tests pass, including velocity/acceleration continuity checks; production build passes. Desktop-effects software Chromium screenshots at 11 and 14 seconds inspected, zero reported errors and all ten media slots present. These checks validate rendering and interpolator continuity, not a real-GPU motion/performance benchmark.

### Render quality and transported light frames

Composer scene buffers now explicitly use half-float HDR with up to 4x multisampling (2x for coarse-pointer devices, capped by GPU capabilities). Previously only the default canvas had MSAA, not the offscreen scene. SMAA still handles postprocessing edges. Composer dimensions are reset in CSS pixels after supplying the physical-size target, avoiding double pixel-ratio scaling.

The light tube's local frame now transports the previous normal along the tangent plane. This avoids world-up cross-product flips on near-vertical arcs; the frame is rebuilt deterministically per frame, so timeline scrubbing remains repeatable. Tests cover sample limits, HDR target dimensions and orthonormal/no-flip transport through a vertical turn.

Fifteen unit tests and production build pass. Desktop-effects Chromium captures at 11 and 27 seconds returned zero errors and ten media slots; the 27-second frame inspected. Software WebGL, not a real GPU benchmark. The CSS-pixel sizing correction is additionally covered by final build validation.

### Architectural composition rework

Replaced the dense random triangle fans with broad two-triangle folded sheets, increased unequal bay length from 3.8–7.2 to 7–12 units, removed longitudinal midpoint jitter and replaced random chamber shifts with slow coherent functions. The irregular eight-sided passage and physically uneven floor remain. Perimeter ribbons no longer wind around the corridor: they are narrower longitudinal folded accents at the sides with slow angular variation. This intentionally removes the large curling bands and reduces background clutter without raising ambient brightness. Camera, media fitting, source slots and finale are unchanged.

Inspected desktop Chromium captures at 7 and 11 seconds; also captured 19 seconds. Zero browser errors. Sixteen unit tests and production build pass; the additional geometry regression checks two triangles per fold, broad bay count and no longitudinal midpoint spikes.

### Finale typography and metal lighting

The final extruded title now uses the Cyrillic Prata serif (Google Fonts, SIL OFL; full license in `src/fonts/Prata-OFL.txt`) instead of DejaVu Sans. Increased curve resolution, reduced bevel size for delicate serifs, added slight letter spacing and normalized the title to a 10.6-unit width. The compass stays above the title with an open engraved scale. Lowered the title's emissive lift and moved the final softbox slowly across the metal, alongside the point-key sweep.

Font source: https://github.com/google/fonts/tree/main/ofl/prata . Rebuild the subset with `python tools/make-title-font.py /path/to/Prata-Regular.ttf` (requires fonttools). Runtime uses only the bundled JSON outlines; no external font request. Browser screenshots at 61 and 65 seconds passed without errors; 65 inspected. Seventeen tests and production build pass. Existing large-bundle warning remains.

### Perimeter grazing light

Added two narrow side-facing rectangular sources travelling with the camera at the architectural perimeter, with slow deterministic vertical drift. Warm left and neutral-cool right sources face outward, not across media. This adds restrained local reflections without changing exposure, environment intensity or frontal fill. Both fade out with architecture by 60 seconds. The effect is intentionally subtle, not a general background lift.

Tests cover bounded perimeter positions, outward aiming, continuous motion and zero finale intensity. Eighteen unit tests and production build pass. Desktop-effects Sparticuz screenshots at 11 and 27 seconds inspected; zero browser errors, all ten media slots present. Existing production bundle-size warning remains.

### Timeline-driven optical focus

Replaced hard nearest-panel autofocus with smooth timeline-weighted blending of inverse view-space depths. Each source gains influence during reveal and releases it before the camera passes, with a near-camera gate to avoid focusing on an edge beside the lens. No accumulated frame-time state is used, so seeks remain repeatable. The final focus now converges to the actual 19-unit lockup distance instead of the previous 13 units. Blur aperture and camera movement are unchanged.

Nineteen tests and build pass, including continuous focus sampled every millisecond through the sequence, seek independence, invalid/behind-camera subjects and final distance. Desktop-effects Chromium captures at 12 and 64 seconds passed with zero errors; final frame inspected. Existing bundle-size warning remains.

### Reference-led leading light (image 16)

The light arrow now has a clearly dominant white-gold head: brighter compact HDR core, a 512px procedural 24-ray optical star and a restrained soft halo. Main/secondary trail opacity reduced to .72/.28 so the head leads visually. All five strand centre lines converge at the head and spread smoothly over the first 30% of the tail. Sprite depth testing, architecture occlusion and the beam envelope remain; environment/exposure and physical point-light power are unchanged.

Twenty tests and production build pass. Desktop-effects Sparticuz captures at 7 and 27 seconds inspected: the star-shaped tip is visible and dominant, ten media slots and zero browser errors. Tests check star core/rays/edge falloff, symmetry and strand convergence. Existing bundle-size warning remains.

### Open stage — tunnel removed (current direction)

Removed all tunnel geometry, floor/ceiling, perimeter folded ribbons, side grazing lights and corridor softboxes from the active scene. Media now live in an independent `mediaStage` group against the existing dark background. No replacement enclosure was added. The approved light arrow/star head, depth occlusion, camera path, media reveal/fitting, localized dust and final compass/title remain unchanged. Earlier tunnel modules remain as unused historical utilities and are not imported into the application bundle; their tests do not imply an active tunnel.

Twenty-one tests and build pass. Desktop-effects Chromium captures at 7, 19 and 64 seconds returned zero errors and ten media slots; 7-second open-stage composition inspected. This change does not implement the separately discussed segmented-photo structure.

### Live settings studio

A minimal sliders icon in the top-right header opens a non-modal live settings drawer (responsive down to mobile widths). Forty-two controls cover playback rate/loop, resolution/exposure/background/fog, the master beam and individual core/star/halo/streak/tail/spark/dust switches, head/tail/spark strengths and sizes, local head lighting, media visibility/brightness/frames/reveal, cursor parallax/camera roll/FOV, environment/key light, bloom/DOF/AO/vignette/SMAA, and individual final title/compass/engraving/line switches.

Changes apply while playing or paused and persist in localStorage under `amber-scene-settings-v1`. Reset restores this scene's approved baseline; JSON import/export carries parameters only, not uploaded media or timeline position. Imports are size-limited, allowlisted, type-checked and clamped. Storage failure does not prevent applying changes. Playback speed also updates video playbackRate. Resolution reallocates GPU buffers only on an actual ratio change, limited to device DPR (and 1.4 on coarse-pointer devices); AO remains desktop-only. Removed tunnel is not reintroduced.

The drawer does not pause playback, closes on Escape or an outside click, restores toggle focus, and keeps keyboard editing from seeking/pausing the film. Sections scroll independently of fixed reset/import/export actions. Existing media and chapter menus remain available.

Validation: 23 unit tests and build pass (existing bundle-size warning). Desktop and 390×844 coarse-pointer Chromium checks exercised open/close/Escape, toggles/sliders, reload persistence, reset, JSON import and export, and all ten media slots; zero browser errors. Desktop and mobile settings screenshots inspected. Reproduce with `BROWSER_DESKTOP=1 BROWSER_TIMES=7 BROWSER_SETTINGS=1 npm run test:browser` or `BROWSER_MOBILE=1 BROWSER_TIMES=7 BROWSER_SETTINGS=1 npm run test:browser`.

### Settings-opening hardening

Settings now use declarative `popovertarget` / `popover="auto"` controls. Opening/closing no longer waits for `mountSettings` or the scene initialization; the browser top layer avoids canvas/header stacking conflicts. Native outside dismissal/Escape is supported, with a legacy JS fallback. The icon has a 40px minimum hit area and its SVG does not intercept pointer targeting. Explicit viewport-relative drawer height keeps the fixed actions reachable in native popover layout.

A dedicated `npm run test:settings` smoke test opens/closes the panel via click, Enter and touch at 1362px and 390px, with the entire scene JavaScript omitted, and verifies viewport bounds. It passes. Integrated mobile scene/settings checks passed with persistence/reset/import/export and ten media slots; desktop integrated controls passed but extended software-WebGL navigation checks timed out, so native no-scene coverage is isolated in the fast smoke test. Twenty-four unit tests and production build pass.

### Reference 20 — rotating edge orbits

Added two camera-relative orbital ornaments partially outside the upper-left and lower-right corners. Each contains three broken gold rings (one dashed), four small orbit nodes and 480 deterministic soft dust points. Assemblies rotate slowly in opposite directions with slight tilt. They use the effects layer, no depth writes and no physical lights: the centre/media lane stays clear, and the dark background/approved leading arrow are unchanged. The ornaments fade in at the start and out at the very end, remaining visible behind the final composition. Portrait layouts reduce their scale.

New settings section “Орбиты по краям” controls visibility, particles, brightness, size and rotation speed; existing saved settings pick up these defaults automatically (47 controls total). Twenty-five unit tests and production build pass. Desktop-effects browser captures at 7 and 64 seconds passed; after the particle sprite refinement, 64 was recaptured and inspected, with zero errors and ten media slots. Dust determinism and clear central lane are regression-tested for portrait and landscape aspect ratios. Existing bundle-size warning remains.

### First-shot sectional media prototype

The first media bay is now the staged proof scene: three source-preserving sections separated along two diagonal seams, slight independent depth offsets and a deterministic quintic assembly over 2.1 seconds. All UV regions remain present exactly once; no stretching, duplicated image or shader-only depth cutouts. The actual clipped geometry is shared by beauty/depth/normal passes. Thin metal seam edges use the existing frame material; the full rectangular rear backing is disabled for sectioned mode.

First reveal begins at 5.4 seconds, near the beam's 6-second arrival. Its front pass follows the lower seam's local slope. The camera blends its forward look target toward the first media during the reading window, then returns to the travelling rig without stopping/reversing longitudinal movement. Desktop hero FOV is 52 degrees to leave room for the leading star. Corner orbits are subdued during this shot. Other media bays are unchanged. Settings → Медиа → “Секции первой сцены” toggles this presentation; 48 settings total. Materials remain placeholders until event photos/video are provided.

Twenty-six unit tests and build pass. Tests verify section UV area equals the original reveal at every step (both reveal directions), finite attributes, vertex capacity and seek-safe assembly. Desktop Chromium captures at 6.3, 7.6 and 9 seconds passed with zero errors; 6.3 and 7.6 inspected. After widening the hero lens and moving placeholder text away from a seam, 7.6 was recaptured and inspected. Ten media slots preserved. This is a proof scene, not a claim that the full film has reached award-level finish.

### Reference-led finale: solid instrument and graphite stage

Rebuilt the final compass with broad bevelled tapered metal legs, real ring pivot, grip, adjustment rail/slider, screw pins and separate tips rather than thin rod legs. Enlarged the Prata title from 10.6 to 16 world units, with responsive fitting to 86% of the available camera width. Added an optional soft radial graphite background only to the finale (effects layer, no depth writes), fading with the final lockup. Reduced key/softbox peaks to avoid washing out the larger instrument and lowered engraving opacity so it remains secondary. The title has stronger reflection support and a restrained base lift. No event date or subtitle added, no tunnel restored.

New settings switch: Финальная заставка → “Графитовый фон финала” (49 controls total). Twenty-seven tests and build pass. Tests cover finite bevel geometry, real compass depth and responsive title fitting. Desktop 1080×720 and mobile 390×844 Chromium captures at 64 seconds inspected, zero errors and ten media slots. This is an interpretation in live 3D, not a pixel-identical recreation of the supplied graphic.

### Finale arrival → flash → stationary logo

Removed all final-group and compass rotation and the final vertical entry slide. Camera lateral movement, cursor parallax and roll now settle before impact (58.8 seconds), with a straight forward final view; longitudinal travel continues and the lockup follows at constant distance. The beam no longer fades before the finale: it travels into the actual moving logo point at 59.2 seconds, then fades over .25 seconds. One white-gold burst with an HDR core, brief warm wash and 96 deterministic radial sparks occurs there. Logo/title reveal starts at 59.35 seconds under the fading burst and finishes at 61.3; no post-reveal rotation.

Settings add flash enable, flash sparks and brightness (52 controls). Disabling flash leaves the ordinary stationary reveal; disabling finale hides the flash too. All burst animation is analytical and seek-safe. Twenty-eight tests and build pass. Desktop Chromium captures at 58.7, 59.3, 60.2 and 64 seconds returned no errors; approach/flash/reveal inspected. After settling the final camera before impact, 64 was recaptured successfully. Existing bundle-size warning remains.

### Larger corner orbits, locked finale and clean title edges

Increased the physical orbit layout scale by 40%, including for saved configurations whose orbitSize is still 1. Removed the diagonal final decorative-line geometry and its obsolete control entirely, so an old saved toggle cannot bring it back. Camera recentering now finishes at 57.8 seconds (1.4 seconds before impact), with a shared camera blend for position/target/roll and zero cursor parallax thereafter. Final logo/title position, orientation and framing do not change during the flash/reveal.

Improved text contours to 32 curve segments, narrower .0015 bevels and four bevel subdivisions to reduce thin-serif bevel artifacts. Resolution now actually supersamples on DPR=1 displays: the quality slider sets render scale directly (desktop default 1.8, mobile capped at 1.4), rather than silently clamping to device DPR. MSAA/SMAA remain. This increases GPU load; the quality slider can lower it if needed. Current controls: 51 (removed finalLines from previous 52).

Twenty-nine tests and build pass, including invariant projected logo position across 57.8–70 seconds with cursor variation. Desktop Chromium produced 59.3/61.5/64-second captures and a zero-error report with ten slots; the long supersampled software run exceeded the initial command wait but completed and its report was verified. The 64-second frame inspected: larger orbits, no diagonal stripes and cleaner lettering. Software render timing is not a hardware GPU performance claim.

### Three presentation types and per-source art direction

First three shots now demonstrate three presentations: first triptych, second whole-image, third vertical diptych. Auto mode keeps sources narrower than .85 aspect intact; other shots remain whole-image by default. Each media slot now offers Автоматически / Цельный кадр / Три секции / Две секции so faces can be protected manually when choosing real media. This is aspect-based fallback, not face detection. Overrides are session-local like uploaded files, and resetting source media restores auto mode. The global sectional-media switch still bypasses all sectional layouts.

Generalized UV partitioning to vertical diptychs and horizontal triptychs with identical source coverage throughout the reveal. Source proportions remain unchanged across layout switches. Seam geometry is rebuilt on upload/aspect/layout changes, and the front beam choreography uses the selected layout (whole second shot stays lower in frame). New choices are available in all ten slots; no new event imagery was fabricated or taken from the reference video.

Thirty-one unit tests and build pass. Tests cover both partition layouts, reveal directions, no missing/duplicated UV area, portrait auto fallback and manual override/rebuild without fit changes. Desktop-effects Chromium at 17 seconds inspected; whole/diptych selector interaction, ten slots and zero browser errors confirmed. Real event imagery is still required for final composition and face-aware art direction.

### Reading composition for all ten shots

Extended attention framing from the first proof scene to all ten media shots. Each has a smooth non-overlapping reading window before camera crossing: the look target blends toward that media and then releases back into the forward rig. Lens fitting considers rotated source corners in view space, with bounded FOV, without changing source proportions or longitudinal camera speed. Orbits are subdued during reading windows. The diptych's front beam pass now sits .5 units in front of its seam rather than 3, reducing perspective separation.

Fixed an actual handoff artifact found during screenshot inspection: the passed first panel's dark rear silhouette could obscure the next media. A continuous spatial visibility envelope now releases each source as the camera passes it. Recaptured 12 seconds confirms the second source is unobstructed. Final camera lock, impact/reveal and approved light-head design are unchanged.

New toggle: Камера и свет → “Акцент камеры на медиа” (52 controls). Thirty-three tests and production build pass, covering reading windows, bounded lenses, forward targets and monotonic passed-source release. Desktop supersampled Chromium captures at 12 and 17 seconds inspected; 12 recaptured after the handoff correction, zero browser errors and ten slots. No real event footage or hardware-GPU performance benchmark was added.

### Baked beam sampling and idle rendering

Beam trajectories are baked when their authored knots or source dimensions change. Hermite lookup preserves smooth motion while reusing typed-array/vector scratch buffers instead of repeatedly evaluating the full spline for every tail/spark sample. Scene rendering now sleeps on pause after its settling window and while the document is hidden. Playback, timeline edits, source transitions/uploads, settings, resize and scene pointer interaction wake rendering. The animation callback remains registered, but idle WebGL draw calls stop; this is not a claim that all browser work stops.

Thirty-five unit tests and production build pass. Portable Sparticuz Chromium confirmed unchanged draw-call count after paused settling, then successful rendering/time-label updates on a synthetic timeline edit. A separate coarse-pointer run passed settings persistence, reset, import/export, mouse/keyboard/touch opening, ten media slots and zero browser errors. Desktop frames at 7 and 59.3 seconds inspected; the combined high-quality desktop settings run exceeded the command wait, so the complete settings check was rerun separately. No hardware FPS benchmark was performed. The existing bundle-size warning remains.

### Uploaded-video timing safety

Added finite-duration clip timing with bounded in/out points, deterministic looping and safe behavior when an uploaded file is shorter than the authored source timecode. Unknown/invalid durations pause instead of generating invalid seeks. Hidden-tab events now explicitly synchronize/pause media even though hidden WebGL rendering sleeps; returning to the tab resynchronizes. A decoded `seeked` event wakes idle rendering without rebuilding beam geometry, and its handler is detached when replacing the video. Pointer leave also wakes the paused scene so parallax can settle back.

37 unit tests and build pass. Portable Chromium checked the actual syncVideo method with a controlled media double (short-file bounds, paused seek, invisible playback pause), plus paused WebGL sleep/wake, ten slots and zero errors. This browser check does not validate real codec decoding or real event footage, which has not been supplied. Visual choreography and finale unchanged; existing bundle-size warning remains.

### Per-scene preview and video source mode

Each of the ten media slots now offers a paused scene preview at the centre of its reading window. Preview closes the media menu, seeks/synchronizes all panels and focuses playback, without resuming the previous running state. Source mode distinguishes a ready-cut clip (starts at zero, default) from a full recording (uses the unchanged authored in/out points). It applies on upload and can be changed for an already loaded video; photos are unaffected. Choices remain session-local and reset with original materials. Select controls no longer trigger global timeline keyboard shortcuts.

38 tests and production build pass. Portable Sparticuz Chromium checked all ten preview/source controls, selector keyboard isolation and a paused jump to scene three; screenshot inspected, ten slots and zero browser errors. No real event footage added. Existing bundle-size warning remains.

### Individual media recovery and recording diagnostics

Each slot now has its own restore button: it restores that source, auto layout and ready-cut mode without altering other slots. Upload/restore marks the slot busy and disables conflicting local actions; global restore is unavailable while any local operation is active. The existing global restore also locks slots until its batch completes. Full-recording mode displays a per-slot warning if the file ends before the authored inpoint or the specified outpoint; ready-cut clips and photos are not flagged.

39 tests and build pass. Portable Sparticuz Chromium uploaded a generated 32×24 PNG test fixture, restored only slot one, confirmed its auto/source defaults and that slot two retained its manual diptych; no stuck busy controls, ten slots and zero browser errors. Media-panel screenshot inspected. The generated PNG is only a test input, not event imagery. Duration warning logic is unit-tested; real recording codecs remain unverified without supplied assets. Existing bundle warning remains.

### Smooth motion joins

Replaced cubic envelopes with bounded quintic C2 easing for reading attention, passed-media release, shared scene fades, finale camera settling/reveal and optical focus pulls. Transition joins now have zero velocity and acceleration rather than an acceleration step. Cursor parallax uses an exact critically damped position/velocity response, avoiding the instantaneous velocity change of first-order lerp when its target jumps. Forward camera speed and authored beam knots are unchanged; the existing C2 beam flight, sectional assembly and short finale impact remain.

41 unit tests and build pass, including finite-difference join velocity/acceleration and 30/120 Hz cursor-response equivalence. Portable Chromium captured 7/12 seconds and passed idle/wake with ten slots and zero errors; 12-second composition inspected. Final focus/source-fade substitutions were subsequently unit/build checked. Screenshot checks do not establish temporal smoothness on hardware or eliminate low-FPS stutter; no hardware benchmark was performed. Existing bundle warning remains.

### Card-jerk correction

The parent cards are static, but per-frame corner-fit zoom and strong short camera-attention windows made them appear to lurch. Removed live per-card lens fitting from playback: media uses a constant 60° desktop / 78° narrow-screen lens, easing to the unchanged final 46° / 68° before impact. Attention strength is reduced to 45%, with two-second entry/exit rather than 1.2/1.5-second transitions. Section assembly now lasts 3.2 seconds instead of 2.1, with substantially reduced lateral/depth excursions; final seam offsets and source UVs remain unchanged.

43 tests and build pass, including fixed playback lens and invariant parent transforms during assembly. Portable Chromium captured 7/12/17 seconds with ten slots and no errors; 17-second composition inspected. These captures are composition checks, not a real-time hardware smoothness measurement. Existing bundle warning remains.

### Fixed-step motion review: first three scenes

Added `node tools/motion-capture.mjs`: portable Chromium renders 385 fixed-time frames at 24 fps over seconds 4–20, plus projected card-centre samples and page errors. Explicit `?motionCapture` render access is development-only and removed from the production build. Output is ignored under `.reference/browser`. This is offline trajectory review, not a real-time performance benchmark. Capture uses 640×360, .75 render scale, no AO/DOF/parallax; production settings remain unchanged. Optional MP4 encoding used imageio-ffmpeg from the ignored Python venv.

Review identified the near-camera release as another abrupt-looking handoff: its former 2-unit envelope lasted .56 seconds at 3.6 units/second. Expanded it to 7 units / 1.94 seconds and start earlier. Passed-card release now fades the complete face/frame rather than reversing the diagonal geometric reveal, avoiding a fast cut sweeping across the card. Ordinary media entry still uses the original geometry reveal, with no change to beam direction or finale. Recaptured all 385 frames after changes, no page errors. 44 tests/build pass; final MP4 is `motion-first-three.mp4`. A hardware playback review is still needed; snapshots and coordinate samples cannot certify perceptual smoothness on every device.

### Single-lane travelling camera

Replaced alternating ±8.3-unit slalom with a single left-side travelling lane, entered over six seconds with quintic easing. During the media run the lane only drifts ±.25 units over a long period (lateral speed ≤.03 units/s); vertical motion and roll are restrained too. Forward speed stays exactly 3.6 units/s. Media/beam placements and final camera-lock logic remain unchanged, although bridge waypoints naturally follow the new rig. Existing collision tests cover the default ten source sizes and still pass; arbitrary replacement assets still require composition review.

45 tests and build pass, including lateral velocity/acceleration bounds and no media intersections. Recaptured 385 fixed-time frames for seconds 4–20, no page errors; encoded `motion-calm-camera.mp4`. Desktop-effects Chromium also captured 12/17 seconds with ten slots/zero errors; 12 inspected. Offline video is 640×360 at 24fps with reduced rendering quality, not a hardware performance benchmark. Existing bundle-size warning remains.

### Continuous camera gaze

Replaced per-card camera-target steering pulses with a single C2 quintic gaze track through the ten source centres. It blends in once over the intro, moves between shot anchors without releasing back to the default aim between cards, and blends out with the existing finale lock. The forward look distance stays fixed at 21 units: no depth pull toward an approaching panel. Camera-guidance off still bypasses this track. Reading envelopes now only influence peripheral ornament emphasis, not the gaze. Side lane, fixed lens, source transforms and finale unchanged.

46 tests/build pass, including gaze join acceleration, fixed look distance, guidance bypass and final centering. Recaptured all 385 offline frames at seconds 4–20 in portable Chromium, no page errors; 17-second frame inspected. Encoded `motion-continuous-gaze.mp4` for motion review. Reduced-quality offline capture is not a real-time GPU benchmark. Existing bundle warning remains.

### Whole-run motion regression

Motion capture now accepts `CAPTURE_START`, `CAPTURE_END`, `CAPTURE_FPS`, validates ranges before launching Chromium, and isolates output by range/fps. Development snapshots include all ten panels, not just the first three. Example: `CAPTURE_START=4 CAPTURE_END=64 node tools/motion-capture.mjs`. The default remains seconds 4–20 at 24fps.

Added a full-timeline camera quaternion regression sampled at 240Hz (including finale recentering): angular speed must stay under .35 radians/s, approximately 20 degrees/s. This guards against discrete orientation jumps but does not guarantee perceived smoothness under low FPS or uploaded-video cuts. 47 tests/build pass. Captured 1,441 software-rendered frames over seconds 4–64, all ten slots visible during their respective scenes, finite projected coordinates, zero page errors. Inspected late-media/transition/final frames at 47/57/64 seconds. Full offline review video: `motion-all-ten.mp4` (640×360, reduced quality, not a hardware FPS benchmark). This pass adds coverage/tooling, not new visual changes. Existing bundle warning remains.

### Alternating viewer-facing cards

Staged odd/even shots on opposite sides of the forward camera lane (±4.8 units), with source dimensions scaled to .68 of the previous presentation sizes to retain margins. Each card gets a static front-facing orientation authored toward the camera at its reading moment; there is no runtime billboard rotation or view of photo backs. Camera aim follows the centre between paired cards rather than steering between sides. Beam bridge knots now stay around the forward lane; media loop knots follow the rotated source transforms automatically. Finale unchanged.

48 tests/build pass, covering actual projected left/right alternation for all ten cards, front-normal alignment, complete default landscape corners inside the desktop reading view and existing collision/continuous-camera checks. Desktop portable Chromium captures at 7.2/12.2 seconds inspected: first card right, second left, both front-facing and contained, ten slots and zero errors. Initial wider staging was rejected during capture inspection because it cropped cards; the tighter final layout was recaptured. Replacement asset and mobile composition still need separate review. Existing bundle warning remains.

### Assembly pre-roll for calm reading

Moved sectional assembly 1.6 seconds earlier without changing its 3.2-second duration or easing. Assembly therefore finishes 1.6 seconds after reveal starts, before the two-second geometric reveal completes, instead of continuing to move while the source is fully readable. Final seams, left/right placement, static viewer-facing orientation, camera and finale remain unchanged. Added invariance tests for settled triptych/diptych sections across all ten reading windows.

49 tests and production build pass. Desktop portable Chromium captured 7.6/17.2 seconds, ten slots and zero errors; 17.2-second diptych inspected. Captures validate composition, not hardware real-time smoothness. Existing bundle warning remains.

### Edge-led beam choreography

Moved the primary front pass to the lower image margin (normalised y=-.43) with a shallower 1.2–1.3-unit front offset, then around the outer edge and behind the upper image area. Removed triptych/diptych overrides that previously drove the bright head through image centres/seams. Loops mirror for left-side cards so entry comes from the central lane on both sides; shared continuous world-space bridge interpolation remains. Camera, card staging and finale unchanged. This protects a generic central region, not detected faces; real assets still need art direction.

50 tests/build pass. New tests cover mirrored loop anchors and central-region clearance of the local front segment; existing C2 flight and bridge framing tests remain passing. Desktop portable Chromium captures at 7.2/12.2/17.2 returned ten slots and zero errors; 7.2/17.2 inspected. Recaptured 385 offline frames over 4–20 seconds and encoded `motion-edge-beam.mp4`, no page errors. This is reduced-quality motion review, not a hardware FPS benchmark. Existing bundle warning remains.
