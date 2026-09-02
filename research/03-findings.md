# Findings 03: browser mesh route

Research method note: done via web search plus automated page-fetch summarization (no interactive browser, no code run). "Did I try it" below always means "no" unless stated — nothing was installed or executed in this pass.

## 1. Existing tools

### Voronator (voronator.com)
- URL: https://www.voronator.com
- Open source: unverified — no source repo found; appears to be a hosted service. Description says it uses Admesh, Stltools, Meshlab, Blender and VTK on the backend (server-side, not browser-only).
- What it does: Upload an existing 3D model (STL/PLY/DAE/OBJ, ≤20MB), get back an STL/PLY with a Voronoi-effect surface applied, in 1–3 minutes.
- What it cannot do: No indication of arbitrary emboss/recess depth control, no SVG tile input, no drag-to-place origin, no evidence of a "layout then apply" split — it's a one-shot batch converter, not an interactive editor. Whether it handles doubly-curved surfaces well or only does a generic mesh-wide effect is unconfirmed.
- Maintained: unknown — no version/changelog information found.
- Did I try it or only read about it: only read about it (aggregator/description pages, not the tool itself).

### Voronoizer (github.com/gabr42/voronoizer)
- URL: https://github.com/gabr42/voronoizer
- Open source: yes (GitHub); license not confirmed in this pass.
- What it does: Command-line tool. Turns an STL into a Voronoi-perforated shell — samples points evenly across the input surface and cuts organic, smooth-edged holes following the Voronoi tessellation of those points.
- What it cannot do: Command-line, not browser-based (out of scope per the brief but noted as the closest same-idea tool); no SVG input; no interactive placement; through-cuts only (a "perforated shell," not recess/emboss modes) as far as the description goes.
- Maintained: not confirmed — last-commit date not retrieved.
- Did I try it or only read about it: only read about it.

### tjwill95/voronizer (GitHub)
- URL: https://github.com/tjwill95/voronizer
- Open source: yes; license not confirmed.
- What it does: Generates Voronoi-based **infill and supports** for 3D printing — a different use case (internal lattice/support structure) rather than a surface-decoration pattern.
- What it cannot do: Not a surface-pattern tool at all; noted here only because it surfaced repeatedly in search and could be a source of reusable Voronoi-on-mesh code (point sampling, cell computation) even though its end goal differs.
- Maintained: not confirmed.
- Did I try it or only read about it: only read about it.

### WebSVG Voronoi generator (websvg.github.io/svg_voronoi_gen, github.com/WebSVG/voronoi)
- URL: https://websvg.github.io/svg_voronoi_gen/ ; source at https://github.com/WebSVG/voronoi
- Open source: yes.
- What it does: A **2D, flat-plane** parametric Voronoi generator with real-time editing and SVG export. Not a mesh tool at all.
- What it cannot do: No mesh/surface awareness whatsoever — it produces a flat SVG. Directly useful only as (a) a possible source of 2D Voronoi-generation code to adapt, or (b) a way to pre-generate a Voronoi "tile" as an SVG that then gets fed through the SVG-tile pipeline instead of the surface-native Voronoi mode.
- Maintained: unknown.
- Did I try it or only read about it: only read about it.

### VoronoiWall (github.com/donsheehy/VoronoiWall)
- URL: https://github.com/donsheehy/VoronoiWall
- Open source: yes.
- What it does: Generates, visualizes, and processes geometric Voronoi diagrams; can output an STL encoding Voronoi facets.
- What it cannot do: Appears to be a general geometric/teaching tool rather than a "load your mesh, wrap a pattern on it" pipeline; not confirmed to support arbitrary input surfaces.
- Maintained: unknown.
- Did I try it or only read about it: only read about it.

### Meshmixer "make pattern" / Voronoi (reference only, per brief instructions)
- Desktop tool, out of scope for adoption, noted only as the effect users compare against. Instructables and forum sources describe using Meshmixer's pattern + attractor tools to get a Voronoi-like cut on a curved part. No browser equivalent with the same interactive quality was found.

**Overall for section 1:** no existing web tool was found that does the specific combination this project needs — interactive origin placement, SVG-tile wrapping with the "undistorted at origin, stretch with distance" policy, and a choice of through-cut/recess/emboss on an arbitrary (not just cylindrical) surface. Voronator is the closest to "upload a mesh, get a Voronoi surface back" but is a batch black box, not an editor, and its distortion/mapping behavior on doubly-curved surfaces is unknown.

## 2. Libraries by building block

### B1. Loading and saving meshes

