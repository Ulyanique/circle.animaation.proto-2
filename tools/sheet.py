#!/usr/bin/env python
"""Contact sheet builder: sheet.py OUT START STEP COLS ROWS [TILE_W] [SRC_DIR] [PATTERN]"""
import sys, cv2, numpy as np, os
out = sys.argv[1]; start = int(sys.argv[2]); step = int(sys.argv[3])
cols = int(sys.argv[4]); rows = int(sys.argv[5])
tw = int(sys.argv[6]) if len(sys.argv) > 6 else 480
src = sys.argv[7] if len(sys.argv) > 7 else '/tmp/work/frames'
pat = sys.argv[8] if len(sys.argv) > 8 else 'f_%04d.jpg'
fps = 24.0
th = int(round(tw * 9 / 16))
sheet = np.zeros((rows * th, cols * tw, 3), np.uint8)
n = start
for r in range(rows):
    for c in range(cols):
        p = os.path.join(src, pat % n)
        if os.path.exists(p):
            im = cv2.imread(p)
            im = cv2.resize(im, (tw, th), interpolation=cv2.INTER_AREA)
            label = 'f%d  %.2fs' % (n, (n - 1) / fps)
            cv2.putText(im, label, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 3, cv2.LINE_AA)
            cv2.putText(im, label, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1, cv2.LINE_AA)
            sheet[r * th:(r + 1) * th, c * tw:(c + 1) * tw] = im
        n += step
cv2.imwrite(out, sheet, [cv2.IMWRITE_JPEG_QUALITY, 88])
print(out, sheet.shape)
