"""Raster analysis and contact sheets for the pattern stress run.
For each generator: rasterise every tile (even-odd), measure connectivity of features and material over a 3x3
repeat, and the share of each lost to a 0.84 mm opening (ribs/holes thinner than the minimum printable feature).
Writes results/analysis-<id>.json and sheets/<id>-<page>.png (2x2 repeats, tile boundaries dashed red).
Run from the repository root:  python planning/pattern-stress-2026-09-14/render.py [ids...]
"""
from pathlib import Path
import sys, json, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

HERE = Path(__file__).resolve().parent
RES, SHEETS = HERE / 'results', HERE / 'sheets'
SHEETS.mkdir(exist_ok=True)
COLS, ROWS, CELL, LABEL = 6, 5, 300, 74
MINFEAT = 0.84

def font(size):
    for f in ['C:/Windows/Fonts/consola.ttf', 'C:/Windows/Fonts/arial.ttf']:
        try: return ImageFont.truetype(f, size)
        except OSError: pass
    return ImageFont.load_default()
F12, F14, F16 = font(12), font(14), font(16)

def raster(w, h, polys, res):
    W, H = max(1, round(w / res)), max(1, round(h / res))
    acc = np.zeros((H, W), bool)
    for p in polys:
        if len(p) < 3: continue
        xs = [x / res for x, _ in p]; ys = [(h - y) / res for _, y in p]  # y up
        x0, x1 = max(0, int(min(xs)) - 1), min(W, int(math.ceil(max(xs))) + 1)
        y0, y1 = max(0, int(min(ys)) - 1), min(H, int(math.ceil(max(ys))) + 1)
        if x1 <= x0 or y1 <= y0: continue
        im = Image.new('1', (x1 - x0, y1 - y0), 0)
        ImageDraw.Draw(im).polygon([(x - x0, y - y0) for x, y in zip(xs, ys)], fill=1)
        acc[y0:y1, x0:x1] ^= np.array(im, bool)
    return acc

def disk(r):
    k = int(math.ceil(r)); yy, xx = np.mgrid[-k:k + 1, -k:k + 1]
    return xx * xx + yy * yy <= r * r

def analyse(rec, poly):
    w, h = poly['w'], poly['h']
    res = max(0.05, max(w, h) / 1200)
    feat = raster(w, h, poly['polys'], res)
    out = {'res': res}
    big = np.tile(feat, (3, 3))
    s4 = ndi.generate_binary_structure(2, 1)
    out['featParts3x3'] = int(ndi.label(big, s4)[1])
    out['matParts3x3'] = int(ndi.label(~big, s4)[1])
    r = MINFEAT / 2 / res
    if r >= 2.5:
        # opening by a disk of radius r via distance transforms, on the centre tile padded with its periodic neighbours
        H, W = feat.shape; p = int(math.ceil(2 * r)) + 2
        pad = np.pad(feat, ((p, p), (p, p)), mode='wrap')
        for name, m in (('featThin', pad), ('matThin', ~pad)):
            core = m[p:p + H, p:p + W]; a = core.sum()
            if not a: out[name] = 0.0; continue
            eroded = ndi.distance_transform_edt(m) > r
            opened = ndi.distance_transform_edt(~eroded) <= r
            out[name] = float(1 - (opened & m)[p:p + H, p:p + W].sum() / a)
    return feat, out

