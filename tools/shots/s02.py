# shot 2 (f48-69): crystal block; flare + straight streak rise from (460,510) to the top; ghost orb bottom-right. ref f69.
SHOT = dict(
    id='s02', range=(48, 69), ref=69, fov=45, toneFrame=69, screens=[],
    planes=dict(C=dict(d=6, yaw=12, at=(420, 480)), T=dict(d=6.6, yaw=-8, pitch=25, at=(560, 280)), L=dict(d=5.8, pitch=-30, at=(340, 620)),
                B=dict(d=10, yaw=-18, at=(900, 360)), B2=dict(d=9, yaw=20, at=(200, 200))),
    polys=[
        dict(id='bgL', on='B2', pts=[(-300, -200), (500, -200), (450, 330), (240, 440), (230, 540), (-300, 470)], thick=0.3, tone=(40, 34, 21)),
        dict(id='bgT', on='B', pts=[(500, -200), (660, -200), (660, 215), (500, 200)], thick=0.3, tone=(70, 60, 40)),
        dict(id='top', on='T', pts=[(500, 200), (660, 215), (640, 330), (560, 380), (450, 330)], thick=0.3, tone=(112, 98, 68)),
        dict(id='front', on='C', pts=[(240, 440), (560, 380), (570, 540), (480, 620), (230, 540)], thick=0.3, tone=(128, 112, 78)),
        dict(id='lit', on='L', pts=[(220, 530), (470, 650), (440, 710), (215, 640)], thick=0.2, glow=0.45, tone=(250, 240, 200)),
        dict(id='bgR1', on='B', pts=[(660, -200), (1600, -200), (1600, 640), (720, 190)], thick=0.3, tone=(96, 84, 58), bevel=0.05, edge=0.5),
        dict(id='bgR2', on='B', pts=[(640, 330), (720, 190), (1600, 640), (1600, 900), (600, 900), (570, 540), (560, 380)], thick=0.3, tone=(104, 92, 64), bevel=0.05, edge=0.5),
        dict(id='bgB', on='B2', pts=[(-300, 470), (230, 540), (215, 640), (440, 710), (480, 620), (570, 540), (600, 900), (-300, 900)], thick=0.3, tone=(58, 50, 33)),
    ],
    cam=dict(mode='keys', keys=[[48, (0.42, -0.1, 0.85)], [69, (0, 0, 0)]]),      # dolly in + truck left: clearly moving, constant speed
    trails=[dict(name='a', frames=(48, 69), head=dict(keys=[[48, 460, 510, 255], [56, 505, 440, 255], [64, 680, 130, 255], [67, 735, 40, 255], [69, 770, -30, 255]]),
                 init=[(408, 625), (430, 570), (460, 510)], search=24)],
)
