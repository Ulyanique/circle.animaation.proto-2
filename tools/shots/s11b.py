# shot 11b: f533-576, pylons from a low angle; camera pans left, the cabinet shard (shot 12) comes in from the left (ref f575)
SHOT = dict(
    id='s11b', range=(533, 576), ref=575, fov=45, toneFrame=575,
    screens=[dict(name='pylons', rect=(520, -40, 1560, 800), depth=9, texW=1280, texFrames=[575, 560, 545, 536], window=True, headR=170),
             dict(name='cabinetA', rect=(-140, 0, 420, 780), depth=7.5, texW=640, texFrames=[576, 572], window=True)],
    polys=[
        dict(id='scr', on='pylons', pts=[(700, 50), (1580, -20), (1580, 820), (545, 820), (570, 680)], thick=0.4, tone=(120, 110, 80)),
        dict(id='cab', on='cabinetA', pts=[(-130, 20), (150, 40), (320, 580), (395, 790), (-130, 790)], thick=0.4, tone=(120, 100, 60)),
    ],
    cam=dict(mode='screen', chain='sift', frames=(533, 576), region=[(720, 70), (1270, 20), (1270, 700), (600, 700)]),
    flare=dict(frames=(544, 572), start=(368, 308), maxjump=60, min=180,
               pre=[[533, 500, 270], [536, 464, 281], [540, 416, 295], [543, 380, 304]]),
    trails=[dict(name='main', frames=(533, 576), search=40)],
)
