# Seams across sharp edges — 8 September 2026

Question: does a tiled pattern continue across two faces that meet at an angle (adjacent sides of a box)? The earlier audits ([REPORT.md](REPORT.md), [FIXED-REPORT.md](FIXED-REPORT.md)) covered the 2D tile seams (opposite edges of the repeat box) and wraps around a cylinder; nothing had measured a crease between two flattened pieces.

## Finding (before)

Every crease between separately flattened faces was discontinuous. `flattenPieces` split the region at edges sharper than the segment angle and flattened each piece with LSCM on its own. LSCM's 2D orientation came from two pins on the piece's longest axis, and each piece was laid out from its own centroid, so the tile's rotation and phase on the two faces were unrelated.

Measured with the crease harness (feature classification 0.02 mm either side of the crease, sampled every 0.1 mm), six generators, default settings, `Solid edge margin` 0:

| Body | Mismatched length | Frames |
|---|---:|---|
| Hollow box, top + front | 15% to 79% of the 80 mm crease, runs up to 6.6 mm | turned 0° to 25°, offset up to 74 mm |
| Box corner, three faces | 42% to 80% on each of the three edges | turned up to 128° |
| Bent plates 45°, 90°, concave 90° | 9% to 61% | turned 40° to 180° |

With the default 3 mm margin the crease measured 0% mismatched only because both faces carried a 3 mm solid band along it: the pattern stopped 3 mm before every sharp edge on both sides, so a box showed a solid frame around each face.

Edges gentler than the segment angle (a 20° ridge) were already exact: LSCM flattens a developable two-face surface isometrically (local size 100.0% everywhere) and the pattern runs straight across.

## Change

Pieces that meet along a sharp edge are unfolded into one sheet, like the net of a box (`unfoldSheets` in `src/geom/regionFlatten.ts`):

- Folds between pieces are found from shared vertex positions along boundary edges. Starting from the piece under the layout origin, the longest fold to a placed piece is joined first (a maximum spanning tree), so a closed corner keeps its two longest edges continuous and cuts the third.
- A child piece's uv is moved by a similarity transform (rotation, uniform scale, translation, no reflection) fitted to the shared vertices. The fold is only joined when the shared edge flattens the same way in both pieces: the residual must stay under 1% of the fold length (0.05 to 0.5 mm). Two planar faces always join; a cylinder wall and its flat lid never do (their rim is a line in one flattening and a circle in the other), so those keep the previous behaviour and the log says why.
- Every piece of a sheet lays out in one frame: the sheet's origin (the user's when its piece is on the sheet) expressed in the shared uv space, with the mm-per-uv scale there (`Parameterization.recenterAt`). Rotation and scale apply to the whole sheet.
- Folds are not part boundaries: the margin band is kept along real edges only, matched by fold edge rather than fold vertex (a wall joined on both sides has both rim corners on folds, yet its rim is a real edge; the vertex rule dropped its band, found on the 50 mm container on 9 September). A single fitted copy is sized to the whole sheet.
- 3D tools are mitred. Each face's tool is a prism through the wall; at a convex fold it used to reach `wall thickness + 1` mm into the neighbouring wall, chopping the neighbour's ribs into islands once the fold band was gone (the whole-body box fell into 25 pieces). Now the layout continues the pattern `foldExtend` mm past each fold (`foldPolygons`) and the worker trims the tool at the plane bisecting the two faces (`mitreTool`), removing only the zone behind that plane near its own fold, so a ring-shaped piece such as a box rim is not cut away where the same plane passes above its far side. Trims overlap by 0.01 mm so two tools ending on the same plane leave no zero-volume flap.
- `Continue across sharp edges` checkbox in the Tile panel (`tileLayout.joinEdges`, default on). Off restores the previous per-face behaviour including the margin band along every edge.

Consequence to know about: on a whole-body through-cut of an open box the rim is now patterned too (its edges are folds, so no band), as a shallow V-groove 0.84 mm deep between the two mitre planes; the pattern wraps from the outer wall over the rim. Turn the checkbox off to keep the rim solid.

## Verification

- Test suite: **141 passed, 0 failed**, including the new [tests/crease.test.ts](../../tests/crease.test.ts) (box faces at rotation 0° and 37°, bent plates at 45°, 135° and a concave valley with rotation, scale and margin, a 20° ridge, a box corner, cylinder plus lid, and cut/recess/emboss with mitred tools measured by ray casts in the finished solid). `npm run build` and `oxlint` pass.
- Crease sweep, all 29 generators × 7 bodies × 5 settings (margin 0, rotation 37°, scale 0.6, margin 3, single copy): **1,450 creases, 1,338 within 0.3 mm**; the 112 others are all the box corner's third edge (40 mm, cut by design). 145 cases were the 20° ridge (single exact piece). 0 errors. Evidence: [crease-audit-full.json](crease-audit-full.json).
- 3D ray casts in the cut, recessed and embossed solids (box, plates 45°, 135°, concave 90°; six generators; three settings each): **216 of 216 creases within 1 mm**, no boolean failures. Evidence: [crease-audit-3d.json](crease-audit-3d.json). Baseline for comparison: [crease-audit-baseline-nojoin.json](crease-audit-baseline-nojoin.json).
- Browser: demo box, outer front + right faces selected, Voronoi, margin 0: the log reports `1 sharp edge(s) unfolded flat ... 2 pieces form 1 sheet(s)`, the overlay shows cells crossing the vertical edge, and a through-cut with 2 mm walls applied in 0.1 s to one solid of 5,396 triangles.

Measurement notes. A feature outline lying exactly on the crease flips the two sides without any discontinuity (Celtic's straight ribs at rotation 0 produced a 72% raw mismatch that way), so a sample counts only when a piece's own pattern, continued past the fold, does not flip there either; the unjoined baseline still measures 37% to 49% under this rule. Runs up to 0.3 mm (1 mm in 3D, where the offset is 0.05 mm) are outlines crossing the crease at shallow angles within the sampling band. Manifold's `rayCast` distance is parametric along the segment, not millimetres.

## Limits

- Only straight folds get a mitre; a curved fold that still passes the flatness test gets the shared frame but no mitre or extension.
- A corner of three faces keeps two edges continuous; the third is an unavoidable cut and keeps its margin band.
- Where three mitred tools meet along a line a zero-volume shell can remain in the boolean result; the worker's island filter drops it. The whole-body test counts material shells only.
- A sheet whose pieces have their own wrap period (a ring joined to a plane along a straight generator) applies the seam fit per piece; not exercised.

Reproduce: `node --import ./tests/register.mjs planning/seam-audit/crease-audit.ts [quick|full|3d] [generatorId] [--no-join]`.
