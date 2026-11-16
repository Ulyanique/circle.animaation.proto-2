# shot 4: f142-187, screen shard with two workers (ref f175)
SCREEN = [(415, 0), (770, 0), (862, 345), (1000, 720), (380, 720), (383, 235)]
SHOT = dict(
    id='s04', range=(142, 187), ref=175, fov=45, toneFrame=187,
    screens=[dict(name='workers', rect=(330, -40, 1050, 760), depth=9, texW=1024, texFrames=[186, 170], window=True, inpaint=215,
                  inpaintRoi=[(380, 380), (1000, 560), (1000, 720), (380, 720)])],
    planes=dict(L=dict(d=8.6, yaw=-25), R=dict(d=9.6, yaw=40, at=(930, 360)), BG=dict(d=24), BG2=dict(d=17)),
    polys=[
        dict(id='scrA', on='workers', pts=[(415, 0), (770, 0), (862, 345), (383, 232)], glow=[0, 0.5, 0, 0], thick=0.5, toneFrame=144),
        dict(id='scrB', on='workers', pts=[(383, 246), (866, 360), (1000, 720), (850, 720), (380, 548)], glow=[0, 0.6, 0, 0, 0], thick=0.5, tone=(150, 118, 62)),
        dict(id='scrC', on='workers', pts=[(380, 562), (825, 720), (380, 720)], thick=0.5, tone=(120, 95, 50)),
        dict(id='side', on='R', pts=[(778, 0), (835, 0), (892, 235), (962, 330), (1018, 720), (1004, 720), (866, 345)], glow=0.25, thick=0.3),
        dict(id='lcol', on='L', pts=[(345, 140), (410, 0), (384, 235), (379, 720), (318, 720)], thick=0.6, toneFrame=187),
        dict(id='bg1', on='BG', pts=[(890, 250), (948, 0), (978, 0), (962, 330)], thick=1.5),
        dict(id='bg2', on='BG', pts=[(1040, 520), (1060, 210), (1100, 400), (1105, 520), (1060, 460)], thick=1.5),
        dict(id='bg3', on='BG2', pts=[(1130, 520), (1245, 160), (1280, 160), (1380, 720), (1125, 720)], thick=1.5),
        dict(id='bg4', on='BG2', pts=[(-60, 140), (0, 140), (40, 300), (110, 720), (-60, 720)], thick=1.5, tone=(34, 28, 16)),
        dict(id='bg5', on='BG', pts=[(1010, 500), (1060, 460), (1105, 520), (1130, 720), (1020, 720)], thick=1.5),
    ],
    cam=dict(mode='screen', frames=(150, 187), region=[(420, 10), (765, 10), (860, 345), (960, 640), (400, 500), (390, 240)]),
    flare=dict(frames=(142, 187), start=(735, 545), maxjump=70, min=150),
    trails=[dict(name='main', frames=(142, 187))],
)
