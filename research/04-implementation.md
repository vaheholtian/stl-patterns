# Implementation of research 04

The Pattern picker includes lusona, periodic maze, Celtic plait, Ammann–Beenker,
Islamic star strapwork, stitched Fermat spirals, Gosper, Sierpiński arrowhead,
terdragon, and Greek key. It also includes diamond lattice, square/rectangular
grid, round perforations, honeycomb, and rounded slots for simple cutout shells.
Black is the feature removed by through-cut; white is the kept material.

## Repeat audit and corrections

The picker distinguishes all-over surface patterns, repeating bands, and motifs
with visible repeats. Matching box edges alone does not make a bounded medallion
an all-over pattern. Fermat spirals and the three single-stroke fractals remain
motifs; Greek key and Hilbert remain bands. Their limitations are shown in the UI.

Celtic and lusona now use a periodic diagonal midpoint lattice, with seeded paired
turns and fused crossings. Neighbours wrap around the grid; there is no enclosing
panel, inset, reflection, or artificial closing chord. Connectivity is checked on
the periodic graph. Winding paths and opened barriers retain connected ribs in
both directions. These are connected networks, not a claim of one unicursal path.
The rounding control can merge turns when the ribs are large relative to cells.

The former planar maze ribbon has been replaced with periodic maze walls. A
spanning tree of passages on a torus leaves a connected dual wall network with
both winding directions. The existing generator ID is retained for saved recipes.
Old ribbon-style parameters are ignored. Celtic, lusona and maze bypass the
optional bridge pass when inverted, including when an old recipe enables it.

Delaunay and snapped Moire lines now extend beyond the crop before stroking;
clipping their centrelines had introduced artificial round caps at repeat edges.
Polygon simplification now runs on neighbouring repeats before the final crop,
even with minimum-feature filtering off. Previously it could independently pull
seam vertices inward, notably on Penrose and Voronoi.

Ammann–Beenker uses a strained Z4 acceptance window with Pell convergents. Hankin
uses a regular square/octagon tiling. Optional rib-width bridges connect separate
kept components and matched opposite-edge ports, without a perimeter frame.
Repair failures are reported. Reflection remains available for bounded motifs;
it doubles both source dimensions and does not hide their visible motif layout.

The simple perforation generators snap dimensions to complete periods and retain
webs between holes without repair bars. Their sizing controls include hole size,
rib width, and aspect ratio where relevant.

## Verification and scope

`npm test` (Node 24+) checks the manifold polygon pipeline, matching opposite edges
for all 15 all-over generators across three seeds with filtering on and off,
periodic Celtic connectivity across grids/densities, maze connectivity, simple
perforation spacing, printable extrusion, repair, and self-crossing stroke holes.
The edge tolerance is 0.02 mm, reflecting the 0.01 mm polygon simplification.
`npm run build` and `npm run lint` check app integration.

Browser checks cover generator previews, saved settings, mobile controls and the
Apply handoff. The supplied pen-cup.3mf is exercised with diamond cutouts, a 5 mm
through-cut, 4 mm solid edge margins and whole-repeat seam fitting. STL and 3MF
exports are reimported and checked for a single watertight body.

These checks do not guarantee every parameter combination or arbitrary 3D crop.
A solid outer margin supports ribs clipped at a finite region's boundary; small
layout scales can close holes or break ribs. Inspect the final model in a slicer.

Algorithm references are in 04-findings.md. Fermat spirals use linked circular
whorls, not Zhao et al.'s arbitrary-region algorithm; Hankin does not include a
general tiling library. No separate published single-line Apollonian tracer is
implemented. The algorithms were written locally.
