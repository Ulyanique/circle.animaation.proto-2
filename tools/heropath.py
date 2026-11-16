#!/usr/bin/env python3
"""heropath.py [--dry] [--sheet=F1,F2,..[!]] — plan the ONE light that flies through the whole film.

The film used to show the light as two dozen separately tracked trail pieces (one or two per shot): it jumped at every
cut, vanished for stretches and sometimes showed two trails at once. This tool authors a single hero light instead:

  head   a smooth curve on the screen for frames 1..1003 (least jerk through the hand-placed WAYPOINTS below), continuous
         in position and speed across every cut — the cuts change the world, never the light;
  tail   what the head leaves behind. Every tail point drifts with the "wind": the motion of the world on the screen
         (camera flow), limited to SAT px/frame and cross-faded over +-BLEND frames at every shot border. So in calm shots
         the tail hangs in the world like smoke, in whip pans it streams without being torn off, and a cut cannot fold it;
  depth  the light flies in front of the shards — except for short planned passes BEHIND one (at most R_MAX frames out of
         sight, with at least G_MIN frames between two passes): that is what makes it go around the structures.

Everything is simulated here frame by frame and baked into src/shots/data/hero.json (tail polyline + depth per frame);
the page only interpolates it (src/fx/hero.js). The numbers printed at the end are measured on that baked result.
"""
import sys, os, json, base64
import numpy as np
from scipy.sparse import lil_matrix, diags
from scipy.sparse.linalg import spsolve

REPO = '/home/user/circle.animaation.proto-2'
W, H = 1280, 720
F0, F1 = 1, 1003
BOX = (64, 1216, 56, 664)   # the light stays inside (x0, x1, y0, y1)
LIFE = 44                   # frames a point of the tail lives
STEP = 2                    # every STEP-th point is stored
SAT = 10.0                  # px/frame: the fastest the tail may drift with the world
BLEND = 6                   # frames: the wind is cross-faded over +-BLEND at every shot border
LMAX = 1000.0               # px: the tail is faded out by this length
V_MIN = 10.0                # px/frame: slowest the light may move against the wind (else the tail collapses)
R_MAX = 10                  # frames: longest pass behind a shard
G_MIN = 12                  # frames: shortest visible stretch between two passes

