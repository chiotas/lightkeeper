#!/usr/bin/env python3
"""Sky Stream's white logo, app/logos/skystream.png, from the image attached to issue #10.

Trim the image first (magick <image> -trim +repage in.png), then run this with Python 3 and Pillow:
python3 logo-sky-stream.py in.png <out dir>. Of the three ways it draws, Lightkeeper uses
B-pieno.png, the diamond filled with "stream" cut out of it, renamed skystream.png.
"""
# Measured on the original (1711 x 1220): the letters are navy, h 0.65, v 0.33 to 0.6 where the
# glass's sheen lies on them, s >= 0.29; the rim opaque and coloured, s >= 0.33, v ~1; the glass
# white and half clear above its line (s 0.05, a 140-163), faint colour below (a <= 28); the glow
# a black shadow (rgb 0, a <= 67). Each part becomes a sharp mask at this size; scaling it down
# to 240 pixels tall gives the soft edges.
import sys, colorsys
from PIL import Image, ImageDraw, ImageFilter, ImageChops
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA'); w, h = im.size; px = im.load()
T = Image.new('L', (w, h)); R = Image.new('L', (w, h)); pt = T.load(); pr = R.load()
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a < 128: continue
        hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if 0.58 <= hh <= 0.72 and s >= 0.08 and v <= 0.75: pt[x, y] = 255
        elif s >= 0.25 and v >= 0.7 and a >= 160: pr[x, y] = 255
# Lines a pixel or two wide, where the rim's edge meets its shadow, are not letters.
opening = lambda m, n: m.filter(ImageFilter.MinFilter(n)).filter(ImageFilter.MaxFilter(n))
T = opening(T, 5)
# Inside the rim: what the edges cannot reach without crossing it.
wall = R.filter(ImageFilter.MaxFilter(5))
fill = Image.new('L', (w + 2, h + 2), 0); fill.paste(wall, (1, 1))
ImageDraw.floodfill(fill, (0, 0), 128)
fill = fill.crop((1, 1, w + 1, h + 1))
diamond = ImageChops.lighter(R, fill.point(lambda v: 255 if v == 0 else 0).filter(ImageFilter.MaxFilter(7)))
diamond = ImageChops.multiply(diamond, fill.point(lambda v: 0 if v == 128 else 255).filter(ImageFilter.MinFilter(1)))
diamond = ImageChops.lighter(diamond, R)
def save(name, mask):
    box = mask.getbbox(); m = mask.crop(box)
    m = m.resize((round(m.size[0] * 240 / m.size[1]), 240), Image.BOX)
    o = Image.new('RGBA', m.size, (255, 255, 255, 0)); o.putalpha(m)
    o.save(out + '/' + name + '.png', optimize=True)
    a = list(m.getdata()); semi = sum(1 for v in a if 0 < v < 255)
    print(name, o.size, 'semi-transparent pixels:', semi, 'of', len(a), '%.1f%%' % (100.0 * semi / len(a)))
# A: the rim and the letters, without the glass, its shadow and the line across it.
save('A-contorno', ImageChops.lighter(T, R))
# B: the diamond filled, "stream" cut out of it, as Sky Go's cloud; "sky" beside it.
save('B-pieno', ImageChops.lighter(ImageChops.subtract(diamond, T), ImageChops.multiply(T, ImageChops.invert(diamond))))
# C: the words alone.
save('C-scritta', T)
