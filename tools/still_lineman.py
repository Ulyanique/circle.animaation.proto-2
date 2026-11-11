"""still_lineman.py [--out=PATH] [--view=PATH] — rebuilds public/footage/lineman.jpg (shot 9).

The old still was a median with a ghost of the original light's flare in the middle of the sky and a smeared lift.
Now: the picture is frame 426 (lineman, stick and wires sharp); the patch that the trail and its flare cover in that
frame comes from later frames in which the trail has climbed above it (the lift from 446–449, before the gold shard
slides in from the right; the sky from 452–460); what frame 426 does not see at the top and bottom comes from the
late frames too.
Needs: regstill.py lineman 426 --poly=…  and  stillstack.py lineman 426 402 466 --poly=…  (see NOTES.md)."""
import sys, numpy as np, cv2
sys.path.insert(0, __file__.rsplit('/', 1)[0]); import stillkit as K
opt = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
REPO = '/home/user/circle.animaation.proto-2'
z = np.load('/tmp/work/st/lineman_stack.npz'); fr = list(z['frames']); V0 = z['views']; M = z['masks']
b = fr.index(426); B = V0[b].astype(np.float32); Ht, Wt = B.shape[:2]
yy, xx = np.mgrid[0:Ht, 0:Wt]
POLY = [(416, 0), (673, 0), (894, 368), (642, 858), (22, 858)]            # the shard's outline in the still (from s09.json)
inside = K.poly_mask(POLY, B.shape)
ref = np.zeros((Ht, Wt), bool); ref[90:230, 420:700] = True               # upper sky: clean in every frame
def plate(a, c, how='median'):
    sel = [i for i, f in enumerate(fr) if a <= f <= c]
    V, _ = K.colour_match(V0[sel], M[sel], B, ref & M[b])
    if how == 'median':
        V[~M[sel]] = np.nan
        with np.errstate(all='ignore'): C = np.nanmedian(V, axis=0)
        return np.nan_to_num(C), M[sel].sum(0) >= max(2, len(sel) // 2)
    return K.low_percentile(V, M[sel], 15, tol=5)
lift, lift_ok = plate(446, 449)                  # the lift's lower half: the trail has climbed above it, the gold shard
                                                 # that slides in from the right is not there yet
sky, sky_ok = plate(452, 460)                    # the lower sky: by then the trail is far up on the left as well
late, late_ok = plate(450, 460, 'pct')           # what frame 426 does not see at the top
late = cv2.medianBlur(np.clip(late, 0, 255).astype(np.uint8), 5).astype(np.float32)
base_ok = cv2.erode((M[b] & inside).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0

# lower plate = late sky on the left, lift (and the floor under it) on the right
# (the border between the two runs at x = 655 beside the platform — the lift's frames still have the trail's glow on
#  its tip — and at x = 600, then 500, below it, where the late frames already show the gold shard)
xb = np.interp(yy, [0, 590, 625, 690, 720, 858], [655, 655, 600, 600, 500, 500])
wl = np.clip((xx - xb) / 40.0, 0, 1)[..., None]; wl = wl * wl * (3 - 2 * wl)
low = sky * (1 - wl) + lift * wl
low_ok = np.where(wl[..., 0] < 0.5, sky_ok, lift_ok)
# the patch of frame 426 under the trail, its flare and the glitter behind it: below a line that climbs to the right …
edge = np.interp(xx, [0, 560, 660, 800, 960], [520, 520, 546, 540, 536])
soft_w = np.interp(xx, [0, 560, 660, 960], [18, 18, 8, 8])          # wide cross-fade in the sky, narrow on the lift
w = np.clip((yy - edge + soft_w) / (2 * soft_w), 0, 1); w = w * w * (3 - 2 * w)
# … and only as far left as the flare's glow reaches (it sits at (530, 660)); further left frame 426 is clean
reach = np.clip((230 - np.hypot(xx - 530, (yy - 660) * 0.8)) / 60.0, 0, 1); reach = np.where(xx > 530, 1.0, reach * reach * (3 - 2 * reach))
w = w * reach
under = w > 0.004
# The glass has two facets, split by the seam through (280, 300) and (640, 650), and how bright each one is changes
# with the camera angle: the later frames do not have the tone of frame 426. So the plate is multiplied by the ratio
# frame 426 / plate, known all around the patch and carried into it — separately for each facet.
fw = np.clip(((yy - 300) - 0.972 * (xx - 280)) / 10.0 + 0.5, 0, 1)
ratio = np.clip((B + 2) / (low + 2), 0.4, 1.7)
ring = base_ok & low_ok & ~under & (cv2.dilate(under.astype(np.uint8), np.ones((121, 121), np.uint8)) > 0)
def carry(facet):
    k = (ring & facet).astype(np.float32)
    num = np.zeros_like(ratio); den = np.zeros(ratio.shape[:2] + (1,), np.float32)
    for sg, wt in ((55, 1.0), (170, 1e-3), (500, 1e-6)):          # near the ring its neighbours decide, far inside the whole ring
        num += wt * cv2.GaussianBlur(ratio * k[..., None], (0, 0), sg); den += wt * cv2.GaussianBlur(k, (0, 0), sg)[..., None]
    return num / np.maximum(den, 1e-12)
rL, rR = carry(fw > 0.9), carry(fw < 0.1)
low = low * (rR * (1 - fw[..., None]) + rL * fw[..., None])
S = B * (1 - w[..., None]) + low * w[..., None]
S = np.where((low_ok | ~under)[..., None], S, B)
known = base_ok & (low_ok | ~under)

# what frame 426 does not see: the top strip from the late frames, the bottom strip from the lower plate
well_in = cv2.erode(inside.astype(np.uint8), np.ones((21, 21), np.uint8)) > 0
top = well_in & ~known & late_ok & (yy < 120)
bottom = well_in & ~known & low_ok & (yy > 600)
S = np.where(top[..., None], cv2.GaussianBlur(late, (0, 0), 2.5), S); S = np.where(bottom[..., None], low, S)
known2 = known | top | bottom
out = K.fill_outside(S, known2, radius=8).astype(np.float32)
soft = cv2.GaussianBlur(out, (0, 0), 9)
far = np.clip(cv2.distanceTransform((~known2).astype(np.uint8), cv2.DIST_L2, 3) / 30.0, 0, 1)[..., None]
out = out * (1 - far) + soft * far
# seams between the pieces: a touch of blur across the strips' borders only
edge_m = cv2.GaussianBlur((cv2.Canny(known.astype(np.uint8) * 255, 50, 150) > 0).astype(np.float32), (0, 0), 3)[..., None]
out = out * (1 - np.clip(edge_m * 4, 0, 1)) + cv2.GaussianBlur(out, (0, 0), 2.5) * np.clip(edge_m * 4, 0, 1)
dst = opt.get('out', '%s/public/footage/lineman.jpg' % REPO)
cv2.imwrite(dst, np.clip(out, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 93]); print('wrote', dst)
if 'view' in opt:
    im = K.grid(out); cv2.polylines(im, [np.array(POLY, np.int32)], True, (0, 0, 255), 1); cv2.imwrite(opt['view'], im, [cv2.IMWRITE_JPEG_QUALITY, 90])