WAYPOINTS = """
# frame x y [tolerance px, default 16]
# s01 (1-47) gold close-up: the light appears top right and glides down across the slabs
1 1190 150 8
8 1150 190
16 1070 240
24 960 300
32 820 370
40 665 440
46 540 492
# s02 (48-69) crystal: a round turn at the bottom, then it climbs through the middle
50 468 500
54 420 470
58 412 408
62 445 338
66 510 262
69 565 205
# s03 (70-141) monoliths: one big arc over the top and down the right side, back left along the bottom
74 640 130
81 755 88
89 880 105
97 965 185
105 992 295
113 960 405
121 880 488
129 780 532
136 700 545
142 625 546
# s04 (142-187) workers: along the bottom edge of the window to the left, round its corner
147 545 543
152 465 532
157 388 516
162 318 500
167 255 492
171 208 498
175 172 522
179 156 566
183 170 612
187 222 640
# s05 (188-231) close-up: the man's profile fills the right half (nose tip at about (716..780, 515)), so the light
# rises in front of him — a quarter turn (centre (307, 430), r 220), straight up at x = 527, a quarter turn (centre
# (756, 317), r 229) over the brim of his helmet
191 292 650
195 370 641
199 443 603
203 498 539
207 525 458
211 527 373
215 529 289
219 553 211
223 604 146
227 675 103
231 756 88
# s06 (232-307) plant: round the window's top right corner and down its right side (arc: centre (737, 358), r 271),
# behind the shard at its lower right, all the way left along the bottom, up the left side
235 837 106
239 907 147
243 962 206
247 996 278
251 1008 355
255 998 431
259 968 500
263 925 556
267 865 596
272 775 618
278 655 625
284 530 625
290 405 618
295 305 598
299 228 560
302 175 505
305 135 440
308 110 368
# s07 (308-334) gold, the camera starts to climb (wind down-right): up and over to the right along the top
311 98 296
314 105 226
317 135 164
320 188 118
323 258 90
326 336 80
330 440 84
334 540 100
# s08 (335-387) substation: on along the top, down the right side, back left along the bottom against the wind
338 640 122
342 738 150
346 830 186
350 912 232
354 980 290
358 1030 360
362 1056 438
366 1050 516
370 1010 580
374 942 622
378 860 640
382 776 640
386 692 630
# s09 (388-468) lineman (wind up): left along the bottom, up the left side, right along the top — ABOVE the lineman
# (he stands at about (853, 216), r 50), then down the right side clear of him
390 608 618
394 524 610
398 440 606
402 356 598
406 276 578
410 206 538
414 160 472
418 140 394
422 146 314
426 180 238
430 245 178
434 330 140
438 422 120
442 515 112
446 608 106
450 702 102
454 796 102
458 884 116
462 958 150
466 1004 214
# s10 (469-521) helmet (wind right, then up): SLOWLY (15 px/f) down the right side and along the bottom at y = 656 —
# the man in the white helmet rises through the window, and his whole face (forehead to chin, facecheck.py) passes
# (602, 725) r 183 at f498, (630, 627) r 159 at f502, (636, 545) r 141 at f506, (630, 480) r 128 at f510: the light
# stays right of x = 820 until f502 and goes under him only when he is up; then it picks up speed (26 px/f)
470 1026 286
474 1036 354
478 1038 417
482 1032 477
486 1017 535
490 991 588
494 949 630
498 895 653
502 838 658
506 780 660
510 714 659
514 636 657
518 547 656
# s11a, s11b (522-576) field, pylons (wind right): one round turn (centre (500, 375), r 280) from the bottom up the
# left, then right along the top
522 448 650
526 351 612
530 275 542
534 230 449
538 222 346
542 251 247
546 314 165
550 403 112
554 505 95
558 600 104
562 690 128
566 780 158
570 866 196
574 946 242
# s12 (577-655) cabinet (wind right): down the right side, then a slow glide left along the bottom, against the wind
578 1015 300
582 1062 368
586 1085 442
590 1078 514
594 1040 576
598 978 618
604 880 646
610 795 655
616 720 652
622 648 642
628 576 626
634 505 602
640 436 566
646 374 518
652 320 460
# s13 (656-738) young man (wind right, then down, then right). The tail rides with the picture, so whatever the head
# crosses stays crossed for two seconds: the head keeps clear of the face (tools/facecheck.py) — it swings up and over
# the top ahead of him, out wide through the dark round the window's right edge, and comes back below him
658 294 382
664 304 292
670 358 202
676 452 132
682 564 94
688 682 84
694 798 100
700 910 136
706 988 214
712 1012 318
718 976 418
724 888 484
730 778 504
736 662 500
# s14 (739-901) the slab with the turbines (the camera closes in: everything streams outwards, a tail laid low would be
# swept out of the frame — tools/offcheck.py): up across the middle to the left, one big loop round the slab, then a
# slow spiral in over the window
742 548 480
748 437 448
752 363 426
756 289 405
760 221 367
764 179 303
768 172 227
772 200 156
776 259 107
780 333 90
784 414 92
788 500 98
792 588 108
796 676 124
800 764 150
804 846 190
808 918 244
812 974 314
816 1010 396
820 1022 480
824 1008 558
826 990 590
830 935 632
834 868 652
840 775 655
846 690 640
852 615 606
858 553 556
864 508 494
870 482 426
876 476 358
882 492 294
888 530 240
894 586 204
900 652 190
# s16 (902-962) the dark (wind left): a last loop — away to the right and down, back along the bottom, up on the left,
# then faster and faster straight into the centre
902 674 188
906 720 192
910 768 208
914 812 240
918 846 286
922 866 342
926 868 404
930 842 466
934 790 518
938 718 550
942 634 558
945 566 548
948 505 520
951 462 474
953 448 436
955 452 398
957 478 372
959 533 364
961 597 368
# s17 (963-) the burst: the light hits its centre and stays in it
963 667 375 4
966 652 366 4
970 640 356 3
980 640 356 3
1003 640 356 3
"""

# brightness and apparent size of the light (frame, value), eased between the keys
GAIN_KEYS = [(1, 0.0), (8, 1.0), (962, 1.0), (967, 0.9), (975, 0.0)]
SIZE_KEYS = [(1, 1.0), (902, 1.0), (922, 0.72), (940, 0.6), (952, 0.8), (962, 1.4), (970, 1.0)]

def parse_waypoints():
    out = []
    for line in WAYPOINTS.splitlines():
        line = line.split('#')[0].split()
        if len(line) >= 3: out.append((int(line[0]), float(line[1]), float(line[2]), float(line[3]) if len(line) > 3 else 16.0))
    return out

