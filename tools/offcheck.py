# offcheck.py T.npy [F0 F1] — where the light's tail leaves the frame: per frame, the ages (frames) of the tail points outside
import sys, numpy as np
T = np.load(sys.argv[1]); a, b = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (1, 962)
M = 6
rows = []
for f in range(a, b + 1):
    P = T[f - 1]
    out = (P[:, 0] < -M) | (P[:, 0] > 1280 + M) | (P[:, 1] < -M) | (P[:, 1] > 720 + M)
    if not out.any(): continue
    k = np.nonzero(out)[0]
    # an "island": points outside with points inside on BOTH sides (the tail leaves the frame and comes back)
    island = bool(out[:k[0]].size and (~out[k[-1] + 1:]).any())
    rows.append((f, int(k[0]), int(k[-1]), island, float(P[k, 1].max()), float(P[k, 0].max()), float(P[k, 0].min()), float(P[k, 1].min())))
runs = []
for r in rows:
    if runs and r[0] == runs[-1][-1][0] + 1 and r[3] == runs[-1][-1][3]: runs[-1].append(r)
    else: runs.append([r])
for run in runs:
    print('f%d-%d %s: ages %d..%d outside (of 44); x %.0f..%.0f y %.0f..%.0f' % (run[0][0], run[-1][0], 'LEAVES AND RETURNS' if run[0][3] else 'tail end outside',
          min(r[1] for r in run), max(r[2] for r in run), min(r[6] for r in run), max(r[5] for r in run), min(r[7] for r in run), max(r[4] for r in run)))
