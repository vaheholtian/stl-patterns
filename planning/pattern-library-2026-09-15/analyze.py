import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from multiprocessing import Pool

MINFEAT = 0.84
def load(n): return np.array(Image.open(n))[..., 0] > 127

def edges(X): return X & ~ndi.binary_erosion(X, border_value=1)

def open_loss(X, r, crop):
    er = ndi.distance_transform_edt(X) > r
    op = ndi.distance_transform_edt(~er) <= r
    c = X[crop]; return (c & ~op[crop]).sum() / max(1, c.sum())

def thinnest(X, crop, ppu):
    """largest opening radius (px) losing <=5% of the phase in the cell -> feature thickness in units"""
    if X[crop].mean() < 0.01: return None
    lo, hi = 0.0, 64.0
    if open_loss(X, 0.5, crop) > 0.05: return 1.0 / ppu
    lo = 0.5
    for _ in range(9):
        m = (lo + hi) / 2
        if open_loss(X, m, crop) <= 0.05: lo = m
        else: hi = m
    return 2 * lo / ppu

def conn(X, cell, H, W):
    lab, n = ndi.label(X)  # 4-connectivity
    c = lab[cell]; tot = (c > 0).sum()
    if tot == 0: return dict(connected=False, share=0, spans=False, pieces=0)
    counts = np.bincount(c.ravel(), minlength=n + 1); counts[0] = 0
    big = counts.argmax()
    ys, xs = np.nonzero(lab == big)
    spans = ys.min() < H / 3 and ys.max() >= 2 * H / 3 and xs.min() < W / 3 and xs.max() >= 2 * W / 3
    spansX = xs.min() < W / 3 and xs.max() >= 2 * W / 3
    spansY = ys.min() < H / 3 and ys.max() >= 2 * H / 3
    share = counts[big] / tot
    pieces = int((counts > 0.002 * tot).sum())
    return dict(connected=bool(spans and share >= 0.97), share=round(float(share), 3), spansX=bool(spansX), spansY=bool(spansY), pieces=pieces)

def run(m):
    H, W, ppu = m['H'], m['W'], m['ppu']
    cy0, cy1, cx0, cx1 = round(H / 3), round(2 * H / 3), round(W / 3), round(2 * W / 3)
    cell = (slice(cy0, cy1), slice(cx0, cx1))
    mg = round(min(cy1 - cy0, cx1 - cx0) / 3)
    crop_box = (slice(cy0 - mg, cy1 + mg), slice(cx0 - mg, cx1 + mg))
    inner = (slice(mg, mg + cy1 - cy0), slice(mg, mg + cx1 - cx0))
    area = (cy1 - cy0) * (cx1 - cx0)
    F = {(f['layer'], f['stroke'], f['lay'], f['rule']): f['name'] for f in m['files']}
    strokes = sorted({f['stroke'] for f in m['files']})
    s0 = strokes[0]
    out = dict(slug=m['slug'])
    # seams: single copy clipped vs periodic union, per layer and stroke
    seam = 0.0
    for (li, s, lay, rule), n in F.items():
        if lay != 'one': continue
        a = load(n)[cell]; b = load(F[(li, s, 'nine', 'nonzero')])[cell]
        d = ndi.binary_opening(a ^ b, structure=np.ones((3, 3)))
        seam = max(seam, d.sum() / area)
    out['seam'] = round(float(seam), 4)
    layers = [load(F[(li, s0, 'nine', 'nonzero')]) for li in range(m['nLayers'])]
    U = np.logical_or.reduce(layers)
    out['fill'] = round(float(U[cell].mean()), 3)
    # colour layers collapsing into one colour
    if len(layers) > 1:
        se = sum(edges(L)[cell].sum() for L in layers)
        out['edgeLoss'] = round(float(1 - edges(U)[cell].sum() / max(1, se)), 3)
        hid = 0; acc = layers[0].copy()
        for L in layers[1:]:
            if L[cell].sum(): hid = max(hid, (L & acc)[cell].sum() / L[cell].sum())
            acc |= L
        out['hidden'] = round(float(hid), 3)
    else:
        out['edgeLoss'] = 0.0; out['hidden'] = 0.0
    if m['mode'] == 'fill':
        nz = U; eo = np.logical_or.reduce([load(F[(li, 0, 'nine', 'evenodd')]) for li in range(m['nLayers'])])
        out['fillRule'] = round(float(ndi.binary_opening(nz ^ eo, structure=np.ones((3, 3)))[cell].sum() / max(1, U[cell].sum())), 3)
    out['fg'] = conn(U, cell, H, W)
    out['bg'] = conn(~U, cell, H, W)
    Uc = U[crop_box]
    tf = thinnest(Uc, inner, ppu); tb = thinnest(~Uc, inner, ppu)
    out['thinFg'] = tf; out['thinBg'] = tb
    w = m['w']
    out['tileMmFg'] = None if tf is None else round(w * MINFEAT / tf, 1)
    out['tileMmBg'] = None if tb is None else round(w * MINFEAT / tb, 1)
    # signature for duplicate detection
    sig = np.array(Image.fromarray((U[cell] * 255).astype(np.uint8)).resize((32, 32), Image.BILINEAR)) > 127
    out['sig'] = ''.join('1' if v else '0' for v in sig.ravel())
    return out

if __name__ == '__main__':
    meta = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'meta.json'))
    with Pool(12) as p: res = p.map(run, meta, chunksize=2)
    json.dump(res, open('analysis.json', 'w'))
    print('done', len(res))
