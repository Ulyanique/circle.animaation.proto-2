"""still_pylons.py [--out=PATH] [--view=PATH] [--fresh] — rebuilds public/footage/pylons.jpg (shots 11b, 12).

The old still was a median: the tops of the pylons dissolved in a smear, with ghosts of the cable drum on the right.
Now the picture is a clean plate — the 12th percentile over frames 536–572 registered by content (the original's
light trail sweeps slowly down the picture, so most texels are free of it for a part of the shot). One band stays
under the trail for the whole shot; there the trail is measured and subtracted: along its own direction the trail is
smooth, while the lattice and the wires cross it, so the median ALONG the trail of (plate − smooth sky) is the trail.
Needs: regstill.py pylons 554 --poly=…  and  stillstack.py pylons 554 534 576 --poly=…  (see NOTES.md)."""
import sys, os, numpy as np, cv2
sys.path.insert(0, __file__.rsplit('/', 1)[0]); import stillkit as K
opt = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
REPO = '/home/user/circle.animaation.proto-2'
POLY = [(221, 111), (1304, 25), (1304, 1059), (31, 1059), (61, 886)]      # the shard's outline in the still (s11b.json)
z = np.load('/tmp/work/st/pylons_stack.npz'); fr = list(z['frames']); V0 = z['views']; M = z['masks']
b = fr.index(554); B = V0[b].astype(np.float32); Ht, Wt = B.shape[:2]
yy, xx = np.mgrid[0:Ht, 0:Wt].astype(np.float32)
cache = '/tmp/work/st/pylons_plate.npz'
if os.path.exists(cache) and 'fresh' not in opt:
    c = np.load(cache); C, Cmed, cnt = c['C'], c['Cmed'], c['cnt']
else:
    ref = np.zeros((Ht, Wt), bool); ref[820:900, 300:800] = True          # tree line: never under the trail
    sel = [i for i, f in enumerate(fr) if 536 <= f <= 572]
    V, _ = K.colour_match(V0[sel], M[sel], B, ref & M[b])
    C, _ = K.low_percentile(V, M[sel], 12, tol=5)
    V[~M[sel]] = np.nan
    with np.errstate(all='ignore'): Cmed = np.nan_to_num(np.nanmedian(V, axis=0))
    cnt = M[sel].sum(0)
    np.savez(cache, C=C, Cmed=Cmed, cnt=cnt)
have = cnt > 0
# where only a few frames see a texel (right edge) a percentile picks codec noise: use the median there
# (also where no view was close to the percentile — it then falls between two groups of frames)
wr = np.clip((20 - cnt) / 8.0, 0, 1)[..., None]
wr = np.maximum(wr, (C.max(-1) < 1)[..., None].astype(np.float32))
C = C * (1 - wr) + Cmed * wr
# the right-hand strip is seen only in the first frames of the shot, mostly behind a gold shard and the trail's start:
# its upper part is not kept at all (the sky is continued into it), its lower part is despeckled
strip = xx > 1150
C = np.where(strip[..., None], cv2.medianBlur(np.clip(C, 0, 255).astype(np.uint8), 5).astype(np.float32), C)
drop = ((xx > 1165) & (yy < 540)) | ((xx < 172) & (yy > 436) & (yy < 504))      # + a scrap of the flare at the left edge
# + the spot at the left edge where an out-of-focus dark shard hangs in front of the window for most of the shot
drop |= ((xx - 205) / 78.0) ** 2 + ((yy - 385) / 64.0) ** 2 < 1

# ---- the band that is under the trail all the time: around the line (200, 413) → (1280, 53), 95 px above to 140 below
ax, ay = 200.0, 413.0; dx, dy = 1080.0, -360.0; L = np.hypot(dx, dy); dx /= L; dy /= L
dist = (xx - ax) * (-dy) + (yy - ay) * dx                    # signed distance to the line (positive below it)
up, down = float(opt.get('up', 95)), float(opt.get('down', 140))
band = np.clip(np.minimum((dist + up) / 56.0, (down - dist) / 18.0), 0, 1); band = band * band * (3 - 2 * band)     # soft upper edge: dark clouds above
# smooth sky under the band: the plate without thin dark lines, blurred from outside the band inwards
closed = cv2.morphologyEx(np.clip(C, 0, 255).astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))).astype(np.float32)
wk = (((dist < -up - 4) | (dist > down + 4)) & have & ~drop).astype(np.float32)
S = np.zeros_like(C); den = np.zeros((Ht, Wt, 1), np.float32)
for sg, wt in ((40, 1.0), (120, 1e-3)):
    S += wt * cv2.GaussianBlur(closed * wk[..., None], (0, 0), sg); den += wt * cv2.GaussianBlur(wk, (0, 0), sg)[..., None]
