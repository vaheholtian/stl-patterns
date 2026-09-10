# Fix plan: physical continuity across tiled faces

Status: planned, not implemented. Scope: confirmed box-audit defects, unresolved screening results, and the coverage required to trust the fixes. Preserve the existing uncommitted work and the original audit artifacts. Write new verification results into a separate `after-fixes` directory so comparisons remain possible.

## Intended result

Applying a supported tile to the 50 × 50 × 50 mm container with a 1.6 mm shell preserves its intended pattern across selected folds, produces the requested physical relief/recess and edge margin, and reports whether the final cut is connected. A four-wall ring closes at compatible lattice settings. Unsupported topology, rotation or geometry is stated clearly without silently changing the user's pattern or leaving an unreported break.

The existing 142 passing tests are a regression baseline, not proof of these outcomes. The confirmed notch, margin measurements and ring closure must first become tests asserting the desired geometry and failing on current source. The audit verifier currently asserts that bugs exist; its success must never be used as proof that a fix works.

## Implementation order

| Stage | Deliverable | Depends on |
|---|---|---|
| 1 | Reliable geometric assertions and complete attribution of outstanding flags | None |
| 2 | Correct physical reach at each fold for emboss, recess and cut | 1 |
| 3 | Margins remain physical millimetres, including final corner/end geometry | 1–2 |
| 4 | Shared periodic closure for developable wall rings | 2–3 |
| 5 | Connected-cut reporting and verified pattern-specific remedies | 1–3; repeat ring cases after 4 |
| 6 | Expanded parameter/surface sweep and numerical regressions | 2–5 |
| 7 | Browser, worker, export and slicer verification with comparison gallery | 2–6 |
| 8 | Physical-print validation on the intended printer/material | Digital results from 7 |

Stages 1–3 are the first implementation batch. Each later stage should remain separately reviewable; do not postpone the confirmed corner fix until an exhaustive parameter sweep is complete.

## 1. Establish assertions that cannot pass on symmetric defects

Touch: `tests/crease.test.ts`, focused new geometry tests, reusable review helpers. Reference: `ridge-probe.json`, `sections.json`, `diagnostics.jsonl`, `extra.jsonl`.

- Separate assertions for pattern phase, expected feature presence, final relief/recess depth, through-wall opening, physical margin, and connected material components.
- Add desired-result tests for the 0.8 mm emboss at scale 0.6 on the exact fixture: expected ridge `(50.8, -0.8, 25)`, not the current `(50.48, -0.48, 25)`.
- Add the 135° normal-change control: expected apex y=2.0905007 for the 0.8 mm uniform emboss. Keep scale-1 90° and 45° controls to detect regressions.
- Use cross-sections and intersections against independently constructed expected solids. Retain original-surface ray tests as phase checks, not the only geometric oracle.
- Classify all 41 angled flags using rays constrained to the relevant local face, final sections, and raw/simplified/filtered geometry. Record attribution and a small reproduction for each distinct cause.
- Revisit all 414 footprint differences, not just the saved 88 examples; retain sample coordinates and their attribution. Keep intentional island removal separate from unrequested geometry loss.
- Ensure the phase test fails when Join edges is disabled or an intentional phase offset is introduced. Verify expected feature samples are present so a blank edge cannot pass.

Acceptance: focused tests fail on the current confirmed bugs, healthy controls pass, and every outstanding flag is classified or explicitly kept unresolved. No increase of tolerance or blanket “ignore concave” rule to remove failures.

## 2. Compute fold reach in physical space, separately for each fold

Touch: `src/geom/regionFlatten.ts`, `src/geom/layout.ts`, `src/geom/tileTool.ts`, `src/app/panels/TilePanel.tsx`; update shared preview/geometry protocols if the per-fold payload changes.

Replace the scalar assumption `foldExtend = depth` with a per-fold reach derived from the actual mitre plane and the operation's signed normal-offset interval. Use the same offset definitions as the worker: emboss `[-0.2, depth]`, recess `[-depth, 1]`, cut `[-(wallThickness + 1), 1]`.

For a point on the crease, outward in-face unit direction `d`, face normal `n`, and oriented mitre normal `m`, solve the plane intersection `m · (u*d + z*n) = 0` over the offset interval. The needed out-of-face extension is the relevant nonnegative range of `u`; convex/concave and inward/outward signs must be derived rather than guessed. For the simple symmetric convex emboss this reduces to `depth * tan(bend/2)` in physical units.

Convert that physical distance to UV using the local face mapping in the direction perpendicular to the fold. A global scale divisor is enough for an isometric planar box, but not a general substitute for the directional metric on distorted UVs. Encapsulate that conversion so margins and fold reach use a consistent unit contract.

