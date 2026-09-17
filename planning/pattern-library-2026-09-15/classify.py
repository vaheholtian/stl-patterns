"""analysis.json + meta.json -> final.json: apply the thresholds and tier every pattern.
All four thresholds below are judgement calls, not measurements. Change them here.
Run from this directory:  python classify.py
"""
import json
from collections import Counter

MIN_FEATURE = 0.84          # mm: 2 x 0.42 mm line width, the app's printability floor
TOO_FINE_MM = 50            # min tile width above which a tile is rejected (a 50 mm box face)
FINE_WARN_MM = 35           # min tile width above which it is only flagged
EDGE_LOSS = 0.25            # share of drawn edges lost when colour layers merge
HIDDEN = 0.5                # share of a layer hidden inside the layers under it
SOLID_FILL = 0.85           # fill fraction above which nothing useful remains

# Checked by eye on sheets/collapse.png: of the tiles the edge-loss rule flags, these are the
# ones whose DESIGN is genuinely gone in one colour rather than merely different from the
# website preview. This list is a human judgement and is the least defensible part of the set.
LOST = {'concentric-circles-6', 'circles-11', 'diamonds-6', 'egyptian-2', 'egyptian-6',
        'waves-14', 'stripes-2', 'japanese-pattern-7'}

# Verified by thick.py: their strokes meet once the rib is thick, so the cut holds together.
CUT_NEEDS_THICK_RIB = {'triangles-5', 'diamonds-15'}

P = {p['slug']: p for p in json.load(open('patterns.json'))}
A = {a['slug']: a for a in json.load(open('analysis.json'))}
M = json.load(open('meta.json'))
out = []
for m in M:
    a = A[m['slug']]
    stroke = m['mode'] != 'fill'
    if stroke:      # a stroke tile's rib is a mm setting here, so only its gaps constrain size
        tb = a['thinBg']
        need = None if tb is None else m['w'] * 2 * MIN_FEATURE / (tb + 1)
    else:
        need = max(x for x in (a['tileMmFg'], a['tileMmBg']) if x is not None)
    need = round(need, 1)
    fragmented = lambda p: p['share'] < 0.8 or not (p['spansX'] and p['spansY'])
    nocut = (not a['fg']['connected'] and not a['bg']['connected']
             and fragmented(a['fg']) and fragmented(a['bg']))
    v = []
    if m['slug'] in LOST: v.append('lost')
    elif a['edgeLoss'] >= EDGE_LOSS or a['hidden'] >= HIDDEN: v.append('recolour')
    if need > TOO_FINE_MM: v.append('fine')
    elif need > FINE_WARN_MM: v.append('fine?')
    if nocut: v.append('nocutThin' if m['slug'] in CUT_NEEDS_THICK_RIB else 'nocut')
    if a['fill'] > SOLID_FILL: v.append('solid')
    tier = 'drop' if ({'lost', 'fine', 'solid'} & set(v)) else ('limited' if v else 'good')
    out.append(dict(slug=m['slug'], title=m['title'], mode=m['mode'], layers=m['nLayers'],
                    w=m['w'], h=m['h'], needMm=need, fill=a['fill'], edgeLoss=a['edgeLoss'],
                    hidden=a['hidden'], fgConn=a['fg']['connected'], bgConn=a['bg']['connected'],
                    seamOverflow=a['seam'] > 0.002, fillRule=a.get('fillRule', 0),
                    verdict=v, tier=tier, tags=m['tags'], path=P[m['slug']]['path']))
json.dump(out, open('final.json', 'w'))
print(Counter(o['tier'] for o in out), Counter(x for o in out for x in o['verdict']))
