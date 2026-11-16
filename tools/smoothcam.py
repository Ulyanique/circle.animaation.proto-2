"""smoothcam.py OUTDIR [shot ...] — refit the baked camera track of every shot with a robust C2 smoothing spline.

The per-frame camera poses come from tracking and are noisy (and wrong where the tracker lost the picture). The real camera of
the original moves on a smooth path, so each of the 6 pose components (position + rotation vector) is replaced by a cubic
smoothing spline g minimising  sum w_f (y_f - g(f))^2 + lam * int g''^2 , with w_f from an IRLS loop on the screen-space
deviation (frames where the raw pose is a glitch get ~0 weight). Outside the data the natural spline continues with constant
velocity, so the camera never stops at the ends of a shot. `camRaw` keeps the original track; `cam` gets the smooth one.
"""
import json, sys, os, math, glob
import numpy as np
from scipy.interpolate import make_smoothing_spline
from scipy.spatial.transform import Rotation as R

REPO = '/home/user/circle.animaation.proto-2'
F = 360 / math.tan(math.radians(22.5))
# per-shot options: T = cutoff period in frames (bigger = smoother), c = robust scale in px, use = trusted raw frames,
# drop = [(f0, f1)] raw frames to ignore, keys = sparse hand keys (interpolate, no smoothing), gain = scale of the move about the ref pose
OPT = {
    'default': dict(T=36, c=4.0),
}
OPT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'smoothcam_opts.json')
if os.path.exists(OPT_FILE): OPT.update(json.load(open(OPT_FILE)))

PTS = np.array([[0, 0, -9], [-3, -2, -9], [3, -2, -9], [3, 2, -9], [-3, 2, -9]], float)   # screen-ish points in front of the ref camera

def project(pos, rv, P=PTS):
    Rm = R.from_rotvec(rv).as_matrix()
    c = (P - pos) @ Rm
    return np.stack([640 + F * c[:, 0] / -c[:, 2], 360 - F * c[:, 1] / -c[:, 2]], 1)

def lam_of(T): return (T / (2 * math.pi)) ** 4

def fit(shot_id, d, o):
    raw = np.array(d.get('camRaw') or d['cam'], float)
    fr = raw[:, 0]
    q = raw[:, 4:8].copy()
    for i in range(1, len(q)):
        if q[i] @ q[i - 1] < 0: q[i] = -q[i]
    rv = R.from_quat(q).as_rotvec()
    Y = np.hstack([raw[:, 1:4], rv])
    f0, f1 = d['range']
    xs = np.arange(f0 - 1, f1 + 2.001, 1.0)                    # the player needs poses for [f0, f1 + 1)
    if len(fr) < 5 or o.get('keys'):                           # sparse hand keys: natural cubic interpolation, linear outside
        from scipy.interpolate import CubicSpline
        if len(fr) == 2:
            G = Y[0] + (xs[:, None] - fr[0]) / (fr[1] - fr[0]) * (Y[1] - Y[0])
        else:
            cs = CubicSpline(fr, Y, bc_type='natural')
            G = cs(xs)
            for sel, k in ((xs < fr[0], 0), (xs > fr[-1], -1)):
                G[sel] = Y[k] + (xs[sel, None] - fr[k]) * cs(fr[k], 1)
        return xs, G, None, raw
    w = np.ones(len(fr))
    if 'use' in o: w *= ((fr >= o['use'][0]) & (fr <= o['use'][1]))
    for a, b in o.get('drop', []): w *= ~((fr >= a) & (fr <= b))
    base = np.maximum(w, 1e-6)
    lam = lam_of(o.get('T', 36))
    wr = base.copy()
    for it in range(8):
        G = np.stack([make_smoothing_spline(fr, Y[:, k], w=wr, lam=lam)(fr) for k in range(6)], 1)
        dev = np.array([np.sqrt(np.mean(np.sum((project(Y[i, :3], Y[i, 3:]) - project(G[i, :3], G[i, 3:])) ** 2, 1))) for i in range(len(fr))])
        wr = base / (1 + (dev / o.get('c', 4.0)) ** 2)
    spl = [make_smoothing_spline(fr, Y[:, k], w=wr, lam=lam) for k in range(6)]
    G = np.zeros((len(xs), 6))
    inside = (xs >= fr[0]) & (xs <= fr[-1])
    for k in range(6):
        G[inside, k] = spl[k](xs[inside])
        for sel, e in ((xs < fr[0], fr[0]), (xs > fr[-1], fr[-1])):
            G[sel, k] = spl[k](e) + (xs[sel] - e) * spl[k].derivative()(e)
    if o.get('gain', 1) != 1:       # exaggerate the move about the ref pose (shots whose tracked drift is too slow to read as flight)
        r0 = np.array([np.interp(d['ref'], xs, G[:, k]) for k in range(6)])
        G = r0 + o['gain'] * (G - r0)
    return xs, G, (fr, dev, wr / base), raw

def main():
    outdir = sys.argv[1]; os.makedirs(outdir, exist_ok=True)
    ids = sys.argv[2:] or sorted(os.path.basename(p)[:-5] for p in glob.glob(REPO + '/src/shots/data/*.json'))
    print('%-5s %5s | %-26s | %-22s | %s' % ('shot', 'T', 'deviation raw->smooth px', 'accel px/f^2 raw->new', 'low-weight frames'))
    for sid in ids:
        d = json.load(open('%s/src/shots/data/%s.json' % (REPO, sid)))
        o = dict(OPT['default']); o.update(OPT.get(sid, {}))
        xs, G, info, raw = fit(sid, d, o)
        if 'camRaw' not in d: d['camRaw'] = d['cam']
        quat = R.from_rotvec(G[:, 3:]).as_quat()
        d['cam'] = [[float(x)] + [round(float(v), 5) for v in G[i, :3]] + [round(float(v), 6) for v in quat[i]] for i, x in enumerate(xs)]
        json.dump(d, open('%s/%s.json' % (outdir, sid), 'w'), separators=(',', ':'))
        def accel(fr, Y):
            P = np.array([project(Y[i, :3], Y[i, 3:]) for i in range(len(fr))])
            a = P[2:] - 2 * P[1:-1] + P[:-2]
            return float(np.sqrt(np.mean(np.sum(a ** 2, 2)))) if len(P) > 2 else 0.0
        if info is None:
            print('%-5s %5s | %-26s | %-22s |' % (sid, 'keys', '-', '-> %.2f' % accel(xs, G)))
            continue
        fr, dev, wrel = info
        q = raw[:, 4:8].copy()
        for i in range(1, len(q)):
            if q[i] @ q[i - 1] < 0: q[i] = -q[i]
        Yraw = np.hstack([raw[:, 1:4], R.from_quat(q).as_rotvec()])
        good = wrel > 0.5
        low = fr[wrel < 0.2]
        segs = []
        if len(low):
            a = b = low[0]
            for x in low[1:]:
                if x - b <= 1: b = x
                else: segs.append((a, b)); a = b = x
            segs.append((a, b))
        print('%-5s %5.0f | med %5.1f  p90 %5.1f max %6.1f | %6.2f -> %5.2f | %s' % (sid, o.get('T', 36), np.median(dev[good]), np.percentile(dev[good], 90), dev[good].max(),
              accel(fr, Yraw), accel(xs, G), ' '.join('%d-%d' % s for s in segs)[:60]))
main()
