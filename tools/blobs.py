#!/usr/bin/env python
# blobs.py f0 f1 [step]  -> brightest compact blobs per frame (candidates for the streak head / flare): x,y,peak
import sys, cv2, numpy as np
f0, f1 = int(sys.argv[1]), int(sys.argv[2]); step = int(sys.argv[3]) if len(sys.argv) > 3 else 2
for n in range(f0, f1 + 1, step):
    im = cv2.imread('/tmp/work/frames/f_%04d.jpg' % n)
    g = np.minimum(im[..., 1], im[..., 2]).astype(np.float32)
    b = cv2.GaussianBlur(g, (0, 0), 6) - cv2.GaussianBlur(g, (0, 0), 40)      # compact bright spot on a darker surround
    out = []
    bb = b.copy()
    for k in range(2):
        _, mx, _, loc = cv2.minMaxLoc(bb)
        out.append('(%4d,%3d) %3.0f/%3.0f' % (loc[0], loc[1], mx, g[loc[1], loc[0]]))
        cv2.circle(bb, loc, 120, -999, -1)
    print('f%d  %s' % (n, '   '.join(out)))
