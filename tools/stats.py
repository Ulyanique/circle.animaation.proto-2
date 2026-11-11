import cv2, numpy as np, json
N = 1213
prev = None
rows = []
for n in range(1, N + 1):
    im = cv2.imread('/tmp/work/frames/f_%04d.jpg' % n)
    small = cv2.resize(im, (320, 180), interpolation=cv2.INTER_AREA).astype(np.float32)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    mean = float(gray.mean())
    diff = float(np.abs(small - prev).mean()) if prev is not None else 0.0
    # histogram correlation for cut detection
    rows.append({'f': n, 't': round((n - 1) / 24, 3), 'mean': round(mean, 2), 'diff': round(diff, 2),
                 'b': round(float(small[..., 0].mean()), 1), 'g': round(float(small[..., 1].mean()), 1), 'r': round(float(small[..., 2].mean()), 1)})
    prev = small
json.dump(rows, open('/tmp/work/stats.json', 'w'))
# print likely cuts: diff spikes relative to neighbours
d = np.array([r['diff'] for r in rows])
for i in range(2, N - 1):
    loc = np.median(d[max(0, i - 6):i + 7])
    if d[i] > 12 and d[i] > 2.2 * loc:
        print('cut? f%d t=%.3f diff=%.1f local=%.1f mean=%.1f' % (rows[i]['f'], rows[i]['t'], d[i], loc, rows[i]['mean']))
