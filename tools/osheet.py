"""osheet.py F1,F2,.. COLS TILEW OUT.jpg [x0,y0,x1,y1] — contact sheet of ORIGINAL video frames (optionally a crop)."""
import sys
from PIL import Image, ImageDraw
fr = [int(x) for x in sys.argv[1].split(',')]; cols = int(sys.argv[2]); tw = int(sys.argv[3]); out = sys.argv[4]
box = [int(x) for x in sys.argv[5].split(',')] if len(sys.argv) > 5 else [0, 0, 1280, 720]
th = round(tw * (box[3] - box[1]) / (box[2] - box[0])); rows = (len(fr) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * th))
for i, f in enumerate(fr):
    im = Image.open('/tmp/work/frames/f_%04d.jpg' % f).crop(box).resize((tw, th), Image.LANCZOS)
    ImageDraw.Draw(im).text((5, 3), 'orig f%d' % f, fill=(0, 255, 0))
    sheet.paste(im, ((i % cols) * tw, (i // cols) * th))
sheet.save(out, quality=88); print(out, sheet.size)
