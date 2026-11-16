#!/usr/bin/env python
# quad.py f1,f2,f3,f4 [gamma] -> 2x2 sheet of half-size frames with an 80 px grid (labels every 160 px, frame coordinates)
import sys, cv2, numpy as np
fs = [int(x) for x in sys.argv[1].split(',')]
gamma = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
tiles = []
for n in fs:
    im = cv2.imread('/tmp/work/frames/f_%04d.jpg' % n)
    if gamma != 1.0: im = (255 * (im / 255.0) ** gamma).astype(np.uint8)
    t = cv2.resize(im, (640, 360), interpolation=cv2.INTER_AREA)
    for x in range(0, 1280, 80):
        cv2.line(t, (x // 2, 0), (x // 2, 360), (200, 255, 120) if x % 160 == 0 else (120, 150, 90), 1)
    for y in range(0, 720, 80):
        cv2.line(t, (0, y // 2), (640, y // 2), (200, 255, 120) if y % 160 == 0 else (120, 150, 90), 1)
    for x in range(160, 1280, 160):
        for y in (0, 320):
            cv2.putText(t, str(x), (x // 2 + 2, y // 2 + 10), cv2.FONT_HERSHEY_SIMPLEX, 0.3, (0, 0, 0), 2); cv2.putText(t, str(x), (x // 2 + 2, y // 2 + 10), cv2.FONT_HERSHEY_SIMPLEX, 0.3, (0, 255, 255), 1)
    for y in range(160, 720, 160):
        cv2.putText(t, str(y), (2, y // 2 - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.3, (0, 0, 0), 2); cv2.putText(t, str(y), (2, y // 2 - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.3, (255, 200, 255), 1)
    cv2.putText(t, 'f%d' % n, (4, 352), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 3); cv2.putText(t, 'f%d' % n, (4, 352), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 0), 1)
    tiles.append(t)
while len(tiles) < 4: tiles.append(np.zeros_like(tiles[0]))
out = '/tmp/work/sheets/quad_%d.jpg' % fs[0]
cv2.imwrite(out, np.vstack([np.hstack(tiles[:2]), np.hstack(tiles[2:4])]), [cv2.IMWRITE_JPEG_QUALITY, 85]); print(out)
