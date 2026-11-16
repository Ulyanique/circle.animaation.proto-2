"""texclean.py NAME "SHAPE;SHAPE;..." [--view] [--radius=R] [--blur=B]
Retouches a footage still: work/footage_orig/<NAME>.jpg -> repo public/footage/<NAME>.jpg (the original stays in
work/footage_orig, so the tool can be re-run with other shapes).

The stills come from the reference video, where the old light trail and its flares cross the footage. bake.py masked
them and filled the holes from other frames or with a blur, which left hard-edged patches and pieces of the old trail
(they read as a second tail now that the light flies elsewhere). The damaged places are marked by hand (shapes in
texture pixels) and re-filled from their surroundings (inpainting), with a feathered seam.

SHAPE:  x0,y0,x1,y1,...        polygon (>= 3 points)
        r:x0,y0,x1,y1          rectangle
        c:x,y,radius           disc
        l:T:x0,y0,x1,y1,...    polyline, T px thick
The marked shapes of every still are kept in work/bin/texclean_shapes.json (run without shapes to re-apply them)."""
import cv2, numpy as np, sys, os, json
name = sys.argv[1]
args = [a for a in sys.argv[2:] if not a.startswith('--')]
opt = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[2:] if a.startswith('--'))
STORE = '/home/user/work/bin/texclean_shapes.json'
store = json.load(open(STORE)) if os.path.exists(STORE) else {}
shapes = args[0] if args else store.get(name, {}).get('shapes', '')
for k in ('radius', 'blur'):
    if k not in opt and name in store and k in store[name]: opt[k] = store[name][k]
SRC = '/home/user/work/footage_orig/%s.jpg' % name
DST = '/home/user/circle.animaation.proto-2/public/footage/%s.jpg' % name
im = cv2.imread(SRC); h, w = im.shape[:2]
mask = np.zeros((h, w), np.uint8)
for sh in [s.strip() for s in shapes.split(';') if s.strip()]:
    if sh.startswith('r:'):
        v = [int(float(t)) for t in sh[2:].split(',')]; cv2.rectangle(mask, (v[0], v[1]), (v[2], v[3]), 255, -1)
    elif sh.startswith('c:'):
        v = [int(float(t)) for t in sh[2:].split(',')]; cv2.circle(mask, (v[0], v[1]), v[2], 255, -1)
    elif sh.startswith('l:'):
        t, rest = sh[2:].split(':', 1); v = np.array([float(x) for x in rest.split(',')]).reshape(-1, 2).astype(np.int32)
        cv2.polylines(mask, [v], False, 255, int(t), cv2.LINE_AA)
    else:
        v = np.array([float(x) for x in sh.split(',')]).reshape(-1, 2).astype(np.int32); cv2.fillPoly(mask, [v], 255)
mask = (mask > 127).astype(np.uint8) * 255
if 'view' in opt:
    v = im.copy(); c, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); cv2.drawContours(v, c, -1, (0, 255, 0), 2)
    out = '/tmp/work/tex/%s_marked.jpg' % name; sc = min(1.0, 1000.0 / w)
    cv2.imwrite(out, cv2.resize(v, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 85]); print(out); sys.exit()
res = im.copy()
if mask.any():
    sc = 0.5      # half resolution: wide holes need a wide reach, and only the low frequencies are trusted anyway
    ims = cv2.resize(im, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA); ms = cv2.resize(mask, (ims.shape[1], ims.shape[0]), interpolation=cv2.INTER_NEAREST)
    ip = cv2.inpaint(ims, ms, int(opt.get('radius', 9)), cv2.INPAINT_TELEA)
    ip = cv2.resize(ip, (w, h), interpolation=cv2.INTER_CUBIC)
    ip = cv2.GaussianBlur(ip, (0, 0), float(opt.get('blur', 2.5)))
    a = cv2.GaussianBlur(cv2.dilate(mask, np.ones((7, 7), np.uint8)).astype(np.float32) / 255, (0, 0), 3.5)
    a = np.clip(a * 1.5, 0, 1)[..., None]
    res = (res * (1 - a) + ip.astype(np.float32) * a).astype(np.uint8)
cv2.imwrite(DST, res, [cv2.IMWRITE_JPEG_QUALITY, 92])
store[name] = dict(shapes=shapes, **{k: opt[k] for k in ('radius', 'blur') if k in opt}); json.dump(store, open(STORE, 'w'), indent=1)
print('wrote', DST, 'retouched %.1f%% of the still' % ((mask > 0).mean() * 100))
