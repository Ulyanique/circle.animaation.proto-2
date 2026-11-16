"""stillstack.py NAME BASE F0 F1 [--step=1] [--poly=..] — registers the frames F0..F1 to the base frame by content
(SIFT inside the window, RANSAC homography) and warps them all into the still's texture space with the base frame's
homography (/tmp/work/st/NAME_fBASE.npy from regstill.py). Saves /tmp/work/st/NAME_stack.npz (frames, views, masks).
Unlike restitch.py it does not trust the tracked camera: the picture may slide or scale inside its shard."""
import cv2, numpy as np, sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
import regstill as R
name, base, F0, F1 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
opt = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[5:] if a.startswith('--'))
poly = [float(x) for x in opt['poly'].split(',')] if 'poly' in opt else None
still = R.load_still(name); Ht, Wt = still.shape[:2]
Hb = np.load('/tmp/work/st/%s_f%d.npy' % (name, base))
fb = R.load_frame(base); mb = R.poly_mask(poly)
sift = cv2.SIFT_create(nfeatures=8000, contrastThreshold=0.02)
kb, db = sift.detectAndCompute(cv2.cvtColor(fb, cv2.COLOR_BGR2GRAY), mb)
frames, views, masks, Hs = [], [], [], []
for f in range(F0, F1 + 1, int(opt.get('step', 1))):
    im = R.load_frame(f)
    if f == base: H = np.eye(3); n = -1
    else:
        ka, da = sift.detectAndCompute(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), None)
        m = cv2.BFMatcher().knnMatch(da, db, k=2)
        good = [a for a, b in m if a.distance < 0.75 * b.distance]
        if len(good) < 12: print('f%d: only %d matches — skipped' % (f, len(good))); continue
        src = np.float32([ka[g.queryIdx].pt for g in good]); dst = np.float32([kb[g.trainIdx].pt for g in good])
        H, inl = cv2.findHomography(src, dst, cv2.RANSAC, 2.5); n = int(inl.sum())
        if n < 25: print('f%d: only %d inliers — skipped' % (f, n)); continue
    T = Hb @ H
    views.append(R.warp(im, T, (Wt, Ht))); masks.append(R.warp(np.full((720, 1280), 255, np.uint8), T, (Wt, Ht), cv2.INTER_NEAREST) > 127)
    frames.append(f); Hs.append(T)
    print('f%d: inliers %d, covers %.0f%%' % (f, n, masks[-1].mean() * 100))
np.savez('/tmp/work/st/%s_stack.npz' % name, frames=np.array(frames), views=np.array(views), masks=np.array(masks), H=np.array(Hs))
print('saved', len(frames), 'views')
