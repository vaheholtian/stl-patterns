# Seamlessness and generation reliability — fix plan

Date: 7 September 2026. Status: implemented and verified. See the [final results and limitations](FIXED-REPORT.md). The plan below is retained as the original rationale, not a list of outstanding tasks.

All observed seam failures and historical timeouts are resolved by corrected geometry or explicit infeasibility errors. Verification includes 133 passing tests, the full settings matrices, actual browser operations, physical cylindrical seam checks, and STL/3MF round-trips. General rotated two-axis fitting remains a separate feature; native heap retention was not independently profiled. The final report records these limits and measured performance against the original proposed targets.

The goal is for supported settings to produce geometrically continuous repeats, for surface fitting to report its actual capabilities, and for difficult inputs to leave the application responsive and recoverable. Matching empty edges is insufficient: the result must also preserve the intended pattern, or explain why the requested geometry cannot be made.

Evidence: [original review](REPORT.md), [extended retry report](RETRY-REPORT.md), [exact timeout settings](timeout-cases.json), and [extended retry results](retry-results.json). The original audit remains a historical baseline; the retry report supplements it. Existing uncommitted application changes must be preserved.

The extended run retried all 22 cases with a 180-second budget: **14 completed with matching edges, one Guilloche kernel abort, and seven timeouts**. Five completed outputs cover over 98% of the tile; all nine completed Hilbert outputs cover 96.24–99.99%. The seven unresolved cases are Penrose medallion plus six Hilbert cases with a 5 mm dimension and 6 mm stroke. This supports doing the Hilbert feasibility guard early, while separately profiling valid large Penrose geometry and the 155-second Guilloche case. No application source changed during the retry run.

## Recommended sequence

| Order | Work package | Reason to do it here | Dependencies |
|---|---|---|---|
| 1 | Strict regression contracts and isolated failure fixtures | Make the observed bugs fail reliably without hanging the suite | None |
| 2 | Guard invalid Hilbert/Guilloche geometry; recover and cancel preview work | Kernel aborts and long synchronous work can prevent further use of the app | 1 |
| 3 | Correct surface-wrap fitting | Shared, visibly large mismatch across otherwise seamless generators | 1 |
| 4 | Correct convex insets in Penrose and related helpers | Large seams and expanding shapes at allowed gap values | 1 |
| 5 | Preserve periodic geometry through cleanup and simplification | Smaller shared defects currently hidden by permissive tests | 1, 4; rerun 2 fixtures |
| 6 | Optimize the remaining expensive valid configurations | Use measured stages and geometry equivalence to guide changes | 2, 5 |
| 7 | Repair residual bridge failures | Lower priority zero-cleanup/API case; exercise final seam contract | 1, 5 |
| 8 | Repeat the complete settings matrix and surface/export checks | Verify the combined result across all 29 generators | 2–7 |

Each package should be a separate reviewable change with its own regression evidence. The worker containment work can be separated from generator validation; neither requires redesigning the surface-fit algorithm.

## 1. Establish the contracts first

Touch: `tests/seamless.test.ts`, new focused geometry/layout tests, and reusable audit helpers.

- Preserve edge intervals down to numerical coincidence tolerance. The current test merges gaps and discards intervals below 0.35 mm, hiding real mismatches. Use the audit's 0.02 mm maximum continuous mismatch as the initial explicit acceptance threshold, retaining the total mismatch as an additional reported metric. This is an audit tolerance, not a claim that every 0.02 mm defect is visually acceptable.
- Assert both opposing edge profiles after the **complete** pipeline, including invert, mirror, cleanup and bridging. Use generated dimensions, since some families snap their repeat box.
- Separately assert native periodic completion: cropping the native geometry must agree with cropping a sufficiently padded set of its translated neighbors. Derive padding from feature reach; do not assume a 3 × 3 neighborhood covers arbitrarily large strokes.
- Add a phase-shift test: run equivalent geometry with the tile origin moved across the seam, then translate back and compare the interior. This catches seam repair that merely relocates the discontinuity to a collar boundary.
- Track empty and almost-solid output independently of seam equality. A legitimate erased feature can be an expected documented outcome; it cannot stand in for a successful usable-pattern regression.
- Convert the exact reproductions below into tests asserting the **desired** behavior. `verify-findings.mjs` currently confirms the existence of bugs; its successful exit is not evidence that the app is fixed.
- Put historical aborts and expensive cases in disposable child processes with bounded runtime. Fast tests must not wait several minutes or reuse an aborted WASM module. Keep the extended performance matrix separate from the ordinary unit suite.