S /= np.maximum(den, 1e-9)
# the trail = median along its direction of (plate − sky), never negative
R = C - S
T = np.zeros_like(C)
span = int(opt.get('span', 72))
for ch in range(3):
    stack = [cv2.remap(R[..., ch], (xx + s * dx).astype(np.float32), (yy + s * dy).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE) for s in range(-span, span + 1, 4)]
    T[..., ch] = np.median(np.stack(stack), axis=0)
T = np.clip(T, 0, None) * band[..., None]
clean = C - T
# saturated texels have lost what was under the trail: there the sky stands in
sat = np.clip((C.min(-1) - 236) / 14.0, 0, 1)[..., None] * band[..., None]
clean = clean * (1 - sat) + np.minimum(clean, S) * sat
# what is still brighter than the sky inside the band is the trail's glitter: lattice and wires are darker than the sky
lum = lambda a: a @ np.array([0.114, 0.587, 0.299], np.float32)
over = np.clip((lum(clean) - lum(S) + 3.0) / 5.0, 0, 1)[..., None] * band[..., None]
clean = clean * (1 - over) + S * over

# right of the pylons there are only wires in the band: thin BRIGHT lines there are strands of the trail that are not
# parallel enough to the rest for the median to catch them — a grey opening takes them out and leaves the wires
opened = cv2.morphologyEx(np.clip(clean, 0, 255).astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))).astype(np.float32)
wo = (band * np.clip((xx - 790) / 40.0, 0, 1))[..., None]
clean = clean * (1 - wo) + np.minimum(clean, opened + 1.5) * wo
# The trail burns the lattice out in the middle of the band. The last frames of the window (578–582, in shot 12) are
# washed out to white but free of the trail there: their lattice — how much darker each texel is than the sky around
# it — is scaled to the plate's contrast (measured outside the band) and put back where the plate has lost it.
late_f = '/tmp/work/st/pylons_stack_late.npz'
if os.path.exists(late_f):
    zl = np.load(late_f); fl = list(zl['frames']); pick = [i for i, f in enumerate(fl) if 578 <= f <= 582]
    Ll = zl['views'][pick].astype(np.float32) @ np.array([0.114, 0.587, 0.299], np.float32); Ml = zl['masks'][pick]
    Ll[~Ml] = np.nan
    with np.errstate(all='ignore'): late = np.nanmedian(Ll, axis=0)
    cover = cv2.erode((Ml.sum(0) >= 2).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
    late = np.nan_to_num(late, nan=255.0)
    ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    dark = lambda img: cv2.morphologyEx(img, cv2.MORPH_CLOSE, ker) - img          # darker than the sky around it, by how much
    d_late = dark(late); d_plate = dark(lum(clean))
    m = cover & (band < 0.01) & (d_plate > 14) & (d_late > 4) & have & (yy < 800)
    g = float(np.median(d_plate[m] / d_late[m])) if m.sum() > 500 else 2.0
    target = cv2.morphologyEx(clean, cv2.MORPH_CLOSE, ker) - (g * d_late)[..., None]
    wl = (band * cover * np.clip((d_late - 2.0) / 4.0, 0, 1))[..., None]
    clean = clean * (1 - wl) + np.minimum(clean, target) * wl
    print('lattice from the late frames: contrast gain %.2f, %d texels darkened' % (g, int((wl[..., 0] > 0.5).sum())))

inside = K.poly_mask(POLY, C.shape)
known = have & (cv2.erode(have.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0) & ~drop
out = K.fill_outside(np.where(known[..., None], clean, 0), known, radius=8).astype(np.float32)
soft = cv2.GaussianBlur(out, (0, 0), 9)
far = np.clip(cv2.distanceTransform((~known).astype(np.uint8), cv2.DIST_L2, 3) / 30.0, 0, 1)[..., None]
out = out * (1 - far) + soft * far
dst = opt.get('out', '%s/public/footage/pylons.jpg' % REPO)
cv2.imwrite(dst, np.clip(out, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 93]); print('wrote', dst)
if 'view' in opt:
    im = K.grid(out); cv2.polylines(im, [np.array(POLY, np.int32)], True, (0, 0, 255), 2)
    cv2.imwrite(opt['view'], cv2.resize(im, None, fx=0.75, fy=0.75, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 90])
