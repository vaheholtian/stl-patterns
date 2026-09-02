# Research brief: Onshape FeatureScript route for surface patterns

**Your job is research only. Do not write code, do not create Onshape documents, do not build anything.**
Produce one report file at `C:\Code\STL-patterns\research\01-findings.md` following the output format at the bottom.

## Context (read fully before searching)

The user prints on a Bambu Lab A1 and designs in Onshape (free plan). They want a tool that:

1. Generates Voronoi / Delaunay style cell patterns (cells separated by ribs of chosen thickness) directly on a chosen face of an Onshape part, including curved faces such as a vase body or cylinder.
2. Accepts a user-supplied SVG tile (black/white artwork) and wraps it around a curved face as a repeating pattern, with the tile stretched slightly so it repeats a whole number of times around the circumference.
3. Lets the user position, rotate, and scale the pattern by dragging handles in the 3D view.
4. Produces either **through-cuts** (lampshade / Voronoi vase look), **recessed cuts to a depth**, or **embossed relief** perpendicular to the surface, with customizable height.
5. Is planned as an Onshape **custom feature written in FeatureScript**, ideally split into two features: a cheap "layout" feature that only produces curves on the surface, and an expensive "cut/emboss" feature that consumes those curves.

Out of scope, do not research: shelling (Onshape already has it), patterns crossing from one face onto an adjacent face, Blender, Fusion 360, OpenSCAD, mesh-based web tools.

The point of this research is to find out **what already exists** so the plan becomes "extend" rather than "build", and to confirm **what FeatureScript can and cannot do** for the pieces above.

## Questions to answer

### A. Existing custom features (highest priority)

Search for public Onshape custom features (FeatureScript) that do any of the following. For each one found, record the fields listed in the output format.

- Voronoi pattern, Voronoi cut, cell pattern, "organic pattern", "lattice on surface"
- Wrap: wrapping a sketch or curves onto a cylindrical, conical, or arbitrary curved face
- Emboss / deboss / relief from a sketch onto a curved face
- Texture or surface pattern features (fill pattern, "pattern on face", curve pattern)
- Random point scatter on a face
- Any feature that reads SVG path data (for example from a text parameter)

Where to look:
- Onshape forum (forum.onshape.com), especially the FeatureScript category
- Onshape's own list of published custom features (Onshape Learning Center, "Custom Features" documentation, the "Onshape FeatureScript examples" public documents)
- GitHub, searching `FeatureScript voronoi`, `FeatureScript wrap`, `FeatureScript emboss`
- Onshape public document search (cad.onshape.com, "Public" tab) for the same terms
- Well known FeatureScript authors' public documents (Onshape staff members have published many; search for those names on the forum)

For each feature, try to actually open the public document and read the feature's parameters and code, not just the forum post. Say explicitly whether you did.

### B. FeatureScript capabilities

Answer from the official FeatureScript documentation (cad.onshape.com/FsDoc) and Standard Library source. Quote exact function or type names.

1. **Manipulators.** Which manipulator types exist for drag handles in the 3D view? Specifically: is there a triad or point manipulator that can slide a point along a face, a linear (distance) manipulator, and an angular one? Can a manipulator be constrained to a surface?
2. **Curves on curved faces.** Is there any built-in operation to wrap or project 2D curves onto a curved face? Look for wrap, project, imprint, `opExtractWires`, `opCreateOutline`, `opSplitFace`, `opImprint`, and anything named emboss. Does Parasolid's wrap capability appear anywhere in the FeatureScript API?
3. **Surface evaluation.** Can a feature evaluate a face's parametric (u,v) surface, get a point at (u,v), and get the normal there? Look for `evSurfaceDefinition`, `evFaceTangentPlane`, `evFaceNormalAtPoint` or similar, and note which face types (plane, cylinder, cone, sphere, torus, spline/BSpline) they support.
4. **Randomness.** Is there a random number function in FeatureScript? Is it seedable and deterministic across regenerations?
5. **Native Onshape features.** Has Onshape added a native Wrap, Emboss, or Texture feature in recent release notes (2024 to 2026)? Check Onshape's release notes and "What's new" posts.
6. **Booleans in bulk.** How does `opBoolean` handle hundreds or thousands of tool bodies at once? Find forum reports on performance and recommended strategies (batching, using a single tool body, `opSplitPart`, etc.).
7. **Text/large parameters.** Can a custom feature take a long string parameter (for pasted SVG path data)? Any length limits?
8. **Free plan limits.** Any restriction on creating or using custom features on the free plan, other than documents being public.

