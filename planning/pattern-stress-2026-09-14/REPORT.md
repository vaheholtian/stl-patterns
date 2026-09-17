# Pattern generator stress test — 2026-09-14

2,041 tile generations across all 29 generators: per generator the default, every parameter at min and max,
every style choice, four seeds, five tile sizes × two line widths, combined min / max (and max with Seamless
off), invert / Connect material flipped, mirror, Seamless off, plus 40 seeded random configurations (every
parameter drawn in range, a third biased to the outer 10%, random invert / connect / seamless / mirror / line
width). Random and default runs were generated twice to check determinism. Every result was rasterised and
put on contact sheets (`sheets/<id>-<page>.png`, 2×2 repeats, tile boundary dashed) and inspected by eye.

Reproduce (repo root):
```
node planning/pattern-stress-2026-09-14/run-all.mjs 40 10 120000     # results/*.jsonl, *.polys.jsonl
python planning/pattern-stress-2026-09-14/render.py <ids...>          # sheets/, results/analysis.jsonl
node planning/pattern-stress-2026-09-14/summarize.mjs                 # results/summary.json
```

## Clean
- 0 non-finite coordinates, 0 nondeterministic results, 0 seam-edge mismatches > 0.02 mm where seamless is expected.
- Crashes: 1. Timeouts (> 120 s): 1.

## Findings

1. **WASM out-of-memory poisons Manifold for the rest of the session.** honeycomb `width 272, height 298,
   holeSize 4.5, ribWidth 1.1, invert, connect, mirror` runs 9 s then throws `RuntimeError: memory access out of
   bounds`; every later Manifold call in that process fails the same way (the first harness run lost all 33
   following configs of honeycomb). Reproduces in a fresh process.
   **Checked in Chrome (`browser-oom.mjs`, headless Chrome 9224 + vite dev server):** the same config fails in
   the app's preview worker after 7–9 s with `memory access out of bounds`. Reusing that worker, a small default
   tile then fails instantly with the same error. The app's `PreviewClient` treats it as fatal, discards the
   worker, and the next tile generates normally, so the Pattern screen recovers; the user only sees the raw
   message "memory access out of bounds". Not covered: the geometry worker (`geom.worker.ts`) catches every error
   as an ordinary failure and never restarts, so an out-of-memory during Apply would presumably leave Apply broken
   until reload — the harness did not produce an out-of-memory there.

2. **Connect material fans bridges from one corner and wrecks the design.** When many islands need joining the
   bridges are straight ribs converging on a single point (see `zoom-fans.png`: greekKey #29, truchet #39;
   also visible on fermatSpirals #26, voronoiTile #53). 103 runs used ≥ 20 bridges, up to 2,779. Every
   generator is affected; the warning only reports a count.

3. **Bridge count drives the extreme timings.** voronoiTile random-37 (300×279, cell 4, mirror) timed out at
   120 s; penroseApproximant random-24 50 s (2,779 bridges), guilloche combined-max 49 s, honeycomb random-34
   44 s (2,463 bridges), koch curve-band random-7 21 s (1,254 bridges). Median generation is 3–370 ms.

4. **Features silently fused into solid fill or disappearing** (warned only by the generic
   "under 2% / almost the whole tile" note, 230 empty results in total): guilloche count=24 and lobes=24 become
   solid discs; delaunayTile ribWidth=6, moire pitch=0.3, penroseApproximant edge=1 / minOrder=6 / ribWidth=6,
   hilbert order=7, julia zoom=1000 fill the tile. Parameter ends that produce nothing: julia cRe/cIm = ±2 and
   iterations=500 (more iterations erasing the set looks wrong), ammannBeenker order=3 at the default size,
   hyperbolic 100×100 at line 0.8 (empty, fine at 0.2), phyllotaxis count=1 / spacing=20 / dotSize=0.6, most
   generators at 5×5 and 5×61, apollonian at every small size.

5. **Thin material without a specific warning:** 30 non-empty results lose > 50% of their material to a
   0.84 mm opening with no rib/width warning — moire default (69%), celtic and lusona at ribWidth=0.4 (100%),
   hilbert at 5×5, delaunayTile random-11.

6. **Visual oddities to review (not measured failures):** small notches where ribs cross the tile boundary on
   hankin; fermatSpirals / gosper / arrowhead link strokes crossing motifs (the generators' notes say so);
   visible kinks at the boundary on some voronoiTile / delaunayTile tiles even with matching edges.

## Limits
- Pages 1 of every generator and a sample of later pages were viewed; not every one of the 87 sheets.
- Raster coverage agrees with the app's CrossSection area within 0.05 for 486 of 509 tiles checked (8 generators); the outliers are large
  tiles with sub-millimetre ribs at the capped raster resolution, where thin-loss is not computed.
- 2D tile output only — no surface application, booleans, export or printing.
