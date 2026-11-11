"""jsheet.py DIR F1,F2,... [tileW] -> sheets/js_<F1>_<DIRNAME>.jpg : video (top) vs render sequence frames (bottom)"""
import cv2, numpy as np, sys
d = sys.argv[1]; fs = [int(x) for x in sys.argv[2].split(',')]; tw = int(sys.argv[3]) if len(sys.argv) > 3 else 288
th = tw * 9 // 16
top = [cv2.resize(cv2.imread('/tmp/work/frames/f_%04d.jpg' % f), (tw, th), interpolation=cv2.INTER_AREA) for f in fs]
bot = [cv2.resize(cv2.imread('%s/r_%06d.jpg' % (d, f * 100)), (tw, th), interpolation=cv2.INTER_AREA) for f in fs]
for i, f in enumerate(fs):
    cv2.putText(top[i], 'f%d video' % f, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 0), 1, cv2.LINE_AA)
    cv2.putText(bot[i], 'f%d ours' % f, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1, cv2.LINE_AA)
out = '/tmp/work/sheets/js_%d_%s.jpg' % (fs[0], d.rstrip('/').split('/')[-1])
cv2.imwrite(out, np.vstack([np.hstack(top), np.hstack(bot)]), [cv2.IMWRITE_JPEG_QUALITY, 85]); print(out)
