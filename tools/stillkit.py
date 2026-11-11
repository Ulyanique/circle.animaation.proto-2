"""stillkit.py — helpers for rebuilding a footage still from ONE base frame plus repairs (see still_*.py recipes).

The stills made by bake.py / restitch.py are medians over many frames warped with the tracked camera. Where the
picture slides or scales inside its shard, or the old light trail never leaves a region, that gives smears and
blurred bands. The recipes instead take one sharp frame as the picture and repair only what the trail covers:
  * static content — from a clean plate: a low percentile over all frames registered BY CONTENT (stillstack.py);
  * content that moves (people) — a fill that continues what is above and below the band along a given direction."""
import cv2, numpy as np

def poly_mask(pts, shape):
    m = np.zeros(shape[:2], np.uint8); cv2.fillPoly(m, [np.array(pts, np.float32).reshape(-1, 2).astype(np.int32)], 255); return m > 0

def feather(mask, sigma):
    """soft version of a mask: 1 well inside, 0 outside, never above the hard mask"""
    m = mask.astype(np.float32)
    inner = cv2.erode(m, np.ones((3, 3), np.uint8), iterations=max(1, int(round(sigma))))
    return np.clip(cv2.GaussianBlur(inner, (0, 0), sigma) * 1.0, 0, 1)

def colour_match(views, masks, base, ref):
    """per-channel gain that brings every view to the base over the region `ref` (clean in all of them)"""
    out = views.astype(np.float32).copy(); gains = []
    for i in range(len(out)):
        ok = ref & masks[i]
        g = (np.median(base[ok], axis=0) + 2) / (np.median(out[i][ok], axis=0) + 2) if ok.sum() > 2000 else np.ones(3)
        out[i] = np.clip(out[i] * g, 0, 255); gains.append(float(np.mean(g)))
    return out, gains

def low_percentile(views, masks, pct, tol=4.0, lo=None):
    """Clean plate. Additive light (trails, flares) drops out of a texel wherever it is absent for part of the time:
    per texel, the mean of the views whose brightness is within `tol` of the pct-th percentile — or, with `lo`, of
    all views between the lo-th and the pct-th percentile (skips the darkest ones: codec ringing next to a bright
    line undershoots, and a plain low percentile collects exactly those dots)."""
    lum = views.mean(axis=3); lum[~masks] = np.nan
    with np.errstate(all='ignore'):
        hi_t = np.nanpercentile(lum, pct, axis=0)
        lo_t = np.nanpercentile(lum, lo, axis=0) if lo is not None else None
    l = np.nan_to_num(lum, nan=1e9)
    w = ((np.abs(l - hi_t[None]) < tol) if lo is None else ((l >= lo_t[None] - 0.5) & (l <= hi_t[None] + 0.5))).astype(np.float32)
    n = w.sum(0)
    return (views * w[..., None]).sum(0) / np.maximum(n, 1)[..., None], n > 0

def directional_fill(img, region, slope, y_top, y_bot, grain=0.0, seed=1):
    """Fills `region` (bool mask, between the rows y_top(x) and y_bot(x), each a function or a number) by continuing
    the rows just above and just below it along the direction dx/dy = slope, cross-faded — edges that run along that
    direction (a sleeve, a pole) pass through the band unbroken."""
    H, W = img.shape[:2]; out = img.astype(np.float32).copy()
    yt = np.vectorize(y_top)(np.arange(W)) if callable(y_top) else np.full(W, y_top, float)
    yb = np.vectorize(y_bot)(np.arange(W)) if callable(y_bot) else np.full(W, y_bot, float)
    ys, xs = np.nonzero(region)
    # source rows are a few px outside the band, averaged over 3 rows to tame noise streaks
    src = img.astype(np.float32)
    def sample(y, x):           # bilinear lookup of scattered points (cv2.remap wants maps narrower than 32768)
        n = len(x); pad = (-n) % 1024
        mx = np.pad(x.astype(np.float32), (0, pad)).reshape(-1, 1024); my = np.pad(y.astype(np.float32), (0, pad)).reshape(-1, 1024)
        return cv2.remap(src, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE).reshape(-1, 3)[:n]
    # the band's borders are looked up where the line through the texel (along the direction) meets them
    top = np.zeros((len(ys), 3), np.float32); bot = np.zeros((len(ys), 3), np.float32)
    t = np.zeros(len(ys), np.float32)
    x_at_top = xs.astype(np.float32); x_at_bot = xs.astype(np.float32)
    for _ in range(3):          # fixed point: where the slanted line through (x, y) crosses the top / bottom curve
        yt_i = np.interp(x_at_top, np.arange(W), yt); x_at_top = xs + slope * (yt_i - ys)
        yb_i = np.interp(x_at_bot, np.arange(W), yb); x_at_bot = xs + slope * (yb_i - ys)
    for k in (2.0, 3.5, 5.0):
        top += sample(yt_i - k, x_at_top - slope * k) / 3; bot += sample(yb_i + k, x_at_bot + slope * k) / 3
    t = np.clip((ys - yt_i) / np.maximum(yb_i - yt_i, 1), 0, 1)
    t = t * t * (3 - 2 * t)
    val = top * (1 - t[:, None]) + bot * t[:, None]
    if grain > 0: val += np.random.default_rng(seed).normal(0, grain, (len(ys), 1)).astype(np.float32)
    out[ys, xs] = val
    return out

