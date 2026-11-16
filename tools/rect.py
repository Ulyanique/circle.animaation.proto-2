"""rect.py SHOT SCREEN F1,F2,.. OUT.jpg [--tex=NAME] [--scale=0.4] [--cols=5] [--grid]
Contact sheet of video frames warped into the texture space of a footage window (tracked camera `camRaw` + the screen's
plane), next to the current still (first tile). Shows which frame sees which part of the picture cleanly."""
import cv2, numpy as np, json, sys
shot, screen = sys.argv[1], sys.argv[2]; frames = [int(x) for x in sys.argv[3].split(',')]; out = sys.argv[4]
opt = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[5:] if a.startswith('--'))
REPO = '/home/user/circle.animaation.proto-2'
d = json.load(open('%s/src/shots/data/%s.json' % (REPO, shot)))
scr = [s for s in d['screens'] if s['name'] == screen][0]
tex = opt.get('tex', screen)
old = cv2.imread('%s/public/footage/%s.jpg' % (REPO, tex)); Ht, Wt = old.shape[:2]
W, H = 1280, 720; k = (H / 2) / np.tan(np.radians(d['fov']) / 2)
cam = {int(r[0]): r[1:] for r in d.get('camRaw', d['cam'])}
def qrot(q, v):
    u = np.array(q[:3]); w = q[3]
    return v + 2 * np.cross(u, np.cross(u, v) + w * v)
def project(f, P):
    c = cam[f]; qi = [-c[3], -c[4], -c[5], c[6]]
    p = np.array([qrot(qi, np.array(x) - np.array(c[:3])) for x in P])
    return np.stack([W / 2 + k * p[:, 0] / -p[:, 2], H / 2 - k * p[:, 1] / -p[:, 2]], 1), -p[:, 2]
o, u, v = [np.array(scr[x], float) for x in 'ouv']
corners = [o, o + u, o + u + v, o + v]
def view(f):
    """the frame in texture space + the mask of texels that are inside the frame"""
    px, z = project(f, corners)
    M = cv2.getPerspectiveTransform(px.astype(np.float32), np.array([[0, 0], [Wt, 0], [Wt, Ht], [0, Ht]], np.float32))
    im = cv2.imread('/tmp/work/frames/f_%04d.jpg' % f)
    valid = np.full((H, W), 255, np.uint8)
    wi = cv2.warpPerspective(im, M, (Wt, Ht), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT)
    wm = cv2.warpPerspective(valid, M, (Wt, Ht), flags=cv2.INTER_NEAREST, borderValue=0)
    return wi, wm > 127, M
if __name__ == '__main__':
    sc = float(opt.get('scale', 0.4)); cols = int(opt.get('cols', 5))
    tw, th = round(Wt * sc), round(Ht * sc)
    tiles = []
    def lab(im, t):
        im = cv2.resize(im, (tw, th), interpolation=cv2.INTER_AREA)
        if 'grid' in opt:
            for x in range(100, Wt, 100): cv2.line(im, (round(x * sc), 0), (round(x * sc), th), (0, 255, 0) if x % 500 else (0, 255, 255), 1)
            for y in range(100, Ht, 100): cv2.line(im, (0, round(y * sc)), (tw, round(y * sc)), (0, 255, 0) if y % 500 else (0, 255, 255), 1)
        cv2.putText(im, t, (5, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 0), 1, cv2.LINE_AA); return im
    tiles.append(lab(old, 'still ' + tex))
    for f in frames:
        if f not in cam: continue
        wi, wm, M = view(f); wi[~wm] = (40, 0, 40)
        tiles.append(lab(wi, 'f%d' % f))
    rows = (len(tiles) + cols - 1) // cols
    sheet = np.zeros((rows * th, cols * tw, 3), np.uint8)
    for i, t in enumerate(tiles): sheet[(i // cols) * th:(i // cols) * th + th, (i % cols) * tw:(i % cols) * tw + tw] = t
    cv2.imwrite(out, sheet, [cv2.IMWRITE_JPEG_QUALITY, 88]); print(out, sheet.shape, 'still', Wt, Ht)