def keyed(keys, f):
    kf = [k[0] for k in keys]
    if f <= kf[0]: return keys[0][1]
    if f >= kf[-1]: return keys[-1][1]
    j = int(np.searchsorted(kf, f, side='right') - 1); t = (f - kf[j]) / (kf[j + 1] - kf[j]); t = t * t * (3 - 2 * t)
    return keys[j][1] + (keys[j + 1][1] - keys[j][1]) * t

def qrot(q, v):
    u = q[:3]
    return v + 2 * np.cross(u, np.cross(u, v) + q[3] * v)

def smoother(t):
    t = min(1.0, max(0.0, t)); return t * t * t * (t * (t * 6 - 15) + 10)

class World:
    def __init__(self, poses='/tmp/work/poses_flown.json'):
        d = json.load(open(poses))
        self.links = d['links']
        self.shots = []
        for s in d['shots']:
            sh = dict(id=s['id'], range=s['range'])
            if s.get('poses'):
                P = np.array(s['poses'])
                sh['f'] = P[:, 0]; sh['p'] = P[:, 1:4]; sh['q'] = P[:, 4:8]; sh['fov'] = P[:, 8]
                for i in range(1, len(P)):
                    if np.dot(sh['q'][i], sh['q'][i - 1]) < 0: sh['q'][i] *= -1
            p = os.path.join(REPO, 'src/shots/data', s['id'] + '.json')
            sh['data'] = json.load(open(p)) if os.path.exists(p) else None
            sh['pv'] = [np.array(pl['v'], float) for pl in sh['data']['polys']] if sh['data'] else []
            self.shots.append(sh)
    def shot_at(self, f):
        for s in reversed(self.shots):
            if f >= s['range'][0]: return s
        return self.shots[0]
    def link_at(self, f):
        for l in self.links:
            if abs(f - l['at']) < l['n'] + 1: return l
        return None
    def by_id(self, i):
        return next(s for s in self.shots if s['id'] == i)
    def cam(self, s, f):
        if 'f' not in s: return np.zeros(3), np.array([0, 0, 0, 1.0]), (H / 2) / np.tan(np.radians(45.0) / 2)
        F = s['f']; i = int(np.clip(np.floor(f) - F[0], 0, len(F) - 2)); u = f - F[i]
        p = s['p'][i] + (s['p'][i + 1] - s['p'][i]) * u
        q = s['q'][i] + (s['q'][i + 1] - s['q'][i]) * u
        return p, q / np.linalg.norm(q), (H / 2) / np.tan(np.radians(s['fov'][i]) / 2)
    def unproject_n(self, s, f, xy, z):
        p, q, k = self.cam(s, f); z = np.broadcast_to(np.asarray(z, float), (len(xy),))
        return qrot(q, np.stack([(xy[:, 0] - W / 2) / k * z, -(xy[:, 1] - H / 2) / k * z, -z], 1)) + p
    def project_n(self, s, f, X):
        p, q, k = self.cam(s, f)
        c = qrot(np.array([-q[0], -q[1], -q[2], q[3]]), X - p); z = np.maximum(1e-3, -c[:, 2])
        return np.stack([W / 2 + k * c[:, 0] / z, H / 2 - k * c[:, 1] / z, z], 1)
    def flow(self, s, f, xy, z):
        """screen velocity (px/frame) of the world points of shot s seen at xy, depth z, at frame f"""
        if 'f' not in s: return np.zeros_like(xy)
        X = self.unproject_n(s, f, xy, z)
        return (self.project_n(s, f + 0.5, X) - self.project_n(s, f - 0.5, X))[:, :2]
    def weights(self, tau):
        out = []
        for i, s in enumerate(self.shots):
            a, b = s['range']
            wa = 1.0 if i == 0 else smoother((tau - (a - BLEND)) / (2.0 * BLEND))
            wb = 0.0 if i == len(self.shots) - 1 else smoother((tau - (b + 1 - BLEND)) / (2.0 * BLEND))
            if wa - wb > 1e-5: out.append((s, wa - wb))
        return out
    def wind(self, tau, xy, z=None):
        """what carries the tail: the flow of the world (at the usual depth of the light in that shot — one smooth field
        over the screen, so neighbouring tail points can never be torn apart), limited to SAT px/frame and cross-faded
        at the shot borders"""
        out = np.zeros_like(xy)
        for s, w in self.weights(tau):
            raw = self.flow(s, tau, xy, self.nominal.get(s['id'], 6.0))
            m = np.hypot(raw[:, 0], raw[:, 1]) + 1e-9
            out += w * raw * (SAT * np.tanh(m / SAT) / m)[:, None]
        return out
    def polys(self, s, f):
        """the solid shards of shot s as seen at frame f: [(index, outline px (m,2), plane normal, plane point, zmin, zmax)]"""
        out = []
        if not s.get('data') or 'f' not in s: return out
        p, q, k = self.cam(s, f); qi = np.array([-q[0], -q[1], -q[2], q[3]])
        for idx, pl in enumerate(s['data']['polys']):
            if pl.get('soft'): continue
            C = qrot(qi, s['pv'][idx] - p)
            n = np.cross(C[1] - C[0], C[2] - C[0]); c0 = C[0].copy()
            # clip against the plane just in front of the camera
            near = -0.08; keep = []
            for i in range(len(C)):
                a, b = C[i], C[(i + 1) % len(C)]
                if a[2] <= near: keep.append(a)
                if (a[2] <= near) != (b[2] <= near): t = (near - a[2]) / (b[2] - a[2]); keep.append(a + (b - a) * t)
            if len(keep) < 3: continue
            C = np.array(keep)
            P2 = np.stack([W / 2 + k * C[:, 0] / -C[:, 2], H / 2 - k * C[:, 1] / -C[:, 2]], 1)
            out.append((idx, P2, n, c0, float((-C[:, 2]).min()), float((-C[:, 2]).max()), k))
        return out

