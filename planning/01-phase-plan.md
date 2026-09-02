# Phase plan

Written 2026-09-02. Companion to `00-decisions.md`, which holds the why; this file holds the what and in which order. Nothing here is started.

Conventions:
- Each phase ends with something you can see or print. No phase is "done" on code alone.
- A phase's acceptance list is the test; if it fails, the phase is not done.
- Anything marked **You** is a step only you can do (modeling in Onshape, printing, judging the look).
- Library facts marked "confirm" are from Claude's memory of manifold-3d's API and are verified in Phase 0 before anything depends on them.

---

## Phase 0: Setup and spikes

**Goal.** Prove the two risky pieces with throwaway code before building anything real, and stand up the repo.

### 0.1 Project setup
- Turn `C:\Code\STL-patterns` into a git repo. Create the GitHub repo. Push.
- Scaffold Vite + React + TypeScript. Add three.js, three-mesh-bvh, manifold-3d, fflate. Pin versions.
- GitHub Pages deploy workflow (build on push to main, publish `dist/`). Confirm the empty app loads at the Pages URL.
- Folder layout: `src/app` (screens), `src/geom` (pure geometry, no React), `src/io` (loaders, exporters), `src/patterns` (generators), `spikes/` (throwaway, deleted at end of phase).
- Manifold and heavy geometry run in a **web worker** from day one so the UI never freezes. Set up the worker plumbing here even though the spikes could run on the main thread.

### 0.2 Spike A: Voronoi cut on a sphere shell
- Build a sphere shell in code with manifold (sphere minus smaller sphere, 60 mm outer, 1.6 mm wall). No file loading.
- Scatter 200 seeds on the outer surface (area-weighted on triangles). One pass of relaxation: move each seed to the mean of its nearest neighbors, snap back to the surface.
- For each seed: start from a box, trim by the bisector planes to its k nearest neighbors (k around 12), each plane moved inward by half the rib width (2 mm rib). This is the cell tool body.
- Subtract all cells from the shell in one variadic boolean. Decompose the result, count components, drop tiny ones. Export STL.
- Measure wall-clock time for: seed and cell construction, the boolean, decompose.
- Confirm these manifold-3d calls exist and behave as expected: `extrude`, `warp`, `trimByPlane`, `decompose`, volume/surface properties, `levelSet`, `CrossSection` with `offset` and booleans, variadic `difference`/`union`. Write the confirmed list into `00-decisions.md`.
- **Acceptance:** boolean plus decompose under 10 seconds in the browser on your PC; output watertight (manifold reports it); ribs visibly continuous; component count equals 1 after dropping islands.

### 0.3 Spike B: tile mapping on a hemisphere
- Build a hemisphere shell in code. Flatten its outer surface with xatlas-three. Re-center the flattening so a chosen surface point maps to (0,0) with unit scale, oriented along a chosen tangent direction.
- Make a tile of circles (8 mm pitch, 4 mm holes). Repeat it across the flattened region.
- Build tool bodies by extruding the circles into a 4 mm slab, then warping each vertex: (x, y) through the inverse map to a surface point, z along the interpolated normal. Subtract. Export STL.
- **Acceptance:** circles near the origin are round to the eye; stretch grows smoothly toward the rim; no visible seam; boolean succeeds and output is watertight. If xatlas's chart cuts land inside the region or distortion is ugly, record it and try the fallback (hand-written LSCM with the origin pinned) before leaving the phase.

### 0.4 Gate
- Both spikes pass: proceed. Delete `spikes/`.
- Spike A fails on time: reduce k, batch cells, or clip cells to a thinner slab; re-measure. If still over budget, revisit the decision log before Phase 2.
- Spike B fails: Phase 4 gets the fallback flattening as its first task; Phases 1 to 3 are unaffected.

---

## Phase 1: App skeleton

**Goal.** Load your Onshape export, pick a region, export it back out, and have Bambu Studio accept it. No patterns yet.

