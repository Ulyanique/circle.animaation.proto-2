"""restitch.py SHOT SCREEN F0 F1 [--step=N] [--ref=A-B] [--out=PATH] [--excl="f0-f1:x0,y0,x1,y1,...;..."] [--pct=50]
Re-stitches a footage still from MANY video frames instead of the few picked by bake.py.

Every frame F0..F1 of the reference video is warped into the texture space of the screen with the tracked camera
(`camRaw` of src/shots/data/<SHOT>.json) and the screen's plane (`screens[].o/u/v`); the still is the per-pixel median
of all those views. Whatever crosses the footage only for a while — the old light trail, flares, shards sliding in
front — drops out, and the video's compression noise is averaged away. Frames are colour-matched to the frames given
by --ref (the reveal and the sepia grade change the tone at both ends of a shot). Where fewer than 3 frames see a
texel the existing still is kept.

--excl masks a polygon (video pixels) in the frames f0..f1, for things that stay too long for the median to vote out."""
import cv2, numpy as np, json, sys, os
shot, screen, F0, F1 = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
opt = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[5:] if a.startswith('--'))
REPO = '/home/user/circle.animaation.proto-2'
d = json.load(open('%s/src/shots/data/%s.json' % (REPO, shot)))
scr = [s for s in d['screens'] if s['name'] == screen][0]
tex_name = opt.get('tex', screen)
old = cv2.imread('/home/user/work/footage_orig/%s.jpg' % tex_name); Ht, Wt = old.shape[:2]
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
excl = []
for part in [x for x in opt.get('excl', '').split(';') if x.strip()]:
    rng, pts = part.split(':'); a, b = [int(t) for t in rng.split('-')]
    excl.append((a, b, np.array([float(t) for t in pts.split(',')]).reshape(-1, 2).astype(np.int32)))
