"""still_cabinet.py [--out=PATH] — rebuilds public/footage/cabinet.jpg (shots 11b, 12).

The old still was a median over the shot; the light trail of the original lies across the same band of the picture for
the WHOLE shot, so the median had nothing to vote with there and left a blurred band a quarter of the window high.
Now: the picture is the single frame 603 (sharp, one instant); under the trail the cabinet (static) comes from a clean
plate — the 8th percentile over frames 590–636 registered by content — and the worker's sleeve, which no frame shows
without the trail, is continued through the band along its own direction.
Needs: regstill.py cabinet 603 --poly=…  and  stillstack.py cabinet 603 584 640 --poly=…  (see NOTES.md)."""
import sys, numpy as np, cv2
sys.path.insert(0, __file__.rsplit('/', 1)[0]); import stillkit as K
opt = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
REPO = '/home/user/circle.animaation.proto-2'
z = np.load('/tmp/work/st/cabinet_stack.npz'); fr = list(z['frames']); V0 = z['views']; M = z['masks']
b = fr.index(603); B = V0[b].astype(np.float32); Ht, Wt = B.shape[:2]
yy, xx = np.mgrid[0:Ht, 0:Wt]

# clean plate of everything that does not move
ref = np.zeros((Ht, Wt), bool); ref[380:600, 440:760] = True; ref[60:230, 470:640] = True
sel = [i for i, f in enumerate(fr) if 590 <= f <= 636]
V, _ = K.colour_match(V0[sel], M[sel], B, ref & M[b])
C, have = K.low_percentile(V, M[sel], 8)

# the footage as frame 603 shows it (still px), and the band the trail covers
WIN = [(276, 47), (650, 52), (700, 195), (752, 268), (800, 380), (850, 480), (900, 570), (938, 612), (880, 616), (500, 632), (95, 648), (93, 600), (108, 500), (133, 400), (150, 350), (200, 215), (240, 150)]
win = cv2.erode((K.poly_mask(WIN, B.shape) & M[b]).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
yt = lambda x: np.interp(x, [0, 300, 450, 700, 800, 1024], [240, 250, 280, 288, 274, 242])
yb = lambda x: np.interp(x, [0, 300, 450, 700, 800, 1024], [370, 370, 360, 352, 342, 312])
band = (yy >= yt(xx)) & (yy <= yb(xx))

# 1. static part of the band: the clean plate, minus what is left of the trail (thin horizontal lines)
label = (xx > 636) & (xx < 694) & (yy > 322)                       # the 'A' plate: thin horizontal edges of its own
# (the percentile also collects the codec's dark ringing dots next to the trail: a 5×5 median takes them out)
Cd = cv2.medianBlur(np.clip(C, 0, 255).astype(np.uint8), 5).astype(np.float32)
Cs = K.vmedian_lines(Cd, band & (xx > 400) & ~label, size=int(opt.get('vsize', 25)), thr=float(opt.get('vthr', 5)))
# 2. the worker's part: continue the sleeve (it runs down-left, dx/dy = -0.69) and the wall behind it through the band
Wk = K.directional_fill(B, band & (xx < 470) & win, -0.69, yt, yb, grain=0.0)
wx = np.clip((xx - 405) / 45.0, 0, 1)[..., None]; wx = wx * wx * (3 - 2 * wx)       # sleeve fill → clean plate across x 405..450
# what the trail's glow leaves on the grey cabinet is a yellow-green cast: take most of the colour out of those rows
haze = np.clip(1 - np.abs(yy - 334) / 22.0, 0, 1) * np.clip((xx - 430) / 40.0, 0, 1) * np.clip((720 - xx) / 30.0, 0, 1)
grey = Cs.mean(-1, keepdims=True)
Cs = Cs + (grey - Cs) * (0.6 * haze[..., None])
repair = Wk * (1 - wx) + Cs * wx
bm = cv2.GaussianBlur(band.astype(np.float32), (0, 0), 2.5)[..., None]
S = B * (1 - bm) + repair * bm

# 3. below the bottom edge of frame 603 nothing sharp exists (later frames see it small and dim): the last rows of the
#    cabinet are continued straight down, darkening a little
known = win
S = np.where(win[..., None], S, 0)
yedge = lambda x: np.interp(x, [95, 500, 880, 938], [640, 624, 608, 606])
low = (yy > yedge(xx) - 1) & (xx > 96) & (xx < 936 + (yy - 606) * 0.6)
src_y = np.clip(yedge(xx) - 5 - 0.04 * (yy - yedge(xx)), 0, Ht - 1)       # (almost) the last row, drawn straight down
pull = cv2.remap(B, xx.astype(np.float32), src_y.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
pull = cv2.GaussianBlur(pull, (0, 0), sigmaX=5, sigmaY=4) * np.clip(1 - (yy - yedge(xx)) / 260.0, 0.6, 1)[..., None]
S = np.where((low & ~win)[..., None], pull, S); known = known | low

# 4. everything else lies outside the footage (the shard is a little wider than the picture): extend the picture
out = K.fill_outside(S, known, radius=8).astype(np.float32)
soft = cv2.GaussianBlur(out, (0, 0), 9)
far = np.clip(cv2.distanceTransform((~known).astype(np.uint8), cv2.DIST_L2, 3) / 30.0, 0, 1)[..., None]
out = out * (1 - far) + soft * far
dst = opt.get('out', '%s/public/footage/cabinet.jpg' % REPO)
cv2.imwrite(dst, np.clip(out, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 93]); print('wrote', dst)
if 'view' in opt:
    P = np.array([(260, 50), (646, 30), (706, 277), (780, 444), (984, 671), (42, 671)], np.int32)
    im = K.grid(out); cv2.polylines(im, [P], True, (0, 0, 255), 1); cv2.imwrite(opt['view'], im, [cv2.IMWRITE_JPEG_QUALITY, 90])
