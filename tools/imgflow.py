"""imgflow.py NAME PATTERN F0 F1 [STEPMUL] — image motion of a frame sequence (video frames or renders), per consecutive pair:
median LK feature displacement (px at 1280 scale / frame), global shift vector (median dx, dy) and mean abs difference.
PATTERN is a printf pattern taking the frame number (use %(f100)06d style via 'r' prefix: 'render:DIR')."""
import json, sys, numpy as np, cv2
name, pat, f0, f1 = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
def load(f):
    p = (pat[7:] + '/r_%06d.jpg' % (f * 100)) if pat.startswith('render:') else pat % f
    g = cv2.imread(p, cv2.IMREAD_GRAYSCALE)
    if g is None: return None
    if g.shape[1] != 640: g = cv2.resize(g, (640, 360), interpolation=cv2.INTER_AREA)
    return g
out = []; prev = None
for f in range(f0, f1 + 1):
    g = load(f)
    if prev is not None and g is not None:
        row = dict(f=f, diff=float(np.mean(np.abs(g.astype(np.float32) - prev.astype(np.float32)))))
        p0 = cv2.goodFeaturesToTrack(prev, 300, 0.01, 8)
        if p0 is not None and len(p0) >= 12:
            p1, st, _ = cv2.calcOpticalFlowPyrLK(prev, g, p0, None, winSize=(21, 21), maxLevel=4)
            p0b, st2, _ = cv2.calcOpticalFlowPyrLK(g, prev, p1, None, winSize=(21, 21), maxLevel=4)
            ok = (st.ravel() == 1) & (st2.ravel() == 1) & (np.linalg.norm((p0 - p0b).reshape(-1, 2), axis=1) < 0.7)
            if ok.sum() >= 10:
                d = (p1 - p0).reshape(-1, 2)[ok] * 2.0
                row.update(mag=float(np.median(np.linalg.norm(d, axis=1))), dx=float(np.median(d[:, 0])), dy=float(np.median(d[:, 1])), n=int(ok.sum()))
        out.append(row)
    prev = g
json.dump(out, open('/tmp/work/motion/img_%s.json' % name, 'w'))
print(name, len(out), 'pairs, with flow:', sum(1 for o in out if 'mag' in o))