Also derive repeat-copy padding and the bounded mitre trim zone from the actual reach. Increasing the extension while leaving `2 * reach + 1` trim coverage unchanged can fail on acute folds. Retain local trimming so a rim or returning piece is not cut away by a global half-space operation.

Handle near-degenerate angles and excessive reach with a specific unsupported/invalid-geometry result. Do not clamp the tool silently or allocate an unbounded number of copies. Preserve sensible behavior for nearly flat faces and folds below the segmentation threshold.

Acceptance matrix:

- Box scales 0.6/1/1.7; rotation 0/37/90°; depth 0.4/0.8/1.2 mm; all three operation modes.
- Normal-change bends 20/45/90/135/160° and concave −45/−90/−135°, including 1.6 mm plates. Near-degenerate cases must either meet the contract or return the documented guard.
- Filled controls reach the analytic offset envelope within **0.02 mm**. Real patterns have no unexplained missing strip or added membrane; expected cut openings go through the shell.
- Preserve phase, invert/mirror semantics and connected-component counts in healthy controls. Equivalent retriangulation, triangle order, model rotation and origin/root changes preserve physical dimensions.
- Save matched before/after overviews, crease close-ups and dimensioned sections for the box-scale defect and the sharp-fold defect.

## 3. Preserve requested physical margins through the final boolean

Touch: physical-to-UV helper introduced in stage 2, `src/geom/layout.ts`, focused margin tests.

- Convert band widths from millimetres into the relevant local mapping rather than stroking a raw UV distance.
- In a distorted region, construct/measure the boundary offset using the local surface metric; document unsupported cases rather than claiming an exact global millimetre margin.
- Treat genuine selection boundaries, artificial closure cuts and joined folds as different edge roles. A joined fold must not receive a seam-hiding blank band.
- Restrict fold extension at rim/floor endpoints so it cannot bypass a requested real-boundary margin. Check final solids, not only the in-face layout polygons.
- Define excessive margin behavior: empty patterned region with a clear explanation, not reversed/expanded geometry.

Acceptance: requested 2.5 mm stays **2.5 ± 0.02 mm** on the planar fixture at scales 0.6/1/1.7, rotations 0/37/90°, in all three modes. Check every real boundary and all fold endpoints. Pattern phase remains continuous at joined folds. Reuse the exact saved controls where current measured bands are 1.5/2.5/4.25 mm.

## 4. Close a developable four-wall ring at a compatible period

Touch: `src/geom/regionFlatten.ts`, `src/geom/layout.ts`, sheet-fit orchestration in `TilePanel.tsx`, shared protocols and preview messages.

- Retain non-tree adjacency edges after unfolding. Measure the remaining boundary correspondence: a consistent translation with compatible orientation is a candidate period; rotational inconsistency is not.
- For the square container's four outer walls, represent the **200 mm physical circumference** as one period belonging to the entire sheet. Carry paired closure edges and their mitres explicitly; do not infer them from individual piece topology or mark all vertices at the closure as arbitrary real boundaries.
- Fit repeat counts once per sheet and apply the same transform to every piece. Avoid independent rounding/stretch decisions per face and double-recentering of the period.
- Initial guaranteed fits: tile axes aligned with the closure at 0/180°. Other rotations are supported only if the actual transformed closure equals a valid lattice translation. Add 90/270° fits if the y-axis path is implemented and tested; otherwise identify them as unsupported.
- At incompatible angles such as a generic 37° setting, preserve the chosen rotation and expose the closure cut in preview with an actionable message. Do not silently snap rotation or claim seamless wrapping.
- Distinguish a developable wall ring from three faces meeting at a solid cube vertex: the latter generally needs a cut or distortion. Keep those seams explicit.

Acceptance: all 29 patterns and all modes on the four-wall box at supported fits; no solid border merely hiding the closure; corresponding samples on **all four** edges agree with expected coverage and physical depth. Shift origin/root face and use a rectangular container to prove the fit is based on geometry. Repeat existing cylindrical seam tests. Incompatible fits display the actual limitation and never show a successful-seam claim.

## 5. Make cut connectivity visible and repair it without changing intent silently

Touch: `src/worker/geom.worker.ts`, result protocol/UI reporting, pattern defaults and `connectMaterial` generation only where evidence justifies a change.

