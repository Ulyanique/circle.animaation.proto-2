#!/usr/bin/env python
"""bake.py SHOT_ID [--no-tex] [--sheet f1,f2,f3,f4]
Turns a hand annotation (work/shots/<id>.py) into src/shots/data/<id>.json (+ footage stills)."""
import sys, os, json, math, importlib.util
import numpy as np, cv2

REPO = '/home/user/circle.animaation.proto-2'
FRAMES = '/tmp/work/frames/f_%04d.jpg'
W, H = 1280, 720
S = np.diag([1.0, -1.0, -1.0])


def frame(n):
    return cv2.imread(FRAMES % int(n))


def Kmat(fov):
    f = (H / 2) / math.tan(math.radians(fov) / 2)
    return np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1.0]])


def ray(px, py, fov):
    f = (H / 2) / math.tan(math.radians(fov) / 2)
    return np.array([(px - W / 2) / f, -(py - H / 2) / f, -1.0])


def plane_from(d, yaw=0, pitch=0, at=(W / 2, H / 2), fov=45):
    """plane through the pixel `at` at view depth d; normal faces the camera, rotated by yaw/pitch (deg)."""
    y, p = math.radians(yaw), math.radians(pitch)
    n = np.array([math.sin(y) * math.cos(p), math.sin(p), math.cos(y) * math.cos(p)])
    p0 = ray(at[0], at[1], fov) * d
    return p0, n


def hit(px, py, plane, fov):
    p0, n = plane
    r = ray(px, py, fov)
    s = np.dot(n, p0) / np.dot(n, r)
    return r * s


def quat_from_R(R):
    t = np.trace(R)
    if t > 0:
        s = math.sqrt(t + 1.0) * 2
        w = 0.25 * s; x = (R[2, 1] - R[1, 2]) / s; y = (R[0, 2] - R[2, 0]) / s; z = (R[1, 0] - R[0, 1]) / s
    elif R[0, 0] > R[1, 1] and R[0, 0] > R[2, 2]:
        s = math.sqrt(1.0 + R[0, 0] - R[1, 1] - R[2, 2]) * 2
        w = (R[2, 1] - R[1, 2]) / s; x = 0.25 * s; y = (R[0, 1] + R[1, 0]) / s; z = (R[0, 2] + R[2, 0]) / s
    elif R[1, 1] > R[2, 2]:
        s = math.sqrt(1.0 + R[1, 1] - R[0, 0] - R[2, 2]) * 2
        w = (R[0, 2] - R[2, 0]) / s; x = (R[0, 1] + R[1, 0]) / s; y = 0.25 * s; z = (R[1, 2] + R[2, 1]) / s
    else:
        s = math.sqrt(1.0 + R[2, 2] - R[0, 0] - R[1, 1]) * 2
        w = (R[1, 0] - R[0, 1]) / s; x = (R[0, 2] + R[2, 0]) / s; y = (R[1, 2] + R[2, 1]) / s; z = 0.25 * s
    q = np.array([x, y, z, w]); return q / np.linalg.norm(q)


def R_from_quat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def euler_pose(p, yaw=0, pitch=0, roll=0):
    """three.js style camera pose from position + yaw(Y) pitch(X) roll(Z) degrees (order YXZ)."""
    y, x, z = map(math.radians, (yaw, pitch, roll))
    Ry = np.array([[math.cos(y), 0, math.sin(y)], [0, 1, 0], [-math.sin(y), 0, math.cos(y)]])
    Rx = np.array([[1, 0, 0], [0, math.cos(x), -math.sin(x)], [0, math.sin(x), math.cos(x)]])
    Rz = np.array([[math.cos(z), -math.sin(z), 0], [math.sin(z), math.cos(z), 0], [0, 0, 1]])
    return np.array(p, float), quat_from_R(Ry @ Rx @ Rz)


def project(P, pose, fov):
    """world points (N,3) -> pixels (N,2) + view depth for camera pose (pos, quat)."""
    C, q = pose
    Rc = R_from_quat(q)
    v = (np.asarray(P, float) - C) @ Rc  # = Rc^T (P - C)
    f = (H / 2) / math.tan(math.radians(fov) / 2)
    z = -v[:, 2]
    zz = np.where(np.abs(z) < 1e-6, 1e-6, z)
    return np.stack([v[:, 0] / zz * f + W / 2, -v[:, 1] / zz * f + H / 2], 1), z


def pose_from_pnp(rvec, tvec):
    R, _ = cv2.Rodrigues(rvec)
    Rv = S @ R @ S
    tv = S @ tvec.reshape(3)
    Rc = Rv.T
    return -Rc @ tv, quat_from_R(Rc)


def slerp_poses(keys, f):
    """keys: sorted list of (frame, pos, quat); linear/slerp-ish interpolation with extrapolation clamp."""
    fs = [k[0] for k in keys]
    if f <= fs[0]: return keys[0][1], keys[0][2]
    if f >= fs[-1]: return keys[-1][1], keys[-1][2]
    i = max(j for j in range(len(fs)) if fs[j] <= f)
    a, b = keys[i], keys[i + 1]
    u = (f - a[0]) / (b[0] - a[0])
    qa, qb = a[2], b[2]
    if np.dot(qa, qb) < 0: qb = -qb
    q = qa + (qb - qa) * u
    return a[1] + (b[1] - a[1]) * u, q / np.linalg.norm(q)


