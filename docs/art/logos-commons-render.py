#!/usr/bin/env python3
"""Turns the brand logos listed in logos-commons.tsv into the white pictures in app/logos/.

Put each file downloaded from Wikimedia Commons, SVG or PNG, as <name>.svg or <name>.png beside this
script, or in a folder given as the first argument, then run it with Python 3 and Pillow. A second
argument writes the pictures elsewhere than app/logos/. Each logo is drawn by Chrome, then made white:
what is white in the original, drawn over a colour, becomes a hole, as in the brands' own one-colour versions.
"""
import os, subprocess, tempfile, sys
from PIL import Image
C = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
here = os.path.dirname(os.path.abspath(__file__))
src = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else here
dest = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(here, '..', '..', 'app', 'logos')
tmp = tempfile.mkdtemp()
for f in sorted(os.listdir(src)):
    if not f.endswith(('.svg', '.png')): continue
    n = f[:-4]
    html = os.path.join(tmp, n + '.html')
    h = 240
    while True:
        open(html, 'w').write('<html><body style="margin:20px;background:transparent"><img src="file://%s/%s" style="height:%dpx"></body></html>' % (src, f, h))
        raw = os.path.join(tmp, n + '.raw.png')
        subprocess.run([C, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
                        '--window-size=4000,%d' % (h + 60), '--allow-file-access-from-files', '--user-data-dir=' + tempfile.mkdtemp(),
                        '--screenshot=' + raw, 'file://' + html], stderr=subprocess.DEVNULL)
        im = Image.open(raw).convert('RGBA')
        px = im.load()
        out = Image.new('RGBA', im.size, (255, 255, 255, 0))
        po = out.load()
        for y in range(im.size[1]):
            for x in range(im.size[0]):
                r, g, b, a = px[x, y]
                if not a: continue
                # White drawn over a colour is a hole, as in the brands' own one-colour versions.
                w = min(max((min(r, g, b) - 200) / 40.0, 0.0), 1.0)
                po[x, y] = (255, 255, 255, int(round(a * (1 - w))))
        box = out.getbbox()
        out = out.crop(box)
        # A file with room around its logo gives a shorter picture: drawn again, larger, it is 240 pixels tall.
        if out.size[1] >= 240: break
        h = h * 240 // out.size[1] + 1
    out.save(os.path.join(dest, n + '.png'), optimize=True)
    print(n, out.size)
