# shot 12: f577-655, worker at the cabinet; the camera pulls back and the screen recedes into the dark (ref f590)
SHOT = dict(
    id='s12', range=(577, 655), ref=590, fov=45, toneFrame=590,
    screens=[dict(name='cabinet', rect=(-240, 0, 980, 820), depth=9, texW=1024, texFrames=[590, 600, 612, 580], window=True, headR=150),
             dict(name='pylonsB', rect=(1000, -40, 2000, 800), depth=10.8, texW=768, texFrames=[577, 583, 590], window=True)],
    polys=[
        dict(id='cab', on='cabinet', pts=[(70, 60), (530, 36), (600, 330), (690, 530), (932, 800), (-190, 800)], thick=0.4, tone=(120, 100, 60)),
        dict(id='pyl', on='pylonsB', pts=[(1150, -30), (1990, -30), (1990, 790), (1108, 790)], thick=0.4, tone=(200, 190, 160)),
    ],
    cam=dict(mode='screen', chain='sift', frames=(577, 655), region=[(80, 70), (520, 46), (590, 330), (680, 530), (860, 720), (0, 720), (0, 270)]),
    flare=dict(frames=(600, 600), start=(145, 310), maxjump=60, min=250,
               pre=[[596, -40, 335], [598, 60, 322], [600, 145, 310], [606, 210, 340], [612, 275, 375], [620, 500, 475], [628, 550, 500],
                    [636, 625, 500], [644, 595, 480], [652, 965, 530], [655, 1120, 545]]),
    trails=[dict(name='old', frames=(577, 640), initFrame=590, search=45, fade=(626, 640),
                 head=dict(keys=[[577, 1340, 225, 255], [640, 1340, 225, 255]]),
                 init=[(-60, 440), (0, 430), (300, 415), (600, 380), (900, 310), (1150, 250)]),
            dict(name='new', frames=(596, 655), init=[], search=40)],
)
