from pathlib import Path
import json, collections, hashlib
ROOT=Path(__file__).resolve().parent
rows=[json.loads(l) for p in ROOT.glob('*.jsonl') for l in p.read_text().splitlines()]
counts=collections.Counter(r['kind'] for r in rows)
picker=[r for r in rows if r['kind']=='picker-solid']
ids=list(dict.fromkeys(r['id'] for r in picker))
table=[]
for id in ids:
    parts={r['mode']:r['keptParts'] for r in picker if r['id']==id}
    inverted=next(r['keptParts'] for r in rows if r['kind']=='extra-solid' and r['id']==id and r['mode']=='cut')
    kind=next(r['repeatKind'] for r in rows if r['kind']=='fixture' and r['id']==id)
    table.append(f'| {id} | {kind} | {parts["cut"]} | {parts["recess"]} | {parts["emboss"]} | {inverted} |')
summary={'counts':dict(counts),'generators':len(ids),'solidExecutions':sum(counts[k] for k in ['solid','angle-solid','extra-solid','ring-solid','picker-solid','fine-solid']),'fixtureSha256':hashlib.sha256((ROOT/'../../fixtures/box-50.stl').read_bytes()).hexdigest(),'images':len(list((ROOT/'images').glob('*.png'))),'errors':[r for r in rows if r.get('error')],'tileMaxMismatchMm':max(e['max'] for r in rows if r['kind']=='tile' for e in r['edges']),'footprintSamples':sum(r['samples'] for r in rows if r['kind']=='footprint'),'footprintDifferences':sum(r['mismatches'] for r in rows if r['kind']=='footprint'),'angleScreenFlags':sum(r['longestRun']>1 for r in rows if r['kind']=='angle-solid')}
(ROOT/'summary.json').write_text(json.dumps(summary,indent=2))
report='''# Pattern tiling review — 50 mm container, 1.6 mm shell

Reviewed the current working tree on 2026-09-09, including its existing uncommitted corner-unfolding changes. Application source and existing tests were not changed. All findings below are reproducible with the saved review scripts.

**Verdict:** the flat tile boundaries and pattern phase across two adjacent box faces match in the tested settings, but the finished geometry is not seamless under every setting. A confirmed relief notch is invisible to the existing original-surface seam metric. Physical margins also change with scale, and a four-wall wrap leaves a closure seam.

## Open the results

- [Full image gallery](gallery.html): every built-in pattern; actual final STL geometry; whole-box and magnified corner views. Picker-default results come first, followed by non-inverted, rotated, inverted and selected fine-scale results.
- [Cutout contact sheet](contact-cut.png), [emboss contact sheet](contact-emboss.png), [recess contact sheet](contact-recess.png).
- [Dimensioned emboss-notch cross-sections](emboss-notch-sections.png).
- [Machine-readable summary](summary.json); individual generator JSONL files contain settings, raw seam measurements, component counts and STL round-trip results.

The contact sheets use the same invert/Connect material choices as selecting each generator in PatternScreen. Application layout settings are explicitly set to a 2.5 mm margin, scale 1, rotation 0, depth 0.8 mm, wall thickness 1.6 mm. Images labeled **baseline, non-inverted** deliberately use invert off, which differs from the picker defaults for many line patterns. Gold in emboss images identifies geometry outside the original two wall planes; it is a diagnostic material color, not an additional object. All images are depth-buffered renders of measured STL geometry, not generated illustrations.

## Confirmed findings

### HIGH — emboss tools do not reach the mitre at reduced scale or sharp bends

**Sources:** [TilePanel.tsx:88](../../src/app/panels/TilePanel.tsx#L88), [layout.ts:195](../../src/geom/layout.ts#L195), [layout.ts:230](../../src/geom/layout.ts#L230).

The caller passes physical depth directly as `foldExtend`, while the strip is constructed in the scaled UV coordinates. It also omits the bend-angle factor needed to reach the bisector. A watertight result can therefore contain a continuous notch along its raised corner.

On the exact box fixture with a uniformly filled diagnostic tile, depth **0.8 mm** and scale **0.6**, the expected outer corner at z=25 is `(50.8, -0.8, 25)`. The measured first hit is `(50.48, -0.48, 25)`: **0.32 mm short on each axis**, or about 0.453 mm along the diagonal. Scale 1 is the positive control and reaches the expected corner to within 0.000001 mm.

At a **135° change in face normals** (45° included angle), depth 0.8 and scale 1, the intended apex is y=2.0905; the actual ridge is y=0.8659: **1.2246 mm missing height**. These diagnostic plates are 8 mm thick to isolate the extension defect from thin-wall effects. The separate angle sweep uses 1.6 mm plates.

**Suggested fix:** derive each fold's required physical reach from its face normals, signed operation offsets and mitre plane, then convert that distance to the local UV scale. For the symmetric convex emboss reproduction the extension is `depth * tan(bend / 2)` in physical units. Recheck concave folds and inward cuts separately rather than assuming the same sign/distance works for every mode.

**Evidence:** [ridge-probe.json](ridge-probe.json), [ridge-probe.ts](ridge-probe.ts), [cross-sections](emboss-notch-sections.png), [fine honeycomb emboss](images/honeycomb-fine-picker-emboss.png).

### MEDIUM — the margin value scales with the pattern instead of staying in millimetres

**Source:** [layout.ts:166](../../src/geom/layout.ts#L166).

The untouched edge band is stroked with `2 * settings.margin` in scaled UV coordinates. With a requested 2.5 mm margin, the exact box's actual pattern bounds are:

| Pattern scale | Actual bottom/top band | Pattern z range |
|---|---:|---|
| 0.6 | 1.50 mm | 1.50–48.50 mm |
| 1.0 | 2.50 mm | 2.50–47.50 mm |
| 1.7 | 4.25 mm | 4.25–45.75 mm |

Reducing pattern scale thins the requested structural border; enlarging it creates an unexpectedly wide blank band. Convert the margin from physical millimetres to the local UV metric, and test physical distances after mapping. The control isolates the in-face layout margin; it does not assert that out-of-face fold extensions respect that band.

**Evidence:** `physical-margin` records in [diagnostics.jsonl](diagnostics.jsonl).

### MEDIUM — the four-wall wrap does not close periodically

**Source:** [regionFlatten.ts:527](../../src/geom/regionFlatten.ts#L527).

`unfoldSheets` joins a spanning tree: it only processes edges between an already placed face and an unplaced face. Once four walls are placed, the remaining vertical edge is not joined and the 200 mm circumference is not supplied as a wrap period. This is an implementation limitation, not an unavoidable property of a four-wall box ring.

With a 2.5 mm margin, that last edge receives a blank band on both sides; a zero mismatch count there means both sides are blank. At margin 0 and rotation 37°, honeycomb's finished embossed closure has a **3.7 mm** mismatch run; Penrose approximant has **2.5 mm**. The other three folds have matching layout frames.

**Suggested fix:** represent the closure as a periodic constraint and fit compatible lattice directions to the 200 mm circumference, or explicitly identify the closure cut in the preview and warn when rotation cannot close it. Merely enabling Join edges / Fit seam does not make this four-wall case periodic today.

**Evidence:** `ring-solid` records in [extra.jsonl](extra.jsonl), including per-edge 2D/3D measurements; ring STL files in [meshes](meshes/).

### Cutout suitability — seven picker defaults leave loose material

**Relevant behavior:** [PatternScreen.tsx:379](../../src/app/PatternScreen.tsx#L379) chooses inversion/bridges; [geom.worker.ts:51](../../src/worker/geom.worker.ts#L51) only removes islands below the configured volume, which defaults to 5 mm³. It does not join retained islands.

The picker-default cut results retain **Delaunay 122**, **Penrose approximant 157**, **Moiré 116**, **Hyperbolic 62**, **Penrose 69**, **Truchet 5**, and **Guilloche 3** material components. These are watertight meshes containing disconnected solids, not single printable containers. This is a pattern/inversion/connectivity limitation, distinct from a phase seam. The images preserve those islands instead of hiding the problem by keeping only the largest component.

Every picker-default emboss and recess result in this particular box matrix retains one component. Many line patterns that fragment when non-inverted produce one container with the picker-selected inversion; Celtic is one such example. For retained islands, consider inversion, material bridges, or a deliberate design change. Component counts alone do not prove that remaining ribs meet a printer's minimum strength requirements.

## Coverage and results

- Exact input: `fixtures/box-50.stl`, bounds 0–50 mm on each axis, 28 triangles, volume 18,992.377 mm³; outer adjacent walls selected by position and normal. The fixture was read, not regenerated.
- **142/142 existing tests passed**, including crease, periodic cleanup, cylindrical seam, whole-body and repeat audits. Fresh test output is saved in `scratch/box50-review-tests.log`.
- **29 generators × 8 configurations = 232 tile-edge runs**, Seamless enabled. Maximum opposite-edge interval discrepancy: **0.000091 mm**, below the 0.02 mm audit tolerance. Seamless mode may lock generator settings or force mirroring; this does not imply that medallions/bands become visually homogeneous fields.
- **1,392 layout cases**, covering two box faces, all four walls, and bends of 45°, 90°, 135° and −90°. Across 2,088 measured edges, joined folds have no unexplained sampled layout mismatch. The ring closure is classified separately.
- **551 primary final-solid executions** on adjacent box faces: all have `NoError`, valid STL round-trip import and zero unexplained original-surface seam mismatch. These results do **not** override the independently confirmed raised-apex defect.
- **261 additional final-solid executions** on 1.6 mm bent plates: all complete with `NoError`; 41 original-level comparison flags exceed 1 mm. These are screening flags, not 41 independently proven bugs: near a concave fold, a normal ray can intersect the neighboring relief, and thin cut patterns can lose islands. The report only elevates separately verified defects.
- **58 inverted outputs**, **16 four-wall outputs**, **87 picker-default outputs**, and **6 fine-scale picker outputs**, for **979 solid executions** in the JSONL evidence, plus 12 dimensional ridge controls.
- **180,969 independently sampled footprint points** on exported baseline/rotated meshes. 414 differ from the intended pre-filter footprint. All saved representative points (88 across 12 flagged cases) still have their original material in the raw and simplified solids; that material disappears after the app-equivalent island filter. This confirms a cleanup consequence in those inspected examples, not a phase mismatch. See `footprint-attribution` records.
- Broken-layout controls (Join edges off) detect 4.4–4.9 mm mismatch runs. This verifies that the seam comparison can detect a real phase break.

The eight main configurations vary rotations 0/17/23/37/90°, scales 0.6/1/1.7, margins 0/2.5/4 mm, depth 0.4/0.8/1.2 mm, seeds 1/7/42, a 23×37 mm rectangular tile, mirroring, inversion, a fitted single copy, and detail 1/2. Recess is included for the baseline, 37° and mirrored configurations; other main configurations include cut and emboss. Baseline line width is 0.42 mm and cleanup minimum feature is 0.84 mm. Native generator parameter extrema and every possible combination were not exhaustively enumerated.

The gallery contains **341 full-resolution result images**, each with two views, plus three contact sheets and the dimensioned cross-section figure. Exported STL files are linked beside their images. The saved controls add four more STL files without standard gallery cards. Final verification reopened **all 345 exported STL files** successfully with positive volume, decoded **all 345 PNG files**, and checked **1,029 gallery links** with none missing. Evidence: [verification.json](verification.json) and [image-verification.json](image-verification.json).

## Per-pattern connected components

The first three numeric columns use actual picker-selected inversion/bridges at rotation 0°. The last column is an additional **invert=true, rotation 37°, no added bridges** cut test; it is not a controlled inversion-only comparison. A value above 1 means retained loose material. All these meshes returned `NoError`.

| Pattern | Repeat character | Picker cut | Picker recess | Picker emboss | Inverted 37° cut |
|---|---|---:|---:|---:|---:|
'''+ '\n'.join(table)+'''

## Measurement limits and reproduction

The primary seam measure samples every 0.1 mm, 0.02 mm inside each face for layout and 0.05 mm for original-level solid comparisons. It discounts a feature outline that crosses the sampling band. That is useful for phase continuity but can miss symmetric underfill. The new dimensional controls measure the actual outer ridge against a known physical offset and demonstrate why an additional depth/envelope assertion is necessary in [tests/crease.test.ts:198](../../tests/crease.test.ts#L198).

The review harness uses the production pattern generation, flattening, layout, surface-tool and mitre functions. Final planar solids receive the same 0.005 mm simplification and 5 mm³ island cutoff as the worker. It does not exercise browser event handling, live preview timing, the separate surface-native 3D Voronoi workflow, arbitrary imported SVG artwork, slicing, or physical printing. The filled SVG is only a geometry diagnostic. Rendered images are CPU views of exported solids, not browser screenshots. No production fixes were applied.

Run from the repository root:

```powershell
npm test
node --import ./tests/register.mjs planning/box50-review-2026-09-09/batch.mjs
node --import ./tests/register.mjs planning/box50-review-2026-09-09/extra.ts
node --import ./tests/register.mjs planning/box50-review-2026-09-09/ridge-probe.ts
node --import ./tests/register.mjs planning/box50-review-2026-09-09/diagnostics.ts
python planning/box50-review-2026-09-09/render.py
python planning/box50-review-2026-09-09/sections.py
python planning/box50-review-2026-09-09/report.py
node --import ./tests/register.mjs planning/box50-review-2026-09-09/verify.ts
python planning/box50-review-2026-09-09/verify-images.py
```

The batch runner isolates each generator in a Node process with an 8-minute timeout and records exit status. All 29 exited normally. `helpers.ts` is a review snapshot of the existing crease harness; its plate selection excludes far end faces that can share another test face's normal. Rendering uses the locally installed NumPy, Numba, Pillow and Matplotlib packages.
'''
(ROOT/'REPORT.md').write_text(report,encoding='utf8')
gallery=ROOT/'gallery.html'
html=gallery.read_text(encoding='utf8')
marker='<aside style="background:#fff4e9;padding:18px;margin:18px 0"><strong>Review findings:</strong> reduced scale / sharp bends can notch embosses; physical margins scale; four-wall wraps retain a closure seam. Seven picker-default cuts leave loose parts. <a href="REPORT.md">Read the evidence</a> · <a href="emboss-notch-sections.png">See dimensioned notch</a>.<br>The surface-level mismatch number on each image does not test the raised apex. Baseline means non-inverted; picker-default uses the application’s generator choices.</aside>'
if '<aside ' not in html:html=html.replace('<nav>',marker+'<nav>')
gallery.write_text(html,encoding='utf8')
print(json.dumps(summary,indent=2))
