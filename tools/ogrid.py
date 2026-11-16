"""ogrid.py FRAME OUT.jpg [x0,y0,x1,y1] [scale] — an ORIGINAL video frame (or a crop of it) with a pixel grid, for
reading coordinates off it. Grid every 50 px (labels every 100)."""
import sys, cv2
f = int(sys.argv[1]); out = sys.argv[2]
im = cv2.imread('/tmp/work/frames/f_%04d.jpg' % f)
box = [int(x) for x in sys.argv[3].split(',')] if len(sys.argv) > 3 and sys.argv[3] != '-' else [0, 0, 1280, 720]
sc = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
x0, y0, x1, y1 = box
crop = cv2.resize(im[y0:y1, x0:x1], None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC if sc > 1 else cv2.INTER_AREA)
for x in range((x0 // 50 + 1) * 50, x1, 50):
    X = round((x - x0) * sc); cv2.line(crop, (X, 0), (X, crop.shape[0]), (0, 255, 0) if x % 100 == 0 else (0, 120, 0), 1)
    if x % 100 == 0: cv2.putText(crop, str(x), (X + 2, 11), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 255, 0), 1, cv2.LINE_AA)
for y in range((y0 // 50 + 1) * 50, y1, 50):
    Y = round((y - y0) * sc); cv2.line(crop, (0, Y), (crop.shape[1], Y), (0, 255, 0) if y % 100 == 0 else (0, 120, 0), 1)
    if y % 100 == 0: cv2.putText(crop, str(y), (2, Y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 255, 0), 1, cv2.LINE_AA)
cv2.imwrite(out, crop, [cv2.IMWRITE_JPEG_QUALITY, 90]); print(out, crop.shape)