def cover(poly, xy):
    """for the screen points xy: (distance to the shard's outline in px, 0 inside; depth of the shard under the point)"""
    idx, P2, n, c0, zmin, zmax, k = poly
    m = len(P2); inside = np.zeros(len(xy), bool); dist = np.full(len(xy), 1e9)
    x, y = xy[:, 0], xy[:, 1]
    for i in range(m):
        a, b = P2[i], P2[(i + 1) % m]
        cr = ((a[1] > y) != (b[1] > y)) & (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1] + 1e-12) + a[0])
        inside ^= cr
        ab = b - a; t = np.clip(((x - a[0]) * ab[0] + (y - a[1]) * ab[1]) / (ab @ ab + 1e-12), 0, 1)
        dist = np.minimum(dist, np.hypot(a[0] + ab[0] * t - x, a[1] + ab[1] * t - y))
    dist[inside] = 0.0
    ray = np.stack([(x - W / 2) / k, -(y - H / 2) / k, -np.ones(len(xy))], 1)
    den = ray @ n
    z = np.where(np.abs(den) > 1e-9, (n @ c0) / np.where(np.abs(den) > 1e-9, den, 1.0), zmin)
    return dist, np.clip(z, zmin, zmax)

# ---- the head ----------------------------------------------------------------------------------------------------
def nominal_depths(world):
    nominal = {}
    for s in world.shots:
        d = s.get('data')
        if d and d.get('screens') and 'f' in s:
            fm = (s['range'][0] + s['range'][1]) // 2
            zs = [cover(pl, np.array([[W / 2, H / 2]]))[1][0] for pl in world.polys(s, fm)]
            nominal[s['id']] = 0.7 * (float(np.median(zs)) if zs else 9.0)
    nominal.update({'s01': 4.4, 's02': 5.0, 's03': 4.4, 's07': 3.8, 's16': 7.0, 's17': 5.0})
    return nominal

