# shots 14+15: f739-901. The camera orbits a tall gold shard wrapped by the streak (f739-816), then the wind-turbine
# footage appears on it (f817-901). ref f870. The footage moves inside the shard, so the shard is keyed by hand.
import math
REFQ = [(400, 0), (1210, 20), (1020, 720), (270, 720)]
CX0 = 725.0
def anchor(f, cx, s=1.0, yaw=0.0):
    F, D = 869.0, 9.0
    co, si = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    Xc = (CX0 - 640) * D / F
    out = []
    for x, y in REFQ:
        X = (x - 640) * D / F; Y = (y - 360) * D / F
        X2 = Xc + (X - Xc) * co; Z2 = D / s + (X - Xc) * si
        out.append((x, y, 640 + F * X2 / Z2 + (cx - (640 + F * Xc * s / D)), 360 + F * Y / Z2))
    return (f, out)
SHOT = dict(
    id='s14', range=(739, 901), ref=870, fov=45, toneFrame=870,
    screens=[dict(name='turbines', rect=(-260, -450, 1520, 1190), depth=9, texW=1500, texFrames=[870, 852, 888, 836, 901, 844, 861, 879, 895], align='track', window=True, headR=150)],
    planes=dict(G=dict(d=8.6, yaw=-20, at=(1040, 600))),
    polys=[
        dict(id='scr', on='turbines', pts=[(526, -700), (1405, -700), (836, 1400), (147, 1400)], thick=0.5, tone=(140, 116, 68)),   # tall enough for the pull-back at f806
        dict(id='gF', on='G', pts=[(790, 790), (1100, 280), (1065, 790)], thick=0.3, glow=0.25, tone=(150, 125, 75)),
    ],
    cam=dict(mode='screen', chain='sift', frames=(869, 871), region=[(420, 20), (1190, 30), (1010, 700), (290, 700)],
             # f739-826: one continuous move - the camera swings round the shard from its left side to the front (yaw falls
             # steadily), skims past it (s peaks at f782), pulls far back (s lowest at f806) and pushes in again.
             # cx, s and yaw never reverse at the same time, so the flight never comes to rest.
             anchors=[anchor(739, 520, 0.50, 80), anchor(742, 505, 0.55, 78), anchor(750, 480, 0.68, 71), anchor(756, 455, 0.82, 66),
                      anchor(762, 425, 1.05, 60), anchor(770, 385, 1.45, 52), anchor(776, 372, 1.70, 46), anchor(782, 390, 1.85, 40),
                      anchor(788, 440, 1.50, 34), anchor(794, 500, 0.95, 28), anchor(800, 560, 0.66, 23), anchor(806, 610, 0.56, 18),
                      anchor(812, 650, 0.58, 13), anchor(818, 677, 0.66, 7), anchor(822, 688, 0.71, 3),
                      # f836-901: the shard keeps creeping right and towards the camera (never a dead stop, no reversal at the ref frame);
                      # the footage slides inside it (uv track)
                      anchor(826, 695, 0.756), anchor(836, 710, 0.9), anchor(846, 716, 0.965), anchor(888, 731, 1.027), anchor(901, 735, 1.048)]),
    trails=[dict(name='A', frames=(744, 770), initFrame=756, search=50, fade=(764, 770), head=dict(keys=[[744, 700, 430, 255], [770, 700, 430, 255]]),
                 init=[(215, 700), (240, 580), (300, 480), (400, 420), (520, 400), (620, 410)]),
            dict(name='B', frames=(772, 800), initFrame=784, search=50, fade=(794, 800), head=dict(keys=[[772, 800, 290, 255], [800, 800, 290, 255]]),
                 init=[(-60, 500), (0, 480), (240, 400), (480, 340), (720, 300)]),
            dict(name='C', frames=(806, 846), initFrame=826, search=45, fade=(838, 846), head=dict(keys=[[806, 1040, 400, 255], [846, 1040, 400, 255]]),
                 init=[(400, 350), (600, 335), (800, 345), (960, 375)]),
            dict(name='D', frames=(848, 901), initFrame=870, search=45, head=dict(keys=[[848, 1150, 580, 255], [901, 1150, 580, 255]]),
                 init=[(280, 470), (500, 480), (700, 490), (900, 510), (1080, 550)])],
)