frames = [f for f in range(F0, F1 + 1, int(opt.get('step', 1))) if f in cam]
views = []; masks = []
for f in frames:
    px, z = project(f, corners)
    if (z <= 0.05).any(): continue
    M = cv2.getPerspectiveTransform(px.astype(np.float32), np.array([[0, 0], [Wt, 0], [Wt, Ht], [0, Ht]], np.float32))
    im = cv2.imread('/tmp/work/frames/f_%04d.jpg' % f)
    valid = np.zeros((H, W), np.uint8); valid[8:H - 8, 8:W - 8] = 255
    for a, b, poly in excl:
        if a <= f <= b: cv2.fillPoly(valid, [poly], 0)
    wi = cv2.warpPerspective(im, M, (Wt, Ht), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
    wm = cv2.warpPerspective(valid, M, (Wt, Ht), flags=cv2.INTER_NEAREST, borderValue=0)
    views.append(wi); masks.append(wm > 127)
    print('f%d: covers %.1f%% of the still' % (f, masks[-1].mean() * 100))
n = len(views)
# Colour: the tone drifts along a shot (reveal, sepia grade, the fade at its end). Every frame is matched to its
# neighbour over what both see, chained outwards from the reference frames, which keep their own tone.
ra, rb = [int(t) for t in opt.get('ref', '%d-%d' % (F0, F1)).split('-')]
fr = frames[:n]
ref_idx = [i for i, f in enumerate(fr) if ra <= f <= rb]
gain = {i: np.ones(3) for i in ref_idx}
def match(i, j):      # gain that brings frame i to the (already matched) frame j
    ov = masks[i] & masks[j]
    if ov.sum() < 5000: return gain[j]
    a = views[i][ov].astype(np.float32); b = views[j][ov].astype(np.float32) * gain[j]
    return np.clip((np.median(b, axis=0) + 2.0) / (np.median(a, axis=0) + 2.0), 0.6, float(opt.get('maxgain', 1.5)))
for i in range(ref_idx[-1] + 1, n): gain[i] = match(i, i - 1)
for i in range(ref_idx[0] - 1, -1, -1): gain[i] = match(i, i + 1)
for i in range(n):
    if i in ref_idx: continue
    views[i] = np.clip(views[i].astype(np.float32) * gain[i], 0, 255).astype(np.uint8)
print('gains:', ' '.join('f%d:%.2f' % (fr[i], gain[i].mean()) for i in range(n) if i not in ref_idx))

# The still: per texel, the views near the MIDDLE of the time it is in sight (so neighbouring texels come from the
# same few frames and the picture stays sharp even where the footage has parallax), minus the views that disagree
# with the median of all (the old trail, flares, things sliding in front).
tol = float(opt.get('tol', 26)); sig = float(opt.get('sigma', 1.5))
fnum = np.array(fr, np.float32)[:, None, None]
out = np.zeros((Ht, Wt, 3), np.float32); cnt = np.zeros((Ht, Wt), np.int32)
wide = np.zeros((Ht, Wt, 3), np.float32); sigw = float(opt.get('wide', 6.0))
for lo in range(0, Ht, 96):
    hi = min(Ht, lo + 96)
    st = np.stack([views[i][lo:hi].astype(np.float32) for i in range(n)]); mk = np.stack([masks[i][lo:hi] for i in range(n)])
    st[~mk] = np.nan
    c = mk.sum(0); cnt[lo:hi] = c
    with np.errstate(all='ignore'):
        med = np.nanmedian(st, axis=0)
        mid = (mk * fnum).sum(0) / np.maximum(c, 1)
        dev = np.nanmax(np.abs(st - med[None]), axis=3)
    clean = mk & (np.nan_to_num(dev, nan=1e9) < tol)
    wgt = np.exp(-(fnum - mid[None]) ** 2 / (2 * sig * sig)) * clean
    # if the views around the middle were all thrown out, the nearest clean ones take over
    far = np.exp(-(fnum - mid[None]) ** 2 / (2 * 36.0)) * clean * 1e-4
    wgt = wgt + far
    ws = wgt.sum(0)
    acc = (np.nan_to_num(st) * wgt[..., None]).sum(0) / np.maximum(ws, 1e-9)[..., None]
    out[lo:hi] = np.where((ws > 1e-9)[..., None], acc, np.nan_to_num(med))
    wg2 = np.exp(-(fnum - mid[None]) ** 2 / (2 * sigw * sigw)) * clean + far
    w2 = wg2.sum(0)
    acc2 = (np.nan_to_num(st) * wg2[..., None]).sum(0) / np.maximum(w2, 1e-9)[..., None]
    wide[lo:hi] = np.where((w2 > 1e-9)[..., None], acc2, np.nan_to_num(med))
# Two bands: the fine detail comes from the few frames around the middle (sharp), the tone from a wide span of frames
# (smooth) — otherwise every change of exposure between two frames would show as a seam in skies and haze.
m = (cnt >= 1).astype(np.float32)
def lowpass(img, sg):
    return cv2.GaussianBlur(img * m[..., None], (0, 0), sg) / np.maximum(cv2.GaussianBlur(m, (0, 0), sg), 1e-4)[..., None]
sg = float(opt.get('band', 10.0))
out = lowpass(wide, sg) + (out - lowpass(out, sg))
# keep the existing still where too few frames see the texel (feathered)
have = (cnt >= int(opt.get('min', 3))).astype(np.uint8)
have = cv2.erode(have, np.ones((9, 9), np.uint8))
a = cv2.GaussianBlur(have.astype(np.float32), (0, 0), float(opt.get('feather', 14)))
a = np.clip((a - 0.5) * 2.0, 0, 1)[..., None]
if 'match' in opt:      # bring the old still's tone to the new one where they meet
    ov = have > 0
    g = (np.median(out[ov], axis=0) + 2.0) / (np.median(old[ov].astype(np.float32), axis=0) + 2.0); old = np.clip(old * g, 0, 255)
res = np.clip(out * a + old.astype(np.float32) * (1 - a), 0, 255).astype(np.uint8)
dst = opt.get('out', '%s/public/footage/%s.jpg' % (REPO, tex_name))
cv2.imwrite(dst, res, [cv2.IMWRITE_JPEG_QUALITY, 92]); print('wrote', dst, 'new content on %.1f%% of the still, from %d frames' % (a.mean() * 100, n))