Acceptance: the new targeted tests fail on today's source for the stated reasons, pass after their respective fixes, and still detect a deliberately shifted edge. Normal default/mirror/invert controls remain unchanged within the stated geometry tolerance.

## 2. Make invalid geometry safe and preview work recoverable

Touch: `src/patterns/hilbert.ts`, `src/patterns/guilloche.ts`, `src/patterns/pipeline.ts`, `src/app/useTileRegen.ts`, `src/app/panels/TilePanel.tsx`, `src/worker/{protocol,client,geom.worker}.ts`, and the module lifecycle in `src/geom/manifold.ts`.

### Generator feasibility

Hilbert's inset at line 123 can exceed half the tile size, making the grid pitch negative. The rounded branch then also receives a negative fillet radius. Calculate available span before generating the path; reject an impossible span with an actionable message. For positive spans, constrain fillets to valid local segment lengths and preserve the two horizontal run-outs. Do not silently lower the selected order or rib width. Dense but geometrically valid overlapping strokes need separate performance handling.

Guilloche's `maxR >= 0.5` fallback allows strokes much wider than the remaining motif space. Define and enforce the available radius/stroke envelope before generating curves. Return an explicit infeasible-setting result when the promised contained rosette cannot fit. For geometrically valid self-intersections, preserve the stroked path's coverage rather than substituting a disk or blank tile. Radius/amplitude scaling that already occurs should be reported when it materially changes the requested motif.

Regression fixtures:

- Guilloche 5 × 5, 5 × 61 and 61 × 5 mm, rib 6 mm, default rosette family; cleanup 0/0.2/0.4/0.84/1.6. No kernel abort; valid output or a specific feasibility error before expensive kernel work.
- Guilloche original full-sweep case 55 (61 × 11, rib 5.8, radius 101, bridging on) now reproduces a kernel abort under the longer budget. Retain its exact JSON, including floating-point parameter values.
- Hilbert widths 5/23/61, heights 5/7/11, order 1/4/7, rounded off/on, rib 6; include the 23 × 5, order 4, rounded, cleanup 0.84 seam failure. No negative spans/radii; validated output obeys the seam contract.
- Include practical nondegenerate controls at ordinary rib widths. Rejecting every difficult input is not an acceptable fix.

### Preview execution and module lifecycle

`useTileRegen` debounces for 120 ms but then runs the generator and WASM pipeline synchronously on the main thread. The current cancellation flag cannot interrupt that work. `TilePanel` also regenerates geometry for fitted layouts. The existing worker handles mesh operations and flattening, but has no tile-generation request.

Add a tile-generation request carrying the resolved definition, seed, pipeline options and optional SVG data, returning serializable polygons, dimensions and notes. Share parameter resolution and pipeline semantics between preview and application. Use a dedicated cancellable preview worker, or explicitly separate its lifecycle from the mesh-operation worker: changing a slider must not cancel an unrelated cut/export. Reuse the existing client's restart concept, with request generations so stale results cannot overwrite a newer selection.

Fatal WASM errors must discard the failed worker/module. The current cached singleton cannot be reused after an abort. Handle initialization rejection and fatal responses as lifecycle failures, not just a displayed error string. Avoid automatic infinite retries of the same input.

Acceptance: while a known heavy fixture runs, a user can change pattern/cancel and the latest request wins. A subsequent simple tile succeeds after cancellation, initialization failure, worker error and a simulated fatal kernel response. Test actual abort recovery in an isolated integration run. Repeated changes do not accumulate pending requests or workers. Verify this in a browser during implementation; the CLI retry does not demonstrate UI responsiveness.

## 3. Fit wraps in the actual placement coordinates

Touch: `src/geom/layout.ts:64–105` and focused layout tests.

`buildParameterization` already rotates the period into tile coordinates. Remove the second inverse rotation from the decision about whether x-only stretching can fit it. Use the actual period vector and the actual final tile dimensions.

