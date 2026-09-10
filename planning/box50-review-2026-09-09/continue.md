# Status after the 2026-09-09 fix session

The fix plan's stages 1 to 5 are implemented, tested and swept; see [FIXES-2026-09-09.md](FIXES-2026-09-09.md) for results, attribution and evidence paths. Everything is uncommitted on `main`.

## Done

- Physical per-fold tool reach from the mitre plane and the tool's signed offset interval, converted through the directional uv metric (`mitreReach`, `toolOffsetRange`, `Parameterization.directionalScale`, `LayoutSettings.normalRange`).
- Margins in millimetres at every scale, extended past fold corners so fold strips cannot bypass a rim margin; "Fold too sharp" guard at 20 mm reach; log line when a margin empties a piece.
- Four-wall ring closure: `closeRings` in `regionFlatten.ts`, `closure` on the end pieces, `period` on the sheet, `LayoutResult.closureJoined`, `toolMitres`, y-axis seam fit for 90 / 270°.
- Worker reports positive-volume `parts`; the panel shows an error notification when more than one.
- New suites `tests/physical-fold.test.ts` and `tests/ring-closure.test.ts` are in `npm test` (147 pass). `tests/seam-fixes.test.ts` now expects the 90° fit. Concave plate fixtures corrected in `tests/crease.test.ts`, `helpers.ts`, `extra.ts`.
- Sweeps: `expanded/before` (geometry, extremes), `expanded/after-fold-reach` (intermediate), `expanded/after-final` (probes, geometry, angles, ring, connectivity, images). Live-app run through the real buttons with STL/3MF exports captured to `exports/`.

## Left

1. Decide on a connected-cut preset: the controlled comparison shows Connect material alone yields one part for all seven fragmenting patterns; changing picker defaults is a design decision.
2. Physical printing (stage 8) and slicer inspection: not possible here.
3. Optional: browser screenshots for the gallery (capture timed out on the WebGL tab), performance/memory budgets, SVG-with-holes and surface Voronoi coverage, a rectangular-container ring image.
4. Commit. Suggested split: production geometry (`src/geom`, worker, panel, protocol), tests, planning/evidence.

## Traps

- `mitreTool` now takes `(m, tool, mitres, zMin, zMax)`; `LayoutSettings.foldExtend` no longer exists (`normalRange`). The review harnesses (`helpers.ts`, `crease-audit.ts`, `expanded/*.ts`) are updated; older scripts under `planning/seam-audit` may still use the old shapes.
- A whole-shell or three-face selection reports 2D crease runs at margins on narrow or cut edges; that is the corrected physical margin, not a phase break (details in the report).
- The original-surface crease metric is not valid within `depth·tan(θ/2)` of a concave fold; use the filled-tile control or the 1 mm-offset measurement there.
- Dev server for browser checks: port 5173 was held by an unrelated IPv6-only listener; use `npx vite --port 5174 --host 127.0.0.1`. `POST /__save?name=` writes into `exports/` in dev.
