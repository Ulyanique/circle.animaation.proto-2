# shot 13: f656-738, dark start with a flare flash, young man in uniform on a tall shard that finally turns away (ref f700)
import math
REFQ = [(190, 10), (810, 0), (740, 720), (80, 720)]           # visible quad of the shard at ref
def anchor(f, cx, yaw=0.0, s=1.0, dy=0.0):
    # the shard slides in from the left and finally turns edge-on (yaw about its vertical axis); exact pinhole projection.
    # dy = vertical drift in px: the camera cranes all through the shot, so the tall shard keeps sliding down the frame.
    F, D = 869.0, 9.0
    co, si = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    Xc = (455 - 640) * D / F
    out = []
    for x, y in REFQ:
        X = (x - 640) * D / F; Y = (y - 360) * D / F
        X2 = Xc + (X - Xc) * co; Z2 = D / s + (X - Xc) * si
        out.append((x, y, 640 + F * X2 / Z2 + (cx - 455), 360 + F * Y / Z2 + dy))
    return (f, out)
# f684-708: the footage content itself was tracked against the video (bin/uvtrack.py, dense flow) — the shard carries it rigidly
import json, os
_TR = {}
if os.path.exists('/home/user/work/tracks/s13_youngman.json'):
    _TR = {int(k): v for k, v in json.load(open('/home/user/work/tracks/s13_youngman.json')).items()}
def tracked(f):
    M = _TR[f]
    return (f, [(x, y, M[0][0] * x + M[0][1] * y + M[0][2], M[1][0] * x + M[1][1] * y + M[1][2]) for x, y in REFQ])
SHOT = dict(
    id='s13', range=(656, 738), ref=700, fov=45, toneFrame=700,
    screens=[dict(name='youngman', rect=(40, -60, 860, 1140), depth=9, texW=960, texFrames=[700, 692, 686, 706, 684], align='track', window=True, headR=150)],
    planes=dict(P=dict(d=9.0)),
    polys=[
        dict(id='scr', on='youngman', pts=[(190, 10), (255, -30), (815, -30), (780, 220), (707, 1140), (16, 1140)], thick=0.5, tone=(128, 106, 62)),
        # gold cap above the window: comes into view when the shard has slid down (f704+)
        dict(id='cap', on='P', pts=[(190, 10), (255, -30), (815, -30), (850, -330), (790, -760), (300, -760), (240, -330)], thick=0.5, tone=(176, 142, 84)),
    ],
    cam=dict(mode='screen', chain='sift', frames=(699, 701), region=[(200, 20), (800, 10), (770, 220), (730, 710), (90, 710)],
             anchors=[anchor(656, -460, 0, 0.8, -170), anchor(660, -330, 0, 0.8, -170), anchor(664, -20, 0, 0.8, -170), anchor(670, 200, 0, 0.8, -168),
                      *[tracked(f) for f in range(684, 709, 2) if f not in (700,)],
                      anchor(716, 500, 39, 0.89, 175), anchor(724, 520, 54, 0.82, 255), anchor(730, 512, 69, 0.77, 310),
                      anchor(736, 500, 79, 0.72, 365), anchor(738, 495, 83, 0.70, 380)]),
    flare=dict(frames=(693, 712), start=(752, 222), maxjump=120, min=200),
    trails=[dict(name='a', frames=(656, 682), search=40, fade=(674, 682), dir=(0.94, 0.33),     # it trails back to the streak coil on the window of shot 12
                 head=dict(keys=[[656, 998, 457, 255], [657, 1013, 442, 255], [658, 1025, 429, 255], [659, 1030, 416, 255], [660, 1025, 405, 255], [661, 1002, 398, 255],
                                 [662, 946, 395, 255], [663, 837, 400, 255], [664, 650, 436, 255], [665, 410, 468, 255], [666, 165, 468, 255], [667, -20, 456, 255],
                                 [668, -230, 452, 255], [669, -450, 452, 255], [671, -900, 460, 255], [682, -3000, 500, 255]])),      # measured: the flare hovers, then whips out to the left
            dict(name='b', frames=(693, 730), search=40),
            dict(name='c', frames=(732, 738), head=dict(frames=(732, 738), start=(120, 660), maxjump=120, min=180), search=40)],
)
