"""plotfit.py OUT.png DATADIR s04 s05 ... — raw (dotted) vs smoothed (solid) camera of shots in DATADIR (json with cam + camRaw)."""
import json, sys, numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.spatial.transform import Rotation as R
out, ddir, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
fig, ax = plt.subplots(2, len(ids), figsize=(4 * len(ids), 6.4), dpi=80, squeeze=False)
for i, sid in enumerate(ids):
    d = json.load(open('%s/%s.json' % (ddir, sid)))
    lim = [[], []]
    for key, ls, lw in (('camRaw', ':', 0.9), ('cam', '-', 1.3)):
        if key not in d: continue
        c = np.array(d[key], float); q = c[:, 4:8].copy()
        for j in range(1, len(q)):
            if q[j] @ q[j - 1] < 0: q[j] = -q[j]
        rv = np.degrees(R.from_quat(q).as_rotvec())
        for k, col in zip(range(3), ('#d22', '#2a2', '#22d')):
            ax[0][i].plot(c[:, 0], c[:, 1 + k], ls, color=col, lw=lw); ax[1][i].plot(c[:, 0], rv[:, k], ls, color=col, lw=lw)
        if key == 'cam': lim = [[c[:, 1:4].min(), c[:, 1:4].max()], [rv.min(), rv.max()]]
    for r in range(2):
        a, b = lim[r]; m = 0.35 * (b - a) + 1e-3
        ax[r][i].set_ylim(a - m, b + m); ax[r][i].grid(alpha=0.3)
    ax[0][i].set_title(sid)
plt.tight_layout(); plt.savefig(out); print(out)
