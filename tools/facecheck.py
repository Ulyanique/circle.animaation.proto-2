# facecheck.py [T.npy] [-v SHOT] — does the light's ribbon cross a face?
# For every face in the footage windows: where it is on screen (frame by frame, through the screen's o/u/v and the
# camera as flown) and how close the ribbon comes to it, in face radii. The tail rides with the picture, so whatever
# the head crosses stays crossed for up to two seconds. Only the part of the tail that is still bright counts
# (envelope > 0.1, i.e. age <= 38 frames of 44). `-v SHOT` prints that shot frame by frame.
import os, sys, numpy as np
args = sys.argv[1:]
npy = next((a for a in args if a.endswith('.npy')), '/tmp/work/hero_T.npy')
verbose = args[args.index('-v') + 1] if '-v' in args else None
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); sys.argv = sys.argv[:1] + ['--dry']
import heropath as H

# shot, screen, (u, v) of the face centre in the still, radius in u, first frame the face is readable (reveal)
FACES = [
    ('s04', 'workers', (180 / 1024, 530 / 1138), 150 / 1024, 142, 'left worker'),
    ('s04', 'workers', (520 / 1024, 520 / 1138), 170 / 1024, 142, 'right worker'),
    ('s05', 'closeup', (960 / 1400, 470 / 915), 230 / 1400, 188, 'close-up'),
    ('s09', 'lineman', (830 / 960, 310 / 858), 60 / 960, 401, 'lineman'),
    ('s10', 'helmet', (630 / 960, 660 / 1015), 170 / 960, 484, 'white helmet'),      # the whole face (the still of f507 shows it down to the chin)
    ('s11b', 'cabinet', (350 / 1024, 140 / 688), 80 / 1024, 533, 'worker at the cabinet'),
    ('s12', 'cabinet', (350 / 1024, 140 / 688), 80 / 1024, 577, 'worker at the cabinet'),
    ('s13', 'youngman', (0.417, 0.189), 0.146, 677, 'young man'),
]
OLD = 38     # tail points older than this are too faint to matter

w = H.World(); w.nominal = H.nominal_depths(w)

def face_track(sid, name, uv, ru):
    s = w.by_id(sid); sc = next(x for x in s['data']['screens'] if x['name'] == name)
    o, u, v = (np.array(sc[k], float) for k in 'ouv')
    C = o + uv[0] * u + uv[1] * v; R = o + (uv[0] + ru) * u + uv[1] * v
    def at(f):
        c = w.project_n(s, f, C[None])[0]; r = w.project_n(s, f, R[None])[0]
        return c[:2], float(np.hypot(*(r[:2] - c[:2])))
    return s, at

def face(f):
    """the young man's face in s13 (used by faceplot.py)"""
    return face_track('s13', 'youngman', (0.417, 0.189), 0.146)[1](f)

if __name__ == '__main__':
    T = np.load(npy)
    print('face                    | frames     | closest: head / bright tail (face radii) at frame | frames with the ribbon inside 1.2 r')
    for sid, name, uv, ru, f0, label in FACES:
        s, at = face_track(sid, name, uv, ru)
        a, b = s['range']; rows = []
        for f in range(max(a, f0), b + 1):
            c, r = at(f)
            if not (-r < c[0] < 1280 + r and -r < c[1] < 720 + r) or r < 12: continue      # off screen or tiny
            P = T[f - H.F0, :OLD + 1, :2]
            d = np.hypot(P[:, 0] - c[0], P[:, 1] - c[1]) / r
            rows.append((f, d[0], d.min(), int(np.argmin(d)), c, r))
        if not rows: print('%-23s | not on screen' % label); continue
        hmin = min(rows, key=lambda x: x[1]); tmin = min(rows, key=lambda x: x[2])
        bad = [x[0] for x in rows if x[2] < 1.2]
        runs = []
        for f in bad:
            if runs and f == runs[-1][1] + 1: runs[-1][1] = f
            else: runs.append([f, f])
        print('%-23s | %4d-%4d  | head %.2f r at f%d, tail %.2f r at f%d (age %d)          | %s' % (
            label, rows[0][0], rows[-1][0], hmin[1], hmin[0], tmin[2], tmin[0], tmin[3], ', '.join('f%d-%d' % (x, y) for x, y in runs) or 'none'))
        if verbose == sid:
            for f, dh, dm, k, c, r in rows[::2]:
                print('   f%d face (%.0f, %.0f) r %.0f | head (%.0f, %.0f) %.2f r | tail %.2f r (age %d)' % (f, c[0], c[1], r, T[f - H.F0, 0, 0], T[f - H.F0, 0, 1], dh, dm, k))
