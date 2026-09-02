# Research brief 03: the browser mesh route as an alternative to FeatureScript

**Research only. Do not write code, do not scaffold a project.**
Write the report to `C:\Code\STL-patterns\research\03-findings.md` using the format at the bottom.

## Context

The user designs parts in Onshape and prints on a Bambu Lab A1 (0.4mm nozzle, single color). They want to put patterns on the surface of arbitrary parts (spheres, prisms, a sphere merging into a prism, anything) as through-cuts, recessed cuts, or embossed relief perpendicular to the surface. Pattern sources:

- Voronoi / Delaunay cells generated directly on the surface (seed count, relaxation, density gradient, rib width).
- Geometric generative patterns: Truchet tiles, guilloche / spirograph curves, Hilbert curve, phyllotaxis, Sierpinski, Koch, Penrose, moire.
- User-supplied SVG tiles (black/white artwork) repeated over the surface. On doubly-curved faces the accepted policy is: pattern is undistorted at a user-placed origin point and stretches gradually with distance from it; any seam falls on the far side.

**The browser route is now the chosen platform** (decided 2026-09-01; Onshape FeatureScript was evaluated in `01-findings.md` and retired). This brief is the primary research pass. The app is **a browser-based tool** that loads an STL or 3MF exported from Onshape, does pattern layout and cutting on the mesh, and exports STL or 3MF for Bambu Studio. The user has no Blender or Fusion skills, so those are not options; a browser tool with drag interaction is.

The app has two screens: a **Pattern** screen that produces a flat vector tile (closed polygons, open curves with rib width, a repeat box in mm), and an **Apply** screen that loads the mesh, selects a region, places the tile with a draggable origin, and runs the cut or emboss. A special "surface-native Voronoi" mode on the Apply screen scatters seeds on the mesh itself and needs no mapping.

Do not research: Blender addons, Fusion plugins, OpenSCAD front ends, desktop Python apps. Browser-first only, though a Node or WASM library that runs in the browser counts.

## Questions

### A. Existing tools that already do this (highest priority)

Search for web tools or open-source projects that put a Voronoi or other pattern onto a mesh surface and export a printable mesh. Known names to check: Voronator, "MeshMixer make pattern" (desktop, note only as a reference for the effect), any "Voronoi STL generator", "lattice on STL", "surface pattern STL web". For each: URL, open source or not, license, what it does, what it cannot do (arbitrary surfaces? emboss? SVG input?), and whether it looks maintained (last commit or update date).

### B. Libraries for each building block

For each block, name the best two or three browser-usable candidates with: name, URL, license, WASM or pure JS, approximate bundle size, last release date, and one line on maturity. Say "none found" when true.

1. **Loading and saving meshes.** STL binary and ASCII, 3MF read and write. three.js loaders and exporters, and anything that writes 3MF with multiple objects or metadata Bambu Studio respects.
2. **Mesh booleans.** manifold-3d (WASM), three-bvh-csg, any others. Note robustness claims, whether they require manifold input, and any published performance figures for hundreds of tool bodies.
3. **Surface sampling and Voronoi on a mesh.** How to scatter points on a mesh surface (area-weighted sampling), relax them (Lloyd), and compute cells restricted to the surface. Look for geodesic Voronoi implementations in JS or WASM (geometry-central compiled to WASM? Anything else?). Also note the simpler approach of clipping 3D Voronoi cells against the surface, and any library that produces 3D Voronoi cells (e.g. Voro++ ports).
4. **Geodesic distance and the exponential map.** For the "undistorted at the origin, stretch with distance" policy, the tool needs geodesic distance and direction from a point across the mesh. Look for heat-method or fast-marching implementations in JS/WASM, and any library that computes a local flattening (exponential map, or "geodesic polar coordinates") around a point.
5. **Mesh parameterization.** LSCM, ABF, or similar UV unwrapping in the browser. Probably rare; record what exists.
6. **Offsetting a surface.** Turning a surface patch or a closed curve on the surface into a solid tool body: mesh offset / thickening in the browser (manifold's offset? anything else).
7. **SVG parsing and 2D geometry.** Parsing SVG paths to polygons with curve flattening (paper.js, svg-path-parser, flatten-js), polygon boolean and offsetting (clipper2 WASM, polygon-clipping), and tiling a polygon set over a plane.
8. **Sweeping a tube along a curve.** For Hilbert, Truchet, guilloche ribs: three.js TubeGeometry or equivalents, and whether the result is manifold enough for booleans.
9. **Island detection and printability.** Splitting a mesh into connected components, measuring component volume, measuring minimum wall thickness (any library, or note it must be hand-rolled).
10. **Interaction.** Dragging a point on a mesh surface in three.js (raycasting), transform gizmos, and any example of dragging a decal or texture origin on a mesh.
11. **Region segmentation.** A mesh has no CAD faces. Look for browser-usable methods or libraries that split a mesh into regions at sharp edges (dihedral angle threshold), flood-fill selection from a clicked triangle, and paint selection. Also confirm whether Onshape can export a multi-body 3MF where each body stays a separate object (so the user can pre-split regions in Onshape), and whether three.js 3MF loading keeps them separate.
12. **Extruding a mapped 2D polygon into a tool solid.** Given a polygon lying on the mesh surface (vertices on the surface, each with a normal), the app needs a closed solid that follows the surface, offset inward and outward along normals. Look for any library doing "extrude along normals" or "thicken a surface patch" that yields a manifold solid usable in a boolean; otherwise note that it must be hand-built and what the pitfalls are (self-intersection at concave corners).

### C. Performance reality check

Find any published or forum-reported figures for manifold-3d or three-bvh-csg doing booleans with 100 to 1000 small tool bodies against a mesh of 50k to 500k triangles in the browser. Even rough anecdotes with numbers are useful. Say "none found" if so.

### D. Bambu Studio input considerations

- Does Bambu Studio prefer 3MF over STL for anything relevant here (units, multiple objects, mesh repair)?
- Does Bambu Studio auto-repair non-manifold input, and how far can that be relied on? (User's rule: the tool must not produce errors that the slicer cannot fix.)

## Rules

- Prefer official docs, GitHub READMEs, and release pages. Note dates; the JS ecosystem moves fast.
- Do not guess at library capabilities. If a README does not say it, mark "unverified".
- "Not found" is a valid and useful answer.
- Keep opinions in the Assessment section, labeled.

## Output format

```
# Findings 03: browser mesh route

## 1. Existing tools
One block per tool: URL, open source (yes/no, license), what it does, what it cannot do, maintained (date), did I try it or only read about it.

## 2. Libraries by building block
One subsection per B1 to B10, with a table: | Library | URL | License | JS/WASM | Size | Last release | Maturity note |

## 3. Performance reality check
Bullets with numbers and sources.

## 4. Bambu Studio input
Bullets.

## 5. Not found
What was searched and not found, with where.

## 6. Assessment (opinion, labeled)
- Which building block is the weakest link in the browser route.
- Whether a browser tool could realistically do Voronoi through-cuts on a 200k-triangle sphere in under ten seconds, with reasoning.
- Whether the "undistorted at origin" mapping is easier or harder in the browser than in FeatureScript, with reasoning.
- One paragraph: if you had to pick FeatureScript or browser for this project based only on what you found, which and why.

## 7. Sources
Numbered URLs with access dates.
```
