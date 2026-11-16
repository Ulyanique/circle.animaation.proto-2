#!/usr/bin/env python
# hcat.py OUT H img1 img2 ...   -> images scaled to height H, side by side
import sys, cv2, numpy as np
out, H = sys.argv[1], int(sys.argv[2])
ims = []
for p in sys.argv[3:]:
    im = cv2.imread(p); s = H / im.shape[0]
    ims.append(cv2.resize(im, (int(im.shape[1] * s), H), interpolation=cv2.INTER_AREA))
cv2.imwrite(out, np.hstack(ims), [cv2.IMWRITE_JPEG_QUALITY, 82]); print(out)
