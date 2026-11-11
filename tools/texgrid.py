"""texgrid.py NAME [x0,y0,x1,y1] [scale] -> /tmp/work/tex/<NAME>_grid.jpg : footage texture with a labelled 100-px grid (texture pixel coordinates)"""
import cv2, sys, numpy as np
name = sys.argv[1]
src = sys.argv[4] if len(sys.argv) > 4 else '/home/user/circle.animaation.proto-2/public/footage/%s.jpg' % name
im = cv2.imread(src); h, w = im.shape[:2]
x0, y0, x1, y1 = [int(v) for v in sys.argv[2].split(',')] if len(sys.argv) > 2 and sys.argv[2] != '-' else (0, 0, w, h)
sc = float(sys.argv[3]) if len(sys.argv) > 3 else min(1.0, 1000.0 / (x1 - x0))
c = cv2.resize(im[y0:y1, x0:x1], None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA if sc < 1 else cv2.INTER_CUBIC)
for x in range((x0 // 100 + 1) * 100, x1, 100):
    X = int((x - x0) * sc); cv2.line(c, (X, 0), (X, c.shape[0]), (0, 255, 0), 1); cv2.putText(c, str(x), (X + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1, cv2.LINE_AA)
for y in range((y0 // 100 + 1) * 100, y1, 100):
    Y = int((y - y0) * sc); cv2.line(c, (0, Y), (c.shape[1], Y), (0, 255, 0), 1); cv2.putText(c, str(y), (2, Y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1, cv2.LINE_AA)
out = '/tmp/work/tex/%s_grid.jpg' % name
cv2.imwrite(out, c, [cv2.IMWRITE_JPEG_QUALITY, 85]); print(out, w, h, c.shape)
