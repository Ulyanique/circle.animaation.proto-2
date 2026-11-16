"""unify.py A B AT [--k=K] [--dry] — make two linked shots (B starts at frame AT, the film does not cut there) share
their footage shards, so that the scene is literally the same on both sides of the border.

Each shot tracks one window and only approximates the neighbour's (a parallel plane fitted at its own ref frame), so the
two versions of a window disagree at the border and the dissolve shows it twice. Here the worlds are glued with a
similarity X_B = k*R*(X_A - C_A) + C_B (cameras of frame AT coincide; k = relative world scale), then
  - B's secondary screen/poly is replaced by A's tracked one (mapped into world B),
  - A's secondary screen/poly is replaced by B's tracked one (mapped into world A).
k is found by a 1-D scan: A's shard, seen by B's camera at B's ref frame, must land on B's hand-fitted outline (left edge).
The glue is stored in B's data JSON ("link") and used by the player for the camera hand-over.
Run again after re-baking either shot (bake.py restores the separate versions)."""
import json, sys, math, numpy as np
from scipy.spatial.transform import Rotation as R
REPO = '/home/user/circle.animaation.proto-2'
args = [a for a in sys.argv[1:] if not a.startswith('--')]; opts = dict(a[2:].split('=') if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
A_id, B_id, AT = args[0], args[1], int(args[2])
F = 360 / math.tan(math.radians(22.5))
path = lambda s: '%s/src/shots/data/%s.json' % (REPO, s)
A, B = json.load(open(path(A_id))), json.load(open(path(B_id)))
if 'link' in B or any(s.get('from') for s in A['screens'] + B['screens']): raise SystemExit('already unified - re-bake both shots first')
def cam(d, f):
    k = min(d['cam'], key=lambda k: abs(k[0] - f)); assert abs(k[0] - f) < 0.01
    return np.array(k[1:4]), R.from_quat(k[4:8]).as_matrix()
def proj(P, C, M):
    q = (np.atleast_2d(P) - C) @ M
    return np.stack([640 + F * q[:, 0] / -q[:, 2], 360 - F * q[:, 1] / -q[:, 2]], 1)
CA, RA = cam(A, AT); CB, RB = cam(B, AT)
Rm = RB @ RA.T
fwd = lambda X, k: k * (np.atleast_2d(X) - CA) @ Rm.T + CB                 # world A -> world B
inv = lambda X, k: ((np.atleast_2d(X) - CB) @ Rm) / k + CA                 # world B -> world A
# A = tracked on its screen 1, B = tracked on its screen 1; the other one of each is the approximation
pa, pb = A['polys'], B['polys']
a_main = next(p for p in pa if p.get('screen') == 1); a_sec = next(p for p in pa if p.get('screen') == 2)
b_main = next(p for p in pb if p.get('screen') == 1); b_sec = next(p for p in pb if p.get('screen') == 2)
Cr, Rr = cam(B, B['ref'])
def left_edge(poly, C, M, n=1):
    """the poly edge with the smallest mean x at this camera -> (points along it)"""
    v = np.array(poly['v']); px = proj(v, C, M); m = len(v)
    i = min(range(m), key=lambda i: (px[i, 0] + px[(i + 1) % m, 0]) / 2 if abs(px[i, 1] - px[(i + 1) % m, 1]) > 200 else 1e9)
    return v[i], v[(i + 1) % m]
if 'k' in opts: k = float(opts['k'])
else:
    t0, t1 = proj(np.array(left_edge(b_sec, Cr, Rr)), Cr, Rr)             # target line in B's ref frame (px)
    ea, eb = left_edge(a_main, *cam(A, AT))
    S = np.array([ea + (eb - ea) * t for t in np.linspace(0.15, 0.85, 8)])
    best = None
    for kk in np.arange(0.4, 3.0, 0.002):
        p = proj(fwd(S, kk), Cr, Rr)
        xt = t0[0] + (p[:, 1] - t0[1]) / (t1[1] - t0[1]) * (t1[0] - t0[0])
        e = np.abs(p[:, 0] - xt).mean()
        if best is None or e < best[0]: best = (e, kk)
    k = float(best[1]); print('scale scan: k = %.3f (left edge of %s/%s lands %.1f px from %s/%s at f%d)' % (k, A_id, a_main['id'], best[0], B_id, b_sec['id'], B['ref']))
t = CB - k * Rm @ CA
def map_screen(s, f):
    o, u, v = (np.array(s[x]) for x in 'ouv')
    O = f(o)[0]; U = f(o + u)[0] - O; V = f(o + v)[0] - O
    return dict(name=s['name'], o=[round(float(x), 4) for x in O], u=[round(float(x), 4) for x in U], v=[round(float(x), 4) for x in V], **{'from': 1})
def map_poly(p, f, scale):
    q = dict(p); q['v'] = [[round(float(x), 4) for x in r] for r in f(np.array(p['v']))]
    if 'thick' in q: q['thick'] = round(q['thick'] * scale, 4)
    q['screen'] = 2
    return q
print('%s f%d: tracked shard px %s' % (A_id, AT, np.round(proj(a_main['v'], CA, RA)).astype(int).tolist()))
print('%s f%d: old approx   px %s' % (B_id, AT, np.round(proj(b_sec['v'], CB, RB)).astype(int).tolist()))
print('%s f%d: tracked shard px %s' % (B_id, AT, np.round(proj(b_main['v'], CB, RB)).astype(int).tolist()))
print('%s f%d: old approx   px %s' % (A_id, AT, np.round(proj(a_sec['v'], CA, RA)).astype(int).tolist()))
nb_scr = map_screen(A['screens'][0], lambda X: fwd(X, k)); nb_poly = map_poly(a_main, lambda X: fwd(X, k), k)
na_scr = map_screen(B['screens'][0], lambda X: inv(X, k)); na_poly = map_poly(b_main, lambda X: inv(X, k), 1 / k)
print('%s ref f%d: mapped %s shard px %s' % (B_id, B['ref'], A_id, np.round(proj(nb_poly['v'], Cr, Rr)).astype(int).tolist()))
print('             old approx     px %s' % np.round(proj(b_sec['v'], Cr, Rr)).astype(int).tolist())
if 'dry' not in opts:
    B['screens'] = [B['screens'][0], nb_scr]; B['polys'] = [nb_poly if p is b_sec else p for p in pb]
    A['screens'] = [A['screens'][0], na_scr]; A['polys'] = [na_poly if p is a_sec else p for p in pa]
    B['link'] = {'from': A_id, 'at': AT, 'q': [round(float(x), 7) for x in R.from_matrix(Rm).as_quat()], 't': [round(float(x), 5) for x in t], 'k': round(k, 5)}
    json.dump(A, open(path(A_id), 'w'), separators=(',', ':')); json.dump(B, open(path(B_id), 'w'), separators=(',', ':'))
    print('wrote %s (screens %s) and %s (screens %s), glue k=%.4f' % (A_id, [s['name'] for s in A['screens']], B_id, [s['name'] for s in B['screens']], k))
