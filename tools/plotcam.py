"""plotcam.py OUT.png s04 s06 ... [--key cam|camRaw] — baked camera tracks (position and rotation vector) of several shots."""
import json, sys, numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
REPO = '/home/user/circle.animaation.proto-2'
args = [a for a in sys.argv[2:] if not a.startswith('--')]
def rotvec(q):
    q = np.array(q, float); q = q / np.linalg.norm(q)
    if q[3] < 0: q = -q
    ang = 2 * np.arccos(np.clip(q[3], -1, 1)); s = np.sqrt(max(1e-12, 1 - q[3] ** 2))
    return np.degrees(q[:3] / s * ang) if ang > 1e-9 else np.zeros(3)
fig, ax = plt.subplots(2, len(args), figsize=(4.0 * len(args), 6.4), dpi=80, squeeze=False)
for i, sid in enumerate(args):
    d = json.load(open('%s/src/shots/data/%s.json' % (REPO, sid)))
    for key, ls, lw in (('camRaw', ':', 0.8), ('cam', '-', 1.2)):
        if key not in d: continue
        c = np.array(d[key], float)
        for k, col in zip(range(3), ('#d22', '#2a2', '#22d')):
            ax[0][i].plot(c[:, 0], c[:, 1 + k], ls, color=col, lw=lw)
        rv = np.array([rotvec(r[4:8]) for r in c])
        for k, col in zip(range(3), ('#d22', '#2a2', '#22d')):
            ax[1][i].plot(c[:, 0], rv[:, k], ls, color=col, lw=lw)
    ax[0][i].set_title('%s  [%d..%d] ref %s, %d keys' % (sid, d['range'][0], d['range'][1], d.get('ref'), len(d['cam'])), fontsize=9)
    ax[0][i].axvline(d['range'][0], color='#888', lw=0.5); ax[0][i].axvline(d['range'][1], color='#888', lw=0.5)
    ax[0][i].grid(alpha=0.3); ax[1][i].grid(alpha=0.3)
ax[0][0].set_ylabel('position x(r) y(g) z(b)'); ax[1][0].set_ylabel('rotation vector, deg')
plt.tight_layout(); plt.savefig(sys.argv[1]); print(sys.argv[1])
