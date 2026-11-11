import cv2, numpy as np, sys
a, b = int(sys.argv[1]), int(sys.argv[2])
step = 1
def load(n):
    return cv2.imread('/tmp/work/frames/f_%04d.jpg' % n)
def prep(im):
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    return clahe.apply(g)
im0 = load(a); g0 = prep(im0)
pts = cv2.goodFeaturesToTrack(g0, maxCorners=250, qualityLevel=0.01, minDistance=18, blockSize=9)
pts = pts.reshape(-1, 2).astype(np.float32)
lk = dict(winSize=(31, 31), maxLevel=4, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 40, 0.01))
tracks = [pts.copy()]
alive = np.ones(len(pts), bool)
prev = g0; cur = pts.copy()
rng = range(a + step, b + 1, step) if b > a else range(a - step, b - 1, -step)
for n in rng:
    g = prep(load(n))
    nxt, st, err = cv2.calcOpticalFlowPyrLK(prev, g, cur.reshape(-1, 1, 2), None, **lk)
    back, st2, _ = cv2.calcOpticalFlowPyrLK(g, prev, nxt, None, **lk)
    fb = np.linalg.norm(back.reshape(-1, 2) - cur, axis=1)
    alive &= (st.ravel() == 1) & (st2.ravel() == 1) & (fb < 1.5)
    cur = nxt.reshape(-1, 2)
    tracks.append(cur.copy())
    prev = g
print('alive', alive.sum(), 'of', len(pts))
out = load(b).copy()
tr = np.array(tracks)
for i in range(len(pts)):
    if not alive[i]: continue
    p = tr[:, i, :].astype(np.int32)
    cv2.polylines(out, [p.reshape(-1, 1, 2)], False, (0, 255, 0), 1, cv2.LINE_AA)
    cv2.circle(out, tuple(p[-1]), 3, (0, 0, 255), -1)
    cv2.circle(out, tuple(p[0]), 2, (255, 128, 0), -1)
cv2.imwrite('/tmp/work/sheets/lk_%d_%d.jpg' % (a, b), out)
