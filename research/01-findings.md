# Findings: Onshape FeatureScript route

Research method note: this was done via web search plus automated page-fetch summarization (no interactive browser), so "did I open the document and read the code" below means the page was fetched and its visible text reviewed, not that every line of FeatureScript source was read. Where the fetch tool truncated a page (noted explicitly), the finding is based on the retrieved excerpt only.

## 1. Existing custom features

### Voronoi Face Lattice
- Author: wille_j (Onshape forum member)
- Link (public document URL): https://cad.onshape.com/documents/899f411dac260df3f77632c9/v/fab5af6805160aa96229bc61/e/bd63df9cab4d8e8b2f518d25
- Source / where found: forum.onshape.com/discussion/28597/new-featurescript-voronoi-face-lattice
- Last updated: August 2025
- Did I open the document and read the code? No — read the forum thread only, not the Feature Studio source.
- What it does: Generates a Voronoi-cell lattice on a face. Has options for random point generation, bezier-curve or polyline cell edges, cell offset (rib width) control, and a blind extrude of the result.
- Inputs it takes: target face, seed/point count (implied), offset distance, curve-style toggle (bezier vs polyline), extrude depth.
- Face types it supports: **flat faces / sketch surfaces only** — author states this as a known limitation and says a general-surface option "would be nice."
- Cut, emboss, or both: extrude (author's own thread doesn't specify cut vs emboss explicitly; treat as unconfirmed which boolean mode, likely both via standard extrude options).
- Has drag manipulators? Not mentioned in the thread — treat as unknown/likely no.
- Known limitations (from the author or forum replies): flat faces only; polyline output is 2D-only; blind extrude only (no up-to-face or two-sided); large offsets can fail; short-edge filter misbehaves at high settings.
- Performance notes: a commenter suggested adding a caching mechanism to improve regeneration time on complex geometry — implying regeneration is slow for larger lattices.
- License or reuse terms: not stated in the thread.

### New Feature: Delaunay Triangulation
- Author: unknown (forum thread title only)
- Link (public document URL): not obtained — the forum thread required an SSO login redirect that could not be completed via automated fetch.
- Source / where found: forum.onshape.com/discussion/27998/new-feature-delaunay-triangulation
- Last updated: unknown
- Did I open the document and read the code? No — could not open either the thread or the document (login-gated).
- What it does: Per the thread title and cross-references from other threads, this is a Delaunay triangulation custom feature, generally described in the community as "often used as a step before Voronoi scripts."
- Inputs it takes: unverified.
- Face types it supports: unverified.
- Cut, emboss, or both: unverified.
- Has drag manipulators? unverified.
- Known limitations: unverified.
- Performance notes: unverified.
- License or reuse terms: unverified.

### Round Emboss
- Author: unknown (listed in dcowden/featurescript curated GitHub list)
- Link: https://cad.onshape.com/documents/c906e2264d158509753b1bdb
- Source / where found: github.com/dcowden/featurescript
- Last updated: unknown
- Did I open the document and read the code? No — only the GitHub list description was read, not the Onshape document.
- What it does: "Creates round formed embosses with the specified height, diameter, and draft angle."
- Inputs it takes: height, diameter, draft angle (per description).
- Face types it supports: per other sources referencing this family of feature, described elsewhere as supporting "non-planar surfaces and variable draft angles" — not independently confirmed by opening the document.
- Cut, emboss, or both: emboss.
- Has drag manipulators? unknown.
- Known limitations: unknown.
- Performance notes: unknown.
- License or reuse terms: unknown.

### Curved Text (Surface Text)
- Author: originally Dave Cowden per forum references; listed in the dcowden/featurescript index.
- Link: https://cad.onshape.com/documents/cfec40e2b66bb4ddb2f3414b
- Source / where found: github.com/dcowden/featurescript; also referenced in forum "Debossed text on curved surface" thread title.
- Last updated: unknown.
- Did I open the document and read the code? No.
- What it does: "Creates embossed or raised text on flat and curved surfaces."
- Inputs it takes: text string, height/depth, font (typical for text features) — not confirmed from source.
- Face types it supports: flat and curved (per description); which curved types (cylindrical only vs. any) not confirmed.
- Cut, emboss, or both: both, per general description of "surface text" tools (emboss/deboss).
- Has drag manipulators? unknown.
- Known limitations: unknown.
- Performance notes: unknown.
- License or reuse terms: unknown.

