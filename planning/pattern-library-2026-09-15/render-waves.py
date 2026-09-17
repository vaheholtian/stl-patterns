import importlib.util, sys
from pathlib import Path
from PIL import Image, ImageDraw
spec = importlib.util.spec_from_file_location('r', str(Path(__file__).parent.parent / 'box50-review-2026-09-09' / 'render.py'))
R = importlib.util.module_from_spec(spec); spec.loader.exec_module(R)
out = Path(__file__).parent / 'out'
canvas = Image.new('RGB', (1640, 760), (247, 247, 247)); d = ImageDraw.Draw(canvas)
for i, rot in enumerate([0, 90]):
    tris = R.read_stl(out / f'box50-waves1-cut-rot{rot}.stl')
    canvas.paste(R.view(tris, [25, 25, 25], 95, 800, 660, 'cut'), (i * 820, 60))
    d.text((i * 820 + 20, 20), f'Waves-1 through-cut, rotation {rot} deg', font=R.font(26), fill='#203448')
canvas.save(Path(__file__).parent / 'sheets' / 'waves-cut-views.png')
print('ok')