- Two-screen shell: Pattern (placeholder) and Apply. Simple top-level switch, no router needed.
- Viewer: three.js scene, orbit controls, lighting, grid, millimeter scale.
- **STL loader** (three.js). **3MF reader**, units-aware: parse `unit`, scale to millimeters, keep each `<object>` separate with its name, apply build-item transforms. Either fix up three.js's loader or write a small parser; the Onshape sample in `research/reference/onshape-3mf-sample/` is the test file.
- Object list panel: shows loaded bodies by name, toggles visibility, selects the active body.
- Region selection: (a) whole body; (b) click a triangle, flood-fill across neighbors while the dihedral angle stays under a threshold slider; (c) shift-click to add, alt-click to remove. Selected region tinted. Store as a set of triangle indices.
- Mesh into manifold: convert the active body to a manifold object in the worker; report whether it is watertight. If not, say so and stop; the app does not repair.
- **Exporters:** binary STL, and a minimal 3MF writer (core spec, millimeters, one object per body, names preserved) zipped with fflate. Use `research/reference/bambu-3mf-structure.md` as the template.
- Deploy to GitHub Pages.
- **You:** model the pen cup in Onshape (about 60 mm diameter, 80 mm tall, 1.6 mm wall, open top, 2 mm solid bottom), export 3MF at the finest tessellation, load it.
- **Acceptance:** the cup loads at the right size in millimeters; clicking the outer wall selects the wall and stops at the rim and bottom edges; exporting and opening in Bambu Studio shows the same cup at the same size with no repair warnings.

---

## Phase 2: Surface-native Voronoi, cut, recess, emboss. Test 1.

**Goal.** Your first real print: the Voronoi pen cup.

- Panel: cell size in mm (converted to seed count from region area), relaxation passes, rib width, seed, mode (through-cut, recess, emboss), depth or height, line-width setting for the printability floor.
- Seeds: area-weighted scatter restricted to the region; relaxation with snap-back via BVH closest point.
- Cells: as in Spike A, now clipped to a **region slab** so cells never touch geometry outside the region. Slab built by `levelSet` over "distance to region triangles" at plus and minus depth (confirm in Phase 0), or, if that proves slow, by extruding region triangles along vertex normals to plus and minus depth.
- Modes: through-cut = subtract cells; recess = subtract (cells intersected with an outer slab of the given depth); emboss = union (cells intersected with a slab from the surface outward by the given height).
- Printability: rib width clamped to at least two line widths, with a warning if the user overrides; after the operation, decompose, drop components under a volume threshold, report "removed N islands".
- Preview: show the seed points and cell outlines on the surface before running, so parameters can be tuned cheaply; the boolean runs on a button.
- Progress and cancel for the worker.
- Export STL and 3MF.
- **You:** cut the cup wall (excluding the bottom and a rim band), cells around 8 mm, ribs 2 mm, print it.
- **Acceptance (Test 1):** the cup prints without slicer errors and without supports; ribs measure at least 2 mm; no loose fragments; the app reported zero or a plausible number of removed islands.

---

## Phase 3: Pattern screen

**Goal.** Make and import flat tiles, export them as SVG. Nothing 3D yet.

