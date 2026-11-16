"""plotflow.py OUT.png [f0 f1] — render camera flow vs original video flow."""
import json, sys, numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
out = sys.argv[1]; f0 = int(sys.argv[2]) if len(sys.argv) > 2 else 1; f1 = int(sys.argv[3]) if len(sys.argv) > 3 else 1213
fl = json.load(open('/tmp/work/motion/flow.json')); vf = json.load(open('/tmp/work/motion/vidflow.json'))
fr = np.array(fl['frames']); flow = np.array([np.nan if x is None else x for x in fl['flow']])
vx = np.array([o[0] for o in vf]); vy = np.array([o[1][0] if o[1] else np.nan for o in vf])
fig, ax = plt.subplots(2, 1, figsize=(16, 7.2), dpi=80, sharex=True)
for a, logy in ((ax[0], True), (ax[1], False)):
    a.plot(vx, vy, color='#999', lw=1.0, label='original video (LK median px/frame)')
    a.plot(fr, flow, color='#d22', lw=1.1, label='three.js camera flow (px/frame)')
    cuts = [48, 70, 142, 188, 232, 308, 335, 388, 469, 522, 533, 577, 656, 739, 817, 902, 963, 1003]
    for c in cuts: a.axvline(c, color='#39c', lw=0.6, alpha=0.6)
    a.set_xlim(f0, f1); a.grid(alpha=0.3)
    if logy: a.set_yscale('log'); a.set_ylim(0.05, 300)
    else: a.set_ylim(0, 30)
ax[0].legend(loc='upper right', fontsize=8); ax[1].set_xlabel('frame')
plt.tight_layout(); plt.savefig(out)
print(out)
