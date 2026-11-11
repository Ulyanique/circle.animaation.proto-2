"""uvtrack.py SHOT [--T=30] [--c=3] [--span=F0,F1] [--dry] — motion of the footage INSIDE its shard.

In the original the footage is a clip that slides / zooms inside the facet while the facet itself moves with the camera.
The shot camera (data.cam, already smoothed) follows the facet, so here the footage content is tracked against the original
frames (SIFT, direct to the ref frame, chained through the neighbour when that fails) and expressed as a 2D similarity in the
screen's uv space:   uv_texture = M(f) * uv_geometry + t(f).   The 4 similarity parameters are refitted with a robust C2
smoothing spline (same as smoothcam.py), so the footage glides instead of being pinned to the facet like a sticker.
Writes data.screens[i].uv = {f0, rows: [[a, b, c, d, tx, ty] per frame]}; `rows` is read by src/shots/shot.js."""
import json, sys, os, math, numpy as np, cv2
from scipy.interpolate import make_smoothing_spline

REPO = '/home/user/circle.animaation.proto-2'
Fpx = 360 / math.tan(math.radians(22.5))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = dict(a[2:].split('=') if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
sid = args[0]; T = float(opt.get('T', 30)); cpx = float(opt.get('c', 3))
path = '%s/src/shots/data/%s.json' % (REPO, sid)
d = json.load(open(path))
f0, f1 = d['range']; ref = d['ref']
span = [int(x) for x in opt['span'].split(',')] if 'span' in opt else [f0, f1]

def quat_R(q):
    x, y, z, w = np.array(q, float) / np.linalg.norm(q)
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
CAM = {int(round(r[0])): (np.array(r[1:4], float), quat_R(r[4:8])) for r in d['cam']}
RAW = {int(round(r[0])): (np.array(r[1:4], float), quat_R(r[4:8])) for r in d.get('camRaw', d['cam'])}
def project(P, pose):
    C, Rm = pose; c = (np.asarray(P, float) - C) @ Rm
    return np.stack([640 + Fpx * c[:, 0] / -c[:, 2], 360 - Fpx * c[:, 1] / -c[:, 2]], 1)

clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
sift = cv2.SIFT_create(nfeatures=3000, contrastThreshold=0.012); bf = cv2.BFMatcher(cv2.NORM_L2)
_g = {}
def gray(f):
    if f not in _g: _g[f] = clahe.apply(cv2.cvtColor(cv2.imread('/tmp/work/frames/f_%04d.jpg' % f), cv2.COLOR_BGR2GRAY))
    return _g[f]
UV = np.float32([[0, 0], [1, 0], [1, 1], [0, 1]])

def match(fa, ma, fb, mb):
    ka, da = sift.detectAndCompute(gray(fa), ma); kb, db = sift.detectAndCompute(gray(fb), mb)
    if da is None or db is None or len(ka) < 8 or len(kb) < 8: return None, 0
    good = [x[0] for x in bf.knnMatch(da, db, k=2) if len(x) == 2 and x[0].distance < 0.78 * x[1].distance]
    if len(good) < 10: return None, 0
    pa = np.float32([ka[g.queryIdx].pt for g in good]); pb = np.float32([kb[g.trainIdx].pt for g in good])
    A, inl = cv2.estimateAffinePartial2D(pa, pb, method=cv2.RANSAC, ransacReprojThreshold=3.0, maxIters=4000)
    if A is None: return None, 0
    return np.vstack([A, [0, 0, 1]]), int(inl.sum())

for si, scr in enumerate(d['screens']):
    o, u, v = (np.array(scr[k], float) for k in 'ouv')
    corners = np.array([o, o + u, o + u + v, o + v]); lu, lv = np.linalg.norm(u), np.linalg.norm(v)
    polys = [np.array(p['v'], float) for p in d['polys'] if p.get('screen') == si + 1]
    def S(f, cam=CAM): return cv2.getPerspectiveTransform(UV, project(corners, cam[f]).astype(np.float32)).astype(float)
    def mask(f, grow):
        m = np.zeros((720, 1280), np.uint8)
        for P in polys: cv2.fillPoly(m, [np.round(np.clip(project(P, CAM[f]), -4000, 5000)).astype(np.int32)], 255)
        k = np.ones((2 * abs(grow) + 1,) * 2, np.uint8)
        return cv2.dilate(m, k) if grow > 0 else cv2.erode(m, k)
    G = S(ref, RAW)                                           # uv -> ref px, exactly as the texture was baked
    mref = np.zeros((720, 1280), np.uint8)
    for P in polys: cv2.fillPoly(mref, [np.round(project(P, RAW[ref])).astype(np.int32)], 255)
    mref = cv2.erode(mref, np.ones((13, 13), np.uint8))
    # sample points of the window in uv (and in metric plane units)
    quv = np.concatenate([np.stack([(P - o) @ u / lu ** 2, (P - o) @ v / lv ** 2], 1) for P in polys]).astype(np.float32)
    lo, hi = quv.min(0), quv.max(0)
    gx, gy = np.meshgrid(np.linspace(lo[0], hi[0], 14), np.linspace(lo[1], hi[1], 14))
    Q = np.stack([gx.ravel(), gy.ravel()], 1).astype(np.float32)
    ins = np.zeros(len(Q), bool)
    off = 0
    for P in polys:
        pu = quv[off:off + len(P)]; off += len(P)
        ins |= np.array([cv2.pointPolygonTest(pu.reshape(-1, 1, 2), (float(q[0]), float(q[1])), False) >= 0 for q in Q])
    Q = Q[ins].astype(float); qc = Q.mean(0); D = np.array([lu, lv])
    C = {ref: np.eye(3)}; how = {ref: 'ref'}
    tfile = '/home/user/work/tracks/%s_%s.json' % (sid, scr['name'])
    if 'reuse' in opt and os.path.exists(tfile):
        C = {int(k): np.array(v, float) for k, v in json.load(open(tfile)).items()}; how = {f: 'file' for f in C}
    elif opt.get('mode', 'flow') == 'flow':
        # dense flow inside the window between neighbouring frames -> similarity velocity -> robust smoothing -> integrate from ref
        dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
        ys, xs_ = np.mgrid[8:712:8, 8:1272:8]
        V = {}                                                   # f -> (dlog s, dtheta, dx, dy) of the content between f and f+1, about the window centre
        fl_frames = [f for f in range(span[0], span[1]) if f in CAM and f + 1 in CAM]
        for f in fl_frames:
            ga, gb = gray(f), gray(f + 1)
            fl = dis.calc(ga, gb, None)
            m = (mask(f, -18) > 0) & (mask(f + 1, -18) > 0)
            fa = cv2.imread('/tmp/work/frames/f_%04d.jpg' % f); fb = cv2.imread('/tmp/work/frames/f_%04d.jpg' % (f + 1))
            bright = cv2.dilate((np.maximum(fa.max(2), fb.max(2)) > 225).astype(np.uint8), np.ones((25, 25), np.uint8)) > 0
            g = cv2.GaussianBlur(cv2.cvtColor(fa, cv2.COLOR_BGR2GRAY), (0, 0), 2)
            tex = cv2.dilate((np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1)) > 6).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
            sel = (m & ~bright & tex)[ys, xs_]
            if sel.sum() < 80: V[f] = None; how[f] = '-'; continue
            pa = np.stack([xs_[sel], ys[sel]], 1).astype(np.float32); pb = pa + fl[ys[sel], xs_[sel]]
            A, inl = cv2.estimateAffinePartial2D(pa, pb, method=cv2.RANSAC, ransacReprojThreshold=1.5, maxIters=3000)
            if A is None or inl.mean() < float(opt.get('minin', 0.25)): V[f] = None; how[f] = '-'; continue
            cen = pa.mean(0); sh = A @ np.array([cen[0], cen[1], 1.0]) - cen
            V[f] = (math.log(math.hypot(A[0, 0], A[1, 0])), math.atan2(A[1, 0], A[0, 0]), sh[0], sh[1], cen[0], cen[1]); how[f] = 'f%.2f' % inl.mean()
        vf = np.array([f for f in fl_frames if V[f] is not None], float)
        vv = np.array([V[int(f)][:4] for f in vf])
        vT = float(opt.get('vT', 14)); vlam = (vT / (2 * math.pi)) ** 4
        vs = np.zeros((len(fl_frames), 4))
        for k in range(4):
            w = np.ones(len(vf)); sc = max(1e-6, 1.4826 * np.median(np.abs(vv[:, k] - np.median(vv[:, k]))) * 0.6)
            for it in range(6):
                sp = make_smoothing_spline(vf, vv[:, k], w=w, lam=vlam); r = vv[:, k] - sp(vf); w = 1 / (1 + (r / sc) ** 2)
            vs[:, k] = np.clip(sp(np.clip(np.array(fl_frames, float), vf[0], vf[-1])), vv[:, k].min(), vv[:, k].max())
        if 'raw' in opt:
            for i, f in enumerate(fl_frames):
                if i % int(opt['raw']) == 0:
                    r = V[f]; print('   vel %4d %-6s raw %s | smooth zoom %6.3f%% rot %6.3f  d (%6.2f, %6.2f)' % (f, how[f],
                        ('zoom %6.3f%% rot %6.3f d (%6.2f, %6.2f)' % (r[0] * 100, math.degrees(r[1]), r[2], r[3])) if r else '-' * 40, vs[i, 0] * 100, math.degrees(vs[i, 1]), vs[i, 2], vs[i, 3]))
        cen = np.mean([V[int(f)][4:6] for f in vf], 0)
        def step(v):                                               # frame -> frame+1 similarity about `cen`
            s_, th = math.exp(v[0]), v[1]; a_, b_ = s_ * math.cos(th), s_ * math.sin(th)
            M = np.array([[a_, -b_], [b_, a_]]); t_ = cen + v[2:4] - M @ cen
            return np.array([[a_, -b_, t_[0]], [b_, a_, t_[1]], [0, 0, 1]])
        idx = {f: i for i, f in enumerate(fl_frames) if vf[0] <= f <= vf[-1]}      # only where the content was really measured
        f = ref
        while f in idx: C[f + 1] = step(vs[idx[f]]) @ C[f]; f += 1
        f = ref
        while f - 1 in idx: C[f - 1] = np.linalg.inv(step(vs[idx[f - 1]])) @ C[f]; f -= 1
    else:
      for direction in (1, -1):
        last = ref
        rng = range(ref + 1, span[1] + 1) if direction > 0 else range(ref - 1, span[0] - 1, -1)
        for f in rng:
            if f not in CAM: continue
            mb = mask(f, 40)
            A, n = match(ref, mref, f, mb)
            if A is not None and n >= 25: C[f] = A; how[f] = 'd%d' % n; last = f; continue
            if abs(f - last) <= 8:
                B, n2 = match(last, mask(last, 0) if last != ref else mref, f, mb)
                if B is not None and n2 >= 14: C[f] = B @ C[last]; how[f] = 'c%d' % n2; last = f; continue
            if A is not None and n >= 14: C[f] = A; how[f] = 'd%d' % n; last = f; continue
            how[f] = '-'
    if 'reuse' not in opt:
        os.makedirs(os.path.dirname(tfile), exist_ok=True)
        json.dump({str(f): [[round(float(x), 6) for x in r] for r in C[f]] for f in sorted(C)}, open(tfile, 'w'))
    fr = np.array(sorted(C)); P4 = []
    for f in fr:
        Tm = np.linalg.inv(G) @ np.linalg.inv(C[f]) @ S(f)                 # geometric uv -> texture uv (homography)
        Qh = np.hstack([Q, np.ones((len(Q), 1))]) @ Tm.T; Qp = Qh[:, :2] / Qh[:, 2:]
        X = (Q - qc) * D; Y = (Qp - qc) * D                                # metric plane units, about the window centre
        # similarity  Y = s R X + t  (least squares)
        xm, ym = X.mean(0), Y.mean(0); Xc, Yc = X - xm, Y - ym
        a = (Xc * Yc).sum() / (Xc ** 2).sum(); b = (Xc[:, 0] * Yc[:, 1] - Xc[:, 1] * Yc[:, 0]).sum() / (Xc ** 2).sum()
        t = ym - np.array([a * xm[0] - b * xm[1], b * xm[0] + a * xm[1]])
        P4.append([math.log(math.hypot(a, b)), math.atan2(b, a), t[0], t[1]])
    P4 = np.array(P4)
    if 'raw' in opt:
        for i, f in enumerate(fr):
            if i % int(opt['raw']) == 0 and opt.get('mode', 'flow') != 'flow': print('   raw %4d %-5s scale %.3f rot %7.2f t (%7.3f, %7.3f)' % (f, how[f], math.exp(P4[i, 0]), math.degrees(P4[i, 1]), P4[i, 2], P4[i, 3]))
    def apply(p, X):
        s, th = math.exp(p[0]), p[1]; a, b = s * math.cos(th), s * math.sin(th)
        return np.stack([a * X[:, 0] - b * X[:, 1] + p[2], b * X[:, 0] + a * X[:, 1] + p[3]], 1)
    X = (Q - qc) * D; px_per_unit = Fpx / max(1e-3, -np.mean(corners[:, 2]))
    w = np.ones(len(fr)); lam = (T / (2 * math.pi)) ** 4
    if len(fr) >= 6:
        for it in range(8):
            Gs = np.stack([make_smoothing_spline(fr.astype(float), P4[:, k], w=w, lam=lam)(fr) for k in range(4)], 1)
            dev = np.array([np.sqrt(np.mean(np.sum((apply(P4[i], X) - apply(Gs[i], X)) ** 2, 1))) for i in range(len(fr))]) * px_per_unit
            w = 1 / (1 + (dev / cpx) ** 2) if opt.get('mode', 'flow') != 'flow' else np.ones(len(fr))
        spl = [make_smoothing_spline(fr.astype(float), P4[:, k], w=w, lam=lam) for k in range(4)]
    else:
        dev = np.zeros(len(fr)); spl = [(lambda k: (lambda x: np.interp(x, fr, P4[:, k])))(k) for k in range(4)]
    xs = np.arange(f0 - 1, f1 + 3)
    out = np.zeros((len(xs), 4))
    for k in range(4):
        e0, e1 = float(fr[0]), float(fr[-1])
        val = lambda x: float(spl[k](x))
        slope0 = (val(e0 + 1) - val(e0)); slope1 = (val(e1) - val(e1 - 1))
        for i, x in enumerate(xs):
            if x < e0: out[i, k] = val(e0) - slope0 * min(e0 - x, float(opt.get('lead', 12)))
            elif x > e1: out[i, k] = val(e1) + slope1 * min(x - e1, float(opt.get('lead', 12)))
            else: out[i, k] = val(float(x))
    rows = []; ext = [9, -9, 9, -9]
    for i, x in enumerate(xs):
        s, th = math.exp(out[i, 0]), out[i, 1]; a, b = s * math.cos(th), s * math.sin(th)
        M = np.array([[a, -b], [b, a]]); Muv = np.diag(1 / D) @ M @ np.diag(D)       # metric -> uv
        t = qc + out[i, 2:4] / D - Muv @ qc
        rows.append([round(float(z), 6) for z in (Muv[0, 0], Muv[0, 1], Muv[1, 0], Muv[1, 1], t[0], t[1])])
        if span[0] <= x <= span[1]:
            Qp = Q @ Muv.T + t
            ext = [min(ext[0], Qp[:, 0].min()), max(ext[1], Qp[:, 0].max()), min(ext[2], Qp[:, 1].min()), max(ext[3], Qp[:, 1].max())]
    print('%s screen %s: tracked %d of %d frames (%d direct, %d chained), window uv x %.2f..%.2f y %.2f..%.2f' % (
        sid, scr['name'], len(fr), span[1] - span[0] + 1, sum(1 for h in how.values() if h[0] == 'd'), sum(1 for h in how.values() if h[0] == 'c'), lo[0], hi[0], lo[1], hi[1]))
    print('  texture uv used over the shot: u %.3f..%.3f  v %.3f..%.3f   (outside 0..1 = texture border visible)' % tuple(ext))
    print('  raw->smooth deviation px: median %.1f  p90 %.1f  max %.1f ; untracked: %s' % (np.median(dev), np.percentile(dev, 90), dev.max(),
          ' '.join(str(f) for f, h in sorted(how.items()) if h == '-')[:120]))
    print('  frame: scale  rot°  shift px (footage relative to its shard, smooth)')
    for x in range(span[0], span[1] + 1, max(1, (span[1] - span[0]) // 12)):
        i = int(x - xs[0]); print('  %5d: %.3f %6.2f  (%6.1f, %6.1f)   raw %s' % (x, math.exp(out[i, 0]), math.degrees(out[i, 1]), out[i, 2] * px_per_unit, out[i, 3] * px_per_unit, how.get(x, '?')))
    scr['uv'] = dict(f0=int(xs[0]), rows=rows)
if 'dry' not in opt:
    json.dump(d, open(path, 'w'), separators=(',', ':')); print('wrote', path)