- **Tile model:** closed polygons (hole or relief), open curves with rib width, repeat box in mm, generator id, parameters, seed. JSON-serializable. Save to file and to browser storage; load back.
- Flat canvas preview with a 3 by 3 repetition so seams are visible while editing.
- 2D pipeline: open curves are offset by half the rib width with round joins into closed polygons (manifold's CrossSection, confirmed in Phase 0); polygons unioned; minimum feature check in 2D against the line-width floor.
- Generators, in order: Voronoi tile (periodic seeds so it tiles seamlessly, relaxation, rib width, plus Delaunay variant), Truchet (grid size, arc or diagonal variants, seed), guilloche (radii, frequencies, phase, rib width), Hilbert (order, rib width).
- **Density gradients, tile-level:** uniform, radial from a point, linear along a direction. Applied to Voronoi seed density first; other generators get it only where it makes sense.
- **SVG import:** parse paths, flatten curves to a tolerance, fill rule handling, black becomes hole with a flip switch, size in mm from the SVG's units or a user override. Text and live fills must already be outlined; say so in the UI.
- SVG export of any tile.
- **Acceptance:** every generator renders, tiles seamlessly in the 3 by 3 preview, and exports an SVG that reopens in Inkscape or a browser; an imported SVG round-trips through export unchanged in shape.

---

## Phase 4: Tile mapping. Tests 2 and 3.

**Goal.** Put a tile on any region with dragging, and print the results.

- Flattening of the selected region with xatlas-three (or the Phase 0 fallback). Per-vertex UV plus per-triangle scale factor.
- **Closed regions:** detect no boundary; find the point geodesically farthest from the origin (Dijkstra over edges is enough), remove a small cap there, flatten the rest.
- **Annular regions** such as a cylinder wall: detect two boundary loops, cut a seam from one to the other, flatten, and compute the loop length so the tile is stretched to repeat a whole number of times around.
- Handles: origin dragged by raycasting onto the region; rotation handle; scale handle. Tile is re-laid out in flattened space on every drag; only outlines are drawn until the user hits Apply.
- Tool bodies: extrude the tile polygons into a slab, warp through the inverse map (locate the 2D point in a UV triangle, barycentric to 3D, offset along interpolated normal). Same three modes as Phase 2.
- Stretch-aware warning: color triangles where local scale pushes the rib width below the floor.
- **You, Test 2:** Truchet tile embossed about 0.8 mm on the same pen cup. Prints as a second cup or on a fresh one.
- **You, Test 3:** model a sphere merging into a prism, shelled. Your own SVG tile through-cut on the sphere region, a different tile on one prism face. Print.
- **Acceptance (Test 2):** the pattern goes around the cup with no visible seam; dragging feels immediate; emboss prints cleanly.
- **Acceptance (Test 3):** the sphere region flattens with the cap on the far side; the tile is undistorted near the origin; segmentation separates sphere from prism cleanly; both regions print.

---

## Phase 5: More patterns, recipes, polish

**Goal.** Fill out the pattern list and make results repeatable.

- Tier 2 generators: phyllotaxis, Sierpinski carpet, Koch, Penrose, moire.
- Tier 3: hyperbolic tiling, Apollonian gasket, Julia and Mandelbrot via raster threshold and contour trace.
- **Recipes:** save tile plus placement plus mode plus region description; re-apply to a re-exported mesh of the same part. Region is re-found by nearest-triangle matching from the saved origin and normal.
- Surface-level density for surface-native Voronoi, driven by distance from the origin handle (the second half of the gradient decision).
- Quality of life: undo of the last operation, multiple operations on one body in sequence, keyboard shortcuts, error messages that say what to fix.

---

## Risks carried across phases

| Risk | Where it bites | Mitigation |
|---|---|---|
| Many-body boolean too slow | Phase 2, 4 | Spike A measures it first; batch cells; thinner slabs; fewer neighbors |
| Flattening ugly or seamed | Phase 4 | Spike B tests early; pinned LSCM fallback; surface-native Voronoi covers the worst shapes anyway |
| Non-watertight input from Onshape | Phase 1 onward | Detect and refuse; tell the user to fix the model; do not repair |
| Manifold API differs from memory | Phase 0 | Confirmed in Spike A before anything depends on it |
| Bambu Studio rejects our 3MF | Phase 1 | Minimal core-spec writer modeled on Bambu's own file; STL as fallback |
| Self-intersecting tool bodies at concave corners | Phase 4 | Keep depth well under local curvature radius; warn when it isn't |
