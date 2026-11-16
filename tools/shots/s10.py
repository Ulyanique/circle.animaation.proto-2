# shot 10: f469-521, camera rolls and pulls back from the big gold plane; white-helmet worker on a rotated screen (ref f505)
SHOT = dict(
    id='s10', range=(469, 521), ref=505, fov=45, toneFrame=505,
    screens=[dict(name='helmet', rect=(280, 60, 980, 800), depth=9, texW=960, texFrames=[505, 502, 499], window=True)],
    planes=dict(L=dict(d=9.0, yaw=30, at=(690, 240)), T=dict(d=9.6, pitch=-25, at=(690, 240)), R=dict(d=8.6, yaw=-40, at=(945, 95)),
                R2=dict(d=7.5, yaw=-55, at=(1040, 300)), BG=dict(d=22), BG2=dict(d=30)),
    polys=[
        dict(id='scr', on='helmet', pts=[(690, 240), (945, 95), (900, 480), (880, 790), (320, 790), (335, 620)], thick=0.5, tone=(150, 128, 82)),
        dict(id='gL', on='L', pts=[(250, 790), (345, 400), (480, 170), (690, 240), (335, 620), (320, 790)], thick=0.4, glow=0.2, tone=(120, 102, 62)),
        dict(id='band', on='T', pts=[(565, -60), (800, -60), (760, 60), (690, 240), (480, 170)], thick=0.3, tone=(238, 230, 205)),
        dict(id='gT', on='T', pts=[(800, -60), (1010, -60), (945, 95), (690, 240), (760, 60)], thick=0.3, glow=0.2, tone=(112, 95, 58)),
        dict(id='gR1', on='R', pts=[(945, 95), (1010, -60), (1050, 300), (1010, 790), (880, 790), (900, 480)], thick=0.4, glow=0.2, tone=(128, 106, 64)),
        dict(id='gR2', on='R2', pts=[(1050, 300), (1010, -60), (1400, -60), (1400, 380), (1010, 790)], thick=0.4, glow=0.35, tone=(214, 192, 140)),
        dict(id='gR3', on='R2', pts=[(1010, 790), (1400, 380), (1400, 790)], thick=0.4, glow=0.2, tone=(176, 152, 104)),
        dict(id='bgL1', on='BG', pts=[(-80, 330), (120, 250), (330, 260), (300, 480), (60, 560), (-80, 520)], soft=34, tone=(66, 57, 34)),
        dict(id='bgL2', on='BG2', pts=[(-200, 480), (200, 500), (240, 800), (-200, 800)], soft=40, tone=(50, 43, 26)),
        dict(id='bgL3', on='BG2', pts=[(-200, -100), (500, -100), (420, 200), (-200, 260)], soft=44, tone=(34, 29, 17)),
    ],
    # the footage zooms out inside the shard after f505, so the content cannot be tracked there: hand keys for the shard
    cam=dict(mode='screen', chain='sift', frames=(472, 505), region=[(690, 240), (945, 95), (900, 480), (880, 720), (320, 720), (335, 620)],
             sim=[[512, 1.0, 13.6, (690, 240), (612, 120)], [521, 0.9, 13.2, (690, 240), (645, 105)]]),
    flare=dict(frames=(507, 521), start=(600, 715), maxjump=110, min=190),
    trails=[dict(name='arc', frames=(478, 512), initFrame=505, search=70, tophat=91, fade=(507, 512),
                 head=dict(keys=[[478, 640, 780, 255], [512, 640, 780, 255]]),
                 init=[(600, 0), (760, 20), (900, 60), (1000, 180), (1020, 300), (990, 400), (900, 520), (770, 640), (650, 720)]),
            dict(name='b', frames=(507, 521), init=[], search=40)],
)
