# Tiling fixes and verification

7 September 2026. Implementation and verification complete for the observed tiling defects. Historical audit files remain unchanged. Existing uncommitted application changes were preserved.

The corrected pipeline has no seam failures in the valid configurations tested across all 29 generators. Infeasible Hilbert and Guilloche combinations now return specific errors before expensive geometry work. The application also has cancellable preview workers and a stage-based progress bar with dismissible generation, layout, and operation messages at the top right.

## Results

| Check | Coverage | Result |
|---|---:|---|
| Automated test suite | 133 tests | All passed; 0 skipped, 0 failed |
| Production build | TypeScript and Vite | Passed |
| Lint | `oxlint src tests` | Passed without diagnostics |
| Full pattern pipeline | 1,518 configurations, 29 generators | 1,517 completed; 0 seam failures; 1 infeasible combination rejected |
| Native periodic completion | 344 configurations | 338 completed; 0 incomplete outputs; 6 infeasible combinations rejected |
| Targeted Penrose/Hilbert matrix | 114 combinations | 80 completed; 0 seam failures; 34 infeasible combinations rejected |
| Surface fitting | 108 layouts | 36 valid fitted wraps; 72 explicitly unsupported rotated fits; 0 false fit claims |
| Historical timeout retries | All 22 exact configurations, 60-second limit | 11 completed with matching seams; 11 infeasible inputs rejected; 0 timeouts or kernel aborts |
| Preview worker reuse | 100 consecutive requests | 100 completed using one worker; no empty outputs or browser exceptions |

The [machine-readable summary](fixed/summary.json) lists every rejected configuration and its reason. Errors in the audit files are intentional validation rejections, not successful seam tests. The 85 empty outputs in the broad matrix are tracked separately: cleanup can erase features below its threshold, so they do not demonstrate usable patterns. All 29 default previews are nonempty and were inspected as single tiles and 3 × 3 repeats in the [interactive gallery](fixed/gallery.html).

The broad matrix covers size extremes, asymmetric tiles, numeric limits, boolean/select alternatives, deterministic seed changes, both polarities, optional/forced mirroring, material bridging, and cleanup widths 0/0.4/0.84/1.6 mm. Final opposing edge profiles use a maximum continuous mismatch threshold of 0.02 mm; tiny intervals are retained rather than discarded. The additional origin-shift regression checks the interior within a 0.025 mm geometric band, allowing the two independent 0.01 mm simplifications.

## Changes

- Convex insets now use inward half-plane clipping. Penrose and Voronoi shapes shrink monotonically and remain empty after collapse; short edges may disappear without invalidating the remaining inset.
- Hilbert rejects negative/zero available spans. Guilloche rejects rosettes whose ribs cannot fit and reports radius/amplitude scaling.
- Cleanup preserves shallow excursions beside seams and consistently removes features exactly at the minimum-width cutoff. Maze repeats are phased through cell interiors, preserving real passages across boundaries.
- Material bridging now joins vertex-touching Diamond components instead of skipping zero-distance connections or deleting legitimate islands.
- Stroke loops are combined in bounded batches. Repeated neighbors are cropped to the filter halo, and very detailed openings use overlapping spatial chunks. Temporary native geometry in generation and layout is released with explicit ownership tracking.
- Surface fitting uses the period in the actual placement coordinates. General rotated two-axis fitting remains unsupported; the UI reports that limitation, including layouts with multiple pieces.
- Preview generation and fitted layouts run in dedicated workers. New settings cancel stale calculations, timeouts discard the worker, and fatal/initialization failures permit subsequent recovery. Mesh operations use their own worker.
- Tiled cut/recess/emboss operations report processing-stage progress, provide Cancel, and display status and errors in the top-right corner. Cancellation preserves the original mesh and permits another operation.

## Physical wrap and browser verification

The actual cylindrical export check exposed defects beyond the flat-layout audit. Area-weighted normals depended on the cylinder's diagonal triangulation and tilted its two rims differently. They are now corner-angle weighted. Layout simplification could move paired seam boundaries independently, and the final 0.005 mm mesh simplifier could introduce thin walls through real openings. Wrapped layouts retain their clipped boundary, and curved tiled operations retain their boolean mesh.

The cylinder regression failed before these corrections. The final browser workflow applies an asymmetric Voronoi pattern to a 40 mm tall tube, verifies the supported fit at 0° and the unsupported message at 30°, exports STL, and re-imports it. At detail settings **1, 2, and 3 mm**, each result has **0 mismatches among 400 physical ray pairs** across the seam, with both openings and retained ribs present. Each export reports `NoError` and retains one positive-volume solid. The importer's existing weld can also produce zero-volume degenerate components (absolute volumes below 1e-15 mm³ in these runs); the recorded component volumes distinguish them from material islands.

Through-cut, recess, and emboss were also applied through the real UI to a box. All three produced watertight results and survived both STL and 3MF export/re-import with volume changes below 0.01 mm³. Progress was monotonic from 0 to 1. Cancel left the original mesh untouched, and a subsequent cut succeeded. The progress display was visually inspected and measured 12 px from the right and 56 px from the top at 1280 × 900. Heavy preview work left the UI responsive, and selecting another pattern replaced it.

Evidence: [cut/recess/emboss and progress](fixed/browser-cut-results.json), [UI responsiveness and placement](fixed/browser-results.json), [cylinder detail 1](fixed/browser-wrap-results-1.json), [detail 2](fixed/browser-wrap-results-2.json), [detail 3](fixed/browser-wrap-results-3.json), [100-request worker run](fixed/browser-preview-stress.json).

## Performance and limits

The final isolated-process retry run completed the large Penrose case in **20.51 seconds** (previously still timed out after 180 seconds), with peak RSS about **367 MiB**. The formerly 155-second Guilloche case completed in **1.42 seconds**, using about **105 MiB**. These timings include startup and ran alongside other verification work; they are measurements, not universal latency guarantees. The 100 ordinary worker requests had a 4.6 ms median and 93.5 ms maximum in the recorded browser run. Native heap retention was not independently profiled.

Preview work has a 60-second limit and remains cancellable. Rotated automatic wraps outside the supported horizontal period are explicitly unsupported rather than falsely reported as fitted. Dense valid patterns may still cover almost the entire tile; the existing coverage warning remains useful. Curved outputs retain more triangles because simplification damaged their seams.

The build retains existing Vite warnings about configuration loading, Manifold's `node:module` browser externalization, and large bundles. No new dependencies were installed.

Full evidence: [test log](fix-tests.log), [build log](fix-build.log), [lint log](fix-lint.log), [retry results with source hashes](fixed/retry-results.json), [layout results](fixed/layout-results.json), [raw results](fixed/raw-results.jsonl), [targeted results](fixed/targeted-results.json).
