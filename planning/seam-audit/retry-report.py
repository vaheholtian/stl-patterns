"""Validate extended retries and render a standalone report from their exact polygons."""
import html
import io
import json
from pathlib import Path
import fitz
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent
data = json.loads((root / 'retry-results.json').read_text(encoding='utf-8'))
originals = json.loads((root / 'timeout-cases.json').read_text(encoding='utf-8'))
rows = data['results']
assert data.get('finishedAt'), 'Retry run is still in progress'
assert data['sourceUnchanged'], 'Application source changed during the run'
assert len(rows) == len(originals) == 22
assert [r['n'] for r in rows] == list(range(22))
assert len({(r['source'], r['index']) for r in rows}) == 22
catalog = json.loads((root / 'catalog.json').read_text())
baseline_timeouts = {(g['id'], r['index']) for g in catalog for r in (json.loads(line) for line in (root / f"{g['id']}.jsonl").read_text().splitlines()) if r.get('timeout')}
baseline_timeouts |= {('targeted', i) for i, r in enumerate(json.loads((root / 'targeted-results.json').read_text())) if r.get('timeout')}
assert {(r['source'], r['index']) for r in rows} == baseline_timeouts
for r, original in zip(rows, originals):
    assert r['source'] == original['source'] and r['index'] == original['index']
    assert r['config'] == original['config']
    if r['source'] == 'targeted':
        baseline = json.loads((root / 'targeted-results.json').read_text())[r['index']]
        assert baseline == r['config']
    else:
        baseline = next(json.loads(line) for line in (root / f"{r['source']}.jsonl").read_text().splitlines() if json.loads(line)['index'] == r['index'])
        assert baseline['config'] == r['config']
    assert baseline.get('timeout'), 'A retried case was not an original timeout'
    assert r['budgetMs'] > r['originalBudgetMs']
    if r['status'] in ('completed', 'seam-failure'):
        result = next(e for e in r['events'] if e['event'] == 'result')
        assert len(result['edges']) == 2
        assert r['status'] == ('seam-failure' if result['fail'] else 'completed')
        assert (root / f"retry-{r['n']}.svg").exists()

summary = {s: sum(r['status'] == s for r in rows) for s in ('completed', 'seam-failure', 'error', 'timeout')}
assert summary == data['summary']
table = []
cards = []
completed = []
for r in rows:
    c = r['config']
    p = c['params']
    result = next((e for e in r['events'] if e['event'] == 'result'), None)
    generated = next((e for e in r['events'] if e['event'] == 'generated'), None)
    pipeline = next((e for e in r['events'] if e['event'] == 'pipeline'), None)
    last = r['events'][-1] if r['events'] else {}
    ident = f"{r['source']}/{r['index']}"
    detail = f"{p['width']} × {p['height']}"
    if r['source'] == 'targeted':
        detail += f", order {p['order']}, rounded {'on' if p['rounded'] else 'off'}"
    else:
        detail += f", invert {'on' if c.get('invert') else 'off'}"
    mismatch = f"{max(e['max'] for e in result['edges']):.6f}" if result else 'unmeasured'
    fill = f"{result['fillFraction'] * 100:.2f}%" if result else '—'
    rss = f"{last['peakRssBytes'] / 1024**2:.0f}" if 'peakRssBytes' in last else 'not captured'
    stage = f"{r['wallMs']/1000:.2f}"
    table.append(f"| {ident} | {detail} | {r['status']} | {stage} | {mismatch} | {fill} | {rss} |")
    if result:
        completed.append(r)
        cards.append(f'<article><h2>{html.escape(ident)}</h2><p>{html.escape(detail)} · {stage} s · feature {fill} · mismatch {mismatch} mm</p><a href="retry-{r["n"]}.svg"><img src="retry-{r["n"]}.svg" loading="lazy" alt="Exact 3 by 3 tiled geometry for {html.escape(ident)}"></a></article>')

empty = sum(next((e.get('empty', False) for e in r['events'] if e['event'] == 'result'), False) for r in rows)
almost_solid = sum(next((e.get('fillFraction', 0) > .98 for e in r['events'] if e['event'] == 'result'), False) for r in rows)
notes = []
for r in rows:
    if r['status'] == 'error':
        err = next((e for e in r['events'] if e['event'] == 'error'), {})
        notes.append(f"- **{r['source']}/{r['index']} is now a reproduced failure rather than an inconclusive timeout:** `{err.get('error', r.get('spawnError', 'process failure'))}` after {r['wallMs']/1000:.2f} seconds. Last recorded process RSS: {err.get('peakRssBytes', 0)/1024**3:.2f} GiB. Discard the failed kernel; do not continue other geometry on that instance.")
unresolved = ', '.join(f"{r['source']}/{r['index']}" for r in rows if r['status'] == 'timeout')
if unresolved:
    notes.append(f'- **Still inconclusive for seams at 180 seconds:** {unresolved}. These inputs need profiling, feasibility handling or bounded-work behavior; extending the UI wait is not a fix.')
if almost_solid:
    notes.append(f'- **{almost_solid} completed cases are almost solid.** The inspected Hilbert previews lose the space-filling-line appearance under these thick-stroke settings. Preserve this distinction in regression results, even when opposing boundaries match.')
