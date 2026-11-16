#!/usr/bin/env python
"""vs.py f1,f2,... [tileW] [cols] : plain video contact sheet -> /tmp/work/sheets/v_<f1>.jpg"""
import sys, cv2, numpy as np
frames=[int(x) for x in sys.argv[1].split(',')]
tw=int(sys.argv[2]) if len(sys.argv)>2 else 420
cols=int(sys.argv[3]) if len(sys.argv)>3 else 3
th=tw*9//16
tiles=[]
for n in frames:
    im=cv2.imread('/tmp/work/frames/f_%04d.jpg'%n)
    im=cv2.resize(im,(tw,th),interpolation=cv2.INTER_AREA)
    cv2.putText(im,'f%d'%n,(6,16),cv2.FONT_HERSHEY_SIMPLEX,0.45,(0,255,0),1,cv2.LINE_AA)
    tiles.append(im)
while len(tiles)%cols: tiles.append(np.zeros_like(tiles[0]))
rows=[np.hstack(tiles[i:i+cols]) for i in range(0,len(tiles),cols)]
out='/tmp/work/sheets/v_%d.jpg'%frames[0]
cv2.imwrite(out,np.vstack(rows),[cv2.IMWRITE_JPEG_QUALITY,82]); print(out)