For the first fix, retain the existing horizontal-only fit where the actual y component is numerically zero (including reversed x orientation). For other angles, leave geometry unstretched and accurately report that automatic fitting is unsupported. Preserve already-commensurate repeats if identified, but do not claim an integer repeat count without checking both phase components. Defer general two-axis integer-lattice fitting to a separate feature: it needs an explicit choice about aspect-ratio distortion and stretch bounds.

Acceptance:

- Reproduce Square grid requested 23 × 37 mm, 100 mm wrap, 30°, scale 1: the current false “4 repeats” claim disappears. If a future implementation claims a fit, the actual period divided by final width/height must be an integer pair and paired seam samples must match.
- Rerun all 108 layout fixtures: Square grid, Truchet and Voronoi; 0/15/30/45/90/180°; scales 0.5/1/2; two origins. The 69 current false fits must become either geometrically correct fits or explicit unsupported cases. An unsupported case is not counted as a seamless wrap.
- Add negative angles, 360°, small numerical perturbations of 0/180°, fit off and single-copy controls. Translation of the origin must not change the fitting verdict.
- Check real cylindrical wrap placement and exported geometry after the mathematical fixture passes; include an asymmetric pattern so symmetry cannot conceal the phase error.

## 4. Implement convex erosion that stays empty after collapse

Touch: `src/patterns/penrose.ts:184–235`, its callers in `penroseApproximant.ts`, and the analogous helper in `voronoiTile.ts`.

Replace the signed-area-only validity test with genuine inward half-plane clipping, or equivalent robust convex erosion. Consecutive line intersections alone are insufficient for general convex polygons because edges can disappear as the inset grows. Normalize duplicate/degenerate edges; handle both windings; return empty for a collapsed region. Consolidate the helpers only if their distance and winding contracts match.

Acceptance:

- A 1 × 1 square inset by 0 remains itself, by 0.25 gives a 0.5 × 0.5 square, and by 0.5 or 2 is empty. Test reversed winding, translation, scaled copies, skinny rhombi and a convex polygon whose short edge disappears before total collapse.
- Erosion is a subset of the original polygon and of every smaller-distance erosion. Area cannot increase as inset distance increases. Every output vertex satisfies all inward half-planes within a scale-aware tolerance.
- Penrose seamless thin/all, widths 5/10/23/40/61, requested height 37, gaps 1/3/5, cleanup 0.2/0.84, seed 7: all 60 targeted combinations obey final seams and periodic completion, including the 1.334441 and 3.892993 mm failures. Empty cases are explicitly accounted for.
- Recheck Voronoi at large rib widths/small cells and both Penrose families at ordinary gaps. Preserve default visual character.

## 5. Preserve periodicity through filtering and simplification

Touch: `src/patterns/pipeline.ts:188–248` and strict seam tests.

First record geometry after stroke assembly, clipping, neighborhood union, offsets, simplification, collar stitching and polygon reconstruction for the three precision fixtures. Compare periodic phase before and after each stage. This identifies the first operation that introduces unequal boundaries and any discontinuity at the copied strip's interior boundary.

Then make periodic cleanup operate on a consistent padded neighborhood with a shared boundary representation. Preserve matched seam vertices through final simplification and reconstruction. Derive halo size from filter support and feature reach. If the strip-copy scheme cannot pass the phase-shift contract, replace it; increasing the tolerance or widening the repaired strip is not evidence of preserved geometry.

Required exact fixtures (seed 7, no inversion/mirror/bridges):

| Pattern | Settings | Cleanup | Current maximum mismatch |
|---|---|---|---:|
| Voronoi | 40 × 40, relax 0 | 0.4 | 0.043879 mm |
| Penrose seamless, edges | requested 40 × 40, rib 0.4 | 0.4 | 0.104317 mm |
| Moiré lines | 61 × 11, angles 40° and −2° | 0.84 | 0.099572 mm |

Acceptance: these meet the strict final-edge and phase-shift contracts at cleanup 0/0.2/0.4/0.84/1.6, then across mirrors, inversion and bridges where applicable. Compare feature area and repeated visual previews with the unfiltered reference to detect vanished holes, merged ribs or introduced borders. Motifs and bands should retain their intended repeat character.