def plan_head(world, wps, nominal, iters=8, lam_j=2.5, lam_a=0.02, lam_r=0.35, w_floor=0.3, log=False):
    """Least-jerk curve through the waypoints, refined so that the TAIL is smooth as well: the light's velocity against
    the wind (which is what lays the tail) changes gently and never drops below V_MIN."""
    n = F1 - F0 + 1
    D3 = lil_matrix((n - 3, n)); D2 = lil_matrix((n - 2, n)); D1 = lil_matrix((n - 1, n))
    for i in range(n - 3): D3[i, i:i + 4] = [-1, 3, -3, 1]
    for i in range(n - 2): D2[i, i:i + 3] = [1, -2, 1]
    for i in range(n - 1): D1[i, i:i + 2] = [-1, 1]
    D3 = D3.tocsr(); D2 = D2.tocsr(); D1 = D1.tocsr()
    Wd = np.zeros(n); B = np.zeros((n, 2))
    for f, x, y, tol in wps:
        w = (16.0 / tol) ** 2
        Wd[f - F0] += w; B[f - F0] += w * np.array([x, y])
    A0 = (diags(Wd) + lam_j * (D3.T @ D3)).tocsc()
    P = np.stack([spsolve(A0, B[:, 0]), spsolve(A0, B[:, 1])], 1)
    last = 963 - F0                         # no tail rules once the light is inside the burst
    zf = np.array([nominal.get(world.shot_at(F0 + i + 0.5)['id'], 6.0) for i in range(n - 1)])
    for it in range(iters):
        u = np.zeros((n - 1, 2))
        for i in range(n - 1):
            u[i] = world.wind(F0 + i + 0.5, 0.5 * (P[i] + P[i + 1])[None], zf[i])[0]
        r = np.diff(P, axis=0) - u
        wr = np.full(n - 2, lam_r); wr[last:] = 0.0
        du = np.diff(u, axis=0)
        sp = np.hypot(r[:, 0], r[:, 1])
        rs = np.stack([np.convolve(np.pad(r[:, d], 3, mode='edge'), np.ones(7) / 7, mode='valid') for d in range(2)], 1)
        rhat = rs / (np.hypot(rs[:, 0], rs[:, 1])[:, None] + 1e-6)
        wf = np.where(sp < V_MIN + 1.5, w_floor, 0.0); wf[last:] = 0.0
        wb = np.zeros(n); tb = P.copy()
        for d in range(2):
            lo, hi = BOX[2 * d], BOX[2 * d + 1]
            bad = (P[:, d] < lo + 6) | (P[:, d] > hi - 6)
            wb[bad] = 0.6; tb[bad, d] = np.clip(P[bad, d], lo + 12, hi - 12)
        A = (diags(Wd + wb) + lam_j * (D3.T @ D3) + lam_a * (D2.T @ D2) + D2.T @ diags(wr) @ D2 + D1.T @ diags(wf) @ D1).tocsc()
        new = np.zeros_like(P)
        for d in range(2):
            rhs = B[:, d] + wb * tb[:, d] + D2.T @ (wr * du[:, d]) + D1.T @ (wf * (u[:, d] + (V_MIN + 1.5) * rhat[:, d]))
            new[:, d] = spsolve(A, rhs)
        step = float(np.abs(new - P).max())
        P = 0.5 * P + 0.5 * new if it > 0 else new
        P[:, 0] = np.clip(P[:, 0], BOX[0], BOX[1]); P[:, 1] = np.clip(P[:, 1], BOX[2], BOX[3])
        if log: print('  iteration %d: max move %.1f px, steps slower than %.0f px/f against the wind: %d' % (it, step, V_MIN, int((sp[:last] < V_MIN).sum())))
    return P

def catmull(P, f):
    u = np.clip(f, F0, F1) - F0; i = int(min(np.floor(u), len(P) - 2)); t = u - i
    p0 = P[max(i - 1, 0)]; p1 = P[i]; p2 = P[i + 1]; p3 = P[min(i + 2, len(P) - 1)]
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)

# ---- passes behind the shards --------------------------------------------------------------------------------------
def plan_events(world, P, log=False):
    """Where the light goes BEHIND a shard: a run of 3..R_MAX frames under one solid shard that is the nearest thing
    under the light all the way, entered and left inside the shot and clear of every dissolve, with G_MIN visible
    frames between two passes. The runs are measured through the dissolves too, so that a long crossing is never
    mistaken for a short one that happens to start where a dissolve ends."""
    n = len(P); under = [dict() for _ in range(n)]
    for i in range(n):
        f = F0 + i; s = world.shot_at(f)
        if f > 955: continue
        for pl in world.polys(s, f):
            d, z = cover(pl, P[i][None])
            if d[0] == 0.0: under[i][pl[0]] = float(z[0])
    events = []; prev_end = -10 ** 6
    i = 0
    cand = []
    for s in world.shots:
        a, b = s['range']; b = min(b, F1)
        for idx in range(len(s['pv'])):
            run = None
            for f in range(a, b + 2):
                inside = f <= b and idx in under[f - F0]
                if inside and run is None: run = f
                if not inside and run is not None:
                    cand.append((run, f - 1, s['id'], idx)); run = None
    why = []
    for a, b, sid, idx in sorted(cand):
        s = world.by_id(sid); L = b - a + 1
        if L < 3: continue
        if L > R_MAX: why.append('f%d-%d %s/%d long' % (a, b, sid, idx)); continue
        if a - 4 < s['range'][0] or b + 4 > s['range'][1]: why.append('f%d-%d %s/%d at a cut' % (a, b, sid, idx)); continue
        # a run that touches a dissolve is not a pass: the light is drawn in front all through a dissolve, so it would
        # drop behind the shard it is already flying over (that was the case at f480 and f586)
        if any(world.link_at(f) for f in range(a - 2, b + 3)): why.append('f%d-%d %s/%d in a dissolve' % (a, b, sid, idx)); continue
        ok = True
        for f in range(a, b + 1):
            zP = under[f - F0][idx]
            for j, z in under[f - F0].items():
                if j != idx and z < zP * 1.02: ok = False                     # something nearer is in the way
        if not ok: why.append('f%d-%d %s/%d covered' % (a, b, sid, idx)); continue
        if a - prev_end - 1 < G_MIN: why.append('f%d-%d %s/%d too soon' % (a, b, sid, idx)); continue
        events.append(dict(a=a, b=b, shot=sid, poly=idx)); prev_end = b
    if log:
        print('passes behind a shard:', ', '.join('f%d-%d %s/%d' % (e['a'], e['b'], e['shot'], e['poly']) for e in events) or 'none')
        print('  not used:', '; '.join(why))
    return events

