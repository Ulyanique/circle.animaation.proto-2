"""rsheet.py DIR F1,F2,... [cols] [tileW] OUT.jpg -> contact sheet of render sequence frames only"""
import cv2, numpy as np, sys
d = sys.argv[1]; fs = [float(x) for x in sys.argv[2].split(',')]; cols = int(sys.argv[3]); tw = int(sys.argv[4]); out = sys.argv[5]
th = tw * 9 // 16; tiles = []
for f in fs:
    im = cv2.resize(cv2.imread('%s/r_%06d.jpg' % (d, round(f * 100))), (tw, th), interpolation=cv2.INTER_AREA)
    cv2.putText(im, 'f%g' % f, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1, cv2.LINE_AA); tiles.append(im)
while len(tiles) % cols: tiles.append(np.zeros_like(tiles[0]))
cv2.imwrite(out, np.vstack([np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)]), [cv2.IMWRITE_JPEG_QUALITY, 86]); print(out)
