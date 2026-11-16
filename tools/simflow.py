"""simflow.py SRC F0 F1 [STEP] — frame-to-frame similarity motion (zoom %/f, roll deg/f, shift px/f at 1280 scale).
SRC = orig | render:DIR.  Dense DIS flow on 640x360 gray, bright (streak/flare) and flat pixels masked out,
robust similarity fit. Prints a table every STEP frames (averaged) and the totals over the range."""
import sys, numpy as np, cv2
src, f0, f1 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
step = int(sys.argv[4]) if len(sys.argv) > 4 else 4
def load(f):
    p = '/tmp/work/frames/f_%04d.jpg' % f if src == 'orig' else '%s/r_%06d.jpg' % (src.split(':', 1)[1], f * 100)
    im = cv2.imread(p)
    if im is None: raise SystemExit('missing ' + p)
    return cv2.resize(im, (640, 360), interpolation=cv2.INTER_AREA)
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
ys, xs = np.mgrid[6:354:6, 6:634:6]
rows = []
prev = load(f0); pg = clahe.apply(cv2.cvtColor(prev, cv2.COLOR_BGR2GRAY))
for f in range(f0 + 1, f1 + 1):
    cur = load(f); cg = clahe.apply(cv2.cvtColor(cur, cv2.COLOR_BGR2GRAY))
    fl = dis.calc(pg, cg, None)
    v = np.maximum(prev.max(2), cur.max(2))
    bright = cv2.dilate((v > 205).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
    g = cv2.GaussianBlur(cv2.cvtColor(prev, cv2.COLOR_BGR2GRAY), (0, 0), 1.5)
    grad = np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))
    ok = (~bright) & (cv2.dilate((grad > 12).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0)
    m = ok[ys, xs]
    if m.sum() < 60: rows.append([f, np.nan] * 3); prev, pg = cur, cg; continue
    a = np.stack([xs[m], ys[m]], 1).astype(np.float32); b = a + fl[ys[m], xs[m]]
    A, inl = cv2.estimateAffinePartial2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=1.0, maxIters=3000)
    if A is None: rows.append([f] + [np.nan] * 5); prev, pg = cur, cg; continue
    s = np.hypot(A[0, 0], A[1, 0]); rot = np.degrees(np.arctan2(A[1, 0], A[0, 0]))
    c = A @ np.array([320, 180, 1.0]) - np.array([320, 180.0])       # shift of the frame centre
    med = float(np.median(np.hypot(*fl[ys[m], xs[m]].T)))
    rows.append([f, (s - 1) * 100, rot, c[0] * 2, c[1] * 2, inl.mean(), med * 2])
    prev, pg = cur, cg
R = np.array([r if len(r) == 7 else [r[0]] + [np.nan] * 6 for r in rows], float)
print('frames      zoom%/f  roll°/f   dx/f   dy/f  inl  med|flow|')
for i in range(0, len(R), step):
    q = R[i:i + step]
    with np.errstate(all='ignore'):
        mean = np.nanmean(q[:, 1:], 0)
    print('%4d-%4d  %7.3f  %7.3f  %6.2f %6.2f  %.2f  %6.2f' % (q[0, 0] - 1, q[-1, 0], *mean))
z = np.nansum(np.log1p(R[:, 1] / 100)); print('total: zoom x%.3f  roll %.1f°  shift (%.0f, %.0f) px  mean|flow| %.2f' % (np.exp(z), np.nansum(R[:, 2]), np.nansum(R[:, 3]), np.nansum(R[:, 4]), np.nanmean(R[:, 6])))