| Library | URL | License | JS/WASM | Size | Last release | Maturity note |
|---|---|---|---|---|---|---|
| three.js STLLoader (official addon) | threejs.org/docs/pages/STLLoader.html | MIT | JS | part of three.js | tracks three.js releases | Mature, official, handles both binary and ASCII STL. |
| three.js STLExporter (official addon) | threejs.org/docs/pages/STLExporter.html | MIT | JS | part of three.js | tracks three.js releases | Mature, official; import path is `three/addons/exporters/STLExporter.js`. |
| three.js 3MFLoader (official addon) | github.com/mrdoob/three.js/blob/master/examples/jsm/loaders/3MFLoader.js | MIT | JS | part of three.js | tracks three.js releases | Confirmed to parse per-object `<item>`/`objectId` build items and per-object resource entries, and supports components (hierarchical composition) — strongly suggests separate objects are preserved as distinct entities, but the exact mesh-instantiation code that would prove objects stay separate (vs. getting merged into one geometry) was not visible in the portion of the file retrieved (file is 1621 lines; only ~1000 seen). **Treat "keeps 3MF bodies separate" as likely but not fully confirmed.** |
| three.js 3MF exporter | — | — | — | — | — | **None found.** Three.js ships a 3MF *loader* but explicitly has no official 3MF *exporter* (confirmed open GitHub feature request, unresolved). This is a real gap: the app needs to **write** 3MF for Bambu Studio, and three.js alone won't do it. |
| lib3mf (WASM) | not directly searched this pass | — | — | — | — | Not evaluated in this pass — flagged as the most likely place to find a real 3MF writer; follow-up search needed. **Not found in this pass = a gap, not a confirmed absence.** |

### B2. Mesh booleans

| Library | URL | License | JS/WASM | Size | Last release | Maturity note |
|---|---|---|---|---|---|---|
| manifold-3d | github.com/elalish/manifold, npm `manifold-3d` | Apache-2.0 (per repo convention; not independently re-verified this pass) | WASM (JS/TS bindings) | not measured | v3.1.1 seen in one snippet ("published 15 days ago" relative to search date); v2.1.0/2.4.2 also referenced — actively released | The most credible option. Guarantees manifold (watertight) output from its Boolean algorithm — a real differentiator. Independent 2026 benchmark (Polydera, see §3) found it slower than a commercial "trueform" baseline but **reliably watertight on 1000/1000 test pairs**. |
| three-bvh-csg | github.com/gkjohnson/three-bvh-csg, npm `three-bvh-csg` | MIT | pure JS (on top of three-mesh-bvh) | not measured | v0.0.17 referenced in the benchmark; active | Fast on simple cases (author claims >100× faster than old BSP-based three.js CSG on complex cases) but the same 2026 independent benchmark found it produced an **open (non-watertight) mesh in 978 of 1000 test pairs** at 200K–1.5M-polygon scale — a serious robustness red flag for anything beyond simple/small geometry. Requires manifold, watertight, non-self-intersecting input brushes as a precondition. |
| three-csg-ts / ThreeCSG (older BSP-based forks) | npm `three-csg-ts`, github.com/samalexander/three-csg-ts | MIT-family | pure JS | small | older/less active | Legacy BSP-tree CSG; noted only because it recurs in search results. No performance or robustness data found; superseded in community discussion by three-bvh-csg. Not recommended as primary. |

### B3. Surface sampling and Voronoi on a mesh

| Library | URL | License | JS/WASM | Size | Last release | Maturity note |
|---|---|---|---|---|---|---|
| three.js MeshSurfaceSampler | threejs.org/docs/pages/MeshSurfaceSampler.html | MIT | JS | part of three.js | tracks three.js | Confirmed: does **area-weighted random point sampling** on a mesh surface (O(n) build, O(log n) per sample) — directly answers the "scatter points on a mesh surface" need. Does not do Lloyd relaxation or Voronoi cells itself. |
| geometry-central | geometry-central.net | MIT (per project convention; not re-verified) | C++ (no confirmed WASM/JS build found) | — | active project, has a documented "Geodesic Centroidal Voronoi Tessellations" algorithm page | This is the most directly relevant *algorithm* (geodesic CVT = geodesic Voronoi + Lloyd relaxation on a mesh, exactly what's needed) but it is a C++ library; **no WASM/browser build was found in this pass**. Would need to be compiled to WASM (feasible — it's used in other WASM geometry-processing demos — but not a ready off-the-shelf browser package). |
| SurfaceVoronoi (github.com/sssomeone/SurfaceVoronoi) | github.com/sssomeone/SurfaceVoronoi | unverified | C++ (SIGGRAPH Asia 2022 research code) | — | research-grade, not a maintained library | Academic reference implementation of Voronoi diagrams over mesh surfaces with an arbitrary geodesic-distance solver. Not browser-usable as-is. |
| ddg-exercises-js (CMU) | github.com/cmu-geometry/ddg-exercises-js | unverified (educational repo) | JS | small | educational/course material, not a maintained production library | Contains a JS `HeatMethod` implementation (see B4) that could be adapted, but it's coursework code, not a packaged npm module — expect to need real adaptation work, not `npm install`. |

