#!/usr/bin/env python
"""cmp.py f1,f2,.. [tileW] : video frame (top) vs render (bottom) sheet."""
import sys, cv2, numpy as np
frames = [int(x) for x in sys.argv[1].split(',')]
tw = int(sys.argv[2]) if len(sys.argv) > 2 else 512
th = tw * 9 // 16
cols = []
for n in frames:
    a = cv2.imread('/tmp/work/frames/f_%04d.jpg' % n)
    b = cv2.imread('/tmp/work/render/r_%04d.png' % n)
    if b is None: b = np.zeros_like(a)
    a = cv2.resize(a, (tw, th), interpolation=cv2.INTER_AREA); b = cv2.resize(b, (tw, th), interpolation=cv2.INTER_AREA)
    cv2.putText(a, 'f%d video' % n, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 0), 1, cv2.LINE_AA)
    cv2.putText(b, 'f%d three.js' % n, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1, cv2.LINE_AA)
    cols.append(np.vstack([a, b]))
out = '/tmp/work/sheets/cmp_%d.jpg' % frames[0]
cv2.imwrite(out, np.hstack(cols), [cv2.IMWRITE_JPEG_QUALITY, 85]); print(out)
