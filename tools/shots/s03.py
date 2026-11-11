# shot 3 (f70-141): monolith "city" on a dark floor; flash f71-72; streak from the top-left, head centre-right. ref f130.
SHOT = dict(
    id='s03', range=(70, 141), ref=130, fov=45, toneFrame=130, screens=[],
    planes=dict(N=dict(d=4.2, yaw=28, at=(150, 480)), M=dict(d=6, yaw=-16, at=(500, 430)), F=dict(d=10, yaw=10, at=(660, 330)),
                F2=dict(d=8.5, yaw=22, at=(1000, 280)), F3=dict(d=7, yaw=-30, at=(1220, 260)), B=dict(d=13, at=(600, 150)), U=dict(d=5.2, yaw=40, pitch=10, at=(120, 240))),
    polys=[
        dict(id='wall', on='B', pts=[(-900, -300), (1500, -300), (1500, 470), (-900, 470)], thick=0.3, tone=(30, 26, 17), bevel=0),
        dict(id='slabL', on='N', pts=[(-1300, 360), (330, 330), (400, 590), (-1300, 800)], thick=0.5, bevel=0.03, edge=1.5, tone=(95, 77, 47)),
        dict(id='slabU', on='U', pts=[(-1300, -130), (250, 240), (330, 330), (-1300, 360)], thick=0.4, bevel=0.03, tone=(121, 97, 56)),
        dict(id='slabC', on='M', pts=[(330, 330), (620, 320), (670, 480), (400, 590)], thick=0.5, bevel=0.03),
        dict(id='tc', on='F', pts=[(600, 60), (700, 20), (730, 470), (610, 480)], thick=0.6, bevel=0.03),
        dict(id='tr', on='F2', pts=[(900, 40), (1010, -20), (1090, 300), (1060, 460), (930, 430)], thick=0.6, bevel=0.03),
        dict(id='fr', on='F3', pts=[(1120, -100), (1500, -140), (1500, 480), (1160, 440)], thick=0.6, bevel=0.03),
    ],
    # orbit to the right with a steady push-in (the original zooms in ~1.4x over the shot)
    cam=dict(mode='keys', keys=[[70, (-2.3, 0.14, 2.5), -10], [100, (-1.05, 0.06, 1.3), -4.5], [130, (0, 0, 0)], [141, (0.42, -0.02, -0.7), 1.8]]),
    flare=dict(frames=(76, 141), start=(600, 200), maxjump=70, pre=[[70, 430, -30], [72, 500, 40], [74, 545, 120]]),
    trails=[dict(name='main', frames=(72, 141), head='flare', init=[], search=40),
            dict(name='tail', frames=(92, 141), initFrame=115, search=45, head=dict(keys=[[92, 700, 200, 255], [141, 700, 200, 255]]),
                 init=[(-30, 80), (200, 118), (410, 150), (560, 172), (660, 190)])],
)