None found: a ready-made, maintained, browser/WASM package that does "scatter + relax + geodesic-Voronoi-cells-on-a-mesh" as a single importable library. Every piece exists in research form or as a partial building block; assembling them is on the project.

### B4. Geodesic distance and the exponential map

| Library | URL | License | JS/WASM | Size | Last release | Maturity note |
|---|---|---|---|---|---|---|
| geometry-central (Heat Method / Vector Heat Method / Signed Heat Method) | geometry-central.net/surface/algorithms/... | MIT-family (unverified) | C++, no confirmed WASM build | — | active | Has exactly the needed algorithms documented (heat method for geodesic distance; **vector heat method**, which is the standard way to transport a direction/frame across a surface — i.e., the exponential-map building block) but again C++-only as found. |
| ddg-exercises-js HeatMethod | github.com/cmu-geometry/ddg-exercises-js | unverified | JS | small | course material | A real, working JS heat-method implementation exists (confirmed by a docs page for `module-Projects.HeatMethod`), giving a concrete starting point for a from-scratch browser geodesic-distance solver even without a packaged library. |
| Dedicated exponential-map / geodesic-polar-coordinates JS library | — | — | — | — | — | **None found.** This is squarely an unsolved-in-the-ecosystem building block; searches turned up only academic papers describing the math (geodesic polar coordinates / logarithmic map around a point), not a JS/WASM implementation. |

### B5. Mesh parameterization

| Library | URL | License | JS/WASM | Size | Last release | Maturity note |
|---|---|---|---|---|---|---|
| xatlas.js | github.com/repalash/xatlas.js | MIT (xatlas upstream is MIT; wrapper license not independently re-verified) | WASM | not measured | actively maintained per repo description | Real, existing WASM port of xatlas (chart segmentation + **LSCM**-based parameterization + atlas packing). This is the strongest finding in the whole brief for B5 — a genuine, ready browser LSCM implementation. |
| xatlas-three | github.com/repalash/xatlas-three | MIT (unverified) | WASM + three.js integration, webworkers | not measured | companion package to xatlas.js | Same engine, wired directly to three.js `BufferGeometry` — lower integration effort if the app is already three.js-based (which it is, per B1/B2/B10). |

As predicted by the brief, this block is rare — but not empty, which is a genuinely useful finding: xatlas.js/xatlas-three could plausibly stand in for a general "flatten this surface region" step if the geodesic/exponential-map route (B4) proves too hard to build from scratch, at the cost of xatlas's charts not being guaranteed distortion-minimal at a single user-chosen origin the way a true exponential map would be.

### B6. Offsetting a surface

| Library | URL | License | JS/WASM | Size | Last release | Maturity note |
|---|---|---|---|---|---|---|
| manifold-3d `levelSet()` | npmjs.com/package/manifold-3d | Apache-2.0 (unverified) | WASM | — | active | Confirmed real method: `levelSet(sdf, bounds, edgeLength, level?, tolerance?) → Manifold`, builds a manifold mesh from a signed-distance function via a marching-tetrahedra-family method. This is a workable **indirect** offset/thicken path (build an SDF for "distance to surface patch," level-set it) rather than a direct "offset this mesh by Xmm" call. |
| manifold-3d direct offset/thicken/shell function | github.com/elalish/manifold | — | — | — | — | **Not found / does not exist yet.** The project's own wiki roadmap lists "add extrusion constructors" and "add slicing function" as *planned*, not implemented. No `offset()`, `thicken()`, or `shell()` API was found in the JS bindings. |

Net finding for B6: there is no one-call "offset this surface patch by N mm" function anywhere in the browser-usable ecosystem. The realistic path is either (a) hand-build offset-along-normals geometry (see B12, same unsolved problem) or (b) go through manifold's SDF/`levelSet()` route, which is real but adds real complexity (defining a correct SDF for an arbitrary surface patch is itself nontrivial).

### B7. SVG parsing and 2D geometry

