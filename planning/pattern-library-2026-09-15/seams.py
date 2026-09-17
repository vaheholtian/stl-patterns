import json, numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
A = {a['slug']: a for a in json.load(open('analysis.json'))}
M = [m for m in json.load(open('meta.json')) if A[m['slug']]['seam'] > 0.002]
f = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 14)
tiles = []
for m in M:
    H, W = m['H'], m['W']; cell = (slice(round(H/3), round(2*H/3)), slice(round(W/3), round(2*W/3)))
    best = None
    for fl in m['files']:
        if fl['lay'] != 'one': continue
        a = np.array(Image.open(fl['name']))[..., 0][cell] > 127
        b = np.array(Image.open(fl['name'].replace('_one_', '_nine_')))[..., 0][cell] > 127
        d = ndi.binary_opening(a ^ b, structure=np.ones((3, 3))).sum()
        if best is None or d > best[0]: best = (d, fl['stroke'], a, b)
    _, s, a, b = best
    img = np.full(a.shape + (3,), 255, np.uint8)
    img[a & b] = (0, 0, 0); img[b & ~a] = (230, 30, 30); img[a & ~b] = (30, 120, 230)
    big = np.tile(img, (2, 2, 1))
    im = Image.fromarray(big); sc = 300 / max(im.size); im = im.resize((round(im.size[0]*sc), round(im.size[1]*sc)), Image.NEAREST)
    d = ImageDraw.Draw(im); w2, h2 = im.size
    d.line([(w2//2, 0), (w2//2, h2)], fill=(0, 200, 0)); d.line([(0, h2//2), (w2, h2//2)], fill=(0, 200, 0))
    canvas = Image.new('RGB', (310, 330), 'white'); canvas.paste(im, (5, 25))
    ImageDraw.Draw(canvas).text((5, 5), f"{m['slug']} s={s} seam={A[m['slug']]['seam']}", fill='black', font=f)
    tiles.append(canvas)
cols = 6; rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (cols * 310, rows * 330), 'white')
for i, t in enumerate(tiles): sheet.paste(t, ((i % cols) * 310, (i // cols) * 330))
sheet.save('sheets/seams.png'); print(len(tiles))
