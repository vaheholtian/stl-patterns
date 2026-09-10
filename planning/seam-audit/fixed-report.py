"""Summarize the fixed runs without touching historical audit artifacts."""
import io
import json
import re
from pathlib import Path
import fitz
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent
out = root / 'fixed'
catalog = json.loads((root / 'catalog.json').read_text(encoding='utf-8'))
rows = []
for g in catalog:
    cases = [json.loads(l) for l in (out / (g['id'] + '.jsonl')).read_text(encoding='utf-8').splitlines()]
    assert len(cases) == g['expectedCases']
    assert [r['index'] for r in cases] == list(range(g['expectedCases']))
    rows.extend(dict(id=g['id'], **r) for r in cases)
raw = [json.loads(l) for l in (out / 'raw-results.jsonl').read_text(encoding='utf-8').splitlines()]
targeted = json.loads((out / 'targeted-results.json').read_text(encoding='utf-8'))
layout = json.loads((out / 'layout-results.json').read_text(encoding='utf-8'))
retry = json.loads((out / 'retry-results.json').read_text(encoding='utf-8'))
summary = {
    'patterns': len(catalog),
    'pipeline': {'cases': len(rows), 'seamFailures': sum(bool(r.get('fail')) for r in rows), 'rejected': sum('error' in r for r in rows), 'empty': sum(bool(r.get('empty')) for r in rows)},
    'raw': {'cases': len(raw), 'incomplete': sum(bool(r.get('fail')) for r in raw), 'rejected': sum('error' in r for r in raw)},
    'targeted': {'cases': len(targeted), 'seamFailures': sum(bool(r.get('fail')) for r in targeted), 'rejected': sum('error' in r for r in targeted), 'empty': sum(bool(r.get('empty')) for r in targeted)},
    'layout': {'cases': len(layout), 'fitted': sum(r['claimedFitted'] for r in layout), 'falseFits': sum(r['claimedFitted'] and r['mismatches'] > 1 for r in layout)},
    'retry': retry['summary'],
    'rejections': {
        'pipeline': [r for r in rows if 'error' in r],
        'raw': [r for r in raw if 'error' in r],
        'targeted': [r for r in targeted if 'error' in r],
        'retry': [dict(n=r['n'], config=r['config'], error=next(e['error'] for e in r['events'] if e['event']=='error')) for r in retry['results'] if r['status']=='error'],
    },
}
for group in summary['rejections'].values():
    assert all('rib width' in r['error'].lower() and ('Hilbert' in r['error'] or 'Guilloche' in r['error']) for r in group)
assert not summary['pipeline']['seamFailures'] and not summary['raw']['incomplete'] and not summary['targeted']['seamFailures'] and not summary['layout']['falseFits']
assert retry['summary']['timeout'] == 0 and retry['sourceUnchanged']
(out / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')

# Inspect both standalone tiles and repeats, including guides on/off.
for mode in ['repeat', 'single']:
    for batch in range(3):
        subset = catalog[batch*10:(batch+1)*10]
        sheet = Image.new('RGB', (1500, 670), 'white')
        draw = ImageDraw.Draw(sheet)
        for i, g in enumerate(subset):
            svg = (out / (g['id']+'-4.svg')).read_text(encoding='utf-8')
            if mode == 'single':
                w, h = map(float, re.search(r'viewBox="0 0 ([\d.eE+-]+) ([\d.eE+-]+)"', svg).groups())
                svg = re.sub(r'viewBox="[^"]+"', f'viewBox="0 0 {w/3} {h/3}"', svg)
            svg = svg.replace('stroke="#ec4661"', 'stroke="none"')
            with fitz.open(stream=svg.encode(), filetype='svg') as doc:
                pix = doc[0].get_pixmap(matrix=fitz.Matrix(.32, .32))
            preview = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
            x, y = (i % 5)*300, (i // 5)*335
            sheet.paste(preview, (x, y+30))
            draw.text((x+6,y+8), g['name'], fill='black')
        sheet.save(out / f'{mode}-previews-{batch+1}.png')

html = '''<!doctype html><html lang="en"><meta charset="utf-8"><title>Verified pattern repeats</title>
<style>body{font:16px system-ui;margin:32px;color:#203448;background:#f7f8fa}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}svg{width:100%;height:auto;background:white}figure{margin:0}figcaption{font-weight:600;padding:12px 0}button{padding:8px 14px;margin:0 8px 20px 0}.hidden-guides svg>path{display:none}</style>
<h1>29 verified pattern repeats</h1><p>Exact final polygons. Default settings, cleanup 0.4 mm, inversion off, Seamless lock on. Red lines mark joins.</p>
<button onclick="document.body.classList.toggle('hidden-guides')">Toggle seam guides</button>
<button onclick="document.querySelectorAll('svg').forEach(s=>{const b=s.dataset.box.split(' ').map(Number);s.dataset.single=s.dataset.single==='1'?'0':'1';s.setAttribute('viewBox','0 0 '+b.map(v=>s.dataset.single==='1'?v/3:v).join(' '))})">Toggle single tile / 3 × 3</button><main>'''
for g in catalog:
    svg = (out / (g['id']+'-4.svg')).read_text(encoding='utf-8')
    box = re.search(r'viewBox="0 0 ([^"]+)"', svg)[1]
    svg = svg.replace('<svg ', f'<svg data-box="{box}" ',1).replace('id="tile"',f'id="{g["id"]}"').replace('href="#tile"',f'href="#{g["id"]}"')
    html += f'<figure>{svg}<figcaption>{g["name"]}</figcaption></figure>'
(out / 'gallery.html').write_text(html+'</main></html>',encoding='utf-8')
print(json.dumps({k:v for k,v in summary.items() if k!='rejections'},indent=2))