## 6. Optimize expensive valid inputs using the retry measurements

Touch only the measured hot paths: initially curve stroking/boolean assembly in `pipeline.ts`, then generator-specific work if profiling identifies it.

The extended retry records generation and full-pipeline timing separately, raw point counts, resolved mirror settings and peak process RSS for completed/error cases. Two cases run concurrently, so these are diagnostic wall times rather than isolated performance benchmarks. WASM may defer work; time constructors, union/intersection, offset and polygon extraction before attributing cost to a particular call. A timeout during the pipeline is not proof of which operation is slow.

The [pre-kernel probe](retry-complexity.json) provides a useful starting point: mirrored Penrose builds 38,392 stroke loops with 691,056 vertices; several rounded Hilbert cases build 52,433 loops with 766,834 vertices. Generation and stroke-array assembly each take less than a second in this probe, so first profile the following kernel work. Julia's mirrored input contains 77,216 polygon vertices. These measured sizes are more informative than the generators' raw curve-point counts alone.

Candidates to measure, not assumed fixes:

- Union many heavily overlapping strips/discs in bounded spatial batches; deduplicate equivalent segments where semantics permit. Test geometric equivalence, including self-crossing hollow lobes and winding rules.
- Avoid processing irrelevant far-away geometry; retain sufficient overhang for correct periodic strokes and cleanup.
- Reduce curve samples only with an explicit geometric error bound tied to physical size; do not silently change Julia resolution, Hilbert order or user-selected motif detail to satisfy the timeout.
- Audit native object ownership. For example, `pipeline.ts`'s strip helper owns the translated square but not the intermediate square. Layout also creates temporary cross sections without consistent disposal. These are ownership issues to fix and measure, **not yet established as the cause of the slow retries**.

Acceptance: benchmark each remaining expensive valid fixture alone in a fresh process and in repeated same-worker use. Record stage times, peak RSS and output equivalence before/after. Include 100 successive ordinary preview changes after warm-up and verify that retained native handles do not grow with each request; account for WASM heap high-water marks when interpreting memory.

Initial proposed product targets: ordinary previews complete within 1 second on the recorded test machine; heavy valid previews complete within 10 seconds or return a clear bounded-work diagnostic; cancellation responds within 250 ms. These are targets for implementation measurements, not existing guarantees. The three-minute retry budget is diagnostic and is not an acceptable UI latency target. Reject infeasible inputs before allocating large geometry; do not increase the WASM memory ceiling to mask runaway work.

## 7. Repair residual material-bridge failures

Touch: `src/patterns/connectMaterial.ts` and connectivity regressions.

Reproduce Diamond lattice 61 × 11, holeSize 21, aspect 0.75, rib 1.6, seed 0, mirror on, invert off, bridges on, cleanup 0. Inspect the three remaining material components at the recursive limit. Measure their area and closest connecting distances; determine whether bridge widths or numerical overlap collapse before changing iteration limits.

Acceptance: one retained connected material component, matching periodic edge profiles and no arbitrary deletion of legitimate islands. Keep cleanup 0.2/0.4/0.84/1.6 as controls. Zero cleanup is an API stress case; it must not take priority over the UI-visible failures above.

## 8. Completion gate

- Re-run the ordinary test suite and production build after source fixes.
- Re-run the 1,518 full-pipeline scenarios, 344 raw checks, 114 targeted combinations and 108 layout cases, with resolved settings/dimensions preserved. Link final counts and every intentional infeasibility rejection. Do not describe rejected or timed-out cases as passing seamlessness.
- Re-run all 22 historical timeouts with isolated limits and retain both the historical and final timings. Any unresolved case remains an explicit limitation.
- Inspect the 29 default repeated previews and the changed edge/extreme fixtures at 1 × 1 and 3 × 3, with seam guides both visible and hidden. Check bands/motifs separately from all-over fields.
- Exercise the real browser workflow: change settings during generation, recover from failure, fit a cylindrical wrap, then apply and export representative cut/recess/emboss patterns. Re-import exports and verify manifold status and continuity at the physical wrap. CLI seam equality alone does not establish final STL correctness.
- Deliver a concise result list: fixed defects, supported/unsupported fit cases, invalid-setting behavior, performance measurements and any remaining limitations.
