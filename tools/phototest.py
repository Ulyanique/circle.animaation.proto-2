"""phototest.py — test photos for tools/phototest.mjs, written to OUTDIR (public/media/ by default) as _test_*:

  _test_plain.png        colour patches, no colour profile
  _test_adobe.png        the same pixel values, tagged as Adobe RGB (1998)
  _test_adobe_ref.png    what those values mean in sRGB (converted here by littleCMS), no profile
  _test_turned.jpg       a tall picture stored on its side, EXIF orientation 6 (as a phone or camera writes it)
  _test_turned_ref.jpg   the same picture stored upright, no EXIF

    /tmp/tools/venv/bin/python tools/phototest.py [OUTDIR]
"""
import io
import struct
import sys
from pathlib import Path

from PIL import Image, ImageCms, ImageDraw, ImageOps

out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'public' / 'media')


def adobe_rgb():
    """A minimal ICC v2 matrix profile of Adobe RGB (1998): D50-adapted primaries, gamma 563/256."""
    s15 = lambda v: struct.pack('>i', int(round(v * 65536)))
    xyz = lambda x, y, z: b'XYZ \0\0\0\0' + s15(x) + s15(y) + s15(z)
    curve = b'curv\0\0\0\0' + struct.pack('>IH', 1, 563) + b'\0\0'
    name = b'Adobe RGB (1998) - test\0'
    tags = [
        (b'desc', b'desc\0\0\0\0' + struct.pack('>I', len(name)) + name + b'\0' * 78),
        (b'cprt', b'text\0\0\0\0' + b'no copyright\0'),
        (b'wtpt', xyz(0.95045, 1.0, 1.08905)),
        (b'rXYZ', xyz(0.60974, 0.31111, 0.01947)), (b'gXYZ', xyz(0.20528, 0.62567, 0.06087)), (b'bXYZ', xyz(0.14919, 0.06322, 0.74457)),
        (b'rTRC', curve), (b'gTRC', curve), (b'bTRC', curve),
    ]
    table, body, at = b'', b'', 128 + 4 + 12 * len(tags)
    for sig, data in tags:
        data += b'\0' * (-len(data) % 4)
        table += sig + struct.pack('>II', at, len(data))
        body += data
        at += len(data)
    head = struct.pack('>I4sI4s4s4s', at, b'\0' * 4, 0x02100000, b'mntr', b'RGB ', b'XYZ ') + struct.pack('>6H', 2024, 1, 1, 0, 0, 0)
    head += b'acsp' + b'\0' * 24 + struct.pack('>I', 0) + s15(0.9642) + s15(1.0) + s15(0.8249) + b'\0' * 48
    assert len(head) == 128, len(head)
    return head + struct.pack('>I', len(tags)) + table + body


# ---- colour: patches of mid saturation (so that little clips on the way to sRGB), greys, a ramp
W, H = 1600, 900
colours = [(200, 70, 50), (60, 170, 80), (60, 90, 190), (200, 180, 60), (180, 70, 170), (60, 180, 180), (210, 130, 60), (120, 200, 60),
           (150, 60, 60), (60, 120, 70), (70, 70, 140), (160, 150, 90), (140, 90, 140), (90, 150, 150), (230, 200, 170), (110, 110, 110),
           (220, 90, 110), (100, 190, 130), (110, 130, 220), (190, 200, 110), (200, 120, 200), (120, 200, 210), (170, 110, 80), (60, 60, 60),
           (240, 60, 60), (60, 220, 60), (60, 60, 230), (230, 230, 60), (230, 60, 230), (60, 230, 230), (245, 245, 245), (180, 180, 180)]
im = Image.new('RGB', (W, H))
d = ImageDraw.Draw(im)
for i, c in enumerate(colours):
    x, y = (i % 8) * (W // 8), (i // 8) * (H // 4)
    d.rectangle([x, y, x + W // 8 - 1, y + H // 4 - 1], fill=c)
profile = adobe_rgb()
im.save(out / '_test_plain.png')
im.save(out / '_test_adobe.png', icc_profile=profile)
adobe = ImageCms.ImageCmsProfile(io.BytesIO(profile))
ref = ImageCms.profileToProfile(im, adobe, ImageCms.createProfile('sRGB'), renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC, outputMode='RGB')
ref.save(out / '_test_adobe_ref.png')
a, b = im.getpixel((100, 100)), ref.getpixel((100, 100))
print(f'Adobe RGB {a} is sRGB {b}; profile {len(profile)} bytes: {ImageCms.getProfileDescription(adobe).strip()!r}')

# ---- orientation: a tall picture that says which way is up
tall = Image.new('RGB', (900, 1600), (236, 230, 214))
d = ImageDraw.Draw(tall)
d.rectangle([0, 0, 899, 399], fill=(60, 110, 190))                       # sky at the top
d.rectangle([0, 1300, 899, 1599], fill=(70, 120, 60))                    # grass at the bottom
d.polygon([(450, 430), (250, 700), (650, 700)], fill=(170, 60, 50))      # a roof pointing up
d.rectangle([300, 700, 600, 1300], fill=(200, 170, 120))                 # the house
d.rectangle([340, 1040, 440, 1300], fill=(90, 60, 40))                   # its door, left of the middle
d.ellipse([700, 80, 840, 220], fill=(250, 220, 90))                      # the sun, top right
side = tall.transpose(Image.ROTATE_90)                                   # as stored: turned a quarter anticlockwise
exif = Image.Exif()
exif[0x0112] = 6                                                         # "turn a quarter clockwise to show"
side.save(out / '_test_turned.jpg', quality=95, subsampling=0, exif=exif)
tall.save(out / '_test_turned_ref.jpg', quality=95, subsampling=0)
back = ImageOps.exif_transpose(Image.open(out / '_test_turned.jpg'))
print(f'turned: stored {side.size}, shown {back.size}; upright again: {back.size == tall.size}')
