# Coverage still needed

Status: follow-up to the 50 mm box audit. This describes what that audit did not establish. Some topics have existing regression tests and older audit evidence; “not covered here” does not mean they have never been tested in this repository.

The 979 solid executions include repeated controls and supplementary runs, not 979 independent combinations. Eight named configurations combine several settings; they are not a full Cartesian sweep. All 29 built-in tile generators were included, but not every generator parameter or every surface workflow.

| Area | What we have | What remains | Priority / fix-plan stage |
|---|---|---|---|
| Relief and cut depth at a crease | Original-surface classifications for all generators; 12 filled-tile ridge controls prove reduced-scale/sharp-angle underfill | Exact outer relief and inner cut/recess envelopes across all modes, scales, convex/concave folds; prove no symmetric notch or residual inner-wall membrane | Highest / 1–2 |
| Angled-surface flags | 261 thin-plate executions; 41 comparison flags above 1 mm | Classify every flag as real geometry defect, neighboring-face ray occlusion, outline effect, or intentional island cleanup; save sections for genuine failures | Highest / 1–2 |
| Physical borders | Measured 2.5 mm requested margin at scales 0.6, 1 and 1.7 on a filled planar control | Physical borders after final booleans; fold endpoints, rim and floor junctions, rotated borders, concave edges, and locally distorted UVs; prove fold extension cannot bypass margin | High / 3 |
| Four-wall wrap | All patterns in layout; four representative patterns in final ring solids | All 29 final patterns/modes, compatible circumference fits, incompatible rotations, shifted origin and root face, non-square rings; no blank-band “pass” | High / 4 |
| Island filtering | 414 exported-footprint differences out of 180,969 samples; 88 representative points attributed to cleanup | Attribute all 414; repeat before and after simplification/filtering; vary island cutoff; measure retained rib thickness and connectivity rather than status alone | High / 1, 5 |
| Connected cutout settings | Seven picker-default cuts retain multiple solids; one inverted/rotated comparison for all patterns | Controlled one-setting-at-a-time inversion and bridge tests; crop boundaries and small scales; safe, explicitly selected connected presets for affected generators | High / 5 |
| Generator-specific controls | Built-in defaults plus generic rotation/scale/mirror/invert/seed/size changes; existing generator tests ran | Density, recursion, stroke/rib width, all style choices, min/max and interacting parameters; Seamless off and unlocked combinations; broader deterministic seeds | Medium / 6 |
| Thickness and depth | Main box and thin plates: 1.6 mm; filled ridge controls: 8 mm; existing tests include other bodies | Thin/thick and nonuniform shells; recess depth near/equal/above wall thickness; cut reach under-/over-estimates; check remaining inner wall, not just volume | High / 2, 6 |
| Other geometry | Fresh two-face box, four-wall ring and straight bent plates; existing whole-body/cylinder/three-face tests passed | All-pattern matrix on rounded corners, cylinders, curved seams, three faces meeting at a vertex, rim/floor/interior faces, whole shell selection, disconnected selections | Medium / 6 |
| Geometry representation | One exact triangulation and fixed box origin `[37, 0, 23]` | Equivalent retriangulation, subdivided faces, reordered triangles, transformed model, moved origin, selection/root face and segmentation threshold changes | High / 2–4, 6 |
| Separate workflows | Tile generation/layout/tools called directly; filled SVG used as a diagnostic | Surface-native 3D Voronoi workflow, real SVG imports with holes/strokes/subtraction, mixed/sequential operations, imported multi-body models | Medium / 6–7 |
| Live application | Existing preview-client regression tests passed | Real import → select → flatten → settings → apply → undo/reapply → export on the current app; rapid changes, cancellation/recovery, stale selection/preview; confirm preview matches export | High / 7 |
| Export formats and downstream use | All 345 saved STL files reopened as valid positive-volume Manifolds | New results through the actual UI export paths, 3MF round trips and units, slicer layer inspection/supports/toolpaths; component identity and dimensions after import | High / 7 |
| Sustained performance | Timings recorded; all 29 isolated processes completed | Browser responsiveness, peak memory and retained WASM/native memory over repeated applies; worst valid parameter combinations; curved-detail cost | Medium / 6–7 |
| Physical printing | No physical prints or slicer checks in this audit | Printed seam quality, minimum reliable ribs, bridging/overhang behavior and strength with the intended printer/material/profile | After digital fixes / 8 |

## Measurement limits that must not become pass criteria

- Matching opposite tile edges proves boundary compatibility, not that a bounded motif loses its visible repeat panel.
- Two equally blank sides of a fold can match while both are missing intended features.
- Two modified original surfaces can agree while their raised apex contains a notch.
- `NoError` and positive volume do not prove one connected part, sufficient rib width, or printability.
- Ray casts into a concave corner can hit the other wall's relief; apparent mismatches need geometry-aware attribution.
- The audit used explicit 1.6 mm wall thickness, 2.5 mm margin and repeat settings. Those are not all of the application's initial layout defaults.

See [FIX-PLAN.md](FIX-PLAN.md) for implementation order, acceptance tolerances and image requirements. The [original report](REPORT.md) remains the baseline evidence.
