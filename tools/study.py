#!/usr/bin/env python
"""study.py REF f1,f2,f3,f4 [gamma] : grid of REF (1280) + strip of 4 frames (320 each) -> /tmp/work/sheets/study_REF.jpg"""
import sys, cv2, numpy as np, subprocess
ref = int(sys.argv[1]); frames = [int(x) for x in sys.argv[2].split(',')]
gamma = sys.argv[3] if len(sys.argv) > 3 else '1.5'
subprocess.run(['/tmp/tools/venv/bin/python', '/tmp/work/bin/grid.py', str(ref), '/tmp/work/sheets/_g.jpg', '--gamma=' + gamma], check=True, stdout=subprocess.DEVNULL)
g = cv2.imread('/tmp/work/sheets/_g.jpg')
tw = 1280 // len(frames); th = tw * 9 // 16
tiles = []
for n in frames:
    im = cv2.resize(cv2.imread('/tmp/work/frames/f_%04d.jpg' % n), (tw, th), interpolation=cv2.INTER_AREA)
    cv2.putText(im, 'f%d' % n, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 0), 1, cv2.LINE_AA)
    tiles.append(im)
strip = np.hstack(tiles)
if strip.shape[1] < 1280: strip = np.hstack([strip, np.zeros((th, 1280 - strip.shape[1], 3), np.uint8)])
out = '/tmp/work/sheets/study_%d.jpg' % ref
cv2.imwrite(out, np.vstack([g, strip]), [cv2.IMWRITE_JPEG_QUALITY, 84]); print(out)
