# Design decisions (brainstorm stage, nothing built)

Last updated: 2026-09-02. Supersedes all earlier versions of this file.

## Goal

A browser app that puts decorative patterns (Voronoi, geometric fractals, user SVG tiles) onto the surface of 3D parts and outputs a printable mesh, producing through-cuts, recessed cuts, or embossed relief. Parts are designed in Onshape and printed on a Bambu Lab A1 (0.4mm nozzle, single color, no AMS).

## Platform (decided 2026-09-01, replacing the earlier FeatureScript choice)

- **Browser app** with a 3D viewer. Loads STL or 3MF exported from Onshape, does layout and cutting on the mesh, exports STL or 3MF for Bambu Studio.
- **Onshape stays the design tool.** Shelling, wall thickness, and the base geometry are done there. The app never shells.
- **FeatureScript is retired** as the primary route. Reason: the requirements settled on arbitrary surfaces, instant dragging, and no need for round-tripping, all of which favor a mesh tool. Its parametric advantage is recovered by saving pattern settings as a recipe that can be re-applied to a re-exported mesh. Research on it (`research/01-findings.md`) is kept for reference; brief 02 is retired.
- Blender, Fusion, and OpenSCAD front ends rejected (user not comfortable with them).

## Two screens, one shared data model

**Screen 1: Pattern.** Creates or imports a flat vector tile. Output is a "tile" object: closed polygons (become holes or relief), open curves with a rib width (become grooves or ridges), a repeat box in millimeters, and the generator parameters plus seed so it can be regenerated. Flat preview. Tiles can be saved and exported as SVG, which also makes them reusable outside the app.

Pattern sources on this screen:
- Generated: Voronoi and Delaunay (periodic seeds so the tile is seamless), Truchet, guilloche, Hilbert, phyllotaxis, Sierpinski, Koch, Penrose, moire, hyperbolic tiling, Apollonian, Julia and Mandelbrot via raster threshold and trace.
- Imported: user SVG (black becomes hole, flip switch available).

**Screen 2: Apply.** Loads the mesh, selects a region, places the tile with a draggable origin, rotation, and scale, picks a mode and depth, runs the cut or emboss, checks printability, exports.

One special case lives on screen 2 rather than screen 1: **surface-native Voronoi**, where seeds are scattered on the mesh itself and cells are computed on the surface. It is not a flat tile and gives the classic seamless "Voronoi sphere" result with no mapping at all. Both flavors of Voronoi exist; the tile flavor is for consistency with other patterns, the surface flavor for the best result on doubly-curved shapes.

## Mapping (screen 2)

- **Region selection.** A mesh has no B-rep faces, so regions come from: automatic segmentation at sharp edges (handles sphere-on-prism), paint selection as a fallback, and multi-body 3MF where the user has split regions into separate bodies in Onshape. One region per operation; patterns do not continue across region boundaries.
- **Distortion policy on doubly-curved regions: Option 1.** The tile is undistorted at the origin handle and stretches gradually with geodesic distance; any seam falls on the far side. Flat, cylindrical, and conical regions map without distortion. Tiles are stretched by a few percent where needed so they repeat a whole number of times around a closed loop (user accepted: "it's art").
- **Handles.** One draggable origin (also the focal point for spirals and hyperbolic patterns), rotation, and scale. Scale stored in millimeters.

## Cut and emboss modes

- Through-cut (lampshade look). Wall thickness must already exist in the model.
- Recess to a depth.
- Emboss perpendicular to the surface, height customizable. Small overhangs accepted.
- Hole walls straight, no taper.

## Printability

- Minimum feature size derived from a line-width setting (default for a 0.4mm nozzle). Fractal recursion depth capped automatically from it. Manual override with a warning.
- Floating islands after a cut are detected and removed, with a count reported.
- Output must be manifold. Non-manifold results are treated as errors, not left for the slicer.
- Overhangs, bridging, and anything fixable in Bambu Studio are not checked.

## Dropped

- Organic patterns: L-systems, reaction-diffusion, noise contours, nested Voronoi, crack/branching style.
- Patterns crossing from one region to an adjacent one.
- Shelling inside the app.
- Native Onshape Wrap as a route (cylinder and cone only; irrelevant once the app maps to any surface).

## Research round 3 outcome and technical approach (2026-09-01, see research/03-findings.md)

**Verdict: every piece is feasible in the browser. One piece is real R&D (flattening a region for tile mapping); everything else is assembly of mature libraries plus small hand-written utilities.**

