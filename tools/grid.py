#!/usr/bin/env python
"""grid.py FRAME [OUT] [--gamma G] [--step N] : frame with labelled pixel grid for reading coordinates."""
import sys, cv2, numpy as np
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = {a.split('=')[0][2:]: (a.split('=')[1] if '=' in a else '1') for a in sys.argv[1:] if a.startswith('--')}
n = int(args[0])
out = args[1] if len(args) > 1 else '/tmp/work/sheets/grid_%04d.jpg' % n
gamma = float(opts.get('gamma', 1.0))
step = int(opts.get('step', 80))
im = cv2.imread('/tmp/work/frames/f_%04d.jpg' % n)
if gamma != 1.0:
    im = (np.clip((im.astype(np.float32) / 255.0) ** (1.0 / gamma), 0, 1) * 255).astype(np.uint8)
H, W = im.shape[:2]
ov = im.copy()
for x in range(0, W, step):
    major = (x % (step * 2) == 0)
    cv2.line(ov, (x, 0), (x, H), (255, 255, 0) if major else (160, 160, 0), 1)
for y in range(0, H, step):
    major = (y % (step * 2) == 0)
    cv2.line(ov, (0, y), (W, y), (255, 255, 0) if major else (160, 160, 0), 1)
im = cv2.addWeighted(ov, 0.45, im, 0.55, 0)
for x in range(0, W, step):
    for y in range(0, H, step * 2):
        cv2.putText(im, '%d' % x, (x + 2, y + 11), cv2.FONT_HERSHEY_SIMPLEX, 0.33, (0, 0, 0), 2, cv2.LINE_AA)
        cv2.putText(im, '%d' % x, (x + 2, y + 11), cv2.FONT_HERSHEY_SIMPLEX, 0.33, (0, 255, 255), 1, cv2.LINE_AA)
for y in range(step, H, step):
    for x in range(0, W, step * 4):
        cv2.putText(im, '%d' % y, (x + 2, y - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.33, (0, 0, 0), 2, cv2.LINE_AA)
        cv2.putText(im, '%d' % y, (x + 2, y - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.33, (255, 200, 255), 1, cv2.LINE_AA)
cv2.imwrite(out, im, [cv2.IMWRITE_JPEG_QUALITY, 92])
print(out)