def depth_of(world, f, pts, flags, events, nominal, slip):
    """draw depth of the points pts (m,2) at frame f. flags[i] = index of the event the point belongs to (or -1)."""
    s = world.shot_at(f); m = len(pts)
    free = nominal.get(s['id'], 6.0)
    zb = np.full(m, free); zf = np.full(m, 1e9); hidden = np.zeros(m, bool)
    r = np.minimum(160.0, 40.0 + 1.3 * slip)
    shots = [s]
    l = world.link_at(f)
    if l: shots = [world.by_id(l['a']), world.by_id(l['b'])]
    for sh in shots:
        for pl in world.polys(sh, f):
            d, z = cover(pl, pts)
            beh = np.array([fl >= 0 and events[fl]['shot'] == sh['id'] and events[fl]['poly'] == pl[0] for fl in flags]) & (not l)
            flagged = np.array([fl >= 0 for fl in flags]) & (not l)
            near = d <= np.where(flagged, 0.0, r)      # a point on its way behind a shard must not be pulled forward by the neighbours' safety margin
            zb = np.where(beh & (d <= r), np.maximum(zb, 1.15 * z), zb)
            zf = np.where(~beh & near, np.minimum(zf, 0.78 * z), zf)
            hidden |= beh & (d == 0.0)
    z = np.minimum(zb, zf)
    hidden &= z >= zb - 1e-9
    return np.clip(z, 0.3, 60.0), hidden

# ---- the tail --------------------------------------------------------------------------------------------------------
def simulate(world, P, events, nominal):
    """frame by frame: every tail point drifts with the wind; returns T[frame, age] = (x, y, draw depth, hidden)"""
    n = len(P); T = np.zeros((n, LIFE + 1, 4))
    pos = np.zeros((0, 2)); zadv = np.zeros(0); flag = np.zeros(0, int)
    def flag_of(f):
        for k, e in enumerate(events):
            if e['a'] - 8 <= f <= e['b'] + 8: return k
        return -1
    prev = None
    for i in range(n):
        f = F0 + i
        pos = np.vstack([P[i][None], pos])[:LIFE + 1]
        flag = np.r_[flag_of(f), flag][:LIFE + 1]
        zadv = np.r_[0.0, zadv][:LIFE + 1]
        # how fast each point slides against the world (for the safety margin around the shards)
        s = world.shot_at(f)
        k1 = world.wind(f, pos, np.maximum(zadv, 1.0) if i else np.full(len(pos), 6.0))
        raw = world.flow(s, f, pos, np.maximum(zadv, 1.0))
        v = k1.copy()
        if i + 1 < n: v[0] = P[i + 1] - P[i]
        slip = np.hypot(*(v - raw).T)
        z, hid = depth_of(world, f, pos, flag, events, nominal, slip)
        zadv[0] = nominal.get(s['id'], 6.0)      # the tail drifts as if it hung at the shot's usual depth (a smooth wind field)
        m = len(pos)
        T[i, :m, :2] = pos; T[i, :m, 2] = z; T[i, :m, 3] = hid
        if m < LIFE + 1: T[i, m:] = T[i, m - 1]
        # one step of the wind (midpoint rule)
        za = np.maximum(zadv, 1.0)
        k1 = world.wind(f, pos, za)
        k2 = world.wind(f + 0.5, pos + 0.5 * k1, za)
        pos = pos + k2
    return T