| Library | URL | License | JS/WASM | Size | Last release | Maturity note |
|---|---|---|---|---|---|---|
| svg-path-parser | npmjs.com/package/svg-path-parser | unverified | pure JS | small | mature/stable | Parses SVG path `d` strings into command objects (handles relative→absolute conversion). Parsing only, no curve flattening. |
| svg-path-to-polygons | npmjs.com/package/svg-path-to-polygons | unverified | pure JS | small | unverified recency | Does the actual curve-to-polyline step with adaptive subsampling and a tolerance parameter — pairs naturally with svg-path-parser or can be used standalone; outputs arrays of polygons/polylines. |
| paper.js | paperjs.org | MIT | pure JS | larger (full vector-graphics engine) | mature, long-running project | `path.flatten(error)` gives controlled curve flattening with a guaranteed maximum deviation — very well suited to controlling polygon density for downstream boolean/offset ops. Heavier dependency than the single-purpose libraries above since it's a whole vector-graphics toolkit. |
| flatten-js | github.com/alexbol99/flatten-js | unverified | pure JS | small-medium | unverified recency | General 2D geometry toolkit (points/lines/segments/arcs/polygons) with boolean ops, intersection, distance — a possible alternative or complement to Clipper2 for 2D geometry math beyond just offsetting. |
| clipper2-wasm | github.com/ErikSom/Clipper2-WASM, npm `clipper2-wasm` | BSL-1.0 (Clipper2 upstream license; unverified for the wasm port specifically) | WASM | not measured | active | Confirmed: polygon boolean (intersection/union/difference/XOR) **and** polygon offsetting, plus constrained Delaunay triangulation, ported from Angus Johnson's well-established Clipper2. This is the strongest, most production-grade candidate for the whole "closed polygons, rib width via offset, tiling" pipeline on the flat Pattern screen. |
| clipper2-ts | github.com/countertype/clipper2-ts | unverified | pure TS (no WASM) | small-medium | active | Pure-JS/TS alternative to clipper2-wasm — slower than the WASM version per its own README comparison, but avoids WASM loading if that's ever a concern. |

This is the best-covered building block in the whole brief — every piece (parse → flatten → offset/boolean → triangulate) has a real, specific, named library.

### B8. Sweeping a tube along a curve

| Library | URL | License | JS/WASM | Size | Last release | Maturity note |
|---|---|---|---|---|---|---|
| three.js TubeGeometry (official) | threejs.org/docs/pages/TubeGeometry.html | MIT | JS | part of three.js | tracks three.js | Confirmed standard three.js geometry class for sweeping a tube along a curve — directly usable for Truchet/Hilbert/guilloche ribs. |

Manifoldness for booleans: **not guaranteed by default.** Both CSG libraries in B2 explicitly require input brushes to be two-manifold/watertight with no self-intersection; a naive TubeGeometry (especially with open caps, or where tube segments self-overlap on tight curves) will need explicit cap-closing and self-intersection avoidance before it's safe to feed into manifold-3d or three-bvh-csg. No library was found that guarantees a watertight tube automatically — this is a "must hand-verify/hand-fix" item, not a solved problem.

### B9. Island detection and printability

| Library | URL | License | JS/WASM | Size | Last release | Maturity note |
|---|---|---|---|---|---|---|
| Connected-component / flood-fill mesh segmentation | — | — | — | — | — | **No ready-made JS library found.** The technique (face-adjacency graph, two-pass connected-components extraction, equivalent to flood fill) is well documented in the research literature (including a CGAL "Triangulated Surface Mesh Segmentation" package as the closest existing *implementation*, which is C++/not browser) but no npm package doing this for three.js/generic meshes was found. |
| Component volume measurement | — | — | — | — | — | Straightforward to hand-roll from a connected-components pass (signed-volume-of-tetrahedra per component) once components are found; no dedicated library found or expected to be needed. |
| Minimum wall thickness measurement | iamrapid.com/tools/wall-thickness-analysis (reference tool, not a library) | — | browser-based **tool**, not a redistributable library | — | active (dated reference found) | iamRapid's own tool runs fully client-side ("never leaves your device") and works by ray-casting from every triangle to measure local thickness, color-mapping thin regions — proves the technique is practical in-browser, but it's a standalone product, not a library to import. **No JS library for wall-thickness measurement was found** — mark as must-hand-roll, using the same ray-cast-per-triangle approach as a known-working technique. |

### B10. Interaction