def band_fill(img, centre, above, below, along=(1.0, -1.0), margin=4.0, smooth=10.0):
    """Repairs a band of ANY orientation (a trail lying across the picture). `centre` is a polyline along the band's
    axis, the band reaches `above` px to one side of it and `below` px to the other (the side the normal — `along`
    turned by +90°, i.e. to the right when looking along it — points to). Every texel inside becomes a cross-fade of
    the picture just outside the two edges, taken straight across the band and averaged a little along it.
    Returns (filled image, weight of the band: 1 inside, feathered over the outer 12 px)."""
    H, W = img.shape[:2]; src = img.astype(np.float32)
    a = np.array(along, np.float32); a /= np.linalg.norm(a); n = np.array([-a[1], a[0]], np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    q = xx * a[0] + yy * a[1]; pp = xx * n[0] + yy * n[1]
    c = np.array(centre, np.float32); cq = c @ a; cp = c @ n; o = np.argsort(cq)
    pc = np.interp(q, cq[o], cp[o]).astype(np.float32)
    d = pp - pc                                                    # signed distance across the band
    def sample(dd, dq):
        P = pc + dd; Q = q + dq
        return cv2.remap(src, (Q * a[0] + P * n[0]).astype(np.float32), (Q * a[1] + P * n[1]).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    top = np.zeros_like(src); bot = np.zeros_like(src); k = 0
    for dq in (-smooth, -smooth / 2, 0.0, smooth / 2, smooth):
        for m in (margin, margin + 3, margin + 6):
            top += sample(-above - m, dq); bot += sample(below + m, dq); k += 1
    top /= k; bot /= k
    t = np.clip((d + above) / (above + below), 0, 1); t = (t * t * (3 - 2 * t))[..., None]
    w = np.clip(np.minimum(d + above, below - d) / 12.0, 0, 1); w = (w * w * (3 - 2 * w))[..., None]
    return top * (1 - t) + bot * t, w

def vmedian_lines(img, region, size=21, thr=6.0, both=False):
    """Removes thin HORIZONTAL lines (what is left of a trail) inside `region`: a texel that is brighter (with `both`:
    brighter or darker) than the vertical median around it by more than `thr` takes that median. Vertical structure
    survives."""
    f = img.astype(np.float32); k = size // 2
    pad = np.pad(f, ((k, k), (0, 0), (0, 0)), mode='reflect')
    med = np.median(np.stack([pad[i:i + f.shape[0]] for i in range(0, size, 2)]), axis=0)
    d = f.mean(-1) - med.mean(-1)
    odd = (np.abs(d) > thr) if both else (d > thr)
    m = np.clip(cv2.GaussianBlur((odd & region).astype(np.float32), (0, 0), 1.2)[..., None] * 1.6, 0, 1)
    return f * (1 - m) + med * m

def fill_outside(img, known, radius=6):
    """extends the picture into texels nobody has seen (they lie outside the window, but the bevel samples near them)"""
    return cv2.inpaint(np.clip(img, 0, 255).astype(np.uint8), (~known).astype(np.uint8) * 255, radius, cv2.INPAINT_TELEA)

def grid(img, step=100):
    im = np.clip(img, 0, 255).astype(np.uint8).copy()
    for x in range(step, im.shape[1], step):
        cv2.line(im, (x, 0), (x, im.shape[0]), (0, 255, 0), 1); cv2.putText(im, str(x), (x + 2, 11), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 255, 0), 1, cv2.LINE_AA)
    for y in range(step, im.shape[0], step):
        cv2.line(im, (0, y), (im.shape[1], y), (0, 255, 0), 1); cv2.putText(im, str(y), (2, y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 255, 0), 1, cv2.LINE_AA)
    return im
