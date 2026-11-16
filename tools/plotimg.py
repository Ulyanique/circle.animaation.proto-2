"""plotimg.py OUT.png NAME [NAME2] [f0 f1] — image-motion curves of rendered sequences against the original video."""
import json, sys, numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
out = sys.argv[1]; names = [a for a in sys.argv[2:] if not a.lstrip('-').isdigit()]; nums = [int(a) for a in sys.argv[2:] if a.lstrip('-').isdigit()]
f0, f1 = (nums + [1, 1213])[:2] if len(nums) >= 2 else (1, 1213)
def series(name, key):
    d = json.load(open('/tmp/work/motion/img_%s.json' % name))
    return np.array([o['f'] for o in d]), np.array([o.get(key, np.nan) for o in d])
fig, ax = plt.subplots(3, 1, figsize=(16, 9), dpi=80, sharex=True)
cols = {'orig': '#888'}; pal = ['#d22', '#06c', '#2a2']
for i, n in enumerate(['orig'] + names):
    c = cols.get(n, pal[(i - 1) % 3]); lw = 1.0 if n == 'orig' else 1.1
    x, m = series(n, 'mag'); ax[0].plot(x, m, color=c, lw=lw, label=n)
    x, dx = series(n, 'dx'); x, dy = series(n, 'dy')
    acc = np.sqrt(np.diff(dx) ** 2 + np.diff(dy) ** 2); ax[1].plot(x[1:], acc, color=c, lw=lw, label=n)
    x, df = series(n, 'diff'); ax[2].plot(x, df, color=c, lw=lw, label=n)
for a in ax:
    for cut in [48, 70, 142, 188, 232, 308, 388, 522, 533, 902]: a.axvline(cut, color='#39c', lw=0.8, alpha=0.7)
    for cut in [335, 469, 577, 656, 739, 817, 963, 1003]: a.axvline(cut, color='#c93', lw=0.8, alpha=0.7, ls='--')
    a.set_xlim(f0, f1); a.grid(alpha=0.3)
ax[0].set_yscale('log'); ax[0].set_ylim(0.05, 300); ax[0].set_ylabel('motion px/frame (median LK)'); ax[0].legend(loc='upper right', fontsize=8)
ax[1].set_yscale('log'); ax[1].set_ylim(0.02, 100); ax[1].set_ylabel('change of global shift px/f^2 (jerkiness)')
ax[2].set_yscale('log'); ax[2].set_ylim(0.1, 120); ax[2].set_ylabel('mean abs frame difference'); ax[2].set_xlabel('frame (blue = real cuts, orange dashed = continuous transitions)')
plt.tight_layout(); plt.savefig(out); print(out)