### Sketch Wrapper
- Author: unknown; referenced by forum user konstantin_shiriazdanov in the "Wrap 2D Sketches around Curved surface" thread.
- Link: https://cad.onshape.com/documents/0bb13c1b6ed6d4a6dd75cf99
- Source / where found: forum.onshape.com/discussion/11081/wrap-2d-sketches-around-curved-surface; also listed (possibly conflated with "Flex FS") in dcowden/featurescript.
- Last updated: unknown (thread active Feb 2019 – Sep 2020).
- Did I open the document and read the code? No.
- What it does: "Wraps sketched curves around cone and cylinder surfaces."
- Inputs it takes: unverified.
- Face types it supports: cylindrical and conical only (per description) — same limitation as native Wrap at the time.
- Cut, emboss, or both: unknown; described as geometry mapping rather than cut/emboss itself.
- Has drag manipulators? unknown.
- Known limitations: limited to cylinder/cone, same as native Wrap of that era.
- Performance notes: unknown.
- License or reuse terms: unknown.

### Flex FS
- Author: unknown.
- Link: https://cad.onshape.com/documents/0bb13c1b6ed6d4a6dd75cf99 (note: the fetch tool returned this same URL for both "Sketch Wrapper" and "Flex FS" in the dcowden list — likely a fetch/summarization error; the actual URLs may differ and should be re-checked by opening the GitHub README directly).
- Source / where found: github.com/dcowden/featurescript; forum.onshape.com/discussion/11081.
- Last updated: unknown.
- Did I open the document and read the code? No.
- What it does: "Bends sketch along curves to make cams or spread text over splines" — described elsewhere as a workaround for curved text/visual effects, not a true surface-wrap.
- Inputs it takes: unverified.
- Face types it supports: not a face-wrap tool per se — it bends a sketch along a curve.
- Cut, emboss, or both: neither directly; a layout aid.
- Has drag manipulators? unknown.
- Known limitations: unknown.
- Performance notes: unknown.
- License or reuse terms: unknown.

### Fill Pattern
- Link: https://cad.onshape.com/documents/57361ad4e4b00e5012c3857c
- Source: github.com/dcowden/featurescript; also has an official Onshape tech-tip page.
- Did I open the document and read the code? No.
- What it does: "Patterns faces within a target face while avoiding the boundary."
- Face types it supports: flat target face (typical of fill-pattern style tools); not confirmed for curved faces.
- Cut, emboss, or both: neither by itself — a layout/patterning tool, could feed a cut/emboss step.
- Notes: closest existing feature in spirit to the "layout" half of the requested two-feature Voronoi/pattern plan, but for regular (non-Voronoi) cell/hole patterns on flat faces.

### Point Pattern
- Link: https://cad.onshape.com/documents/9fca78cb66a0bc83e359eb3e
- Source: github.com/dcowden/featurescript
- What it does: "Patterns parts at sketch vertices." Not directly relevant to random-point scatter but shows a precedent for vertex-driven placement.

### Surface Pattern
- Link: https://cad.onshape.com/documents/6988ff60065e4c34350ca5e1
- Source: github.com/dcowden/featurescript
- What it does: "Patterns a part across a surface of a body" — relevant precedent for placing many small bodies across a (possibly curved) surface, close to what a "texture" feature needs.

### Texture (community custom feature, "Texture (New Custom Feature!)" thread)
- Link: https://cad.onshape.com/documents/46897a2d60ade8dbb04077f3/w/23398bd91a932d1432a5d204/e/56e5d6543ccb1f14cf1c4a46 (via cadsharp.com listing)
- Source / where found: cadsharp.com/featurescripts/; forum threads "Texture (New Custom Feature!)" and "Texture FeatureScript revisited" (forum.onshape.com/discussion/16576 and /19950).
- Did I open the document and read the code? No.
- What it does: "Creates a texture by patterning parts along a face or surface" — works by patterning many small solid bodies (bumps) across a face.
- Face types it supports: face/surface generally, per description; forum notes it does **not** currently support revolving a texture around a cylinder as a built-in option.
- Cut, emboss, or both: emboss-style (adds bumps); presumably usable as cut via boolean subtract too.
- Known limitations: cannot revolve texture around a cylinder natively (per forum reply); performance scales with number of pattern instances (see opBoolean notes below).