def tail_stats(T):
    """per frame: visible length within LMAX, total length, sharpest bend (deg per 40 px) and where (age)"""
    out = np.zeros((len(T), 4))
    for i, t in enumerate(T):
        seg = np.diff(t[:, :2], axis=0); L = np.hypot(seg[:, 0], seg[:, 1]); cum = np.r_[0, np.cumsum(L)]
        vis = L[(cum[1:] <= LMAX) & (t[1:, 3] == 0) & (t[:-1, 3] == 0)].sum()
        turn = 0.0; where = 0.0
        tot = min(cum[-1], LMAX)
        if tot > 100:
            sq = np.arange(0, tot, 10.0)
            Q = np.stack([np.interp(sq, cum, t[:, 0]), np.interp(sq, cum, t[:, 1])], 1)
            dq = np.diff(Q, axis=0); ang = np.unwrap(np.arctan2(dq[:, 1], dq[:, 0]))
            if len(ang) > 5:
                da = np.abs(ang[4:] - ang[:-4]); j = int(np.argmax(da)); turn = float(np.degrees(da[j])); where = float(np.interp(sq[j + 2], cum, np.arange(len(t))))
        out[i] = (vis, cum[-1], turn, where)
    return out

def main():
    world = World()
    wps = parse_waypoints()
    nominal = nominal_depths(world); world.nominal = nominal
    P = plan_head(world, wps, nominal, log=True)
    events = plan_events(world, P, log=True)
    T = simulate(world, P, events, nominal)
    S = tail_stats(T)
    n = len(P)
    v = np.diff(P, axis=0); sp = np.hypot(v[:, 0], v[:, 1]); acc = np.hypot(*np.diff(P, 2, axis=0).T)
    rel = np.array([np.hypot(*(v[i] - world.wind(F0 + i + 0.5, 0.5 * (P[i] + P[i + 1])[None], T[i, 0, 2])[0])) for i in range(n - 1)])
    hid = T[:, 0, 3]
    print('shot   frames    | head px/f med/max | accel max | against the wind min/med | tail px: visible min / length med | sharpest bend deg/40px | head hidden frames | depth')
    for s in world.shots:
        a, b = s['range']; b = min(b, 962)
        if a > 962: continue
        ia, ib = a - F0, b - F0
        ia2 = max(ia, 12)
        print('%-5s %4d-%4d  | %5.1f %5.1f       | %5.2f     | %5.1f %5.1f              | %5.0f / %5.0f                     | %5.0f                  | %3d                | %.1f-%.1f' % (
            s['id'], a, b, np.median(sp[ia:ib]), sp[ia:ib].max(), acc[ia:max(ia + 1, ib - 1)].max(), rel[ia:ib].min(), np.median(rel[ia:ib]),
            S[ia2:ib + 1, 0].min(), np.median(S[ia:ib + 1, 1]), S[ia2:ib + 1, 2].max(), int(hid[ia:ib + 1].sum()), T[ia:ib + 1, 0, 2].min(), T[ia:ib + 1, 0, 2].max()))
    bad = [(F0 + i, int(S[i, 2]), int(F0 + i - S[i, 3])) for i in range(12, 962) if S[i, 2] > 60]
    if bad:
        laid = {}
        for f, ang, lf in bad: laid.setdefault(int(round(lf / 4.0)) * 4, []).append((f, ang))
        print('tail bends > 60 deg per 40 px (laid at ~f: worst, seen):', '; '.join('f%d: %d deg, f%d-%d' % (k, max(x[1] for x in laid[k]), laid[k][0][0], laid[k][-1][0]) for k in sorted(laid)))
    else: print('no tail bend above 60 deg per 40 px')
    slow = [(F0 + i, round(float(rel[i]), 1)) for i in range(0, 961) if rel[i] < V_MIN - 1.5]
    print('frames slower than %.1f px/f against the wind:' % (V_MIN - 1.5), slow[:30])
    print('max distance from a waypoint: %.1f px' % max(float(np.hypot(P[f - F0, 0] - x, P[f - F0, 1] - y)) for f, x, y, tol in wps))
    for a in sys.argv:
        if a.startswith('--sheet='): sheet(world, P, T, events, [int(x) for x in a.split('=')[1].rstrip('!').split(',')], not a.endswith('!'))
    for a in sys.argv:
        if a.startswith('--save='): np.save(a.split('=')[1], T)
    if '--dry' not in sys.argv:
        keep = list(range(0, LIFE + 1, STEP))
        xy = np.clip(np.round(T[:, keep, :2] * 16), -32768, 32767).astype('<i2')
        z = np.clip(np.round(T[:, keep, 2] * 512), 0, 65535).astype('<u2')
        # how much of the head is in sight (the lens flare follows it): sampled finer than a frame
        vis = np.ones(n)
        for e in events:
            s = world.by_id(e['shot'])
            for f in range(e['a'] - 1, e['b'] + 2):
                hits = []
                for dt in (-0.5, -0.25, 0.0, 0.25, 0.5):
                    pl = [p for p in world.polys(s, f + dt) if p[0] == e['poly']]
                    hits.append(bool(pl) and cover(pl[0], catmull(P, f + dt)[None])[0][0] == 0.0)
                vis[f - F0] = 1.0 - float(np.mean(hits))
        vis = np.convolve(np.pad(vis, 1, mode='edge'), [0.25, 0.5, 0.25], mode='valid')
        # The light as a LAMP for the gold (uLights): its depth must not follow the draw depth, which steps from one
        # shard to the next and drops behind a shard during a pass — a big facet would flicker. The lamp always hangs
        # in front of everything near the head, its depth eased over time; a pass behind a shard only dims it (`lit`).
        def gauss(v, sg):
            r = int(4 * sg) + 1; k = np.exp(-np.arange(-r, r + 1) ** 2 / (2.0 * sg * sg)); k /= k.sum()
            return np.convolve(np.pad(v, r, mode='edge'), k, mode='valid')
        zl = np.array([depth_of(world, F0 + i, P[i][None], np.array([-1]), events, nominal, np.array([30.0]))[0][0] for i in range(n)])
        zl = gauss(zl, 3.0)
        lit = gauss(vis, 2.0)
        out = dict(f0=F0, f1=F1, n=len(keep), step=STEP, life=LIFE, lmax=LMAX, q=16, zq=512,
                   xy=base64.b64encode(xy.tobytes()).decode(), z=base64.b64encode(z.tobytes()).decode(),
                   vis=[round(float(x), 3) for x in vis],
                   zl=[round(float(x), 3) for x in zl], lit=[round(float(x), 3) for x in lit],
                   gain=[round(keyed(GAIN_KEYS, F0 + i), 3) for i in range(n)],
                   size=[round(keyed(SIZE_KEYS, F0 + i), 3) for i in range(n)],
                   events=[[e['a'], e['b'], e['shot'], e['poly']] for e in events])
        p = os.path.join(REPO, 'src/shots/data/hero.json')
        json.dump(out, open(p, 'w'), separators=(',', ':')); print('wrote', p, os.path.getsize(p), 'bytes')
        np.save('/tmp/work/hero_T.npy', T)