| Library | URL | License | JS/WASM | Size | Last release | Maturity note |
|---|---|---|---|---|---|---|
| three.js Raycaster (core) | three.js core | MIT | JS | part of three.js core | tracks three.js | Standard, mature approach: `raycaster.setFromCamera()` + `intersectObject()` gives the hit point and face normal directly — exactly what's needed to drag an origin point on a mesh surface. |
| three.js DecalGeometry (official example/addon) | threejs.org/docs/#examples/en/geometries/DecalGeometry | MIT | JS | part of three.js examples | tracks three.js | Confirmed official example: builds a decal mesh from a target mesh, hit position, orientation, and size — the closest existing precedent for "place and orient a tile origin on a mesh," including the community-known trick of offsetting slightly along the normal to avoid z-fighting. Not a full transform-gizmo/drag interaction by itself, but the geometry side of the problem is solved. |
| THREE.DecalGeometry (spite fork) | github.com/spite/THREE.DecalGeometry | unverified | JS | small | unverified recency | Standalone/older packaging of the same idea; the official three.js examples version is the more current reference. |
| three.js TransformControls (official addon) | not independently re-confirmed this pass, but is a well-known official three.js addon | MIT | JS | part of three.js examples | tracks three.js | Not directly searched in this pass but flagged from general three.js knowledge as the standard gizmo for drag/rotate/scale manipulation — worth confirming directly before relying on it; **treat as unverified in this research pass** even though it is a well-known part of the three.js examples ecosystem. |

### B11. Region segmentation

- Dihedral-angle-threshold face segmentation: the underlying math is well documented (`cos φ = n_A · n_B` between adjacent face normals, used as a watershed/threshold), and CGAL has a full C++ implementation of general mesh segmentation, but **no ready browser/JS library implementing dihedral-angle region growing was found**. This would need to be hand-built on top of a half-edge/face-adjacency structure (three-mesh-bvh, already needed for B2, can help with adjacency queries but doesn't do this directly).
- Flood-fill selection from a clicked triangle: same conclusion — a straightforward hand-rolled BFS/DFS over face adjacency once a triangle is picked via raycasting (B10), no dedicated library found or really needed for this specific piece.
- Onshape multi-body 3MF export with separate objects: **plausible but not conclusively confirmed.** Search results confirm Onshape's export dialog supports exporting "unique parts as different files" and that 3MF is positioned by Onshape's own materials as better than STL for "multi-material or multi-part workflows," but no source explicitly confirmed that a *single* 3MF file with multiple bodies keeps them as separate build items/objects (as opposed to one merged mesh or one file per part). **Needs a direct hands-on test in Onshape, not just documentation reading, before relying on this for the pre-split-in-Onshape workflow.**
- Whether three.js's 3MFLoader keeps multiple 3MF objects separate on load: see B1 — likely yes based on the parser structure (per-object resource dictionary, per-item build entries, component/transform support) but not confirmed all the way through to final `Object3D` construction in the code actually retrieved.

### B12. Extruding a mapped 2D polygon into a tool solid

- **No library found** that takes a polygon with per-vertex surface normals and produces a clean offset-inward/outward manifold solid ("thicken a surface patch") as a single call. This is the same gap identified in B6.
- The closest available primitives to hand-build it: `opCreateBSplineCurve`-equivalent curve/vertex data plus manual normal-offset extrusion, then repair/re-triangulate with clipper2-wasm (2D) or manifold-3d's `levelSet()` (3D, via SDF) to guarantee manifoldness before boolean use.
- Known pitfall, confirmed conceptually but not solved by any tool found: **self-intersection at concave corners** when offsetting along per-vertex normals — this is the standard failure mode for naive normal-offset thickening (interior/concave corners can cause offset faces to fold over themselves), and nothing in this research pass found a browser library that handles it automatically. Clipper2's polygon offsetting (B7) handles the exact 2D analogue of this problem (miter/round/square join types for offsetting concave polygon corners) — worth exploring using a Clipper2-style 2D offset in the flattened/parameter-space domain and only then lifting the result back onto the 3D surface, rather than doing the offset in 3D directly.

## 3. Performance reality check

- **manifold-3d (WASM), independent 2026 benchmark (Polydera, "Browser Mesh Boolean Library Comparison and Benchmarks — 2026", published 2026-06-29, author Žiga Sajovic):** median 303.4 ms per boolean operation across 1,000 Thingi10K mesh pairs at 200K–1.5M polygons per operand; produced a closed, manifold result on **all 1000/1000** pairs. This is a large-mesh-pair benchmark, not a many-small-tool-bodies benchmark — the brief's specific scenario (100–1000 small tool bodies against one 50k–500k-triangle mesh) was not directly tested by any source found. Closest indirect evidence: the same source notes Manifold's Boolean algorithm "scales optimally to variadic Booleans involving hundreds of shapes" with "no computational overhead introduced for the increased number of input shapes" — a real, encouraging claim, but not accompanied by a specific timing number for that scenario.
- **three-bvh-csg, same Polydera benchmark:** median 978.04 ms per boolean operation on the same corpus, and critically, **produced an open (non-watertight) mesh on 978 of 1000 pairs** — i.e., correctness failure, not just a speed disadvantage, at this scale. Described in the source as "the fastest of the JavaScript-native CSG tools" despite this — implying other pure-JS CSG options are worse still.
- **manifold-3d native (non-WASM) benchmark for context (MeshLib blog, updated 2026-08-27, Apple M5 MacBook Air, native not browser):** on a 2M-triangle mesh (Nefertiti dataset), union/intersection/difference each completed in roughly 0.19–0.27 seconds; on a 280K–500K-triangle dental scan with degenerate geometry, each operation completed in 0.04–0.05 seconds and succeeded where CGAL reportedly hangs. This is native performance (likely faster than the WASM build) and again single large-pair operations, not many-small-bodies — included only as a rough ceiling/sanity-check, not as a browser number.
- Cosmetic-knurl-style evidence from brief 01 (not re-verified here, carried over as context): the Onshape FeatureScript community found true geometric knurling (helix-sweep + circular-pattern + many-body boolean subtract) slow enough to regenerate that a "cosmetic" non-geometric alternative was published instead — directionally consistent with the concern that many-small-body booleans are the risky part of this whole project, regardless of platform.
- **No source found** with a direct "N tool bodies × M-triangle base mesh × T seconds" figure for either library. This specific number — the one the brief most wants — is genuinely unanswered by anything available in this research pass.

## 4. Bambu Studio input

- **STL vs 3MF:** Onshape's own materials describe 3MF as storing more than geometry — material properties, colors, textures, and even slicing settings — and position it as the better choice for multi-material/multi-part workflows; plain STL cannot carry multiple named/separated objects reliably (an STL "file can contain multiple shells," but Bambu Studio loads all shells of one STL as a single object even when they're logically separate parts). **For this project, 3MF is the better target format if the app needs to hand Bambu Studio pre-separated bodies** (e.g., a base part plus separate cut tool remnants, or multiple pattern islands the user wants to treat as distinct print objects) — STL would require the user to manually "Split to Objects" in Bambu Studio afterward instead.
- **Bambu Studio's own object-splitting tools:** confirmed native features "Split to Objects" (separates all disconnected shells into individual objects) and "Split to Parts," plus a manual multi-body "select all, right-click, Merge" then "Repair" workflow — meaning even if the app only ever exports single-mesh STL, the user has a manual fallback inside Bambu Studio itself to separate and repair afterward.
- **Auto-repair reliability:** general consensus found ("most of the time models don't really need repair even if it says so since it does it automatically") is reassuring but vague and not a documented guarantee; no source was found stating precisely which classes of non-manifold defects (self-intersections vs. non-manifold edges vs. inverted normals vs. tiny gaps) Bambu Studio's auto-repair reliably fixes versus silently mishandles. **This is a "not found" that matters**: the user's stated rule ("the tool must not produce errors that the slicer cannot fix") cannot be fully de-risked from documentation alone — some empirical testing of Bambu Studio against deliberately-imperfect exports from this pipeline will likely be needed once the app exists, rather than relying on Bambu Studio's repair as a guarantee up front.
- Given B2's finding that manifold-3d reliably produces closed/watertight output while three-bvh-csg does not at scale, favoring manifold-3d for the actual cut/emboss booleans directly reduces reliance on Bambu Studio's auto-repair as a safety net.

