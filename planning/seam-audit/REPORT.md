# Seamlessness review — 7 September 2026

Follow-up: [extended timeout retries](RETRY-REPORT.md) and [prioritized fix plan](FIX-PLAN.md). The counts below preserve the original audit baseline.

All 29 generators were reviewed. Normal defaults repeat successfully with the application's Seamless lock, including its forced mirrors. **Not all supported settings are seamless.** Rotated surface wraps, filled Penrose settings, very thick Guilloche strokes, and small cleanup artifacts need attention.

Application source was left unchanged. The workspace already contained uncommitted generator, geometry, UI, worker, and test changes when this review began; this audit tests that working tree.

## Evidence and coverage

- Existing suite: **115 passed, 0 failed**, approximately 168 seconds. `npm run build` also succeeded; Vite emitted compatibility and bundle-size warnings.
- Full pipeline: **1518 cases attempted across 29 patterns; 3 seam failures, 1 generation errors, and 7 timeouts**. Both opposing edges are measured from final feature polygons, accepting no continuous mismatch longer than 0.02 mm. Segments/gaps are merged only within 0.000001 mm, rather than discarding everything under 0.35 mm.
- Raw geometry: **344 cases; 9 incomplete periodic outputs and 3 geometry-engine aborts**. Compare the generator's cropped geometry with a union of its 3 × 3 translated copies, before seam repair or simplification. Missing area above 0.05 mm² fails. These checks apply to natively seamless configurations; forced-mirror families are covered by the full pipeline sweep.
- Targeted Penrose/Hilbert combinations: **114 cases attempted; 13 seam failures, 0 errors, and 15 timeouts**. An additional 25 diagnostic cases varied cleanup for confirmed reproductions.
- Surface layout: **108 cases; 69 falsely reported fitted wraps**. Three actual generators, rotations 0/15/30/45/90/180°, scale 0.5/1/2, two origins, and 500 sample pairs per wrap. All 18 zero-rotation cases matched. The fixture is an isometric developed 100 × 50 mm surface with paired wrap boundaries; it isolates layout math from flattening distortion.

The full sweep includes native/forced mirroring and optional mirroring, both invert settings, cleanup widths 0/0.4/0.84/1.6 mm, material bridging, generator defaults, each numeric minimum/maximum, all select/boolean alternatives, seeds 0/1/7/42/999999, requested sizes 5×5/5×300/300×5/23×37/100×45/300×300 mm, and 12 deterministic multi-parameter samples per generator. Locked parameters are resolved through the actual application store. Snapped output dimensions are used for assertions and recorded for every case. Width/height settings that a family intentionally derives (e.g. square Pell repeats) are not falsely treated as independently honored.

**84 full-sweep outputs were empty.** They have no mismatched seam but are not evidence of a usable pattern. Cleanup can erase a feature when strokes/details are smaller than its threshold. Raw and targeted checks prevent these empty outputs from masking the reported defects.

Two long-lived sweeps were interrupted after individual Guilloche/Hilbert cases had run for several minutes. Unfinished cases were retried in fresh child processes, with a 20-second full-pipeline budget and an 8-second targeted budget. Timed-out cases are **inconclusive for seam correctness**, not passes or confirmed seam defects. They remain useful responsiveness findings; see their exact settings in the recorded results.

## Findings

### High: rotating a surface wrap defeats seam fitting while the UI reports success

