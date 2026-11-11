"""still_helmet.py [--out=PATH] [--view=PATH] — rebuilds public/footage/helmet.jpg (shot 10).

The old still was a blurred median with a ghost of the original light's flare as a hot spot under the face.
Now the picture is frame 507, the first one in which the worker has full contrast (the footage fades in, and from 509
on it is under the trail), placed with the tracked camera of the reference frame 505 and registered to it by content.
In that frame the original's trail lies across the lower right of the window and its flare in the lower left:
  * under the trail nothing can be recovered (no frame shows that part without it): the band becomes a cross-fade of
    the picture on its two sides — in the film our own light flies along exactly that edge of the window;
  * the flare is a veil of light over the cabinet: its low frequencies are pressed down, the detail under it stays.
Needs: /tmp/work/st/helmet_f505.npy (rect.py's homography of frame 505) and stillstack.py helmet 505 494 512 --poly=…"""
import sys, numpy as np, cv2
sys.path.insert(0, __file__.rsplit('/', 1)[0]); import stillkit as K
opt = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
REPO = '/home/user/circle.animaation.proto-2'
z = np.load('/tmp/work/st/helmet_stack.npz'); fr = list(z['frames'])
B = z['views'][fr.index(507)].astype(np.float32); ok = z['masks'][fr.index(507)]; Ht, Wt = B.shape[:2]
yy, xx = np.mgrid[0:Ht, 0:Wt].astype(np.float32)
POLY = [(563, 247), (912, 48), (851, 577), (823, 1001), (55, 1001), (76, 768)]         # the shard's outline in the still (s10.json)
inside = K.poly_mask(POLY, B.shape)
lum = lambda a: a @ np.array([0.114, 0.587, 0.299], np.float32)

# ---- the flare in the lower left: press down the low frequencies above a knee, keep the detail
low = cv2.GaussianBlur(B, (0, 0), 30)
L = lum(low); knee, cap = 150.0, 196.0
Lt = np.where(L > knee, knee + (cap - knee) * (1 - np.exp(-(L - knee) / (cap - knee))), L)
zone = np.clip((640 - xx) / 120.0, 0, 1) * np.clip((yy - 640) / 110.0, 0, 1)             # lower left only
S = B - (low - low * (Lt / np.maximum(L, 1))[..., None]) * zone[..., None]
# its burnt-out core has nothing under it: a soft continuation of what is around it (pressed down alone it turns grey)
burnt = (L > 208) & (zone > 0.3)
kb = (ok & ~cv2.dilate(burnt.astype(np.uint8), np.ones((25, 25), np.uint8)).astype(bool)).astype(np.float32)
core = np.zeros_like(S); den = np.zeros((Ht, Wt, 1), np.float32)
for sg, wt in ((30, 1.0), (90, 1e-3), (270, 1e-6)):
    core += wt * cv2.GaussianBlur(S * kb[..., None], (0, 0), sg); den += wt * cv2.GaussianBlur(kb, (0, 0), sg)[..., None]
core /= np.maximum(den, 1e-12)
wc = np.clip(cv2.GaussianBlur(burnt.astype(np.float32), (0, 0), 16) * 1.6, 0, 1)[..., None]
S = S * (1 - wc) + core * wc

# ---- the trail: a band along this axis, 48 px to the face's side, 105 px to the other
AXIS = [(430, 965), (500, 900), (600, 812), (700, 722), (800, 618), (860, 558), (930, 480), (1000, 410)]
fill, wb = K.band_fill(S, AXIS, float(opt.get('above', 48)), float(opt.get('below', 105)), along=(1.0, -1.0), margin=4.0, smooth=12.0)
grey = lum(fill)[..., None]
fill = fill + (grey - fill) * 0.45                    # the halo on both sides is yellow: take half of that out
S = S * (1 - wb) + fill * wb
# ---- the tip of the window in the upper right: arcs of the trail's loop — a soft continuation of the cabinet instead
tip = K.poly_mask([(770, 130), (912, 30), (961, 30), (961, 400), (880, 400), (800, 290)], B.shape)
k = (ok & ~tip & (wb[..., 0] < 0.05)).astype(np.float32)
soft_fill = np.zeros_like(S); den = np.zeros((Ht, Wt, 1), np.float32)
for sg, wt in ((22, 1.0), (70, 1e-3), (200, 1e-6)):
    soft_fill += wt * cv2.GaussianBlur(S * k[..., None], (0, 0), sg); den += wt * cv2.GaussianBlur(k, (0, 0), sg)[..., None]
soft_fill /= np.maximum(den, 1e-12)
wt_ = np.clip((cv2.GaussianBlur(tip.astype(np.float32), (0, 0), 9) - 0.25) / 0.5, 0, 1)[..., None]
S = S * (1 - wt_) + soft_fill * wt_
trail = tip | (wb[..., 0] > 0.5)

known = (ok | trail) & (cv2.erode(inside.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0) | (ok & ~trail)
out = K.fill_outside(np.where(known[..., None], S, 0), known, radius=8).astype(np.float32)
soft = cv2.GaussianBlur(out, (0, 0), 9)
far = np.clip(cv2.distanceTransform((~known).astype(np.uint8), cv2.DIST_L2, 3) / 30.0, 0, 1)[..., None]
out = out * (1 - far) + soft * far
dst = opt.get('out', '%s/public/footage/helmet.jpg' % REPO)
cv2.imwrite(dst, np.clip(out, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 93]); print('wrote', dst)
if 'view' in opt:
    im = K.grid(out); cv2.polylines(im, [np.array(POLY, np.int32)], True, (0, 0, 255), 2)
    cv2.imwrite(opt['view'], cv2.resize(im, None, fx=0.75, fy=0.75, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 90])
