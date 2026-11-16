"""regflow.py SRC F0 F1 STEP 'x,y x,y ...' [margin] — median frame-to-frame flow (px/f at 1280 scale) INSIDE a polygon
(shrunk by margin) and OUTSIDE it (grown by margin): footage content vs the shards around it. SRC = orig | render:DIR."""
import sys, numpy as np, cv2
src, f0, f1, step = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
poly = np.array([[float(v) for v in p.split(',')] for p in sys.argv[5].split()], np.float32) / 2
margin = (int(sys.argv[6]) if len(sys.argv) > 6 else 60) // 2
def load(f):
    p = '/tmp/work/frames/f_%04d.jpg' % f if src == 'orig' else '%s/r_%06d.jpg' % (src.split(':', 1)[1], f * 100)
    return cv2.resize(cv2.imread(p), (640, 360), interpolation=cv2.INTER_AREA)
m = np.zeros((360, 640), np.uint8); cv2.fillPoly(m, [np.round(poly).astype(np.int32)], 255)
k = np.ones((2 * margin + 1,) * 2, np.uint8)
inside = cv2.erode(m, k) > 0; outside = cv2.dilate(m, k) == 0
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
prev = load(f0); pg = clahe.apply(cv2.cvtColor(prev, cv2.COLOR_BGR2GRAY)); rows = []
for f in range(f0 + 1, f1 + 1):
    cur = load(f); cg = clahe.apply(cv2.cvtColor(cur, cv2.COLOR_BGR2GRAY))
    fl = dis.calc(pg, cg, None) * 2
    bright = cv2.dilate((np.maximum(prev.max(2), cur.max(2)) > 215).astype(np.uint8), np.ones((13, 13), np.uint8)) > 0
    g = cv2.GaussianBlur(cv2.cvtColor(prev, cv2.COLOR_BGR2GRAY), (0, 0), 1.5)
    tex = cv2.dilate((np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1)) > 10).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
    r = [f]
    for reg in (inside, outside):
        s = reg & tex & ~bright
        r += [np.median(fl[..., 0][s]), np.median(fl[..., 1][s]), s.mean()] if s.sum() > 300 else [np.nan] * 3
    rows.append(r); prev, pg = cur, cg
R = np.array(rows, float)
print('frames       inside dx   dy  (area)   | outside dx   dy  (area)')
for i in range(0, len(R), step):
    q = R[i:i + step]
    with np.errstate(all='ignore'): a = np.nanmean(q[:, 1:], 0)
    print('%4d-%4d   %7.2f %6.2f  (%.2f)   | %7.2f %6.2f  (%.2f)' % (q[0, 0] - 1, q[-1, 0], *a))