def thumb(rec, feat, an):
    img = Image.new('RGB', (CELL, CELL + LABEL), (250, 250, 250)); d = ImageDraw.Draw(img)
    bad = []
    if rec.get('error'): bad.append('ERROR')
    if rec.get('seamFail'): bad.append('SEAM')
    if rec.get('deterministic') is False: bad.append('NONDET')
    if rec.get('finite') is False: bad.append('NaN')
    if feat is not None:
        tiled = np.tile(feat, (2, 2)); H, W = tiled.shape
        k = min((CELL - 8) / W, (CELL - 8) / H)
        pic = Image.fromarray(np.where(tiled, 32, 236).astype(np.uint8)).resize((max(1, int(W * k)), max(1, int(H * k))), Image.LANCZOS).convert('RGB')
        ox, oy = (CELL - pic.width) // 2, (CELL - pic.height) // 2
        img.paste(pic, (ox, oy))
        cx, cy = ox + pic.width // 2, oy + pic.height // 2
        for t in range(0, pic.height, 8): d.line([(cx, oy + t), (cx, oy + t + 4)], fill=(236, 70, 97))
        for t in range(0, pic.width, 8): d.line([(ox + t, cy), (ox + t + 4, cy)], fill=(236, 70, 97))
        d.rectangle([ox, oy, ox + pic.width - 1, oy + pic.height - 1], outline=(236, 70, 97))
    else:
        d.text((10, 20), '\n'.join((rec.get('error') or 'no polygons')[i:i + 38] for i in range(0, 380, 38)), font=F12, fill=(150, 30, 30))
    c = rec['config']
    d.text((6, CELL + 2), f"#{rec['i']} {rec['label']}"[:40], font=F14, fill=(20, 40, 60))
    extras = f"inv={int(c['invert'])} con={int(c['connectMaterial'])} seam={int(c['seamless'])} mir={int(c['mirror'])} lw={c['lineWidth']}"
    d.text((6, CELL + 20), extras, font=F12, fill=(70, 90, 100))
    if not rec.get('error'):
        m = f"{rec['ms']:.0f}ms {rec['tileW']:.0f}x{rec['tileH']:.0f} pts={rec['points']} area={rec['areaFraction']:.2f}"
        t = f"parts F{an.get('featParts3x3','-')}/M{an.get('matParts3x3','-')} thin F{an.get('featThin',float('nan')):.2f} M{an.get('matThin',float('nan')):.2f}"
        d.text((6, CELL + 36), m, font=F12, fill=(70, 90, 100)); d.text((6, CELL + 52), t, font=F12, fill=(70, 90, 100))
    if bad:
        d.rectangle([0, 0, CELL - 1, CELL + LABEL - 1], outline=(200, 30, 30), width=4)
        d.text((CELL - 90, 6), ' '.join(bad), font=F14, fill=(200, 30, 30))
    return img

def run(gid):
    recs = {}
    for l in (RES / f'{gid}.jsonl').read_text(encoding='utf-8').splitlines():
        if l.strip(): r = json.loads(l); recs[r['i']] = r
    polys = {}
    pf = RES / f'{gid}.polys.jsonl'
    if pf.exists():
        for l in pf.read_text(encoding='utf-8').splitlines():
            if l.strip(): p = json.loads(l); polys[p['i']] = p
    cells, rows = [], []
    for i in sorted(recs):
        rec = recs[i]; feat, an = None, {}
        if not rec.get('error') and i in polys and polys[i]['polys']:
            feat, an = analyse(rec, polys[i])
        rows.append({'id': gid, 'i': i, **an})
        cells.append(thumb(rec, feat, an))
    per = COLS * ROWS
    for page in range(math.ceil(len(cells) / per)):
        chunk = cells[page * per:(page + 1) * per]
        sheet = Image.new('RGB', (COLS * (CELL + 8) + 8, 40 + math.ceil(len(chunk) / COLS) * (CELL + LABEL + 8) + 8), (255, 255, 255))
        ImageDraw.Draw(sheet).text((10, 10), f'{gid} — page {page + 1}  (2x2 repeats, red dashes = tile boundary, dark = feature polygons)', font=F16, fill=(20, 40, 60))
        for k, c in enumerate(chunk): sheet.paste(c, (8 + (k % COLS) * (CELL + 8), 40 + (k // COLS) * (CELL + LABEL + 8)))
        sheet.save(SHEETS / f'{gid}-{page + 1}.png')
    return rows

if __name__ == '__main__':
    ids = sys.argv[1:] or sorted({p.name.split('.')[0] for p in RES.glob('*.jsonl') if p.name.count('.') == 1})
    with open(RES / 'analysis.jsonl', 'a', encoding='utf-8') as f:
        for gid in ids:
            for row in run(gid): f.write(json.dumps(row) + '\n')
            print(gid, flush=True)
