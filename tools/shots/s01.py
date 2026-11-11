# shot 1 (f1-47): close-up of long gold facets, bright bevel strip, light ramps up; flare top-right. ref f40.
SHOT = dict(
    id='s01', range=(1, 47), ref=40, fov=45, toneFrame=40, screens=[],
    planes=dict(BG=dict(d=11, at=(640, 360)), P1s=dict(d=7.4, yaw=22, at=(250, 360)), P2s=dict(d=5.4, yaw=-10, at=(600, 360)), P1=dict(d=7.5, yaw=22, at=(250, 360)), P2=dict(d=5.5, yaw=-10, at=(600, 360)), P3=dict(d=6.8, yaw=14, at=(760, 300)),
                P4=dict(d=8.5, yaw=-24, at=(1050, 250)), P5=dict(d=5.0, yaw=8, pitch=18, at=(950, 500)), P6=dict(d=6.0, yaw=-12, pitch=-20, at=(1000, 680))),
    polys=[
        dict(id='bg', on='BG', pts=[(-1500, -900), (2800, -900), (2800, 1700), (-1500, 1700)], thick=0.2, tone=(58, 48, 29), bevel=0),
        dict(id='a0', on='P1', pts=[(-400, -60), (60, -60), (320, 780), (-400, 780)], thick=0.3, bevel=0.035, edge=1.8),
        dict(id='a1', on='P1', pts=[(60, -60), (360, -60), (480, 780), (320, 780)], thick=0.3, bevel=0.03, edge=1.8),
        dict(id='b', on='P2', pts=[(360, -200), (540, -200), (780, 900), (480, 900)], thick=0.4, bevel=0.09, edge=3.2),
        dict(id='strip', on='P2s', pts=[(533, -200), (554, -200), (829, 900), (808, 900)], thick=0.05, glow=0.35, tone=(255, 246, 205), bevel=0),
        dict(id='t1', on='P1s', pts=[(-40, -200), (-30, -200), (370, 900), (360, 900)], thick=0.05, glow=0.1, tone=(170, 148, 100), bevel=0),
        dict(id='t2', on='P2s', pts=[(330, -200), (342, -200), (510, 900), (498, 900)], thick=0.05, glow=0.1, tone=(175, 152, 104), bevel=0),
        dict(id='c', on='P3', pts=[(560, -60), (830, -60), (805, 340), (800, 780), (760, 780)], thick=0.3, bevel=0.02),
        dict(id='d', on='P4', pts=[(830, -60), (1700, -60), (1700, 560), (1200, 590), (810, 340)], thick=0.3, bevel=0.03),
        dict(id='e', on='P5', pts=[(810, 340), (1200, 590), (860, 590)], thick=0.25, glow=0.3, bevel=0.03, edge=1.6),
        dict(id='g', on='P6', pts=[(800, 600), (1700, 600), (1700, 900), (780, 900)], thick=0.3, bevel=0.03),
    ],
    cam=dict(mode='keys', keys=[[1, (0.85, 0.05, 0.7)], [12, (0.6, 0.03, 0.5)], [40, (0, 0, 0)], [47, (-0.14, 0, -0.12)]]),
)
