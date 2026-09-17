import json, numpy as np
from PIL import Image
M = json.load(open('meta.json')); A = {a['slug']: a for a in json.load(open('analysis.json'))}
sig = {}
for m in M:
    H, W = m['H'], m['W']
    f = [x for x in m['files'] if x['lay'] == 'nine'][0]
    im = Image.open(f['name']).convert('L')
    U = None
    for x in m['files']:
        if x['lay'] != 'nine' or x['rule'] != 'nonzero' or x['stroke'] != sorted({y['stroke'] for y in m['files']})[0]: continue
        a = np.array(Image.open(x['name']))[..., 0] > 127
        U = a if U is None else U | a
    cellimg = Image.fromarray((U[round(H/3):round(2*H/3), round(W/3):round(2*W/3)] * 255).astype(np.uint8))
    sig[m['slug']] = (np.array(cellimg.resize((48, 48), Image.BILINEAR)) > 127, m['w'] / m['h'])
order = [m['slug'] for m in M]
out = []
for i, s in enumerate(order):
    for t in order[i+1:]:
        a, ra = sig[s]; b, rb = sig[t]
        if abs(ra - rb) > 0.02 or abs(a.mean() - b.mean()) > 0.03 or not (0.06 < a.mean() < 0.94): continue
        best = 1
        for dy in range(0, 48, 2):
            for dx in range(0, 48, 2):
                best = min(best, (a != np.roll(np.roll(b, dy, 0), dx, 1)).mean())
        if best < 0.05: out.append((round(best, 3), s, t))
for r in sorted(out): print(r)
