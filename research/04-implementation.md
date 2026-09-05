# Implementation of research 04

The shortlist is available in the Pattern picker: lusona, unicursal maze (ribbon
or walls), Celtic plait, Ammann–Beenker, Islamic star strapwork, stitched Fermat
spirals, Gosper, Sierpiński arrowhead, terdragon, and Greek key.

New selections start with **Invert**, **Seamless**, and **Connect material across
repeats** enabled. Black remains the cut feature; white is the kept material.
The Apply screen receives the same polygons, and Auto uses repeated layout.
Saved tile definitions preserve these settings.

## Seamless repeats and cutout connectivity

- Ammann–Beenker uses a Z⁴ acceptance window strained with Pell convergents.
  Hankin uses a regular square/octagon tiling. Greek key joins horizontally.
- Other families use the existing 2 × 2 reflection to form a rectangular repeat.
  This deliberately introduces mirror symmetry; the repeat is twice the source
  width and height. Source curves alone are not advertised as periodic.
- Rib-width bridges connect the kept material and matched ports on opposite
  edges, in both directions. There is no default perimeter frame. Tangential
  bridge contacts are shared within a rib-width collar at opposite edges.
- Minimum-feature filtering runs over neighbouring repeats before final clipping,
  avoiding artificial borders caused by filtering each tile separately.
- Connectivity is checked after clipping/filtering/bridging. A failed repair
  reports an error rather than returning a claimed connected tile. The bridge
  search has a fixed work budget and falls back to a longer connection.
- This is a tile-level guarantee. Cropping on an irregular 3D region and small
  layout scales can still break ribs; inspect the resulting model.

## Algorithm scope

Lusona and Celtic plait share a midpoint graph with seeded mirror/barrier
pairings. Distinct circuits are merged and every edge is checked during the final
walk. Celtic styling rounds the turns; crossings are fused, without over-under
gaps. The maze traces a planar spanning-tree contour or renders its connected
walls. Its seamless form uses reflection and bridges, not an unverified toroidal
contour construction.

Fermat spirals are double-arm circular whorls joined in a rectangular serpentine
grid. This is explicitly a simpler variant, not the arbitrary-region decomposition
algorithm from Zhao et al. Greek key and the three fractals use direct paths.
Hankin implements the greedy ray-pairing rule on regular squares/octagons; it does
not include a general tiling library. Rejected/unverified survey candidates are
not added. Existing Apollonian, Julia and Truchet can use the same material repair;
this does not implement the separate published single-line Apollonian tracer.

Algorithm references are recorded in `04-findings.md`; the implementation was
written locally, without copying third-party implementations.

## Verification

`npm test` (Node 24+) exercises the actual manifold-3d polygon pipeline, source
traversals over varied seeds/grids, matching opposite cut edges, 2 × 2 material
connectivity, extrusion into one body, old-pattern repair, and hollow lobes in
self-crossing strokes. `npm run build` and `npm run lint` check app integration.
Browser checks exercise every picker entry, saved settings, mobile controls and
the Apply handoff. A box-wall through-cut is checked with island removal disabled.
