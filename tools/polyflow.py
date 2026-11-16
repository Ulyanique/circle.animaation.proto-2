"""polyflow.py SHOT [F0 F1] [STEP] — per-frame image motion of a shot's geometry under the (smoothed) camera in the data JSON.
Samples every poly (edges + interior), projects with the camera of frame f and f+1 and reports the displacement of the
samples that are inside the 1280x720 frame: median, and the 10th percentile (a low p10 with a low median = the picture rests)."""
import json, sys, math, numpy as np
from scipy.spatial.transform import Rotation as R
REPO = '/home/user/circle.animaation.proto-2'
shot = sys.argv[1]; nums = [int(a) for a in sys.argv[2:]]
d = json.load(open('%s/src/shots/data/%s.json' % (REPO, shot)))
f0, f1 = (nums[0], nums[1]) if len(nums) >= 2 else (d['range'][0], d['range'][1])
step = nums[2] if len(nums) > 2 else 4
F = 360 / math.tan(math.radians(d.get('fov', 45) / 2))
cam = {int(k[0]): (np.array(k[1:4]), R.from_quat(k[4:8]).as_matrix()) for k in d['cam']}
P = []
for p in d['polys']:
    v = np.array(p['v'], float); n = len(v); c = v.mean(0)
    for i in range(n):
        a, b = v[i], v[(i + 1) % n]
        for t in np.linspace(0, 1, 24, endpoint=False):
            e = a + (b - a) * t
            for k in (1.0, 0.66, 0.33): P.append(c + (e - c) * k)
P = np.array(P)
def proj(f):
    C, M = cam[f]; q = (P - C) @ M
    z = -q[:, 2]; ok = z > 0.05
    return np.stack([640 + F * q[:, 0] / np.where(ok, z, 1), 360 - F * q[:, 1] / np.where(ok, z, 1)], 1), ok
rows = []
for f in range(f0, f1):
    if f not in cam or f + 1 not in cam: continue
    a, oa = proj(f); b, ob = proj(f + 1)
    vis = oa & ob & (a[:, 0] > 0) & (a[:, 0] < 1280) & (a[:, 1] > 0) & (a[:, 1] < 720)
    if vis.sum() < 5: rows.append((f, np.nan, np.nan, 0)); continue
    m = np.linalg.norm(b - a, axis=1)[vis]
    rows.append((f, float(np.median(m)), float(np.percentile(m, 10)), int(vis.sum())))
rows = np.array(rows)
print('%s f%d-%d: geometry flow px/frame (median / p10 of visible samples)' % (shot, f0, f1))
for i in range(0, len(rows), step):
    q = rows[i:i + step]
    print('  f%4d-%4d  med %6.2f  p10 %6.2f  min-med %6.2f  n %d' % (q[0, 0], q[-1, 0] + 1, np.nanmedian(q[:, 1]), np.nanmedian(q[:, 2]), np.nanmin(q[:, 1]), np.nanmedian(q[:, 3])))
k = np.nanargmin(rows[:, 1]); print('slowest frame f%d: median %.2f px/f' % (rows[k, 0], rows[k, 1]))