Location: [layout.ts:92](../../src/geom/layout.ts#L92), together with the already rotated period returned by `buildParameterization`.

The period is rotated into tile coordinates, then rotated back by `-rotationDeg` before testing whether its vertical component is zero. This cancels the very rotation that should prevent horizontal-only fitting. The code stretches x and claims an integer repeat count even when the actual period is not a tile-lattice vector.

Reproduce with Square grid, requested tile 23 × 37 mm, a 100 mm wrap, rotation 30°, scale 1, origin (0,0), Fit seam enabled. The result reports “4 repeats around the seam” but its actual phase is (3.464102, 1.315789) tiles. **355 of 500 opposing seam samples disagree.** This is a shared layout defect, not a particular generator defect.

Recommendation: evaluate the period in the coordinates actually used for tile placement. Skip unsupported rotations with an accurate message, or fit both period components to integer tile counts. Test phase/geometry equality rather than the reported repeat count alone. Evidence: [layout-results.json](layout-results.json).

### High: Guilloche can abort the shared geometry engine at allowed settings

Locations: [guilloche.ts:107](../../src/patterns/guilloche.ts#L107), [pipeline.ts:197](../../src/patterns/pipeline.ts#L197), and the cached module in [manifold.ts:11](../../src/geom/manifold.ts#L11).

Set width=5, height=5, ribWidth=6, leaving rosette defaults. `tileToCrossSection` raises **`RuntimeError: Aborted()`** for cleanup 0, 0.2, 0.4, **0.84 (default)**, and 1.6 mm. Raw checks also reproduce it for 5 × 61 and 61 × 5 mm. The rosette radius bottoms out at 0.5 mm even when the stroke exceeds the tile, creating extreme overlapping offset geometry. The same aborted WASM instance rejects subsequent operations; the app caches this instance, so recovery needs attention as well.

Recommendation: constrain or explicitly handle strokes wider than the available motif/tile space before passing them to the kernel, and recover the geometry module after a fatal abort. Evidence: [reproductions.json](reproductions.json) and [raw-results.jsonl](raw-results.jsonl). The raw harness resets the module after aborts; later patterns were not counted as failures merely because a prior case poisoned the instance.

### High: filled Penrose rhombi can expand after collapse and break the repeat

Locations: [penrose.ts:234](../../src/patterns/penrose.ts#L234), used by [penroseApproximant.ts:326](../../src/patterns/penroseApproximant.ts#L326).

`insetConvex` accepts an inset whenever its signed area retains the original sign. Once an inset passes the inradius, both dimensions can flip and the resulting shape grows again with the same winding. For example, insetting a 1 × 1 square by 2 returns vertices (2,2), (-1,2), (-1,-1), (2,-1): a **3 × 3 square instead of an empty result**. Expanded rhombi invalidate the generator's bounded neighbor selection and become overlapping EvenOdd geometry.

Visible reproduction: Penrose seamless, **thin rhombi, width=23, height=37, gap=5, seed=7, cleanup=0.84**, other defaults. Actual snapped size is 23 × 31.656784 mm; a left/right seam interval differs by **1.334441 mm**. At width=40, height=37, gap=5 and cleanup=0.2, thin/all styles have mismatches as large as **3.892993 mm**. These settings are within the UI's controls.

Recommendation: implement an actual convex erosion or verify every reconstructed vertex against every inward-offset half-plane; reject collapsed insets. Then audit periodic completeness after applying the gap. Evidence: [visible repeated preview](penrose-visible-seam.svg), [targeted-results.json](targeted-results.json).

### Medium: cleanup still creates small unmatched edge features that existing tests ignore

Locations: [pipeline.ts:220](../../src/patterns/pipeline.ts#L220) through final stitching/simplification; [seamless.test.ts:39](../../tests/seamless.test.ts#L39).

Concrete reproductions, inversion/mirror/bridges off unless forced, with other generator values at defaults:

| Generator | Settings | Cleanup | Longest mismatched interval |
|---|---|---|---:|
| Voronoi | 40 × 40, relax=0, seed=7 | 0.4 mm | 0.043879 mm |
| Penrose seamless, edges | 40 × 40 requested, ribWidth=0.4, seed=7 | 0.4 mm | 0.104317 mm |
| Moiré, lines | 61 × 11, angleA=40°, angleB=-2°, seed=7 | 0.84 mm | 0.099572 mm |

These are much smaller than the major Penrose and wrap defects; treat them as strict seam/precision failures, not equally large visible gaps. The existing broad test merges gaps below 0.35 mm and discards intervals below 0.35 mm, so it reports these as passing. Voronoi's reproduction matches at cleanup 0/0.2/0.84/1.6 and fails at 0.4, confirming a cleanup-sensitive result.

Recommendation: retain narrow intervals in tests; measure mismatched extent with an explicit tolerance, and verify final profiles after all boolean/simplification steps. Evidence: per-generator JSONL files and [reproductions.json](reproductions.json).

### Medium: Hilbert's narrow-tile stroke assumptions can reverse its grid and lose the seam

Location: [hilbert.ts:123](../../src/patterns/hilbert.ts#L123). Width=61, height=5, ribWidth=6, order=4, rounded=true produces a negative vertical grid step. Raw periodic completion is missing 0.168480 mm²; final top/bottom mismatch at cleanup=0 is up to 0.523734 mm. Cleanup ≥0.2 masks that particular boundary defect but leaves the tile almost entirely filled. A second reproduction at **width=23, height=5, ribWidth=6, order=4, rounded=true and default cleanup=0.84** still has a **0.057424 mm** top/bottom mismatch. High-order small-tile variants also exceeded the targeted time budget.

Recommendation: prevent negative grid extents and make the too-wide-stroke behavior explicit. The zero-cleanup example is a pipeline/API stress case (the current UI minimum corresponds to cleanup 0.2 mm); the 23 × 5 example occurs at ordinary cleanup. Evidence: [reproductions.json](reproductions.json) and [targeted-results.json](targeted-results.json).

### Low: a mirrored Diamond lattice bridge case fails with cleanup disabled

Location: [connectMaterial.ts:92](../../src/patterns/connectMaterial.ts#L92). Requested width=61, height=11, holeSize=21, aspect=0.75, ribWidth=1.6, mirror=true, bridges=true, invert=false, cleanup=0 raises “Material still has 3 components after bridging”. Cleanup 0.2/0.4/0.84/1.6 succeeds for the same settings. This is also a **pipeline/API stress case**, not a default UI failure.

Recommendation: investigate the tiny residual components and make bridge repair robust at zero cleanup. Evidence: [diamondLattice.jsonl](diamondLattice.jsonl) and [reproductions.json](reproductions.json).

## Per-pattern full-pipeline coverage

Counts below are for the broad sweep, not the additional raw/targeted findings described above. “Empty” is tracked separately and is not a usable-pattern pass. Motifs and bands intentionally retain visible panel outlines; matching their edges does not make them an all-over field.

| Pattern | Default repeat character | Cases | Seam failures | Errors/timeouts | Empty |
|---|---|---:|---:|---:|---:|
| Diamond lattice | field | 50 | 0 | 1 | 0 |
| Square / rectangular grid | field | 50 | 0 | 0 | 0 |
| Round perforations | field | 48 | 0 | 0 | 0 |
| Honeycomb | field | 48 | 0 | 0 | 0 |
| Rounded slots | field | 50 | 0 | 0 | 0 |
| Mirror curves / lusona | field | 53 | 0 | 0 | 7 |
| Periodic maze | field | 50 | 0 | 0 | 5 |
| Celtic plait | field | 54 | 0 | 0 | 7 |
| Ammann–Beenker (Pell repeat) | field | 48 | 0 | 0 | 10 |
| Islamic star strapwork | field | 52 | 0 | 0 | 5 |
| Stitched Fermat spirals | motif (mirror forced) | 52 | 0 | 0 | 0 |
| Gosper / flowsnake | motif (mirror forced) | 48 | 0 | 0 | 0 |
| Sierpiński arrowhead | motif (mirror forced) | 48 | 0 | 0 | 0 |
| Terdragon | motif (mirror forced) | 48 | 0 | 0 | 0 |
| Greek key / meander | band | 51 | 0 | 0 | 9 |
| Voronoi cells | field | 55 | 1 | 0 | 0 |
| Delaunay mesh | field | 55 | 0 | 0 | 0 |
| Truchet tiling | field | 50 | 0 | 0 | 0 |
| Penrose tiling (seamless) | field | 55 | 1 | 0 | 6 |
| Hilbert curve | band | 49 | 0 | 0 | 1 |
| Moire lines | field | 55 | 1 | 0 | 4 |
| Guilloche rosette | motif | 59 | 0 | 3 | 0 |
| Sierpinski fractal | motif | 49 | 0 | 0 | 2 |
| Koch fractal | motif | 54 | 0 | 0 | 0 |
| Phyllotaxis spiral | motif | 55 | 0 | 0 | 8 |
| Hyperbolic tiling | motif | 56 | 0 | 1 | 2 |
| Apollonian gasket | motif | 54 | 0 | 0 | 3 |
| Penrose medallion | motif (mirror forced) | 54 | 0 | 1 | 3 |
| Julia / Mandelbrot fractal | motif (mirror forced) | 68 | 0 | 2 | 12 |

## Reproduce and inspect

Run from the repository root (Node 24+, existing dependencies):

```powershell
npm test
npm run build
node --import ./tests/register.mjs planning/seam-audit/audit.mjs
node --import ./tests/register.mjs planning/seam-audit/raw-audit.mjs
node --import ./tests/register.mjs planning/seam-audit/targeted.mjs
node --import ./tests/register.mjs planning/seam-audit/layout-audit.mjs
node --import ./tests/register.mjs planning/seam-audit/reproduce.mjs
python planning/seam-audit/report.py
```

The broad harness accepts an optional generator ID, e.g. `audit.mjs moire`. The broad, raw, and targeted harnesses set a failing exit code when they find defects. Layout and reproduction scripts are diagnostic and report their measurements in JSON. Their process exit code alone does not indicate seamlessness.

Inspect [all 29 repeated previews](gallery.html), [summary counts](summary.json), and individual JSON/JSONL measurements. The previews show exact pipeline polygons repeated 3 × 3, with red repeat-boundary guides. Their settings are defaults, inversion off and 0.4 mm cleanup; automatic mirroring follows the application's Seamless lock.

This was a geometric and rendered-artifact audit, not a physical print test. The browser connector reported no available browser, so live UI interaction was unavailable; exact SVG geometry was rendered with PyMuPDF for visual review. No claim is made that every combination of continuous controls, every imported SVG, arbitrary surface flattening, or every exported STL has been exhaustively tested.
