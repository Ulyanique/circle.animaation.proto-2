# shot 11a: f522-532, field with pylons and trucks on a big screen, camera pans (ref f531)
SHOT = dict(
    id='s11a', range=(522, 532), ref=531, fov=45, toneFrame=531,
    screens=[dict(name='field', rect=(-150, -20, 1450, 840), depth=9, texW=1280, texFrames=[531, 524, 527], window=True)],
    planes=dict(R=dict(d=8.0, yaw=-30, at=(1210, 360))),
    polys=[
        dict(id='scr', on='field', pts=[(300, 0), (1020, 60), (1090, 300), (1200, 540), (1420, 700), (1420, 820), (-110, 820)], thick=0.4, tone=(120, 110, 80)),
        dict(id='gR', on='R', pts=[(1215, 40), (1560, 20), (1560, 740), (1230, 740), (1185, 400)], thick=0.4, glow=0.3, tone=(150, 126, 76)),
    ],
    cam=dict(mode='screen', chain='sift', frames=(522, 532), region=[(320, 30), (1000, 80), (1070, 300), (1180, 540), (1270, 620), (1270, 700), (60, 700)]),
    flare=dict(frames=(532, 532), start=(1152, 166), maxjump=60, min=180,
               pre=[[522, 1262, 196], [525, 1229, 187], [528, 1196, 178], [531, 1163, 169]]),
    trails=[dict(name='main', frames=(522, 532), search=40)],
)