def sheet(world, P, T, events, frames, video=True, tw=320):
    import cv2
    th = tw * 9 // 16; tiles = []
    for f in frames:
        im = cv2.imread('/tmp/work/frames/f_%04d.jpg' % f) if video else np.zeros((H, W, 3), np.uint8)
        im = (im * 0.7).astype(np.uint8)
        fut = np.array([P[min(len(P) - 1, t - F0)] for t in range(f, min(F1, f + 30) + 1)])
        cv2.polylines(im, [np.round(fut).astype(np.int32)], False, (255, 160, 0), 2, cv2.LINE_AA)
        t = T[f - F0]; cum = 0.0
        for i in range(len(t) - 1):
            cum += float(np.hypot(*(t[i + 1, :2] - t[i, :2])))
            c = max(0.0, 1 - i / len(t)) * (1.0 if cum < LMAX else 0.3)
            col = (60, 60, 200) if t[i, 3] or t[i + 1, 3] else (int(120 * c), int(255 * c), int(255 * c))
            cv2.line(im, tuple(np.round(t[i, :2]).astype(int)), tuple(np.round(t[i + 1, :2]).astype(int)), col, 6, cv2.LINE_AA)
        cv2.circle(im, (int(t[0, 0]), int(t[0, 1])), 15, (60, 60, 255) if t[0, 3] else (255, 255, 255), -1, cv2.LINE_AA)
        cv2.putText(im, 'f%d %s' % (f, world.shot_at(f)['id']), (12, 44), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (0, 255, 0), 3, cv2.LINE_AA)
        tiles.append(cv2.resize(im, (tw, th), interpolation=cv2.INTER_AREA))
    cols = 4
    while len(tiles) % cols: tiles.append(np.zeros_like(tiles[0]))
    out = '/tmp/work/sheets/hero_%d.jpg' % frames[0]
    cv2.imwrite(out, np.vstack([np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)]), [cv2.IMWRITE_JPEG_QUALITY, 82]); print(out)

if __name__ == '__main__':
    main()