## 5. Not found

- A browser tool matching the project's specific combination (interactive origin placement + SVG-tile wrap with graduated distortion + through-cut/recess/emboss + arbitrary surface). Searched: general web search for "Voronoi STL generator," "lattice on STL," "surface pattern STL web," GitHub topic/code search.
- A maintained, packaged, browser/WASM library that computes geodesic Voronoi diagrams directly on a triangle mesh (scatter + Lloyd relaxation + geodesic cells) as one unit. Searched: web search combining "geodesic voronoi," "mesh surface," "javascript," "wasm"; found only research code (SurfaceVoronoi) and a C++ library with the right algorithm but no browser build (geometry-central).
- A packaged JS/WASM library for the exponential map / geodesic polar coordinates around a point on a mesh. Searched directly; found only academic paper descriptions of the math, no implementation.
- A three.js 3MF **exporter**. Searched three.js GitHub issues and docs; confirmed as an open, unresolved feature request — loader exists, exporter does not, in the official three.js codebase.
- A direct "offset/thicken a surface patch into a manifold solid" function in any browser-usable library. Searched manifold-3d's own wiki/roadmap (confirms it's planned, not built) and general search; the closest usable substitute found is manifold-3d's `levelSet()` SDF route, which is real but indirect.
- A minimum-wall-thickness-measurement JS library (as opposed to a finished consumer tool). Searched directly; found only finished tools (iamRapid, Blender's toolbox, Meshmixer) with no redistributable library behind them found.
- A dihedral-angle mesh region-segmentation JS/npm library. Searched directly; found only the general algorithm description and a C++ (CGAL) implementation.
- A direct "N small tool bodies against one M-triangle mesh, T seconds" performance figure for manifold-3d or three-bvh-csg — the exact scenario the brief most wanted a number for. Searched multiple phrasings; both located benchmarks (Polydera 2026, MeshLib 2026) test large-mesh-pair booleans, not many-small-bodies-against-one-mesh.
- Explicit, source-backed detail on exactly which classes of mesh defects Bambu Studio's auto-repair does and does not reliably fix. Searched Bambu Lab forum and wiki directly; found general reassurance and manual-repair-tool documentation, not a defect-by-defect reliability statement.
- Confirmation (vs. plausible inference) that a single Onshape 3MF export keeps multiple bodies as separate build items rather than merging or one-file-per-part. Searched Onshape forum and help docs; found supporting context but not a direct statement answering this exactly.

## 6. Assessment (opinion, labeled)

- **Weakest link in the browser route:** in my opinion it's the geodesic/surface-mapping layer (B3+B4+B6+B12 together) — surface-native Voronoi (scatter + relax + geodesic cells), the exponential map for "undistorted at origin, stretch with distance," and turning any resulting 2D shape into a solid that actually follows the surface. Every one of these has a real, documented algorithm but **no packaged browser library** — each would need to be built from research code or from scratch (geometry-central's algorithms exist only in C++; ddg-exercises-js is coursework, not a library; manifold has no offset/thicken function yet). By contrast, the "flat vector tile" side of the app (SVG parsing, 2D boolean/offset, tiling — B7) is extremely well served by mature libraries (clipper2-wasm especially), and mesh I/O plus interaction (B1, B10) are solid via three.js. The gap is squarely in the middle: getting 2D-flat pattern math correctly and efficiently onto a 3D curved surface.
- **Voronoi through-cuts on a 200k-triangle sphere in under ten seconds — realistic or not:** cautiously plausible, with real caveats. manifold-3d's independent benchmark shows ~300ms median for a single large-pair boolean at up to 1.5M polygons, and Manifold's own claim of no per-shape overhead scaling to "hundreds of shapes" is encouraging — but nobody has actually benchmarked hundreds of small cut bodies against one mesh, so this is extrapolation, not measurement. The bigger risk to the ten-second budget isn't the boolean step itself but everything upstream of it that has no packaged library: geodesic point scattering/relaxation and per-cell surface-following solid generation for potentially hundreds of Voronoi cells could easily dominate the ten-second budget even if the final `manifold-3d` boolean pass is fast, especially since three-bvh-csg (the pure-JS alternative) is both slower and unreliable at scale per the same benchmark, making manifold-3d effectively the only real choice for the boolean step itself.
- **Is the "undistorted at origin" mapping easier or harder in the browser than in FeatureScript:** in my opinion, roughly comparable in difficulty, for different reasons. Brief 01 found that FeatureScript's face parameter space is a flattened/stretched reparameterization that isn't arc-length-preserving except on true cylinders/cones — the browser route has the equivalent problem (no exponential-map library exists either), but the browser route has *more raw material to build one from* (three.js's mesh/BVH tooling, xatlas.js's LSCM as a fallback flattening, and published heat-method JS code to adapt) versus FeatureScript's much sparser, harder-to-introspect standard library. So: similarly hard as a math problem, but the browser gives more usable scaffolding to solve it with.
- **FeatureScript or browser, based only on what was found — pick one:** browser. The determining factor isn't any single capability — both platforms are missing the same core piece (a real geodesic/exponential-map implementation) — it's that the browser route has (a) a genuinely strong, benchmarked, reliable boolean engine in manifold-3d, something brief 01 flagged as a real open risk in FeatureScript (`opBoolean` degrading badly with many bodies, no equivalent robustness benchmark found there), (b) a first-class, mature 2D geometry stack (clipper2-wasm, paper.js, svg-path-to-polygons) directly solving the whole SVG-tile and generative-pattern half of the project, and (c) no dependency on Onshape-side FeatureScript API gaps that brief 01 could not even fully verify (manipulator-surface-constraint behavior, exact `evSurfaceDefinition` support per face type) because the documentation itself was too large to retrieve. The browser route trades "sparse but curated CAD-kernel API" for "rich but scattered general-purpose ecosystem that needs real assembly" — and for this project's specific needs (arbitrary surfaces, SVG import, many small cut bodies), the browser's strengths line up better with the actual requirements.

