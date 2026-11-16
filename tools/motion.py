"""motion.py [poses.json] — camera motion report from poses.mjs output.
Screen flow = median pixel displacement per frame of the shot's world geometry (poly vertices) as seen by the camera."""
import json, sys, glob, os, math
import numpy as np
REPO = '/home/user/circle.animaation.proto-2'
rows = json.load(open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/work/motion/poses.json'))
F = 360 / math.tan(math.radians(22.5))
def rot(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
pts = {}
for p in glob.glob(REPO + '/src/shots/data/*.json'):
    d = json.load(open(p))
    v = [x for poly in d.get('polys', []) for x in poly.get('v', [])]
    if v: pts[d['id']] = np.array(v, float)
def project(P, pos, q, fov):
    f = 360 / math.tan(math.radians(fov / 2))
    c = (P - np.array(pos)) @ rot(q)            # world -> camera (R^T (P - p))
    ok = c[:, 2] < -0.2
    px = np.stack([640 + f * c[:, 0] / -c[:, 2], 360 - f * c[:, 1] / -c[:, 2]], 1)
    return px, ok
fr = np.array([r[0] for r in rows]); ids = [r[1] for r in rows]
step = fr[1] - fr[0]
flow = np.full(len(rows), np.nan); tv = np.zeros(len(rows)); av = np.zeros(len(rows))
for i in range(1, len(rows)):
    if ids[i] != ids[i - 1]: flow[i] = np.nan; continue
    a, b = rows[i - 1], rows[i]
    tv[i] = np.linalg.norm(np.array(b[2:5]) - np.array(a[2:5])) / step
    qa, qb = np.array(a[5:9]), np.array(b[5:9])
    av[i] = math.degrees(2 * math.acos(min(1.0, abs(float(qa @ qb))))) / step
    P = pts.get(ids[i])
    if P is None:      # no geometry: a virtual point cloud 9 units ahead of the first pose of the shot
        continue
    pa, oka = project(P, a[2:5], a[5:9], a[9]); pb, okb = project(P, b[2:5], b[5:9], b[9])
    ok = oka & okb & (np.abs(pa[:, 0] - 640) < 1600) & (np.abs(pa[:, 1] - 360) < 1200)
    if ok.sum() >= 3: flow[i] = np.median(np.linalg.norm(pb[ok] - pa[ok], axis=1)) / step
out = dict(frames=fr.tolist(), ids=ids, flow=[None if np.isnan(x) else float(x) for x in flow], tv=tv.tolist(), av=av.tolist())
json.dump(out, open('/tmp/work/motion/flow.json', 'w'))
print('%-5s %-11s %7s %7s %7s | %8s %8s | %-28s | %s' % ('shot', 'frames', 'flowmin', 'median', 'max', 'jitter', 'accmax', 'frozen (flow<0.35px/f)', 'cam speed min/med (u/f, deg/f)'))
seen = []
for s in ids:
    if s not in seen: seen.append(s)
for s in seen:
    m = np.array([x == s for x in ids])
    idx = np.where(m)[0][1:]
    f0, f1 = fr[m][0], fr[m][-1]
    fl = flow[idx]
    if np.all(np.isnan(fl)):
        print('%-5s %4d-%-6d  (no geometry)                     cam %.4f/%.4f u/f  %.3f/%.3f deg/f' % (s, f0, f1, tv[idx].min(), np.median(tv[idx]), av[idx].min(), np.median(av[idx])))
        continue
    fl2 = np.nan_to_num(fl, nan=np.nanmedian(fl))
    # jitter: RMS of the flow speed around its 9-frame moving average; acc: biggest speed change per frame
    k = max(3, int(round(9 / step)) | 1)
    sm = np.convolve(np.pad(fl2, k // 2, mode='edge'), np.ones(k) / k, mode='valid')
    jit = float(np.sqrt(np.mean((fl2 - sm) ** 2)))
    acc = float(np.max(np.abs(np.diff(fl2))) / step)
    frozen = fr[idx][fl2 < 0.35]
    segs = []
    if len(frozen):
        a = b = frozen[0]
        for x in frozen[1:]:
            if x - b <= step * 1.01: b = x
            else: segs.append((a, b)); a = b = x
        segs.append((a, b))
    segs = ['%d-%d' % (a, b) for a, b in segs if b - a >= 2]
    print('%-5s %4d-%-6d %7.2f %7.2f %7.2f | %8.3f %8.2f | %-28s | %.4f/%.4f  %.3f/%.3f' % (s, f0, f1, fl2.min(), np.median(fl2), fl2.max(), jit, acc, ','.join(segs)[:28] or '-', tv[idx].min(), np.median(tv[idx]), av[idx].min(), np.median(av[idx])))