### Cosmetic Knurl
- Source / where found: forum.onshape.com/discussion/11111/new-featurescript-cosmetic-knurl
- Did I open the document and read the code? No.
- What it does: Applies a cosmetic (non-solid-geometry) knurl appearance to a cylindrical face, explicitly created because fully 3D-modeled knurls (helix-sweep + circular pattern + boolean subtract) take too long to regenerate.
- Face types it supports: cylindrical.
- Performance notes: this feature exists specifically because true-geometry knurling via `opBoolean`-heavy helix sweeps is slow — direct evidence that many-body boolean patterns on a cylinder are a real regeneration bottleneck (see B6).

### SVG to Sketch (Custom Tool)
- Author: ChandraAwsome (Onshape forum, EDU tier)
- Link (public document): https://cad.onshape.com/documents/c201c83c91a83aade27337d1/v/fa88b35f1753d1f6f757a891/e/09d98a5bdcf6272e418d3ec2
- Companion web tool: https://svgto-onshape.vercel.app
- Source / where found: forum.onshape.com/discussion/31483/new-custom-tool-svg-to-sketch
- Last updated: August 2, 2024
- Did I open the document and read the code? No — the linked document was found but not opened; the forum post text was read.
- What it does: Converts an SVG file into native Onshape sketch entities — "proper lines, arcs, and fitted splines" — via an external web app that a user runs, then a custom Feature Studio element/tool imports the result. Not a pure in-Onshape FeatureScript parser of raw SVG text.
- Inputs it takes: an SVG file uploaded to the external site; the Onshape side needs document/workspace/element IDs entered manually.
- Face types it supports: N/A (sketch import tool, not a face-wrap tool).
- Cut, emboss, or both: N/A.
- Has drag manipulators? No.
- Known limitations: author states "edge cases that break it" exist without enumerating them; not yet on the Onshape App Store; requires an external website in the loop (not a self-contained FeatureScript custom feature); planned raster (PNG/JPG) support status unclear.
- Performance notes: not stated.
- License or reuse terms: not stated.

## 2. FeatureScript capabilities

### B1. Manipulators
One-line answer: FeatureScript has a manipulator system with distinct enum-backed types (confirmed to exist: a "full triad" manipulator and a "linear" manipulator used for offsets/distances), but the exact enum list and whether any manipulator can be **constrained to slide along a face/surface** could not be fully verified — the standard-library documentation page (`cad.onshape.com/FsDoc/library.html`) is a single very large page and the fetch tool repeatedly truncated it before reaching the manipulator/evaluate sections.