### Library stack (proposed)
- **three.js** with three-mesh-bvh: viewer, STL and 3MF loading, raycasting for the drag handles, surface point sampling, closest-point queries.
- **manifold-3d** (WASM): the workhorse. Chosen over three-bvh-csg, which an independent 2026 benchmark found produced non-watertight output in 978 of 1000 cases; manifold was watertight in 1000 of 1000. Beyond booleans, manifold provides (from Claude's knowledge of its API, to be confirmed against manifoldcad.org docs in the spike): `extrude` of 2D polygons, `warp` (apply a function to every vertex), `trimByPlane`, `decompose` (split into connected components), volume properties, `levelSet` (mesh from a signed distance function), and a `CrossSection` 2D type wrapping Clipper2 with polygon offset and booleans. If confirmed, one library covers booleans, tool-body construction, island detection, and 2D offsetting.
- **SVG flattening**: svg-path-parser plus svg-path-to-polygons, or paper.js if we want its guaranteed-error flattening.
- **fflate** (zip) for a hand-written minimal 3MF writer, since three.js has no 3MF exporter. 3MF is XML in a zip; a minimal writer is small. STL export also offered.
- **xatlas-three** (WASM LSCM) as the first candidate for region flattening. Fallback: hand-written LSCM or heat method adapted from CMU's ddg-exercises-js.
- Everything runs client-side. No backend. Hosting can be any static host or a local file.

### Key algorithms
- **Everything becomes closed polygons in tile space before 3D.** Open curves (Hilbert, Truchet, guilloche) are offset by half the rib width with round joins to become closed polygons. This removes the need for tube geometry and its manifoldness problems, and makes the minimum-rib check a 2D operation.
- **Tool bodies via extrude then warp.** Extrude the tile polygons into a flat slab of the chosen depth, then warp every vertex through the mapping: tile (x, y) becomes the surface point, and the slab's z becomes offset along the surface normal. Result follows the surface. Subtract for cuts, intersect and union for emboss. Self-intersection at concave corners is only a risk when depth approaches the local curvature radius, which is not the case for typical relief on printed parts.
- **Region flattening for Option 1.** Use a conformal (angle-preserving) flattening of the selected region, re-centered so the origin handle sits at the tile origin with unit scale there. Conformal maps keep local shape and vary only in scale, which is exactly "undistorted at the origin, stretching with distance." For closed regions such as a full sphere, remove a small cap at the point geodesically farthest from the origin; the remainder is a disk topologically and flattens without a seam. The removed cap is the "far side" and can be patterned separately with its own origin. The local scale factor of the map also gives a stretch-aware minimum-rib warning per location.
- **Surface-native Voronoi in 3D.** Scatter seeds on the region (area-weighted), relax by moving each seed to the centroid of its neighbors and snapping back to the surface. Each cell is a convex polyhedron: a bounding box trimmed by the bisector planes to its nearest neighbors. Rib width is obtained by moving each bisector plane inward by half the rib width. Cells are clipped to a slab around the region (built with `levelSet` from distance-to-region) so they do not cut unrelated geometry. Then one variadic boolean against the body. This is the classic "Voronoi sphere" construction and needs no mapping at all.
- **Region segmentation**: hand-written flood fill over face adjacency with a dihedral-angle threshold, plus click-to-select. Multi-body 3MF from Onshape as an alternative, pending a hands-on test.
- **Island detection**: `decompose` after the cut, drop components below a volume threshold, report the count.

### Spikes (the first things to be built, both throwaway)
1. **Voronoi-on-sphere timing.** Load a sphere shell STL, scatter 200 seeds, build cells with plane trims, subtract with manifold, decompose, export STL. Measure wall-clock time. Confirms manifold's API surface and the many-body boolean performance nobody has benchmarked.
2. **Tile mapping on a hemisphere.** Flatten a hemisphere with xatlas, re-center on a chosen point, warp a tile of circles onto it, cut, export. Confirms the flattening approach and the extrude-then-warp tool bodies.

If both pass, essentially all technical risk is retired.

### Phase outline (proposal, not started)
0. Spikes 1 and 2.
1. App skeleton: viewer, load STL and 3MF, region segmentation, export STL and minimal 3MF.
2. Apply screen with surface-native Voronoi: cut, recess, emboss, islands, min rib.
3. Pattern screen: tile model, Voronoi tile, Truchet, guilloche, Hilbert, SVG import, SVG export.
4. Tile mapping: flattening, origin/rotation/scale handles, extrude-then-warp tool bodies, stretch-aware warnings.
5. Tier 2 and 3 patterns, recipe save and load, polish.

## Open items

- Resolved 2026-09-02: an Onshape 3MF export keeps bodies as separate named objects (see research/reference/bambu-3mf-structure.md). Pre-splitting regions in Onshape is a supported workflow. Onshape exports in **meters**; the app's 3MF reader must be units-aware.
- Confirm the manifold-3d API list above against current docs during spike 1.
- Bambu Studio's auto-repair behavior is undocumented; the app relies on manifold's watertight guarantee instead and does not lean on the slicer.
- Resolved 2026-09-02, **UI stack**: React + TypeScript on Vite.
- Resolved 2026-09-02, **hosting**: GitHub Pages from a GitHub repo. The project folder is not a git repo yet; making it one is the first setup step when building starts. Development runs on a local Vite dev server.
- Resolved 2026-09-02, **density gradients: both, in order**. First, tile-level gradients on the Pattern screen (uniform, radial from a point, linear along a direction), saved with the tile. Only once that is polished, add surface-level density for surface-native Voronoi on the Apply screen, driven by distance from the origin handle. Mapping stretch stays a separate effect and is never presented as a gradient.
