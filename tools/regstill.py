"""regstill.py NAME FRAME [--poly=x,y,x,y,..] [--out=PATH] [--ratio=0.75] [--view=PATH]
Finds where an ORIGINAL video frame sits in an existing footage still: SIFT matches between the frame (inside --poly,
video pixels) and public/footage/NAME.jpg → homography frame → still (RANSAC). Saves it as /tmp/work/st/NAME_fFRAME.npy
and, with --view, a sheet: old still | frame warped into the still | checkerboard of the two.
Importable: `register(name, frame, poly)` → (H, n_inliers), `warp(frame, H, size)`."""
import cv2, numpy as np, sys
REPO = '/home/user/circle.animaation.proto-2'
def load_frame(f): return cv2.imread('/tmp/work/frames/f_%04d.jpg' % f)
def load_still(name): return cv2.imread('%s/public/footage/%s.jpg' % (REPO, name))
def poly_mask(poly, shape=(720, 1280)):
    m = np.zeros(shape, np.uint8)
    if poly is None: m[:] = 255
    else: cv2.fillPoly(m, [np.array(poly, np.float32).reshape(-1, 2).astype(np.int32)], 255)
    return m
def register(still, frame, mask=None, ratio=0.75, thr=3.0):
    sift = cv2.SIFT_create(nfeatures=6000, contrastThreshold=0.02)
    ka, da = sift.detectAndCompute(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), mask)
    kb, db = sift.detectAndCompute(cv2.cvtColor(still, cv2.COLOR_BGR2GRAY), None)
    m = cv2.BFMatcher().knnMatch(da, db, k=2)
    good = [a for a, b in m if a.distance < ratio * b.distance]
    if len(good) < 8: return None, 0, len(good)
    src = np.float32([ka[g.queryIdx].pt for g in good]); dst = np.float32([kb[g.trainIdx].pt for g in good])
    H, inl = cv2.findHomography(src, dst, cv2.RANSAC, thr)
    return H, int(inl.sum()) if inl is not None else 0, len(good)
def warp(img, H, size, flags=cv2.INTER_LANCZOS4, border=cv2.BORDER_CONSTANT):
    return cv2.warpPerspective(img, H, size, flags=flags, borderMode=border)
if __name__ == '__main__':
    name, f = sys.argv[1], int(sys.argv[2])
    opt = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[3:] if a.startswith('--'))
    poly = [float(x) for x in opt['poly'].split(',')] if 'poly' in opt else None
    still = load_still(name); frame = load_frame(f); Ht, Wt = still.shape[:2]
    mask = poly_mask(poly)
    H, n, g = register(still, frame, mask, float(opt.get('ratio', 0.75)))
    print('matches %d, inliers %d' % (g, n))
    if H is None: sys.exit(1)
    np.save(opt.get('out', '/tmp/work/st/%s_f%d.npy' % (name, f)), H)
    c = np.float32([[0, 0], [1280, 0], [1280, 720], [0, 720]]).reshape(-1, 1, 2)
    print('frame corners in the still:', cv2.perspectiveTransform(c, H).reshape(-1, 2).round().tolist())
    if 'view' in opt:
        w = warp(frame, H, (Wt, Ht)); wm = warp(mask, H, (Wt, Ht), cv2.INTER_NEAREST) > 127
        w[~wm] = (40, 0, 40)
        yy, xx = np.mgrid[0:Ht, 0:Wt]; chk = ((yy // 64 + xx // 64) % 2 == 0)[..., None]
        mix = np.where(chk & wm[..., None], w, still)
        cv2.imwrite(opt['view'], np.hstack([still, w, mix]), [cv2.IMWRITE_JPEG_QUALITY, 88]); print(opt['view'])
