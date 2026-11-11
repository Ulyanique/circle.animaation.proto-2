"""slotmap.py NOW_DIR CARD_DIR OUT.jpg — the map of the windows for the README (docs/windows.jpg).

For every window: the frame as it looks now (top) and the same frame with the 16:9 test card of `?card` (bottom),
under the window's id and frames. The two directories come from tools/slotshot.mjs, run without and with QUERY=card
on the frames listed in FRAMES (see tools/NOTES.md).
"""
import sys
from PIL import Image, ImageDraw, ImageFont

# window -> (frame shown on the map, frames on screen)
FRAMES = {
    'w01': (172, '143–187'), 'w02': (215, '188–231'), 'w03': (285, '240–307'), 'w04': (362, '335–387'),
    'w05': (415, '400–468'), 'w06': (508, '486–521'), 'w07': (528, '522–532'), 'w08': (552, '533–598'),
    'w09': (610, '554–655'), 'w10': (710, '678–738'), 'w11': (870, '807–901'),
}
COLS, TW, TH, HEAD, GAP = 4, 480, 270, 44, 14


def font(size, bold=False):
    for path in ('/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf' % ('-Bold' if bold else ''), '/tmp/fonts/fonts/Open_Sans/OpenSans-%s.ttf' % ('Bold' if bold else 'Regular')):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def main(now_dir, card_dir, out):
    ids = list(FRAMES)
    rows = -(-len(ids) // COLS)
    cell_h = HEAD + 2 * TH + 4
    W = GAP + COLS * (TW + GAP)
    H = GAP + rows * (cell_h + GAP)
    sheet = Image.new('RGB', (W, H), (14, 13, 11))
    d = ImageDraw.Draw(sheet)
    big, small = font(26, True), font(19)
    for k, wid in enumerate(ids):
        f, span = FRAMES[wid]
        x = GAP + (k % COLS) * (TW + GAP)
        y = GAP + (k // COLS) * (cell_h + GAP)
        d.text((x + 2, y + 6), wid, fill=(236, 200, 120), font=big)
        d.text((x + 70, y + 12), 'кадры %s  ·  на карте кадр %d' % (span, f), fill=(170, 165, 150), font=small)
        for j, src in enumerate((now_dir, card_dir)):
            im = Image.open('%s/r_%06d.jpg' % (src, f * 100)).convert('RGB').resize((TW, TH), Image.LANCZOS)
            sheet.paste(im, (x, y + HEAD + j * (TH + 4)))
    # the free cell: what the map shows
    k = len(ids)
    if k % COLS:
        x = GAP + (k % COLS) * (TW + GAP)
        y = GAP + (k // COLS) * (cell_h + GAP) + HEAD
        lines = ['Сверху — окно сейчас (заглушка).', 'Снизу — то же окно с разметкой 16:9', '(адрес ?card): какую часть', 'горизонтального кадра оно берёт', 'при настройках по умолчанию.', '',
                 'Клетки разметки: A1 … I16,', 'A — верхний ряд, 1 — левый столбец.']
        for i, t in enumerate(lines):
            d.text((x + 6, y + 8 + i * 30), t, fill=(190, 185, 170), font=small)
    sheet.save(out, quality=88, optimize=True)
    print(out, sheet.size)


if __name__ == '__main__':
    main(*sys.argv[1:4])
