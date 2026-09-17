import json, numpy as np
from PIL import Image
from scipy import ndimage as ndi
from multiprocessing import Pool
import analyze
M = {m['slug']: m for m in json.load(open('meta.json'))}
F = json.load(open('final.json'))
targets = [o['slug'] for o in F if 'nocut' in o['verdict'] and M[o['slug']]['mode'] != 'fill']
def run(slug):
    m = M[slug]; H, W = m['H'], m['W']
    cell = (slice(round(H/3), round(2*H/3)), slice(round(W/3), round(2*W/3)))
    res = {}
    for s in sorted({f['stroke'] for f in m['files']}):
        U = None
        for f in m['files']:
            if f['lay'] == 'nine' and f['stroke'] == s:
                a = np.array(Image.open(f['name']))[..., 0] > 127
                U = a if U is None else U | a
        res[s] = dict(fill=round(float(U[cell].mean()), 3),
                      fg=analyze.conn(U, cell, H, W), bg=analyze.conn(~U, cell, H, W))
    return slug, res
if __name__ == '__main__':
    with Pool(12) as p: R = dict(p.map(run, targets))
    fixed = []
    for slug, res in R.items():
        ss = sorted(res)
        thin, thick = res[ss[0]], res[ss[-1]]
        if (thick['fg']['connected'] or thick['bg']['connected']) and not (thin['fg']['connected'] or thin['bg']['connected']):
            fixed.append((slug, ss[-1], thick['fill'], thick['fg']['connected'], thick['bg']['connected']))
    print('stroke patterns flagged nocut:', len(targets))
    print('become cuttable when the rib is thickened to half of maxStroke:', len(fixed))
    for f in fixed: print('  ', f)
    w = R['waves-1']
    print('waves-1:', {s: (v['fill'], v['fg']['connected'], v['bg']['connected'], v['fg']['share'], v['bg']['share']) for s, v in w.items()})
