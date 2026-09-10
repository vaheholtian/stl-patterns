"""Before/after images of measured STL meshes for the 2026-09-09 fixes: the same CPU rasterizer and
cameras as the audit's render.py, applied to the saved controls (box corner at scale 0.6, the 135°
plate) and the four-wall ring results. Aligned pairs: before on the left, after on the right.
Run from the repository root:  python planning/box50-review-2026-09-09/expanded/render-after.py
"""
from pathlib import Path
import sys, json
import numpy as np
from PIL import Image, ImageDraw
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import render as R  # the audit's rasterizer (module-level code only defines functions)

OUT = HERE / 'after-final' / 'images'; OUT.mkdir(parents=True, exist_ok=True)
BEFORE = HERE.parent / 'meshes'; AFTER = HERE / 'after-final' / 'meshes'

def pair(name, before, after, target, span, w, h, mode, caption_b, caption_a, title, sub):
    tb, ta = R.read_stl(before), R.read_stl(after)
    canvas = Image.new('RGB', (2 * w + 60, h + 170), (247, 247, 247)); d = ImageDraw.Draw(canvas)
    canvas.paste(R.view(tb, target, span, w, h, mode), (20, 110))
    canvas.paste(R.view(ta, target, span, w, h, mode), (w + 40, 110))
    d.text((32, 18), title, font=R.font(28), fill='#203448')
    d.text((32, 60), sub, font=R.font(19), fill='#465b65')
    d.text((36, h + 120), 'BEFORE  ' + caption_b, font=R.font(20), fill='#ad3b23')
    d.text((w + 56, h + 120), 'AFTER  ' + caption_a, font=R.font(20), fill='#1d7a3c')
    canvas.save(OUT / f'{name}.png'); print(name)

def single(name, path, views, mode, title, sub, caption):
    t = R.read_stl(path)
    w = sum(v[3] for v in views) + 20 * (len(views) + 1); h = max(v[4] for v in views)
    canvas = Image.new('RGB', (w, h + 170), (247, 247, 247)); d = ImageDraw.Draw(canvas); x = 20
    for target, span, vw, vh, label in [(v[0], v[1], v[3], v[4], v[2]) for v in views]:
        canvas.paste(R.view(t, target, span, vw, vh, mode), (x, 110)); d.text((x + 8, h + 120), label, font=R.font(20), fill='#203448'); x += vw + 20
    d.text((32, 18), title, font=R.font(28), fill='#203448'); d.text((32, 60), sub, font=R.font(19), fill='#465b65')
    d.text((32, h + 148), caption, font=R.font(17), fill='#465b65')
    canvas.save(OUT / f'{name}.png'); print(name)

probes_b = {(r.get('body'), r.get('scale'), r.get('angle'), r.get('mode')): r for r in json.loads((HERE.parent / 'ridge-probe.json').read_text(encoding='utf-8'))}
probes_a = {(r.get('body'), r.get('scale'), r.get('angle'), r.get('mode')): r for r in json.loads((HERE / 'after-final' / 'probes.json').read_text(encoding='utf-8')) if not r.get('kind')}
b = probes_b[('box50', 0.6, None, None)]; a = probes_a[('box50', 0.6, None, 'emboss')]
pair('box-corner-scale0.6-emboss', BEFORE / 'control-box50-scale0.6-emboss.stl', AFTER / 'control-box50-scale0.6-emboss.stl', [50, 0, 25], 6, 700, 620, 'emboss',
     f"corner at ({b['actual'][0]:.2f}, {b['actual'][1]:.2f}): {b['missingHeight']:.2f} mm short on each axis", f"corner at ({a['actual'][0]:.2f}, {a['actual'][1]:.2f}): exact",
     'Filled 0.8 mm emboss on the 50 mm box, tile scale 0.6 — shared corner, magnified', '2.5 mm margin, 1.6 mm shell. Gold: geometry outside the original wall planes. Expected apex (50.8, -0.8).')
b = probes_b[('plate 135°', 1, 135, None)]; a = probes_a[('plate 135°', 1, 135, None)]
pair('plate-135-emboss', BEFORE / 'control-filled-135-emboss.stl', AFTER / 'control-filled-135-emboss.stl', [0, 1, 5], 8, 700, 620, 'plate',
     f"ridge at y={b['actualRidgeY']:.3f}: {b['missingHeight']:.2f} mm missing", f"ridge at y={a['actualRidgeY']:.3f}: exact", 'Filled 0.8 mm emboss over a 135° bend (8 mm plates) — ridge, magnified', f"Expected apex y = 0.8 / cos(67.5°) = {b['expectedRidgeY']:.4f} mm")
for gen in ['honeycomb', 'celtic', 'voronoiTile', 'penroseApproximant']:
    for mode in ['cut', 'emboss', 'recess']:
        p = AFTER / f'{gen}-ring-{mode}.stl'
        if not p.exists(): continue
        rec = next((json.loads(l) for l in (HERE / 'after-final' / f'ring-{gen}.jsonl').read_text(encoding='utf-8').splitlines() if l.strip() and json.loads(l).get('mesh') == f'meshes/{gen}-ring-{mode}.stl'), {})
        closure = next((c for c in rec.get('creases', []) if c.get('closure')), {})
        single(f'ring-{gen}-{mode}', p, [([25, 25, 25], 98, 'whole ring', 700, 560), ([0, 0, 25], 27, 'closing edge (x=0, y=0), magnified', 520, 560)], mode,
               f'{gen} / {mode.upper()} / four outer walls as one periodic sheet, rotation 0°', f"2.5 mm margin, scale 1, depth 0.8 mm, 1.6 mm shell. {rec.get('notes', [''])[0] if rec.get('notes') else ''}",
               f"closing edge joined: {rec.get('closureJoined')} walls · material parts: {rec.get('materialParts')} · closing edge 2D/3D disagreement: {closure.get('longestRun', '?')} / {closure.get('threeD', '?')} mm · mesh {rec.get('roundtrip')}")
