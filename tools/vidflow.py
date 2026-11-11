"""vidflow.py — global image motion of the ORIGINAL video per frame (median LK feature displacement, px/frame) -> motion/vidflow.json"""
import json, numpy as np, cv2
out = []
prev = None
for f in range(1, 1214):
    g = cv2.imread('/tmp/work/frames/f_%04d.jpg' % f, cv2.IMREAD_GRAYSCALE)
    if prev is not None:
        p0 = cv2.goodFeaturesToTrack(prev, 400, 0.01, 12)
        v = None
        if p0 is not None and len(p0) >= 12:
            p1, st, err = cv2.calcOpticalFlowPyrLK(prev, g, p0, None, winSize=(31, 31), maxLevel=4)
            p0b, st2, _ = cv2.calcOpticalFlowPyrLK(g, prev, p1, None, winSize=(31, 31), maxLevel=4)
            ok = (st.ravel() == 1) & (st2.ravel() == 1) & (np.linalg.norm((p0 - p0b).reshape(-1, 2), axis=1) < 1.0)
            if ok.sum() >= 10:
                d = np.linalg.norm((p1 - p0).reshape(-1, 2)[ok], axis=1)
                v = [float(np.median(d)), float(np.percentile(d, 25)), float(np.percentile(d, 75)), int(ok.sum())]
        out.append([f, v])
    prev = g
json.dump(out, open('/tmp/work/motion/vidflow.json', 'w'))
print('done', len(out), 'valid', sum(1 for o in out if o[1]))