- Expose positive-volume retained material components and removed volume separately from “manifold” status. Do not count a cavity's negative shell as a loose printed part.
- For the seven affected picker defaults, test inversion and Connect material individually at the same origin, rotation, scale and margin. The previous inverted comparison also changed rotation and is not proof of an inversion-only remedy.
- Preserve already saved pattern definitions. Where a usable connected cut requires inversion or bridges, present a deliberate connected-cut preset/action with a preview of its effect. Keep emboss/recess appearance unchanged by a cut-specific remedy.
- If existing connected-material mode promises connected ribs but cropping/seams sever them, repair the physical connectivity or report the limitation. Do not silently keep only the largest island and erase the design.
- Test island cutoff 0/0.1/5/20 mm³ and narrow retained bridges. Validate minimum physical rib width against the configured width requirement and identify under-width cases.

Acceptance: every advertised connected-cut preset yields **one positive-volume material component** on the selected box faces after STL round trip, with intended openings preserved. Other intentionally disconnected designs report their retained components. All 414 baseline footprint differences have attributable explanations, and cleanup does not hide a seam defect.

## 6. Expand coverage around the fixes

Use a small fast regression suite plus a bounded offline matrix. Keep expensive valid/invalid generator cases isolated in child processes; save exact inputs on failure.

- All supported style choices and min/default/max values for generator-specific parameters; pairwise interactions among line width, density/order, tile size, inversion, mirroring, bridging and Seamless lock. Use a deterministic seed sample, not a claim of exhaustive coverage.
- Repeat the existing eight configurations and add one-variable controls so causes can be isolated. Add remaining recess combinations.
- Sweep shell thickness and depth ratios, including inaccurate entered cut thickness and a recess approaching/breaching the inner wall. Distinguish an intentional through-recess from an unexpected residual membrane.
- Curved surfaces, rounded box corners, triangulation changes, near-threshold segmentation, three-face/rim/floor junctions, whole-body/interior selection, nonuniform shells, multiple/disconnected pieces and sequential operations.
- Test imported SVGs with holes, strokes and subtract geometry; separately test the surface-native Voronoi path on the box. Do not label these workflows covered by the tile-generator audit.
- Repeat after simplification and island removal. Track volumes, material components, physical feature sizes, seam/depth errors, timings and peak memory where measurable.

Acceptance: each supported scenario passes its physical contract; unsupported combinations produce a specific recoverable outcome. Every matrix failure is recorded and classified. Unresolved flags are not included in a pass count.

## 7. Exercise the application and deliver reviewable comparisons

- Real browser flow: import exact fixture → select adjacent walls → flatten → change pattern/settings → apply → inspect → export → reimport. Repeat for the four-wall ring and a curved model.
- Check preview vs final mesh at altered scale/margin/rotation, selection and origin changes, switching cut/recess/emboss, undo and reapply. Exercise stale work cancellation and recovery after invalid geometry.
- Verify the normal UI default wall-thickness setting is not mistaken for measured shell thickness; this audit deliberately entered 1.6 mm.
- Run STL and 3MF UI export round trips, checking dimensions, units, component counts and geometry. Inspect representative results in the available slicer; record if slicer access is unavailable rather than treating it as passed.
- Compare responsiveness and memory before/after on matched flat/curved and dense configurations. Establish measured budgets from the current environment before asserting performance regressions or improvements.
- Preserve baseline images. Save new per-pattern cut/recess/emboss images, aligned cameras, close-ups, sections and contact sheets. Include isolated-material views for connectivity findings and a view of the actual closure edge.

Acceptance: existing tests, new regressions, build and lint pass after final changes; browser and export checks have fresh evidence; gallery links and files validate. Publish a supported/unsupported/unresolved table alongside numerical results. No deployment is part of this plan.

## 8. Physical validation

Prepare a small set of diagnostic coupons and final box STLs after digital checks: reduced-scale emboss corner, sharp/concave fold, minimum-width connected cut and ring closure. Record intended orientation, printer, nozzle, material, layer height and slicer settings. The user/printer operator can print them; compare measured corner profile, border width, surviving ribs and bridging against the digital outputs. Printer/profile choice remains open until that stage and does not block the geometry fixes.

## Open decisions and limits

- Full arbitrary-angle periodic fitting is not promised; compatible fits plus honest closure feedback are the first target.
- Exact physical offsets on strongly distorted curved UVs may require a surface-aware construction. Establish support from measurement rather than extending the planar scalar assumption.
- Automatic bridge insertion changes pattern appearance. Use explicit connected-cut controls and measured results; a default design change needs its own review.
- Physical printing depends on equipment and material details not yet provided.

Coverage inventory: [COVERAGE-GAPS.md](COVERAGE-GAPS.md). Baseline results: [REPORT.md](REPORT.md). This plan adds documentation only; implementation starts with stage 1.
