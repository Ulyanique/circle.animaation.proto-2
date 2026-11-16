# shot 1 (f1-47): close-up of long gold facets, bright bevel strip, light ramps up; flare top-right. ref f40.
# The first frame has to stand on its own (the light is not in yet): shadow behind the facets, a second family of
# edges (x1 crosses the lit wedge, d2 cuts the flat upper right), and the lit wedge is a face with a hot rim, not a fill.
SHOT = dict(
    id='s01', range=(1, 47), ref=40, fov=45, toneFrame=40, screens=[],
    planes=dict(BG=dict(d=11, at=(640, 360)), P1s=dict(d=7.4, yaw=22, at=(250, 360)), P2s=dict(d=5.4, yaw=-10, at=(600, 360)), P1=dict(d=7.5, yaw=22, at=(250, 360)), P2=dict(d=5.5, yaw=-10, at=(600, 360)), P3=dict(d=6.8, yaw=14, at=(760, 300)),
                P4=dict(d=8.5, yaw=-24, at=(1050, 250)), P5=dict(d=5.0, yaw=8, pitch=18, at=(950, 500)), P6=dict(d=6.0, yaw=-12, pitch=-20, at=(1000, 680)),
                # Two planes for the second family of edges (otherwise almost every long edge runs at 75°). Their
                # `at` is measured in the camera the annotation assumes (at the origin); the camera of frame 1 stands
                # 0.87 to the right, so a point lands ~760/d px further left on the screen — the pair below is placed
                # with that in mind: one slim blade behind the lit wedge, one thin bright edge over the right facet.
                P7=dict(d=5.2, yaw=-10, at=(900, 520)), P8=dict(d=8.0, yaw=-20, at=(1200, 260))),
    polys=[
        dict(id='bg', on='BG', pts=[(-1500, -900), (2800, -900), (2800, 1700), (-1500, 1700)], thick=0.2, tone=(32, 26, 15), bevel=0),
        dict(id='a0', on='P1', pts=[(-400, -60), (60, -60), (320, 780), (-400, 780)], thick=0.3, bevel=0.035, edge=1.8),
        dict(id='a1', on='P1', pts=[(60, -60), (360, -60), (480, 780), (320, 780)], thick=0.3, bevel=0.03, edge=1.8, tone=(46, 40, 25)),
        dict(id='b', on='P2', pts=[(360, -200), (540, -200), (780, 900), (480, 900)], thick=0.4, bevel=0.09, edge=3.2),
        dict(id='strip', on='P2s', pts=[(533, -200), (554, -200), (829, 900), (808, 900)], thick=0.05, glow=0.35, tone=(255, 246, 205), bevel=0),
        dict(id='t1', on='P1s', pts=[(-40, -200), (-30, -200), (370, 900), (360, 900)], thick=0.05, glow=0.1, tone=(170, 148, 100), bevel=0),
        dict(id='t2', on='P2s', pts=[(330, -200), (342, -200), (510, 900), (498, 900)], thick=0.05, glow=0.1, tone=(175, 152, 104), bevel=0),
        dict(id='c', on='P3', pts=[(560, -60), (830, -60), (805, 340), (800, 780), (760, 780)], thick=0.3, bevel=0.02, tone=(132, 113, 66)),
        dict(id='d', on='P4', pts=[(830, -60), (1700, -60), (1700, 560), (1200, 590), (810, 340)], thick=0.3, bevel=0.03, tone=(72, 60, 37)),
        dict(id='e', on='P5', pts=[(810, 340), (1200, 590), (860, 590)], thick=0.25, glow=0.14, bevel=0.035, edge=1.9, tone=(224, 205, 124)),
        dict(id='x1', on='P7', pts=[(676, 300), (742, 300), (1296, 760), (1230, 760)], thick=0.12, bevel=0.03, edge=3.0, glow=0.35, tone=(52, 43, 27)),
        dict(id='d2', on='P8', pts=[(820, 60), (830, 60), (1480, 500), (1470, 500)], thick=0, bevel=0.09, edge=1.0, glow=0.5, tone=(250, 232, 180)),
        dict(id='g', on='P6', pts=[(800, 600), (1700, 600), (1700, 900), (780, 900)], thick=0.3, bevel=0.03, tone=(54, 43, 27)),
    ],
    cam=dict(mode='keys', keys=[[1, (0.85, 0.05, 0.7)], [12, (0.6, 0.03, 0.5)], [40, (0, 0, 0)], [47, (-0.14, 0, -0.12)]]),
)