### C. SVG into Onshape

1. Does Onshape currently import SVG directly into a sketch? If not, which formats does the sketch "Insert DXF/DWG" accept?
2. What is the recommended SVG to DXF conversion route (for example Inkscape's DXF export, or a specific online converter), and known pitfalls (curves turning into polylines, scale units, fills lost).
3. Are there any custom features or tools that go from SVG to Onshape geometry without the DXF step?

### D. Prior art to note briefly (low priority, keep to a few lines each)

- Any Onshape forum threads where someone asked for "Voronoi vase" or "pattern wrapped on vase" and what they were told.
- Any published FeatureScript that does "texture" or "knurl" on a cylinder, since that is the closest mechanical analogue to wrapping a tile.

### E. Fractal and generative pattern features (added later, medium priority)

The user also wants geometric and psychedelic generative patterns. Priority order: Truchet tiles, guilloche / spirograph curves, Hilbert curve, phyllotaxis spiral, Sierpinski carpet, Koch snowflake, Penrose tiling, moire, hyperbolic tiling, Apollonian gasket. Organic patterns (L-systems, reaction-diffusion, noise contours) are out of scope; do not search for them.

1. Search for existing public FeatureScripts that generate any of the above, plus "knurl", "texture", "diamond pattern", "hex pattern", "grid pattern on face", "space filling curve", "spirograph". Record them in section 1 of the report using the same block format.
1b. Guilloche and phyllotaxis need smooth curves, not polylines. Check whether FeatureScript can create spline or arc geometry directly (look for `opCreateBSplineCurve`, `bSplineCurve`, `opFitSpline`, `sketchFittedSpline`, `skArc`, `skEllipticalArc`) and whether such curves can be created in 3D lying on a curved face rather than only inside a planar sketch.
2. Find out how FeatureScript copes with very many small curves: is there a practical limit on the number of sketch entities or wire edges a feature can create before regeneration becomes unusably slow? Look for forum reports with numbers (for example "2000 lines took 40 seconds").
3. Does FeatureScript support recursion and deep loops without hitting an execution time limit? Find the documented regeneration timeout for a single feature, if any.
4. Does any custom feature let the user pick a second reference point or direction on a face (for example "spiral center") via a manipulator, in addition to an origin?

## Rules

- Prefer official docs and actual public documents over blog posts. Note the date of every source; Onshape changes fast.
- Never guess at a function name. If you are not sure it exists, say so and mark it "unverified".
- If you cannot find something after a reasonable effort, say "not found" and note where you looked. Absence is a useful result.
- Do not summarize the same feature twice under different names; deduplicate.
- Keep opinions to the "Assessment" section at the end and label them as opinions.

## Output format

Write `C:\Code\STL-patterns\research\01-findings.md` with these sections, in this order:

```
# Findings: Onshape FeatureScript route

## 1. Existing custom features
For each feature found, one block:
### <Feature name>
- Author:
- Link (public document URL):
- Source / where found (forum URL, GitHub URL):
- Last updated (date, or "unknown"):
- Did I open the document and read the code? (yes / no)
- What it does (2 to 4 lines):
- Inputs it takes:
- Face types it supports (planar / cylindrical / conical / any curved / unknown):
- Cut, emboss, or both:
- Has drag manipulators? (yes / no / unknown)
- Known limitations (from the author or forum replies):
- Performance notes:
- License or reuse terms (if stated):

## 2. FeatureScript capabilities
One subsection per question B1 to B8. Quote exact function names, link to the FsDoc page, give a one-line answer first and detail after.

## 3. SVG into Onshape
Answers to C1 to C3.

## 4. Prior art
Short bullets for section D.

## 5. Not found
Everything you searched for and did not find, with where you looked.

## 6. Assessment (opinion, labeled)
- Which existing feature, if any, is closest to the two-feature "layout + cut" plan and could be extended.
- The single biggest technical risk you see for wrapping an SVG tile onto a curved face in FeatureScript.
- The single biggest technical risk you see for generating Voronoi cells on a curved face in FeatureScript.

## 7. Sources
Numbered list of every URL used, with access date.
```
