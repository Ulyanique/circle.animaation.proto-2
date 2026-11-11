"""final_check.py NAME — whole-timeline comparison of image motion: original vs render NAME (motion/img_NAME.json)."""
import json, sys, numpy as np
name = sys.argv[1]
import os
def L(n):
    p = '/tmp/work/motion/img_%s.json' % n
    return {r['f']: r for r in json.load(open(p))} if os.path.exists(p) else {}
orig, new = L('orig'), L(name)
base = L('base')        # the render before any smoothing work; it cannot be re-made (its numbers are in tools/NOTES.md) — empty if absent
if not orig: sys.exit('no /tmp/work/motion/img_orig.json — run: imgflow.py orig /tmp/work/frames/f_%04d.jpg 1 1213')
SHOTS = [('s01', 1), ('s02', 48), ('s03', 70), ('s04', 142), ('s05', 188), ('s06', 232), ('s07', 308), ('s08', 335), ('s09', 388), ('s10', 469), ('s11a', 522), ('s11b', 533),
         ('s12', 577), ('s13', 656), ('s14a', 739), ('s14b', 817), ('s16', 902), ('s17', 963)]
CUTS = {48, 70, 142, 188, 232, 308, 388, 522, 533, 902}
LINKS = {335, 469, 577, 656, 739}
ends = [s[1] for s in SHOTS[1:]] + [1214]
def col(d, a, b, k):
    return np.array([d[f][k] for f in range(a + 1, b) if f in d and k in d[f]])
print('shot    frames     | LK px/f  min / median:  orig        base        %s      | still frames (<0.5 px/f): orig base %s' % (name, name))
for (sid, a), b in zip(SHOTS, ends):
    row = []
    for d in (orig, base, new):
        m = col(d, a, b, 'mag'); row.append((m.min() if len(m) else np.nan, np.median(m) if len(m) else np.nan, int((m < 0.5).sum())))
    print('%-5s %4d-%4d |                        %5.2f/%5.2f  %5.2f/%5.2f  %5.2f/%5.2f |   %3d %3d %3d' % (sid, a, b - 1, row[0][0], row[0][1], row[1][0], row[1][1], row[2][0], row[2][1], row[0][2], row[1][2], row[2][2]))
# pops: a frame whose difference to the previous one sticks out of its neighbourhood (not at a real cut)
print('\npops (diff of one frame > 1.8x the median of the 6 around it and +6), outside real cuts and s17:')
for d, n in ((orig, 'orig'), (base, 'base'), (new, name)):
    out = []
    for f in range(4, 962):
        if f in CUTS or f not in d: continue
        nb = [d[g]['diff'] for g in (f - 3, f - 2, f - 1, f + 1, f + 2, f + 3) if g in d and g not in CUTS]
        if len(nb) >= 4 and d[f]['diff'] > 1.8 * np.median(nb) + 6: out.append('%d%s(%.0f/%.0f)' % (f, '*' if f in LINKS else '', d[f]['diff'], np.median(nb)))
    print('  %-5s %2d: %s' % (n, len(out), ' '.join(out)))
# jerk: change of the global shift vector between consecutive frame pairs
print('\njerk = |shift(f) - shift(f-1)| px/f^2, median and p95 per shot (orig | base | %s)' % name)
def jerk(d, a, b):
    v = [(d[f]['dx'], d[f]['dy']) if f in d and 'dx' in d[f] else None for f in range(a + 1, b)]
    j = [np.hypot(v[i][0] - v[i - 1][0], v[i][1] - v[i - 1][1]) for i in range(1, len(v)) if v[i] and v[i - 1]]
    return (np.median(j), np.percentile(j, 95)) if j else (np.nan, np.nan)
for (sid, a), b in zip(SHOTS[:-1], ends[:-1]):
    r = [jerk(d, a, b) for d in (orig, base, new)]
    print('  %-5s  %5.2f/%6.2f | %5.2f/%6.2f | %5.2f/%6.2f' % (sid, r[0][0], r[0][1], r[1][0], r[1][1], r[2][0], r[2][1]))
# slow spots: ours much slower than the original over 6-frame bins
print('\nbins of 6 frames where the render moves < 45%% of the original (orig > 4 px/f) or stands still (< 1 px/f):')
for f0 in range(2, 960, 6):
    o = [orig[f]['mag'] for f in range(f0, f0 + 6) if f in orig and 'mag' in orig[f] and f not in CUTS]
    n = [new[f]['mag'] for f in range(f0, f0 + 6) if f in new and 'mag' in new[f] and f not in CUTS]
    if len(o) >= 3 and len(n) >= 3:
        mo, mn = np.median(o), np.median(n)
        if (mo > 4 and mn < 0.45 * mo) or mn < 1: print('  f%d-%d: orig %.1f  render %.1f' % (f0, f0 + 5, mo, mn))