notes.append('- The implementation order is captured in [FIX-PLAN.md](FIX-PLAN.md): strict regression contracts; invalid geometry and worker recovery; truthful wrap fitting; convex erosion; periodic cleanup; measured performance work; residual bridges; final all-pattern verification.')
text = f'''# Extended timeout retries — 7 September 2026

All **22 original timeouts** were retried at their exact recorded settings in fresh processes, with **180 seconds per case** instead of 8 seconds (targeted) or 20 seconds (broad sweep). Results: **{summary['completed']} completed with matching edge profiles, {summary['seam-failure']} seam failures, {summary['error']} {'error' if summary['error'] == 1 else 'errors'}, {summary['timeout']} remaining timeouts**.

Of the completed geometries, **{empty} were empty and {almost_solid} covered more than 98% of the tile**. Equal edges alone do not establish a usable pattern. These new measurements supplement the [original review](REPORT.md); its historical counts are unchanged. See the [prioritized fix plan](FIX-PLAN.md) and [exact repeated previews](retry-gallery.html).

## What the retries establish

{chr(10).join(notes)}

## Method and limits

- Reused the original generator resolution, seeded randomness, forced/optional mirrors, inversion, cleanup and bridge rules. Targeted Hilbert cases retain their original native-tile semantics. No source fixes or parameter substitutions were made.
- Two disposable child processes ran concurrently on {data['cpu'].strip()} with {data['logicalCpus']} logical CPUs, {data['platform']}, Node {data['node']}. Wall times include process startup and output writing and are not isolated performance benchmarks.
- Both final opposing edge profiles are compared without suppressing features under 0.35 mm. The longest continuous mismatch must be at most 0.02 mm. Exact mismatch extents and feature areas are stored in [retry-results.json](retry-results.json).
- Generation and full-pipeline stages are timed separately. For errors/timeouts, the last stage is recorded. A stalled pipeline does not by itself identify which internal boolean/offset operation is responsible.
- A separate [pre-kernel complexity probe](retry-complexity.json) measures generation and stroke assembly without booleans. Penrose emits 38,392 stroked loops / 691,056 stroke vertices after mirroring; several rounded Hilbert inputs emit 52,433 loops / 766,834 vertices. Creating these arrays took well under a second in the probe. This narrows the performance investigation to the subsequent geometry processing, without proving a particular kernel operation is at fault.
- Peak RSS is process resident memory reported by Node, not a measurement of retained WASM allocations. Timeout processes may not emit a peak measurement. High RSS plus a kernel abort does not prove the abort's internal cause.
- SHA-256 hashes of all application source files matched before and after the run. The baseline working tree already had uncommitted source changes.
- Completed output was rendered as exact 3 × 3 repeated SVG geometry. These are tile/pipeline checks; they do not verify browser responsiveness or physical STL wrap/export continuity.

## Results

“targeted” entries below are Hilbert, rib width 6 mm and cleanup 0.84 mm, seed 7. Other complete settings are in [timeout-cases.json](timeout-cases.json). Feature coverage refers to the region used by the pipeline, with inversion already applied.

| Original case | Requested settings (mm) | Result | Wall seconds | Max mismatch (mm) | Feature coverage | Peak RSS (MiB) |
|---|---|---|---:|---:|---:|---:|
{chr(10).join(table)}

## Reproduce

```powershell
node --import ./tests/register.mjs planning/seam-audit/retry-timeouts.mjs
python planning/seam-audit/retry-report.py
```

The runner writes incremental results, preserving the original broad and targeted logs. Use `--only=0,1 --jobs=1 --budget=180000 --output=retry-isolated-results.json` for selected isolated timing runs; numbers index `timeout-cases.json`. Keep the alternate output filename to preserve this complete retry record. The runner exits successfully when orchestration finishes, even if geometry fails; inspect its summary. The report generator asserts coverage and result consistency, not that all patterns are correct.
'''
(root / 'RETRY-REPORT.md').write_text(text, encoding='utf-8')
(root / 'retry-gallery.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><title>Extended retry previews</title><style>body{font:16px system-ui;margin:28px;background:#f3f5f7;color:#203448}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:22px}article{background:white;padding:18px;border:1px solid #ccd2d8}h2{font-size:18px}img{width:100%;height:320px;object-fit:contain}p{font-size:13px}</style><h1>Extended retry previews</h1><p>Exact final geometry repeated 3 × 3. Red guides locate the tile boundaries. Click a preview for its SVG.</p><main>' + ''.join(cards) + '</main></html>', encoding='utf-8')

# Render exact geometry into compact sheets for visual inspection.
for sheet_index, start in enumerate(range(0, len(completed), 8), 1):
    batch = completed[start:start+8]
    sheet = Image.new('RGB', (1200, 390 * ((len(batch) + 2) // 3)), '#f3f5f7')
    draw = ImageDraw.Draw(sheet)
    for j, r in enumerate(batch):
        doc = fitz.open(root / f"retry-{r['n']}.svg")
        page = doc[0]
        scale = min(370 / page.rect.width, 310 / page.rect.height)
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        preview = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
        x, y = (j % 3) * 400, (j // 3) * 390
        sheet.paste(preview, (x + (400 - preview.width) // 2, y + 65 + (310 - preview.height) // 2))
        p = r['config']['params']
        res = next(e for e in r['events'] if e['event'] == 'result')
        draw.text((x + 12, y + 12), f"{r['source']}/{r['index']} - {r['wallMs']/1000:.1f}s", fill='#203448')
        draw.text((x + 12, y + 30), f"{p['width']} x {p['height']} mm; feature {res['fillFraction']*100:.2f}%", fill='#203448')
        doc.close()
    sheet.save(root / f'retry-previews-{sheet_index}.png')
print(json.dumps({'verifiedRetryCases': len(rows), **summary, 'empty': empty, 'almostSolid': almost_solid, 'sourceUnchanged': data['sourceUnchanged']}))