## 7. Sources

1. https://www.voronator.com — accessed 2026-09-01 (via search snippet/aggregator descriptions)
2. https://github.com/gabr42/voronoizer — accessed 2026-09-01 (via search snippet)
3. https://github.com/tjwill95/voronizer — accessed 2026-09-01 (via search snippet)
4. https://websvg.github.io/svg_voronoi_gen/ and https://github.com/WebSVG/voronoi — accessed 2026-09-01 (via search snippet)
5. https://github.com/donsheehy/VoronoiWall — accessed 2026-09-01 (via search snippet)
6. https://threejs.org/docs/pages/STLLoader.html — accessed 2026-09-01 (via search snippet)
7. https://threejs.org/docs/pages/STLExporter.html — accessed 2026-09-01 (via search snippet)
8. https://github.com/mrdoob/three.js/blob/master/examples/jsm/loaders/3MFLoader.js — accessed 2026-09-01 (direct fetch, partial — 1000 of 1621 lines seen)
9. https://github.com/mrdoob/three.js/issues/18984 (3MF exporter feature request) — accessed 2026-09-01 (via search snippet)
10. https://www.npmjs.com/package/manifold-3d — accessed 2026-09-01 (via search snippet, multiple versions seen: 2.1.0, 2.4.2, 3.1.1)
11. https://github.com/elalish/manifold — accessed 2026-09-01 (via search snippet)
12. https://github.com/elalish/manifold/wiki/Manifold-Library — accessed 2026-09-01 (direct fetch)
13. https://manifoldcad.org/docs/jsuser/classes/Manifold.html — accessed 2026-09-01 (via search snippet, `levelSet()` signature)
14. https://github.com/gkjohnson/three-bvh-csg — accessed 2026-09-01 (via search snippet)
15. https://discourse.threejs.org/t/three-bvh-csg-a-library-for-performing-fast-csg-operations/42713 — accessed 2026-09-01 (via search snippet)
16. https://threejs.org/docs/pages/MeshSurfaceSampler.html — accessed 2026-09-01 (via search snippet)
17. https://geometry-central.net/surface/algorithms/geodesic_distance/ — accessed 2026-09-01 (via search snippet)
18. https://geometry-central.net/surface/algorithms/geodesic_voronoi_tessellations/ — accessed 2026-09-01 (via search snippet)
19. https://geometry-central.net/surface/algorithms/vector_heat_method/ — accessed 2026-09-01 (via search snippet)
20. https://github.com/cmu-geometry/ddg-exercises-js — accessed 2026-09-01 (via search snippet)
21. https://github.com/sssomeone/SurfaceVoronoi — accessed 2026-09-01 (via search snippet)
22. https://github.com/repalash/xatlas.js/ — accessed 2026-09-01 (via search snippet)
23. https://github.com/repalash/xatlas-three — accessed 2026-09-01 (via search snippet)
24. https://github.com/ErikSom/Clipper2-WASM — accessed 2026-09-01 (via search snippet)
25. https://www.npmjs.com/package/clipper2-wasm — accessed 2026-09-01 (via search snippet)
26. https://github.com/countertype/clipper2-ts — accessed 2026-09-01 (via search snippet)
27. https://www.npmjs.com/package/svg-path-parser — accessed 2026-09-01 (via search snippet)
28. https://www.npmjs.com/package/svg-path-to-polygons — accessed 2026-09-01 (via search snippet)
29. https://paperjs.org/tutorials/paths/smoothing-simplifying-flattening/ — accessed 2026-09-01 (via search snippet)
30. https://github.com/alexbol99/flatten-js — accessed 2026-09-01 (via search snippet)
31. https://threejs.org/docs/pages/TubeGeometry.html — accessed 2026-09-01 (via search snippet)
32. https://threejs.org/docs/#examples/en/geometries/DecalGeometry — accessed 2026-09-01 (via search snippet)
33. https://github.com/spite/THREE.DecalGeometry — accessed 2026-09-01 (via search snippet)
34. https://iamrapid.com/tools/wall-thickness-analysis/ — accessed 2026-09-01 (via search snippet)
35. https://doc.cgal.org/latest/Surface_mesh_segmentation/index.html — accessed 2026-09-01 (via search snippet)
36. https://polydera.com/algorithms/browser-mesh-boolean-libraries-2026 — accessed 2026-09-01 (direct fetch; published 2026-06-29, author Žiga Sajovic)
37. https://meshlib.io/blog/comparing-3d-boolean-libraries/ — accessed 2026-09-01 (direct fetch; page states "Updated 2026-08-27")
38. https://forum.onshape.com/discussion/15856/feature-request-3mf-export-option-please — accessed 2026-09-01 (via search snippet)
39. https://www.onshape.com/en/resource-center/tech-tips/stl-vs-3mf-files-additive-manufacturing — accessed 2026-09-01 (via search snippet)
40. https://wiki.bambulab.com/en/software/bambu-studio/split-to-objects-parts — accessed 2026-09-01 (via search snippet)
