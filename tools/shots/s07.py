# shot 7 (f308-334): gold close-up, the streak head passes top-right (f320-328) and lights everything up. ref f318.
SHOT = dict(
    id='s07', range=(308, 334), ref=318, fov=45, toneFrame=318, screens=[],
    planes=dict(K=dict(d=9.5), U=dict(d=5, yaw=-14, pitch=12, at=(640, 250)), L=dict(d=4.6, yaw=10, pitch=-22, at=(560, 560)), E=dict(d=5.6, yaw=30, at=(120, 200)), R=dict(d=11, yaw=-20, at=(1150, 300))),
    polys=[
        # dull gold backdrop: the facets sit on different planes, so the fast sweep opens cracks between them
        dict(id='back', on='K', pts=[(-1500, -1300), (1050, -1300), (1050, 1500), (-1500, 1500)], thick=0.2, tone=(62, 52, 34), bevel=0),
        dict(id='r', on='R', pts=[(400, -1100), (2200, -1100), (2200, 1300), (1100, 1300)], thick=0.3, tone=(26, 22, 14), bevel=0),
        dict(id='u', on='U', pts=[(240, 236), (527, -705), (1300, 860), (1150, 600)], thick=0.5, bevel=0.03, edge=1.4, tone=(63, 55, 38)),
        dict(id='lo', on='L', pts=[(240, 236), (1150, 600), (1300, 860), (1380, 1150), (-950, 1150), (-950, 950)], thick=0.5, bevel=0.03, edge=1.5, tone=(95, 78, 51)),
        dict(id='le', on='E', pts=[(-950, -705), (527, -705), (240, 236), (-950, 950)], thick=0.5, bevel=0.03, tone=(63, 55, 37)),
    ],
    # the camera sweeps left/up with a growing roll and keeps accelerating into shot 8 (one continuous move in the original)
    cam=dict(mode='keys', keys=[[308, (0.55, -0.32, 0.25), 0, 0, -4.5], [318, (0, 0, 0)], [326, (-0.66, 0.44, -0.2), 0, 0, 4.5], [334, (-1.95, 1.5, -0.45), 0, 0, 10.5]]),
    trails=[dict(name='sweep', frames=(327, 334), initFrame=332, search=60, head=dict(keys=[[327, 1320, 370, 255], [334, 1320, 370, 255]]),
                 init=[(320, 0), (520, 50), (720, 105), (900, 170), (1060, 240), (1200, 320)])],
)