Detail:
- Confirmed real identifiers (from forum code snippets, not full FsDoc): `fullTriadManipulator` (has a `displayEditView` parameter controlling whether text boxes show), `linearManipulator` (used in a "plane manipulator" example to control a plane's offset).
- Confirmed to exist as module/enum names (from a partial FsDoc fetch): `manipulatortype`, `manipulatordragtypeenum`, `manipulatorstyleenum` — present as enum modules in the library's Utilities category, but their member values were not retrieved.
- On sliding a point along a face: one forum answer (paraphrased from search snippet, source thread not identified precisely) states that "multi-point movement is possible but challenging to handle from the UI," and describes a workaround where a **plane manipulator** is used to grab points that lie in a slice/plane and move them together — this implies there is **no simple built-in "constrain manipulator to arbitrary curved face" primitive**; developers work around it by constraining motion to a plane instead. This should be marked **unverified** pending a direct read of the manipulator FsDoc page.
- Not found / not confirmed: an explicit "angular manipulator" type name, and any manipulator documented as natively surface-constrained.

### B2. Curves on curved faces
One-line answer: Yes — `opCreateCurvesOnFace` exists and generates isoparametric curves on a face; the community had to lobby for it to be officially documented.

Detail:
- `opCreateCurvesOnFace(context is Context, id is Id, definition is map)` — generates isoparametric curves of a face: for each requested surface-parameter value, it creates a wire body following the curve that holds that surface parameter constant. Parameters found: `curveDefinition` (array of `CurveOnFaceDefinition`), `showCurves` (bool, preview display), `skipTrim` (bool — but "lines and arcs are always trimmed" regardless), `useFaceParameter` (internal use).
- History (from forum.onshape.com/discussion/14021/face-curves-in-featurescript): the function existed in Onshape's internal codebase before being publicly documented. Onshape's Ilya Baran announced it as officially released/documented in an August 2020 release-notes post; forum member Evan Reese then published a public "Face Curves" FeatureScript built on it.
- `opExtractWires` — "Generates wire bodies from the supplied edges. If the edges are disjoint multiple wires will be returned." Useful for turning a set of edges (e.g., from an imprint or split) into usable wire geometry.
- `opSplitFace` — splits faces with edges or faces, returning intersection edges. Relevant for "imprint curves onto a face" style workflows.
- `opCreateOutline` and `opImprint` — **not found** in the retrieved FsDoc excerpt or in any forum search; their existence is unverified. (Onshape's native Wrap feature almost certainly uses an internal Parasolid-level imprint/wrap operation, but no FeatureScript-level `opImprint` function name was confirmed.)
- Does Parasolid's wrap capability appear in the FeatureScript API? Not found directly — no FeatureScript-level "wrap" op function was located. The native Wrap *feature* exists at the UI level (see B5), and community members have historically had to build their own curve-projection/wrap workflows in FeatureScript using `opCreateCurvesOnFace` plus manual projection, rather than calling a single native "wrap" op.

### B3. Surface evaluation
One-line answer: Evaluation functions for surface point/normal exist (`evSurfaceDefinition`, `evFaceTangentPlane`, `evDistance` at minimum, referenced by name in forum threads and Onshape staff replies), but exact signatures and the full list of supported face types (plane/cylinder/cone/sphere/torus/spline) could not be confirmed from FsDoc directly due to page-fetch truncation — treat the details below as **partially unverified**, sourced from forum paraphrase rather than the FsDoc page itself.

Detail:
- `evSurfaceDefinition` — per a forum reply, "will tell you the type of face"; recent Onshape releases extended `evSurfaceDefinition`/`evCurveDefinition` to also return B-spline surfaces/curves (implying it already worked for analytic surface types — planes, cylinders, cones, spheres, tori — and was later extended to spline surfaces). This is a paraphrase of a forum answer, not a direct FsDoc read — mark **unverified in exact wording**.
- `evFaceTangentPlane` — requires the point in **face-specific parameter space** (u,v), not world space; for non-planar surfaces the parameter-space bounding box is a flattened/stretched version of the surface, so parameter-space coordinates are not simply proportional to arc length. A recommended pattern from the forum: use `evDistance` between a 3D point and the surface to get back a 2D parameter-space vector, then feed that into `evFaceTangentPlane`.
- `evFaceNormalAtPoint` or an equivalently named normal-evaluation function — **not confirmed by name**; likely exists (Onshape needs face normals constantly) but no forum or doc source explicitly named it in this research pass.
- `evDistance` — confirmed to exist and to return parameter-space coordinates when queried against a face.
- Supported face types: not independently confirmed per type. Circumstantial evidence (the B-spline extension note) suggests planar/cylindrical/conical/spherical/toroidal were already supported before B-spline (freeform) surfaces were added.

### B4. Randomness
One-line answer: There is no true-random function; the documented, idiomatic approach is a hand-rolled deterministic pseudo-random number generator (commonly a linear congruential generator) seeded from something stable like the feature's ID.
- FeatureScript is explicitly designed so regeneration is deterministic everywhere — "execution cannot be influenced by external input, time, or randomness" (paraphrase of Onshape's own FeatureScript guide language on determinism).
- Onshape has published a "Tech Tip: Pseudo-Random Number Generation in FeatureScript" describing exactly this LCG-seeded-by-feature-ID pattern. This is a fully supported, sanctioned technique, not a hack — good news for the Voronoi seed-point generation requirement, since it is both random-looking and stable across regenerations (won't reshuffle every rebuild) as long as the seed source doesn't change.

### B5. Native Onshape features
One-line answer: Onshape's native **Wrap** feature exists and has been actively extended (most recently to conical faces), but there is still no native "Voronoi," "Emboss," or general "Texture" feature — those remain custom-feature territory.
- Wrap release history found: release 1.194 added the ability to apply Wrap to **conical** faces (previously cylindrical only). Exact 1.194 date not confirmed from the snippet, but forum/help content referencing it was current as of an October 23, 2025 documentation update.
- Wrap can already do emboss (Boolean "Add") or engrave/deboss (Boolean "Remove") once a sketch is wrapped onto a cylindrical or conical face — this is a native capability, not custom.
- Wrap is still explicitly limited to single-curvature (cylindrical/conical) target faces; an Onshape moderator (Jake Rosenfeld, in the 2019 thread) said "currently wrap only works for cylinders. Eventually, more will come" — conical support is the "more" that has since shipped, but doubly-curved or organic/freeform target faces are still **not supported** by native Wrap as of this research (per forum discussion explicitly listing cones/organic surfaces/lofts as unsupported, itself possibly stale — cones are now supported per the 1.194 note above, so treat "still unsupported: doubly-curved/organic" as the current best understanding, not a guarantee).
- No native Voronoi/lattice feature was found. No native general "Texture" feature was found (Texture remains a well-known **custom** feature per section 1).

### B6. Booleans in bulk
One-line answer: `opBoolean` scales poorly with the number of bodies combined in one call — combining many bodies at once is measurably slower than combining them pairwise in a loop, and community authors have written entire alternative custom features (e.g. Cosmetic Knurl) specifically to avoid heavy boolean patterns.
- A documented performance comparison (forum): a Multi-Mirror boolean set of 4 bodies took 7.9 seconds versus 3.7 seconds for 12 individual mirror features each doing a 2-part boolean — i.e., many small pairwise booleans beat one large N-way boolean.
- Recommended strategy from the forum: loop `opBoolean` over pairs of bodies rather than passing a large tool-body set to a single call. Also relevant: `"targetsAndToolsNeedGrouping": true` as an option that resolves some union-boundary issues.
- Cosmetic Knurl (section 1) exists specifically because a fully-geometric knurl (helix sweep + circular pattern + subtract, i.e. many-body `opBoolean`) was too slow to regenerate — real-world evidence that hundreds/thousands of cut bodies is a genuine risk for a Voronoi/texture feature that produces one solid per cell.
- No specific "N bodies took X seconds" benchmark for Voronoi-scale counts (hundreds to thousands of cells) was found; the general regeneration-timeout numbers in B3/E2 below (10-minute cap; 120 edges ≈3 min, 240 edges ≈5.7 min, 320-face geodesic timed out at 10 min) are the closest available proxy and suggest cell counts need to stay in the low hundreds unless batched cleverly.

### B7. Text/large parameters
One-line answer: Custom features can take string parameters, but no documented maximum length was found — this should be treated as **unverified / not found**, not as "no limit."
- Search for an explicit character/length limit on FeatureScript string parameters returned nothing specific to FeatureScript from official docs or the forum; general programming-forum results (unrelated platforms) were excluded as not applicable.
- Practical implication: pasting a long SVG path-data string into a text parameter is plausible in principle, but the length ceiling (if any) is unknown, and no one on the forum was found reporting having done exactly this at scale.

### B8. Free plan limits
One-line answer: The Free plan's headline restriction relevant here is that **all documents must be public** — no specific additional restriction on *creating or using* custom features/FeatureScript on the Free plan was found.
- Free plan summary found: full parametric modeling, assemblies, and real-time collaboration are included; documents must be public; commercial use is prohibited; private storage/document caps exist (100MB / 10 private documents) but these caps are about privacy tier, not about FeatureScript itself.
- No forum or doc source was found stating a Free-plan-specific cap on number of custom features, Feature Studios, or FeatureScript execution time/complexity beyond the general regeneration-timeout behavior that applies to all plans (see B3/E2/E3).

## 3. SVG into Onshape

**C1. Does Onshape import SVG directly into a sketch?**
No. The "Insert DXF/DWG" sketch tool does not accept SVG — forum guidance explicitly says SVG is not supported there and suggests converting to PNG (as a reference image) or to DXF (for real geometry). Insert DXF/DWG accepts AutoCAD DWG up to 2018 and DXF up to 2013/2018 (and DWT 2013/2018).

**C2. Recommended SVG→DXF route and pitfalls**
Recommended route found: export/convert the SVG to DXF (Inkscape's DXF export, or an online converter such as CloudConvert, were both mentioned by forum users) and then use Insert DXF/DWG into a sketch.
Known pitfalls found:
- Curve fidelity: conversion can turn splines into a series of arcs, introducing unwanted arc-center points once imported into an Onshape sketch; avoid any conversion setting that further flattens curves to straight-line polylines.
- Entity-type mismatch: Inkscape does not support the old DXF `POLYLINE` entity but does support `LWPOLYLINE` (and LWPOLYLINE is the more efficient, modern entity anyway) — a converter mismatch here can produce import errors or dropped geometry.
- Fonts/text: SVG text objects and hatch/pattern fills are **not** preserved through SVG→DXF conversion (fonts don't become DXF text entities; fills/hatches are lost) — irrelevant for a black/white tile artwork workflow as long as the source SVG is already outlined paths rather than live text or fills-as-fills, but worth flagging since "black/white artwork" could imply flat fill regions that need to be pre-converted to outlined paths before export.
- Point bloat: vector-trace-derived SVGs (e.g. from raster-to-vector autotracing) tend to produce very dense splines with many points, especially around sharp corners/high-curvature regions, which will interact with the sketch-entity-count performance concerns in B6/E2.

**C3. Custom features/tools that skip the DXF step**
One found: the "SVG to Sketch" custom tool (see section 1) — but it is not a pure FeatureScript solution; it routes the SVG through an external web app (svgto-onshape.vercel.app) that the user runs, which then produces native sketch entities (lines, arcs, fitted splines) inside Onshape via a companion tool/feature. It is community-built, not on the Onshape App Store as of its August 2024 post, and the author acknowledges unspecified edge cases. No other SVG-to-Onshape-geometry tool bypassing DXF was found.

## 4. Prior art

- "Coral pattern/shape on 3D-Objekts" (forum.onshape.com/discussion/26421, Jan 2025–Aug 2025): user wanted a coral/Voronoi-like pattern on curved 3D objects. Community identified it as a Voronoi-family problem, pointed to an "Attractor Pattern" script plus a sphere-intersection + Project Curve workaround, and to external tools (Voronator.com, a web SVG-Voronoi generator convertible to DXF, and non-parametric sculpting tools like Meshmixer/zBrush) as fallbacks when native/FeatureScript tools fall short on doubly-curved surfaces. The thread is also where the "Voronoi Face Lattice" FeatureScript (section 1) was eventually cross-referenced.
- "Wrap 2D Sketches around Curved surface" (forum.onshape.com/discussion/11081, Feb 2019 – Sep 2020): established that native Wrap has historically been cylinder-only (later extended to cones), and that "organic surfaces like lofts" are explicitly out of reach for native Wrap — pattern-on-a-vase-body users have had to use workaround FeatureScripts (Sketch Wrapper, Flex FS) rather than a single built-in tool.
- Cosmetic Knurl (forum.onshape.com/discussion/11111): the closest published "texture wrapped on a cylinder" mechanical analogue found. It deliberately avoids full 3D boolean-based knurl geometry for performance reasons, which is a directly relevant precedent for the performance risk of a Voronoi/texture cut feature (see B6, Assessment below).

## 5. Not found

- A published FeatureScript custom feature that does Voronoi/cell patterning on a **curved** (non-flat) face — the one Voronoi feature found (Voronoi Face Lattice) is explicitly flat-face-only. Searched: forum.onshape.com discussion search, GitHub code/repo search, cadsharp.com library, frcdesign.org library, dcowden/featurescript curated list.
- A FeatureScript custom feature that reads raw SVG path data from a text parameter and converts it to geometry inside FeatureScript itself (as opposed to routing through an external web app). Searched: forum SVG threads, GitHub, both curated FeatureScript library sites.
- Any custom feature combining "wrap a repeating SVG/tile pattern around a curved face" in one step. Searched the same sources as above, plus "knurl"/"texture"/"diamond pattern"/"hex pattern" terms.
- Truchet tiles, guilloche/spirograph curves (a genuine attempt exists per "Spirograph — not quite ready?" thread, but no finished/published feature), Hilbert curve, phyllotaxis spiral, Sierpinski carpet, Koch snowflake, Penrose tiling, moire, hyperbolic tiling, Apollonian gasket — **none found** as published FeatureScript custom features. Searched: targeted web searches per pattern name + "FeatureScript"/"Onshape", GitHub, cadsharp.com, frcdesign.org.
- Exact enum member list for FeatureScript manipulator types (only module/enum *names* were found: `manipulatortype`, `manipulatordragtypeenum`, `manipulatorstyleenum`), and explicit confirmation of a "manipulator constrained to a curved face" primitive. Searched: web search plus repeated direct fetches of `cad.onshape.com/FsDoc/library.html`, which the fetch tool could not retrieve in full (page too large; excerpts kept landing in unrelated sections of the doc, e.g. `SplitByIsoclineResult`).
- Exact signature and full supported-face-type list for `evSurfaceDefinition` and a normal-at-point function (candidate name `evFaceNormalAtPoint` was guessed by the brief, not confirmed to exist). Same FsDoc page-size obstacle as above.
- `opImprint` and `opCreateOutline` — not found anywhere (forum, GitHub, or the retrieved FsDoc excerpts). Not confirmed to exist or not exist; genuinely absent from every source checked.
- Any explicit statement of a FeatureScript string-parameter length limit. Searched forum and general docs; nothing FeatureScript-specific surfaced.
- Any Free-plan-specific restriction on custom features beyond the public-documents requirement. Searched forum "free plan limitations" threads and Onshape's own custom-feature help page.
- A documented, single numeric "regeneration timeout" guarantee beyond the empirically-reported ~10 minutes (this appears to be an operational ceiling reported by users hitting it, not a number published in official docs as a hard spec).

## 6. Assessment (opinion, labeled)

- **Closest existing feature to extend for the "layout + cut" plan:** In my opinion, none of the found features is a good base to literally extend/fork — "Voronoi Face Lattice" is flat-face-only and its author already flags surface support as unsolved, and none of the wrap/emboss features combine cell-pattern generation with curved-face placement. The more useful role these features play is as **reference implementations**: Voronoi Face Lattice for the point-generation/cell-geometry math, "Fill Pattern"/"Surface Pattern" for how the community structures a layout-only feature that a second feature consumes, and Cosmetic Knurl for how to sidestep heavy boolean counts on a cylinder. I'd plan to write both features from scratch rather than fork an existing one, while borrowing the pseudo-random-seed pattern (B4) and the `opCreateCurvesOnFace`/`evDistance`+`evFaceTangentPlane` evaluation pattern (B2/B3) directly from documented Onshape guidance.
- **Biggest technical risk — wrapping an SVG tile onto a curved face:** In my opinion this is the u,v parameter-space math, not the geometry creation itself. `evFaceTangentPlane` and friends work in a face's own (u,v) parameter space, which for a non-planar surface is a flattened/stretched reparameterization, not an arc-length-preserving one — so mapping an SVG tile so it repeats a *whole number of times around the circumference without visible stretching* requires either (a) restricting the first version to true cylinders/cones, where u,v maps cleanly to angle/height and the math is tractable, or (b) building a proper arc-length-correct surface parameterization for arbitrary curved faces, which is a nontrivial numerical problem on top of an already sparsely-documented evaluation API. I'd treat "cylinder/cone-only wrap, general curved-face wrap deferred" as the realistic v1 scope going into planning.
- **Biggest technical risk — generating Voronoi cells on a curved face:** In my opinion it's the combination of (a) no existing FeatureScript primitive for computing a true geodesic/surface-constrained Voronoi diagram (every example found computes Voronoi in a flat 2D domain, i.e. in parameter space or a planar sketch, then would need to be re-projected onto the curved face) and (b) the `opBoolean` bulk-performance ceiling documented in B6 — a Voronoi vase-style cut with hundreds of cells, each needing its own imprint/cut/emboss operation, is squarely in the regeneration-timeout danger zone that other authors (Cosmetic Knurl, the 320-face-geodesic timeout report) had to specifically engineer around. Computing the diagram in flat parameter space and reprojecting will also reintroduce the same stretching/distortion problem as the SVG-wrap risk above, for any face where parameter space isn't arc-length-proportional.

## 7. Sources

1. https://forum.onshape.com/discussion/28597/new-featurescript-voronoi-face-lattice — accessed 2026-09-01
2. https://forum.onshape.com/discussion/27998/new-feature-delaunay-triangulation — attempted, blocked by SSO login redirect, 2026-09-01
3. https://github.com/dcowden/featurescript — accessed 2026-09-01
4. https://forum.onshape.com/discussion/11081/wrap-2d-sketches-around-curved-surface — accessed 2026-09-01
5. https://forum.onshape.com/discussion/14021/face-curves-in-featurescript — accessed 2026-09-01
6. https://forum.onshape.com/discussion/22948/debossed-text-on-curved-surface — attempted, blocked by SSO login redirect, 2026-09-01
7. https://forum.onshape.com/discussion/26421/coral-pattern-shape-on-3d-objekts — accessed 2026-09-01
8. https://www.cadsharp.com/featurescripts/ — accessed 2026-09-01
9. https://cad.onshape.com/FsDoc/library.html — accessed 2026-09-01 (multiple fetches; page truncated each time by the fetch tool, only partial content retrieved)
10. https://cad.onshape.com/FsDoc/ — accessed 2026-09-01
11. https://www.onshape.com/en/resource-center/tech-tips/tech-tip-how-to-use-the-wrap-feature-in-onshape — accessed 2026-09-01 (via search snippet)
12. https://www.onshape.com/en/resource-center/what-is-new/wrap-feature-copy-paste-configuration-inputs-render-studio-appearances — accessed 2026-09-01 (via search snippet; release 1.194, conical Wrap support)
13. https://forum.onshape.com/discussion/16576/texture-new-custom-feature — referenced via search snippet, 2026-09-01
14. https://forum.onshape.com/discussion/19950/texture-featurescript-revisited — referenced via search snippet, 2026-09-01
15. https://forum.onshape.com/discussion/8908/opboolean-unions — referenced via search snippet, 2026-09-01
16. https://forum.onshape.com/discussion/14454/why-is-multi-mirror-heavier-than-individual-mirror-features — referenced via search snippet (opBoolean 4-body vs pairwise timing), 2026-09-01
17. https://www.onshape.com/en/resource-center/tech-tips/tech-tip-pseudo-random-number-generation-in-featurescript — referenced via search snippet, 2026-09-01
18. https://forum.onshape.com/discussion/6223/random-function — referenced via search snippet, 2026-09-01
19. https://forum.onshape.com/discussion/13596/strategies-to-address-slow-regeneration-times — referenced via search snippet, 2026-09-01
20. https://forum.onshape.com/discussion/26667/changing-feature-parameters-when-onshape-wont-load-because-regen-time — referenced via search snippet (10-minute timeout, 320-face geodesic example), 2026-09-01
21. https://forum.onshape.com/discussion/12899/free-plan-limitations — referenced via search snippet, 2026-09-01
22. https://cad.onshape.com/help/Content/customfeature.htm — referenced via search snippet, 2026-09-01
23. https://forum.onshape.com/discussion/7604/importing-svg-into-a-part-studio — referenced via search snippet, 2026-09-01
24. https://cad.onshape.com/help/Content/Sketch/insert_dwg_or_dxf.htm — referenced via search snippet, 2026-09-01
25. https://forum.onshape.com/discussion/31483/new-custom-tool-svg-to-sketch — accessed 2026-09-01
26. https://forum.onshape.com/discussion/5657/dxf-export-of-polyline-entities — referenced via search snippet, 2026-09-01
27. https://forum.onshape.com/discussion/14713/spirograph-not-quite-ready — referenced via search snippet, 2026-09-01
28. https://zmatt.net/splines-in-onshape-part-2/ — accessed 2026-09-01 (author Matthew Chapman, originally published 2017-07-25)
29. https://forum.onshape.com/discussion/5391/maximum-call-stack-depth-for-recursive-functions — referenced via search snippet (~1500 recursion depth), 2026-09-01
30. https://forum.onshape.com/discussion/1096/operations-slow-as-sketch-has-more-entities — referenced via search snippet (3000-entity performance degradation), 2026-09-01
31. https://www.frcdesign.org/resources/featurescripts/ — accessed 2026-09-01
32. https://forum.onshape.com/discussion/11111/new-featurescript-cosmetic-knurl — referenced via search snippet, 2026-09-01