class Shot:
    def __init__(self, sid):
        spec = importlib.util.spec_from_file_location(sid, '/home/user/work/shots/%s.py' % sid)
        mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
        self.a = mod.SHOT
        self.id = sid
        self.fov = self.a.get('fov', 45)
        self.ref = self.a['ref']
        self.range = self.a['range']
        self.K = Kmat(self.fov)
        self.planes = {k: plane_from(fov=self.fov, **v) for k, v in self.a.get('planes', {}).items()}
        self.screens = []
        self.cam = None
        self.trails = []

    # ---- screens ---------------------------------------------------------------------------
    def solve_screens(self):
        for s in self.a.get('screens', []):
            if 'rect' in s:  # frontal rectangle (x0, y0, x1, y1) in px at view depth `depth`
                x0, y0, x1, y1 = s['rect']
                s['quad'] = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
                s['aspect'] = (x1 - x0) / (y1 - y0)
                s['size'] = s.get('depth', 9.0) * (x1 - x0) / self.K[0, 0]
            wS = s.get('size', 8.0); hS = wS / s.get('aspect', 16 / 9)
            obj = np.array([[0, 0, 0], [wS, 0, 0], [wS, hS, 0], [0, hS, 0]], float)
            img = np.array(s['quad'], float)
            ok, rvecs, tvecs, errs = cv2.solvePnPGeneric(obj, img, self.K, None, flags=cv2.SOLVEPNP_IPPE)
            best = int(np.argmin(errs.ravel()))
            R, _ = cv2.Rodrigues(rvecs[best])
            Xc = obj @ R.T + tvecs[best].reshape(3)
            Xw = Xc @ S  # CV camera -> GL (ref camera is the world frame)
            o = Xw[0]; u = Xw[1] - Xw[0]; v = Xw[3] - Xw[0]
            n = np.cross(u, v); n /= np.linalg.norm(n)
            if np.dot(n, -o) < 0: n = -n
            rep, _ = project(Xw, (np.zeros(3), np.array([0, 0, 0, 1.0])), self.fov)
            print('screen %s reproj err %.2f px, depth %.2f, normal %s' % (s['name'], float(np.abs(rep - img).max()), -Xw[:, 2].mean(), np.round(n, 2)))
            self.screens.append(dict(name=s['name'], o=o, u=u, v=v, corners=Xw, spec=s))
            self.planes[s['name']] = (o, n)

    # ---- polygons --------------------------------------------------------------------------
    def build_polys(self):
        self.polys = []
        names = [s['name'] for s in self.screens]
        for i, p in enumerate(self.a.get('polys', [])):
            plane = self.planes[p['on']]
            v = np.array([hit(x, y, plane, self.fov) for x, y in p['pts']])
            self.polys.append(dict(id=p.get('id', 'p%d' % i), v=v, spec=p,
                                   screen=(names.index(p['on']) + 1) if (p['on'] in names and p.get('screen', True)) else 0))

    # ---- camera ----------------------------------------------------------------------------
    def pose(self, f):
        return slerp_poses(self.cam, f)

    def solve_camera(self):
        c = self.a.get('cam', {})
        ident = (np.zeros(3), np.array([0, 0, 0, 1.0]))
        if c.get('mode') == 'keys':
            self.cam = [(k[0],) + euler_pose(*k[1:]) for k in c['keys']]
            return
        if c.get('mode') != 'screen':
            self.cam = [(self.ref, ident[0], ident[1])]
            return
        scr = next(s for s in self.screens if s['name'] == c.get('screen', self.screens[0]['name']))
        f0, f1 = c.get('frames', self.range)
        # features inside the tracked region at the reference frame
        region = np.array(c.get('region') or scr['spec']['quad'], np.int32)
        mask = np.zeros((H, W), np.uint8); cv2.fillPoly(mask, [region], 255)
        mask = cv2.erode(mask, np.ones((9, 9), np.uint8))
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        prep = lambda n: clahe.apply(cv2.cvtColor(frame(n), cv2.COLOR_BGR2GRAY))
        g_ref = prep(self.ref)
        pts0 = cv2.goodFeaturesToTrack(g_ref, maxCorners=400, qualityLevel=0.008, minDistance=10, blockSize=7, mask=mask)
        pts0 = pts0.reshape(-1, 2).astype(np.float32)
        lk = dict(winSize=(25, 25), maxLevel=4, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 40, 0.01))
        Hs = {self.ref: np.eye(3)}
        if c.get('chain') == 'sift':
            # frame-to-frame similarity from SIFT matches inside the (moving) region: survives rolls, zooms and glare
            det_ = cv2.SIFT_create(nfeatures=1500, contrastThreshold=0.015); bf_ = cv2.BFMatcher(cv2.NORM_L2)
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
            gp = lambda n: clahe.apply(cv2.cvtColor(frame(n), cv2.COLOR_BGR2GRAY))
            report = []
            for direction in (1, -1):
                n = self.ref + direction
                while f0 <= n <= f1:
                    a_ = n - direction
                    mk = cv2.warpPerspective(mask, Hs[a_], (W, H), flags=cv2.INTER_NEAREST) if mask is not None else None
                    ka, da = det_.detectAndCompute(gp(a_), mk); kb, db = det_.detectAndCompute(gp(n), None)
                    if da is None or db is None or len(ka) < 8: break
                    good = [x[0] for x in bf_.knnMatch(da, db, k=2) if len(x) == 2 and x[0].distance < 0.8 * x[1].distance]
                    if len(good) < 8: break
                    pa_ = np.float32([ka[g.queryIdx].pt for g in good]); pb_ = np.float32([kb[g.trainIdx].pt for g in good])
                    if c.get('model') == 'homography':       # shards that turn in depth
                        A, inl = cv2.findHomography(pa_, pb_, cv2.RANSAC, c.get('ransac', 3.0))
                        if A is None or inl.sum() < c.get('mininl', 10): break
                        Hs[n] = A @ Hs[a_]
                    else:
                        A, inl = cv2.estimateAffinePartial2D(pa_, pb_, method=cv2.RANSAC, ransacReprojThreshold=c.get('ransac', 3.0))
                        if A is None or inl.sum() < c.get('mininl', 6): break
                        Hs[n] = np.vstack([A, [0, 0, 1]]) @ Hs[a_]
                    report.append((n, int(inl.sum())))
                    n += direction
            weak = [n for n, k in sorted(report) if k < 15]
            print('sift chain: %d frames, weak (<15 inliers): %s' % (len(report), weak))
        elif c.get('chain'):
            # frame-to-frame homographies with fresh features every frame (for footage that moves a lot)
            for direction in (1, -1):
                prev = g_ref; n = self.ref + direction
                while f0 <= n <= f1:
                    g = prep(n)
                    # the region follows the screen; light trails are not footage
                    mk = cv2.warpPerspective(mask, Hs[n - direction], (W, H), flags=cv2.INTER_NEAREST) if mask is not None else np.full((H, W), 255, np.uint8)
                    st_ = (self.streakness(n - direction, 91) > 0.2).astype(np.uint8)
                    mk = mk & ~(cv2.dilate(st_, np.ones((25, 25), np.uint8)) * 255)
                    p0 = cv2.goodFeaturesToTrack(prev, maxCorners=500, qualityLevel=c.get('quality', 0.006), minDistance=7, blockSize=7, mask=mk)
                    if c.get('debug'): print('   chain f%d: mask %d px, %s features' % (n, int((mk > 0).sum()), None if p0 is None else len(p0)))
                    if p0 is None or len(p0) < 12: break
                    nxt, st, _ = cv2.calcOpticalFlowPyrLK(prev, g, p0, None, **lk)
                    back, st2, _ = cv2.calcOpticalFlowPyrLK(g, prev, nxt, None, **lk)
                    fb = np.linalg.norm(back.reshape(-1, 2) - p0.reshape(-1, 2), axis=1)
                    ok = (st.ravel() == 1) & (st2.ravel() == 1) & (fb < c.get('fb', 1.0))
                    if ok.sum() < 8: break
                    if c.get('chain') == 'affine':
                        A, inl = cv2.estimateAffinePartial2D(p0.reshape(-1, 2)[ok], nxt.reshape(-1, 2)[ok], method=cv2.RANSAC, ransacReprojThreshold=c.get('ransac', 2.0))
                        if c.get('debug'): print('   chain f%d: %d tracked, %s inliers' % (n, int(ok.sum()), None if inl is None else int(inl.sum())))
                        if A is None or inl.sum() < 6: break
                        Hm = np.vstack([A, [0, 0, 1]])
                    else:
                        Hm, inl = cv2.findHomography(p0.reshape(-1, 2)[ok], nxt.reshape(-1, 2)[ok], cv2.RANSAC, c.get('ransac', 2.0))
                        if Hm is None or inl.sum() < 10: break
                    Hs[n] = Hm @ Hs[n - direction]
                    prev = g; n += direction
        for direction in ((1, -1) if not c.get('chain') else ()):
            prev = g_ref; cur = pts0.copy(); alive = np.ones(len(pts0), bool)
            n = self.ref + direction
            while f0 <= n <= f1:
                g = prep(n)
                nxt, st, _ = cv2.calcOpticalFlowPyrLK(prev, g, cur.reshape(-1, 1, 2), None, **lk)
                back, st2, _ = cv2.calcOpticalFlowPyrLK(g, prev, nxt, None, **lk)
                fb = np.linalg.norm(back.reshape(-1, 2) - cur, axis=1)
                alive &= (st.ravel() == 1) & (st2.ravel() == 1) & (fb < 1.0)
                cur = nxt.reshape(-1, 2)
                if alive.sum() < 12: break
                Hm, inl = cv2.findHomography(pts0[alive], cur[alive], cv2.RANSAC, 2.5)
                if Hm is None or inl.sum() < 10: break
                Hs[n] = Hm
                prev = g; n += direction
        # hand similarity keys [f, scale, rot (deg, clockwise on screen), (cx, cy) ref px, (px, py) where that point is at f]:
        # interpolated from the nearest tracked frame (for parts where nothing can be tracked)
        for kf, ks, krot, kc, kp in c.get('sim', []):
            near = min(Hs, key=lambda n: abs(n - kf)); Ha = Hs[near]
            kc = np.array(kc, float); kp = np.array(kp, float)
            sa = math.hypot(Ha[0, 0], Ha[1, 0]); ta = math.atan2(Ha[1, 0], Ha[0, 0]); pa = (Ha @ np.array([kc[0], kc[1], 1.0]))[:2]
            step_ = 1 if kf > near else -1
            for n in range(near + step_, kf + step_, step_):
                u = (n - near) / (kf - near)
                sc = sa ** (1 - u) * ks ** u; th = ta + (math.radians(krot) - ta) * u; pp = pa + (kp - pa) * u
                co, si = sc * math.cos(th), sc * math.sin(th)
                Hs[n] = np.array([[co, -si, pp[0] - (co * kc[0] - si * kc[1])], [si, co, pp[1] - (si * kc[0] + co * kc[1])], [0, 0, 1.0]])
        fr = sorted(Hs)
        print('homography track: frames %d..%d (%d of %d)' % (fr[0], fr[-1], len(fr), f1 - f0 + 1))
        cs = np.array([[[0, 0]], [[W, 0]], [[W, H]], [[0, H]]], np.float64)
        allc = np.vstack([cv2.perspectiveTransform(cs, np.linalg.inv(Hs[n])).reshape(-1, 2) for n in fr])
        print('  content seen (ref px): x %.0f..%.0f  y %.0f..%.0f ; first frame box %s ; last frame box %s' % (
            allc[:, 0].min(), allc[:, 0].max(), allc[:, 1].min(), allc[:, 1].max(),
            np.round(cv2.perspectiveTransform(cs, np.linalg.inv(Hs[fr[0]])).reshape(-1, 2)).astype(int).tolist(),
            np.round(cv2.perspectiveTransform(cs, np.linalg.inv(Hs[fr[-1]])).reshape(-1, 2)).astype(int).tolist()))
        # PnP on a grid of screen points
        gu, gv = np.meshgrid(np.linspace(0.1, 0.9, 5), np.linspace(0.1, 0.9, 5))
        Pw = np.array([scr['o'] + a * scr['u'] + b * scr['v'] for a, b in zip(gu.ravel(), gv.ravel())])
        px0, _ = project(Pw, ident, self.fov)
        Pcv = Pw @ S
        poses = {}; resid = {}
        self.Hs = Hs; self.px0 = px0
        for direction in (1, -1):
            rvec = np.zeros((3, 1)); tvec = np.zeros((3, 1))
            n = self.ref
            while n in Hs:
                img = cv2.perspectiveTransform(px0.reshape(-1, 1, 2).astype(np.float64), Hs[n]).reshape(-1, 2)
                ok, rvec, tvec = cv2.solvePnP(Pcv, img, self.K, None, rvec.copy(), tvec.copy(), useExtrinsicGuess=True, flags=cv2.SOLVEPNP_ITERATIVE)
                poses[n] = pose_from_pnp(rvec, tvec)
                rp, _ = cv2.projectPoints(Pcv, rvec, tvec, self.K, None)
                resid[n] = float(np.sqrt(((rp.reshape(-1, 2) - img) ** 2).sum(1).mean()))
                n += direction
        fr = sorted(poses)
        worst = max(resid, key=resid.get)
        print('pnp residual rms: mean %.2f px, worst %.2f px at f%d' % (np.mean(list(resid.values())), resid[worst], worst))
        bad = [n for n in fr if resid[n] > c.get('maxres', 12.0)]
        if bad:
            print('  residuals:', ' '.join('%d:%.0f' % (n, resid[n]) for n in fr if resid[n] > 6))
            # drop poses that do not explain the tracked homography (lost track); they get extrapolated instead
            print('  dropping %d frames with residual > %.0f px: %s' % (len(bad), c.get('maxres', 12.0), bad))
            lo = max([n for n in bad if n < self.ref], default=None); hi = min([n for n in bad if n > self.ref], default=None)
            for n in list(poses):
                if (lo is not None and n <= lo) or (hi is not None and n >= hi): del poses[n]
            fr = sorted(poses)
        # plane normal candidates from homography decomposition at the most distant frames
        for n in (fr[0], fr[-1]):
            try:
                _, Rs, Ts, Ns = cv2.decomposeHomographyMat(Hs[n], self.K)
                print('  H f%d normals(cv):' % n, [tuple(np.round(nn.ravel(), 2)) for nn in Ns], 't:', [tuple(np.round(t.ravel(), 2)) for t in Ts])
            except Exception as e: print('decomp failed', e)
        P = np.array([poses[n][0] for n in fr]); Q = np.array([poses[n][1] for n in fr])
        for i in range(1, len(Q)):
            if np.dot(Q[i], Q[i - 1]) < 0: Q[i] = -Q[i]
        # smooth (box of +-2) and extrapolate linearly to the full range
        def sm(A, r=2):
            out = A.copy()
            for i in range(len(A)):
                a, b = max(0, i - r), min(len(A), i + r + 1)
                out[i] = A[a:b].mean(0)
            return out
        P, Q = sm(P), sm(Q); Q /= np.linalg.norm(Q, axis=1, keepdims=True)
        keys = [(n, P[i], Q[i]) for i, n in enumerate(fr)]
        ex = c.get('extrapolate', 8)
        if fr[0] > self.range[0] and len(fr) > ex:
            dP = (P[ex] - P[0]) / ex; dQ = (Q[ex] - Q[0]) / ex
            k = (fr[0] - self.range[0]) * c.get('damp', 0.6); q = Q[0] - dQ * k
            keys.insert(0, (self.range[0], P[0] - dP * k, q / np.linalg.norm(q)))
        if fr[-1] < self.range[1] and len(fr) > ex:
            dP = (P[-1] - P[-1 - ex]) / ex; dQ = (Q[-1] - Q[-1 - ex]) / ex
            k = (self.range[1] + 1 - fr[-1]) * c.get('damp', 0.6); q = Q[-1] + dQ * k
            keys.append((self.range[1] + 1, P[-1] + dP * k, q / np.linalg.norm(q)))
        # anchors: hand correspondences (ref px on the screen plane -> px at the anchor frame), solved with PnP
        plane = self.planes[scr['name']]
        for af, corr in c.get('anchors', []):
            obj = np.array([hit(a[0], a[1], plane, self.fov) for a in corr]) @ S
            img = np.array([[a[2], a[3]] for a in corr], float)
            ok, rvecs, tvecs, errs = cv2.solvePnPGeneric(obj, img, self.K, None, flags=cv2.SOLVEPNP_IPPE)
            near = min(keys, key=lambda k: abs(k[0] - af))
            cands = []
            for rv, tv, e in zip(rvecs, tvecs, errs.ravel()):
                rv, tv = cv2.solvePnPRefineLM(obj, img, self.K, None, rv, tv)
                Cp, q = pose_from_pnp(rv, tv)
                if np.dot(q, near[2]) < 0: q = -q
                cands.append((np.linalg.norm(q - near[2]) + 0.02 * np.linalg.norm(Cp - near[1]), e, Cp, q))
            cands.sort(key=lambda x: x[0])
            best_e = min(cc[1] for cc in cands)
            ok_ = [cc for cc in cands if cc[1] <= max(3.0, 2.0 * best_e)]     # the pose must explain the points; the neighbour only breaks ties
            cands = ok_ + [cc for cc in cands if cc not in ok_]
            print('anchor f%d: reproj %.2f px (alt %.2f), dq %.3f' % (af, cands[0][1], cands[-1][1], cands[0][0]))
            keys = [k for k in keys if not (min(af, near[0]) <= k[0] <= max(af, near[0])) or k[0] == near[0]]
            keys.append((af, cands[0][2], cands[0][3]))
        keys.sort(key=lambda k: k[0])
        # densify to one key per frame (linear / nlerp) so splines downstream do not overshoot, extend to the range ends
        dense = []
        for n in range(self.range[0], self.range[1] + 2):
            if n < keys[0][0] or n > keys[-1][0]: continue
            dense.append((n,) + slerp_poses(keys, n))
        keys = dense
        if keys[0][0] > self.range[0]:
            m = min(len(keys) - 1, 4); k = (keys[0][0] - self.range[0])
            dP = (keys[m][1] - keys[0][1]) / m; dQ = (keys[m][2] - keys[0][2]) / m
            q = keys[0][2] - dQ * k
            keys.insert(0, (self.range[0], keys[0][1] - dP * k, q / np.linalg.norm(q)))
        for k in c.get('extra', []):  # hand keys outside the tracked span
            keys.append((k[0],) + euler_pose(*k[1:]))
        self.cam = sorted(keys, key=lambda k: k[0])

    # ---- tones -----------------------------------------------------------------------------
    def bake_tones(self):
        cache = {}
        for p in self.polys:
            sp = p['spec']
            if 'tone' in sp: p['tone'] = list(sp['tone']); continue
            tf = sp.get('toneFrame', self.a.get('toneFrame', self.ref))
            if tf not in cache: cache[tf] = frame(tf)
            px, z = project(p['v'], self.pose(tf), self.fov)
            mask = np.zeros((H, W), np.uint8); cv2.fillPoly(mask, [np.round(px).astype(np.int32)], 255)
            er = cv2.erode(mask, np.ones((13, 13), np.uint8))
            if er.sum() > 255 * 60: mask = er
            sel = cache[tf][mask > 0]
            if len(sel) < 10: p['tone'] = [70, 56, 30]; continue
            med = np.median(sel.reshape(-1, 3), axis=0)
            p['tone'] = [int(med[2]), int(med[1]), int(med[0])]

    # ---- flare / streak head track --------------------------------------------------------
    def track_head(self, fl):
        if 'keys' in fl:
            return [list(k) for k in fl['keys']]
        f0, f1 = fl.get('frames', self.range)
        prev = fl.get('start')
        maxjump = fl.get('maxjump', 90)
        out = []
        for n in range(f0, f1 + 1):
            im = frame(n).astype(np.float32)
            g = im.min(axis=2)  # the head is white: all channels high
            g = cv2.GaussianBlur(g, (0, 0), fl.get('blur', 4))
            for poly in fl.get('exclude', []): cv2.fillPoly(g, [np.array(poly, np.int32)], 0)
            if prev is not None:
                m = np.zeros_like(g); cv2.circle(m, (int(prev[0]), int(prev[1])), maxjump, 1, -1); g = g * m
            _, mx, _, loc = cv2.minMaxLoc(g)
            if mx < fl.get('min', 170):
                continue
            ys, xs = np.nonzero(g > mx * 0.93)
            d = np.hypot(xs - loc[0], ys - loc[1]) < 30
            cx, cy = float(xs[d].mean()), float(ys[d].mean())
            out.append([n, round(cx, 1), round(cy, 1), round(float(mx), 0)])
            prev = (cx, cy)
        if len(out) > 9 and fl.get('smooth', 9):
            from scipy.signal import savgol_filter
            A = np.array(out)
            w = min(fl.get('smooth', 9), len(A) // 2 * 2 - 1)
            A[:, 1] = savgol_filter(A[:, 1], w, 2); A[:, 2] = savgol_filter(A[:, 2], w, 2)
            out = [[int(a[0]), round(a[1], 1), round(a[2], 1), a[3]] for a in A]
        return out

    def track_flare(self):
        fl = self.a.get('flare')
        self.flare = self.track_head(fl) if fl else []
        if fl and fl.get('pre'):
            # hand keys [f, x, y] for the frames where the tracker cannot follow the head (flashes, off-screen loops)
            from scipy.interpolate import PchipInterpolator
            pre = np.array(fl['pre'], float)
            fx = PchipInterpolator(pre[:, 0], pre[:, 1]); fy = PchipInterpolator(pre[:, 0], pre[:, 2])
            a, b = int(pre[0, 0]), int(pre[-1, 0])
            hand = [[n, round(float(fx(n)), 1), round(float(fy(n)), 1), 255.0] for n in range(a, b + 1)]
            self.flare = [k for k in self.flare if k[0] < a] + hand + [k for k in self.flare if k[0] > b]
        if fl: print('flare track: %d frames' % len(self.flare))

    # ---- light trails: 2D snake that follows the bright ridge frame by frame -----------------
    def streakness(self, n, tophat=45):
        if not hasattr(self, '_sm'): self._sm = {}
        if (n, tophat) not in self._sm:
            im = frame(n)
            g = np.minimum(im[..., 1], im[..., 2])                       # bright & warm/white
            small = cv2.resize(g, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
            k = max(3, tophat // 2) | 1
            th = cv2.morphologyEx(small, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
            th = cv2.resize(th, (W, H), interpolation=cv2.INTER_LINEAR)
            b = np.clip(th.astype(np.float32) / 70.0, 0, 1) * np.clip((g.astype(np.float32) - 140) / 60.0, 0, 1)
            self._sm = {(n, tophat): cv2.GaussianBlur(b, (0, 0), 2.0)}
        return self._sm[(n, tophat)]

    @staticmethod
    def _snap(B, p, nrm, R):
        ss = np.arange(-R, R + 0.1, 1.5)
        xs = p[0] + ss * nrm[0]; ys = p[1] + ss * nrm[1]
        ok = (xs >= 0) & (xs < W - 1) & (ys >= 0) & (ys < H - 1)
        v = np.zeros_like(ss)
        v[ok] = B[ys[ok].astype(int), xs[ok].astype(int)]
        w = v * np.exp(-1.5 * (ss / R) ** 2)
        sw = w.sum()
        if sw < 1.5 or v.max() < 0.2: return None
        m = (w * ss).sum() / sw
        sig = math.sqrt(max((w * ss * ss).sum() / sw - m * m, 0.0))
        return m, sig, sw

    def track_trails(self):
        self.trails = []
        specs = []
        for tr in self.a.get('trails', []):
            if 'initFrame' in tr and tr['initFrame'] > tr['frames'][0]:
                fi = tr['initFrame']
                b = dict(tr, frames=(tr['frames'][0], fi), born=(0, 0), _rev=True, name=tr['name'] + '_rev'); b.pop('initFrame')
                a = dict(tr, frames=(fi, tr['frames'][1]), born=(0, 0), _merge=b['name']); a.pop('initFrame')
                specs += [b, a]
            else: specs.append(tr)
        for ti, tr in enumerate(specs):
            if 'path' in tr:
                # hand-keyed streak: path = {frame: [(x, y), ..., head]} (same number of points in every key frame),
                # interpolated in time with a monotone spline. For fast sweeps the ridge tracker cannot follow.
                from scipy.interpolate import PchipInterpolator
                kf = sorted(tr['path']); P = np.array([tr['path'][k] for k in kf], float)
                f0, f1 = tr.get('frames', (kf[0], kf[-1]))
                ip = PchipInterpolator(kf, P, axis=0, extrapolate=True)
                wk = tr.get('w', 12)
                rows = []
                for n in range(f0, f1 + 1):
                    pts = ip(n)
                    w = float(np.interp(n, [k[0] for k in wk], [k[1] for k in wk])) if isinstance(wk, (list, tuple)) else float(wk)
                    row = []
                    for i, q in enumerate(pts): row += [round(float(q[0]), 1), round(float(q[1]), 1), 0 if i == len(pts) - 1 else round(w, 2)]
                    rows.append(row)
                self.trails.append(dict(name=tr.get('name', 't%d' % ti), f0=f0, tau=[f0] * P.shape[1], det=[0] * len(rows), frames=rows))
                print('trail %s: frames %d..%d, hand-keyed path (%d key frames, %d points)' % (tr.get('name', 't%d' % ti), f0, f1, len(kf), P.shape[1]))
                continue
            head = self.flare if tr.get('head', 'flare') == 'flare' else self.track_head(tr['head'])
            if not head: continue
            f0, f1 = tr.get('frames', (head[0][0], self.range[1]))
            R = tr.get('search', 40); step = tr.get('step', 42)
            hd = {k[0]: np.array([k[1], k[2]], float) for k in head}
            known = sorted(hd)
            def head_at(n):
                if n in hd: return hd[n], 1
                if n < known[0]:
                    v = (hd[known[min(3, len(known) - 1)]] - hd[known[0]]) / max(1, known[min(3, len(known) - 1)] - known[0])
                    return hd[known[0]] + v * (n - known[0]), 0
                last = max(k for k in known if k < n); i = known.index(last)
                if i + 1 < len(known):  # gap inside the track
                    nx = known[i + 1]; u = (n - last) / (nx - last)
                    return hd[last] * (1 - u) + hd[nx] * u, 1
                j = max(0, i - 3)
                v = (hd[last] - hd[known[j]]) / max(1, last - known[j]) if i > j else np.zeros(2)
                sp = np.linalg.norm(v)
                if sp < tr.get('minspeed', 12): v = v / max(sp, 1e-6) * tr.get('minspeed', 12)
                return hd[last] + v * (n - last), 0
            # initial trail at f0 (tail -> head), by hand or by following the ridge away from the head
            h0, _ = head_at(f0)
            TH = tr.get('tophat', 45)
            fm = (lambda n, a=f0, b=f1: a + b - n) if tr.get('_rev') else (lambda n: n)     # loop index -> video frame
            B = self.streakness(fm(f0), TH)
            if 'init' in tr and len(tr['init']) == 0:
                keys = []
            elif 'init' in tr:
                pts = np.array(tr['init'], float); keys = [pts[0]]
                for q in pts[1:]:
                    while np.linalg.norm(q - keys[-1]) > step * 1.5:
                        keys.append(keys[-1] + (q - keys[-1]) / np.linalg.norm(q - keys[-1]) * step)
                    keys.append(q)
            else:
                h2, _ = head_at(f0 + 2)
                d = h0 - h2
                if 'dir' in tr: d = np.array(tr['dir'], float)
                d = d / max(np.linalg.norm(d), 1e-6)
                cur = h0.copy(); keys = []; miss = 0
                for _ in range(tr.get('maxinit', 60)):
                    q = cur + d * step
                    nrm = np.array([-d[1], d[0]])
                    inside = -20 <= q[0] <= W + 20 and -20 <= q[1] <= H + 20
                    r = self._snap(B, q, nrm, R * 0.7) if inside else None
                    if r is None:
                        miss += 1
                        if miss > 2 or not inside: break
                    else:
                        miss = 0; q = q + nrm * r[0]
                    d = (q - cur); d /= max(np.linalg.norm(d), 1e-6)
                    keys.append(q.copy()); cur = q
                for k in range(3): keys.append(keys[-1] + d * step * (k + 1) * 2 if keys else h0 + d * step * (k + 1) * 2)
                keys = keys[::-1]
            wid = [tr.get('w0', 8.0)] * len(keys)
            alpha = [1.0] * len(keys)
            taus = [f0 - (len(keys) - i) for i in range(len(keys))]
            frames_out = []; det = []
            hprev = h0
            born = tr.get('born', (-1e9, 1e9))
            fade = tr.get('fade')
            hfree = None
            for n in range(f0, f1 + 1):
                h, isdet = head_at(fm(n))
                if n > born[1]:                       # detached: the head went on, this piece only drifts
                    if hfree is None: hfree = head_at(int(born[1]))[0].copy()
                    h, isdet = hfree, 0
                if n > f0 and keys:
                    B = self.streakness(fm(n), TH)
                    if R > 60: B = cv2.GaussianBlur(B, (0, 0), R / 9.0)
                    P = np.array(keys); poly = np.vstack([P, h])
                    disp = np.zeros_like(P); valid = np.zeros(len(P), bool); neww = np.array(wid)
                    for i in range(len(P)):
                        t = poly[min(i + 1, len(poly) - 1)] - poly[max(i - 1, 0)]
                        tn = np.linalg.norm(t)
                        if tn < 1e-3: continue
                        t /= tn; nrm = np.array([-t[1], t[0]])
                        if not (-5 <= P[i][0] <= W + 5 and -5 <= P[i][1] <= H + 5): continue
                        if np.linalg.norm(P[i] - h) < tr.get('headclear', 55): continue
                        r = self._snap(B, P[i], nrm, R)
                        if alpha[i] < 0: continue                  # retired for good
                        if r is None:
                            alpha[i] *= tr.get('decay', 0.55)      # the trail left this place (or faded)
                            continue
                        alpha[i] = min(1.0, alpha[i] + 0.34)
                        blur = R / 9.0 if R > 60 else 2.0
                        disp[i] = nrm * r[0] * 0.85; valid[i] = True; neww[i] = math.sqrt(max(r[1] ** 2 - blur ** 2, 1.0))
                    if valid.any():
                        idx = np.arange(len(P)); vi = idx[valid]
                        for c in range(2): disp[:, c] = np.interp(idx, vi, disp[vi, c])
                        k = np.array([0.25, 0.5, 0.25])
                        for c in range(2): disp[:, c] = np.convolve(np.pad(disp[:, c], 1, mode='edge'), k, mode='valid')
                        neww = np.interp(idx, vi, neww[vi])
                        wid = list(0.6 * np.array(wid) + 0.4 * neww)
                    P = P + disp
                    if hfree is not None and valid.any():   # the free end follows the last key that still sees the trail
                        hfree = hfree + disp[np.arange(len(P))[valid][-1]]; h = hfree
                    # keep the snake smooth: pull every key towards the midpoint of its neighbours (normal component only)
                    for _ in range(2):
                        full = np.vstack([P, h])
                        mid = 0.5 * (full[:-2] + full[2:]) if len(full) > 2 else None
                        if mid is not None:
                            t = full[2:] - full[:-2]; t /= np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-6)
                            nn = np.stack([-t[:, 1], t[:, 0]], 1)
                            off = ((mid - P[1:]) * nn).sum(1, keepdims=True) * nn
                            eq = ((mid - P[1:]) * t).sum(1, keepdims=True) * t          # equalise the spacing along the trail
                            P[1:] += tr.get('stiff', 0.35) * off + 0.3 * eq
                    if tr.get('poly') and len(P) > tr['poly'] + 2:
                        # detached sweep: keep it a smooth low-order curve (fit over the keys that see the trail)
                        tt = np.linspace(-1, 1, len(P))
                        sel = valid if valid.sum() > tr['poly'] + 2 else np.ones(len(P), bool)
                        for cdim in range(2):
                            co = np.polyfit(tt[sel], P[sel, cdim], tr['poly'])
                            P[:, cdim] = np.polyval(co, tt)
                    inside = (P[:, 0] > 0) & (P[:, 0] < W) & (P[:, 1] > 0) & (P[:, 1] < H)
                    if inside.any() and not inside[0] and not tr.get('poly'):
                        i_in = int(np.argmax(inside))
                        if i_in + 1 < len(P):
                            d = P[i_in] - P[i_in + 1]; d /= max(np.linalg.norm(d), 1e-6)
                            for kk in range(i_in):
                                P[kk] = P[i_in] + d * step * (i_in - kk)
                    # an old part that ends up on top of a younger part of the trail has lost its own ridge: retire it
                    for i in range(len(P)):
                        if alpha[i] <= 0: continue
                        j0 = i + tr.get('mergegap', 7)
                        if j0 < len(P):
                            dmin = np.linalg.norm(P[j0:] - P[i], axis=1).min()
                            if dmin < tr.get('mergedist', 16): alpha[i] = -1.0
                    keys = [P[i] for i in range(len(P))]
                    wmax = tr.get('wmax', 45.0)
                    ww = np.minimum(np.array(wid), wmax)
                    if len(ww) >= 3:
                        pad = np.pad(ww, 1, mode='edge'); ww = np.median(np.stack([pad[:-2], pad[1:-1], pad[2:]]), axis=0)
                    wid = list(ww)
                    if n - 1 <= born[1] and n - 1 >= born[0] and (np.linalg.norm(hprev - keys[-1]) >= step or (not keys)):
                        keys.append(hprev.copy()); wid.append(wid[-1] if wid else 8.0); taus.append(n - 1); alpha.append(1.0)
                elif n > f0 and not keys and born[0] <= n - 1 <= born[1]:
                    keys.append(hprev.copy()); wid.append(tr.get('w0', 8.0)); taus.append(n - 1); alpha.append(1.0)
                row = []
                gfade = 1.0 if not fade else float(np.clip((fade[1] - n) / max(1e-6, fade[1] - fade[0]), 0, 1))
                for q, w, al in zip(keys, wid, alpha): row += [round(float(q[0]), 1), round(float(q[1]), 1), round(float(max(w, 1.5) * max(al, 0.0) * gfade), 1)]
                row += [round(float(h[0]), 1), round(float(h[1]), 1), 0]
                frames_out.append(row); det.append(isdet)
                hprev = h
            if tr.get('_rev'): frames_out = frames_out[::-1]; det = det[::-1]
            if tr.get('_merge'):
                prev = next(t for t in self.trails if t['name'] == tr['_merge']); self.trails.remove(prev)
                frames_out = prev['frames'][:-1] + frames_out; det = prev['det'][:-1] + det; f0 = prev['f0']
            self.trails.append(dict(name=tr.get('name', 't%d' % ti), f0=f0, tau=taus, det=det, frames=frames_out))
            print('trail %s: frames %d..%d, %d keys, %d detected head frames' % (tr.get('name', 't%d' % ti), f0, f1, len(keys), sum(det)))

    # ---- footage stills --------------------------------------------------------------------
    def content_h(self, tf, scr, model='similarity'):
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        gp = lambda n: clahe.apply(cv2.cvtColor(frame(n), cv2.COLOR_BGR2GRAY))
        mk = np.zeros((H, W), np.uint8)
        for poly in self.polys:
            if poly['screen'] and poly.get('on', scr['name']) == scr['name']:
                q, _ = project(poly['v'], self.pose(self.ref), self.fov)
                cv2.fillPoly(mk, [np.round(q).astype(np.int32)], 255)
        det_ = cv2.SIFT_create(nfeatures=2500, contrastThreshold=0.012); bf_ = cv2.BFMatcher(cv2.NORM_L2)
        ka, da = det_.detectAndCompute(gp(self.ref), mk); kb, db = det_.detectAndCompute(gp(tf), None)
        if da is None or db is None or len(ka) < 8: return None
        good = [x[0] for x in bf_.knnMatch(da, db, k=2) if len(x) == 2 and x[0].distance < 0.78 * x[1].distance]
        if len(good) < 10: return None
        pa_ = np.float32([ka[g.queryIdx].pt for g in good]); pb_ = np.float32([kb[g.trainIdx].pt for g in good])
        if model == 'homography':
            A, inl = cv2.findHomography(pa_, pb_, cv2.RANSAC, 3.0)
        else:
            A, inl = cv2.estimateAffinePartial2D(pa_, pb_, method=cv2.RANSAC, ransacReprojThreshold=3.0)
            if A is not None: A = np.vstack([A, [0, 0, 1]])
        if A is None or inl.sum() < 10: return None
        print('  tex align f%d: %d inliers of %d' % (tf, int(inl.sum()), len(good)))
        return A

    def bake_textures(self):
        for s in self.screens:
            sp = s['spec']
            if sp.get('tex') is False: continue
            frames_ = sp.get('texFrames') or [sp.get('texFrame', self.ref)]
            Wt = sp.get('texW', 1280); Ht = int(round(Wt / sp.get('aspect', 16 / 9)))
            tex = np.zeros((Ht, Wt, 3), np.float32); filled = np.zeros((Ht, Wt), np.float32)
            feather = sp.get('feather', 90)
            for tf in frames_:
                px, _ = project(s['corners'], self.pose(tf), self.fov)
                if sp.get('align') in ('sift', 'track') and tf != self.ref:
                    # the footage moves inside the shard: register this frame to the ref frame by its content
                    pxr, _ = project(s['corners'], self.pose(self.ref), self.fov)
                    if sp['align'] == 'track':      # content track measured by uvtrack.py (dense flow, smooth)
                        tr = json.load(open('/home/user/work/tracks/%s_%s.json' % (self.id, s['name'])))
                        Hc = np.array(tr[str(tf)], float) if str(tf) in tr else None
                    else:
                        Hc = self.content_h(tf, s, sp.get('alignModel', 'similarity'))
                    if Hc is None: print('  tex align failed for f%d' % tf); continue
                    px = cv2.perspectiveTransform(pxr.reshape(-1, 1, 2).astype(np.float64), Hc).reshape(-1, 2)
                M = cv2.getPerspectiveTransform(px.astype(np.float32), np.array([[0, 0], [Wt, 0], [Wt, Ht], [0, Ht]], np.float32))
                im = frame(tf)
                valid = np.zeros((H, W), np.uint8); valid[4:H - 4, 4:W - 4] = 255
                if sp.get('window'):  # only trust pixels inside the visible window (annotated at ref) — mapped by the camera
                    win = np.zeros((H, W), np.uint8)
                    for poly in self.polys:
                        if poly['screen']:
                            q, _ = project(poly['v'], self.pose(tf), self.fov)
                            cv2.fillPoly(win, [np.round(q).astype(np.int32)], 255)
                    valid &= cv2.erode(win, np.ones((7, 7), np.uint8))
                    # shards in front of the screen are not footage either (they do not move with the content)
                    zs = float(np.mean([-c[2] for c in s['corners']]))
                    for poly in self.polys:
                        if poly['screen'] or self.soft_of(poly): continue
                        if float(np.mean([-v[2] for v in poly['v']])) < zs - 0.05:
                            q, _ = project(poly['v'], self.pose(tf), self.fov)
                            occ = np.zeros((H, W), np.uint8); cv2.fillPoly(occ, [np.round(q).astype(np.int32)], 255)
                            valid[cv2.dilate(occ, np.ones((25, 25), np.uint8)) > 0] = 0
                if sp.get('inpaint'):
                    # additive streak/flare light: very bright warm pixels are not trusted
                    b, g, r = [im[..., i].astype(np.int32) for i in range(3)]
                    m = ((r > sp['inpaint']) & (g > sp['inpaint'] - 25) & (b < r - 18)).astype(np.uint8) * 255
                    if sp.get('inpaintRoi'):
                        roi = np.zeros((H, W), np.uint8); cv2.fillPoly(roi, [np.array(sp['inpaintRoi'], np.int32)], 255); m &= roi
                    m = cv2.dilate(m, np.ones((sp.get('inpaintGrow', 11),) * 2, np.uint8))
                    valid[m > 0] = 0
                for poly in sp.get('exclude', {}).get(tf, []):
                    cv2.fillPoly(valid, [np.array(poly, np.int32)], 0)
                if sp.get('autoExclude', True):
                    # the tracked light trails and the flare head are not part of the footage
                    for trl in self.trails:
                        i = tf - trl['f0']
                        if not (0 <= i < len(trl['frames'])): continue
                        row = np.array(trl['frames'][i], float).reshape(-1, 3)
                        for a in range(len(row) - 1):
                            w = max(row[a, 2], row[min(a + 1, len(row) - 2), 2])
                            if w <= 0.01: continue
                            r = int(max(sp.get('trailR', 30), 2.6 * w))
                            p0 = tuple(int(v) for v in np.clip(row[a, :2], -3000, 4000)); p1 = tuple(int(v) for v in np.clip(row[a + 1, :2], -3000, 4000))
                            cv2.line(valid, p0, p1, 0, thickness=2 * r)
                        if len(row) and trl['det'][i]:
                            cv2.circle(valid, tuple(int(v) for v in row[-1, :2]), sp.get('headR', 110), 0, -1)
                wi = cv2.warpPerspective(im, M, (Wt, Ht), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
                # soft priority: earlier frames win, later ones fill what is left, with feathered borders
                soft = np.clip(cv2.distanceTransform(valid, cv2.DIST_L2, 3) / feather, 0, 1)
                wv = cv2.warpPerspective(soft, M, (Wt, Ht), flags=cv2.INTER_LINEAR, borderValue=0)
                a = wv * (1.0 - filled)
                wf = wi.astype(np.float32)
                ov = (filled > 0.6) & (wv > 0.6)
                if sp.get('match', False) and ov.sum() > 2000:
                    cur = tex / np.maximum(filled, 1e-3)[..., None]
                    g = (cur[ov].mean(0) + 4.0) / (wf[ov].mean(0) + 4.0)        # per channel gain
                    wf = wf * np.clip(g, 0.4, 2.5)
                tex += wf * a[..., None]; filled += a
            tex = tex / np.maximum(filled, 1e-3)[..., None]
            tex = np.clip(tex, 0, 255).astype(np.uint8)
            holes = (filled < 0.5).astype(np.uint8) * 255
            keep = np.clip((filled - 0.5) * 4, 0, 1)
            frac = holes.mean() / 255
            if frac > 0:
                sw_, sh_ = max(8, Wt // 8), max(8, Ht // 8)
                col = cv2.resize(tex.astype(np.float32) * keep[..., None], (sw_, sh_), interpolation=cv2.INTER_AREA)
                wgt = cv2.resize(keep, (sw_, sh_), interpolation=cv2.INTER_AREA)
                fill = np.zeros_like(col); fw = np.zeros_like(wgt)
                for sig in (3, 8, 20, 50, 120):                      # fine first: nearby colours win, far ones fill the rest
                    c2 = cv2.GaussianBlur(col, (0, 0), sig); w2 = cv2.GaussianBlur(wgt, (0, 0), sig)
                    take = np.clip(w2 * 8, 0, 1) * (1 - fw)
                    fill += c2 / np.maximum(w2, 1e-4)[..., None] * take[..., None]; fw += take
                fill = fill / np.maximum(fw, 1e-4)[..., None]
                fill = cv2.GaussianBlur(cv2.resize(fill, (Wt, Ht), interpolation=cv2.INTER_CUBIC), (0, 0), 6)
                soft = (1.0 - keep)[..., None]
                tex = (tex * (1 - soft) + fill * soft).astype(np.uint8)
            if sp.get('gain'): tex = np.clip(tex.astype(np.float32) * sp['gain'], 0, 255).astype(np.uint8)
            out = os.path.join(REPO, 'public/footage/%s.jpg' % s['name'])
            cv2.imwrite(out, tex, [cv2.IMWRITE_JPEG_QUALITY, 90])
            print('wrote', out, tex.shape, 'holes %.1f%%' % (frac * 100))

    def soft_of(self, p):
        px = p['spec'].get('soft')
        if not px: return {}
        f = (H / 2) / math.tan(math.radians(self.fov) / 2)
        return dict(soft=round(float(px * (-p['v'][:, 2].mean()) / f), 4))

    # ---- output ----------------------------------------------------------------------------
    def write(self):
        r = lambda a, n=4: [round(float(x), n) for x in a]
        data = dict(
            id=self.id, range=list(self.range), ref=self.ref, fov=self.fov,
            cam=[[k[0]] + r(k[1]) + r(k[2], 5) for k in self.cam[::self.a.get('camStep', 1)] + ([self.cam[-1]] if (len(self.cam) - 1) % self.a.get('camStep', 1) else [])],
            polys=[dict(id=p['id'], v=[r(v) for v in p['v']], tone=p['tone'], screen=p['screen'], **self.soft_of(p),
                        **{k: p['spec'][k] for k in ('glow', 'bevel', 'thick', 'edge', 'dim') if k in p['spec']}) for p in self.polys],
            screens=[dict(name=s['name'], o=r(s['o']), u=r(s['u']), v=r(s['v'])) for s in self.screens],
            flare=self.flare, trails=self.trails,
        )
        for k in self.a.get('export', {}): data[k] = self.a['export'][k]
        out = os.path.join(REPO, 'src/shots/data/%s.json' % self.id)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        json.dump(data, open(out, 'w'), separators=(',', ':'))
        print('wrote', out, os.path.getsize(out), 'bytes;', len(self.cam), 'cam keys,', len(self.polys), 'polys')

    def sheet(self, frames, tw=640):
        th = tw * 9 // 16
        tiles = []
        for n in frames:
            im = frame(n)
            pose = self.pose(n)
            for p in self.polys:
                px, z = project(p['v'], pose, self.fov)
                if (z <= 0.05).any(): continue
                col = (0, 255, 0) if not p['screen'] else (255, 200, 0)
                cv2.polylines(im, [np.round(px).astype(np.int32)], True, col, 2, cv2.LINE_AA)
                c = px.mean(0); cv2.putText(im, p['id'], (int(c[0]) - 10, int(c[1])), cv2.FONT_HERSHEY_SIMPLEX, 0.6, col, 2, cv2.LINE_AA)
            for s in self.screens:
                px, z = project(s['corners'], pose, self.fov)
                if (z > 0.05).all(): cv2.polylines(im, [np.round(px).astype(np.int32)], True, (255, 0, 255), 1, cv2.LINE_AA)
            for tr in self.trails:
                i = n - tr['f0']
                if 0 <= i < len(tr['frames']):
                    row = np.array(tr['frames'][i]).reshape(-1, 3)
                    cv2.polylines(im, [np.round(row[:, :2]).astype(np.int32)], False, (255, 0, 255), 2, cv2.LINE_AA)
                    for q in row: cv2.circle(im, (int(q[0]), int(q[1])), max(2, int(q[2])), (255, 255, 0), 1, cv2.LINE_AA)
            for k in self.flare:
                if abs(k[0] - n) <= 12: cv2.circle(im, (int(k[1]), int(k[2])), 3 if k[0] != n else 9, (0, 0, 255), 1 if k[0] != n else 2)
            cv2.putText(im, 'f%d' % n, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 2, cv2.LINE_AA)
            tiles.append(cv2.resize(im, (tw, th), interpolation=cv2.INTER_AREA))
        while len(tiles) % 2: tiles.append(np.zeros_like(tiles[0]))
        rows = [np.hstack(tiles[i:i + 2]) for i in range(0, len(tiles), 2)]
        out = '/tmp/work/sheets/bake_%s.jpg' % self.id
        cv2.imwrite(out, np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 85]); print(out)


if __name__ == '__main__':
    sid = sys.argv[1]
    sh = Shot(sid)
    if '--trails-only' in sys.argv:
        # re-track only the light trails (and the flare they hang on) and patch them into the existing data file:
        # camera (smoothed, unified, uv-tracked ...), polys and screens stay exactly as they are
        sh.solve_screens(); sh.build_polys(); sh.solve_camera(); sh.track_flare(); sh.track_trails()
        out = os.path.join(REPO, 'src/shots/data/%s.json' % sid); d = json.load(open(out))
        d['trails'] = sh.trails
        json.dump(d, open(out, 'w'), separators=(',', ':'))
        print('patched trails in', out, [(t['name'], t['f0'], len(t['frames'])) for t in sh.trails])
        sys.exit(0)
    sh.solve_screens(); sh.build_polys(); sh.solve_camera(); sh.bake_tones(); sh.track_flare(); sh.track_trails()
    if '--no-tex' not in sys.argv: sh.bake_textures()
    sh.write()
    for a in sys.argv:
        if a.startswith('--sheet'):
            sh.sheet([int(x) for x in a.split('=')[1].split(',')], tw=int(os.environ.get('TW', 640)))
