# faceplot.py T.npy OUT.jpg F1,F2,... — s13/s14: shard outlines, the face circle and the light's tail, per frame
import sys, numpy as np
from PIL import Image, ImageDraw
npy, out, frames = sys.argv[1], sys.argv[2], [int(x) for x in sys.argv[3].split(',')]
import os
sys.argv = sys.argv[:1] + ['--dry']
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import heropath as H, facecheck as FC
w = FC.w; T = np.load(npy)
tw, th = 320, 180; k = tw / 1280.0; cols = 4
rows = (len(frames) + cols - 1) // cols
img = Image.new('RGB', (cols * tw, rows * th), (16, 16, 16))
for i, f in enumerate(frames):
    tile = Image.new('RGB', (tw, th), (16, 16, 16)); d = ImageDraw.Draw(tile)
    s = w.shot_at(f)
    for pl in sorted(w.polys(s, f), key=lambda q: -q[5]):
        P2 = [(float(x) * k, float(y) * k) for x, y in pl[1]]
        d.polygon(P2, outline=(170, 140, 70), fill=(70, 56, 28) if pl[0] == 0 else (44, 38, 22))
    if s['id'] == 's13':
        c, r = FC.face(f)
        d.ellipse([(c[0] - r) * k, (c[1] - r) * k, (c[0] + r) * k, (c[1] + r) * k], outline=(255, 90, 90))
    P = T[f - H.F0]
    n = len(P)
    for j in range(n - 1):
        a = 1.0 - 0.8 * j / float(n)
        col = (int(255 * a), int(240 * a), int(160 * a)) if P[j, 3] == 0 else (int(90 * a), int(160 * a), int(255 * a))
        d.line([P[j, 0] * k, P[j, 1] * k, P[j + 1, 0] * k, P[j + 1, 1] * k], fill=col, width=2)
    d.ellipse([P[0, 0] * k - 3, P[0, 1] * k - 3, P[0, 0] * k + 3, P[0, 1] * k + 3], fill=(255, 255, 255))
    d.rectangle([0, 0, tw - 1, th - 1], outline=(70, 70, 70))
    d.text((4, 3), 'f%d' % f, fill=(0, 255, 0))
    img.paste(tile, ((i % cols) * tw, (i // cols) * th))
img.save(out, quality=90); print(out, T.shape)
