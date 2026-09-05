# Research brief 04: new pattern generators — continuous single-line, cutout-safe

**Research only. Do not write code, do not scaffold anything.**
Write the report to `C:\Code\STL-patterns\research\04-findings.md` using the format at the bottom.

## Context

STL-patterns is a browser app (React + TypeScript + three.js + manifold-3d) that generates flat vector "tiles" — closed polygons or open curves with a rib width — in `src/patterns/*.ts`, then wraps them onto a 3D mesh surface as a through-cut, recess, or emboss. Full background: `C:\Code\STL-patterns\planning\02-night-report.md`.

The 14 generators that already exist (do not propose these again, minor variants only if clearly distinct — say why):

1. Voronoi cells (surface-native, seamless)
2. Delaunay mesh (seamless)
3. Truchet tiles (seamless)
4. Penrose tiling — periodic approximant (seamless, cut-and-project)
5. Penrose tiling — raw medallion (not seamless on its own; Mirror switch can force it)
6. Hilbert curve (seamless, joins across horizontal repeats)
7. Moiré (seamless, snaps to seamless angles/pitches)
8. Guilloche / spirograph, including a woven "Band" style (seamless)
9. Sierpinski (medallion)
10. Koch (medallion)
11. Phyllotaxis (medallion, seamless as a grid of medallions)
12. Hyperbolic tiling (medallion, seamless as a grid of medallions)
13. Apollonian gasket (medallion, seamless as a grid of medallions)
14. Julia / Mandelbrot, raster-traced into contours (medallion)

There is also a generic **Mirror (kaleidoscope) switch** that can make any tile seamless by reflection, and a **Seamless switch** that locks settings that would break repetition.

## What I'm looking for

New pattern families to add, screened for two properties, in this priority order:

1. **Continuous single line, safe for cutouts — the hard requirement.** The pattern's *kept material* (the rib, at some width) should form one connected path with no isolated "flying islands" — pieces of material that would become disconnected from the rest and fall out of a through-cut. The gold-standard version of this is a pattern that is mathematically **unicursal** (a single continuous stroke, ideally an Eulerian circuit — start drawing, never lift the pen, end where you started or at least never need a second disconnected stroke). A weaker but still acceptable version is a pattern where a *known algorithm reliably stitches* what would otherwise be separate loops/fragments into one connected path (e.g. slicer "concentric infill" links each ring to the next with a small radial jog instead of leaving separate closed loops). Flag which category each candidate falls into.
2. **Seamless tileability — a strong preference, not a requirement.** Prefer patterns that either tile natively, have a known periodic form, or have a documented way to build a periodic approximant (the way this app already did for Penrose: cut-and-project from a higher-dimensional lattice with a strained window). Note if a candidate is closed-medallion-only (fine, like several existing generators, but say so).

## Questions

### A. Survey — cast a wide net

Search across these domains for candidate pattern families. For each family found, give: name, where it comes from / who studies or uses it, and one line on visual character.

1. **Space-filling and other continuous fractal curves** beyond Hilbert: Moore curve (its defining feature is that it's a *closed loop* — check if that makes it seamless "for free" where Hilbert needed extra work), Peano curve, Gosper/flowsnake curve, Sierpinski arrowhead curve (note: distinct from the Sierpinski *gasket* already in the app — arrowhead is drawn as one continuous line, gasket is not), dragon curve, terdragon, Cesàro/Koch-variant curves, Lévy C curve.
2. **3D-printing slicer toolpaths**, since they exist specifically to solve "one continuous line, no islands": concentric infill with its ring-to-ring radial connector (how do slicers actually do this connector — is it a documented/simple algorithm?), spiral/vase-mode toolpaths, Fermat spiral infill (used by some slicers explicitly because it's a *single* continuous spiral covering an area, unlike plain concentric rings), zigzag/rectilinear boustrophedon fill. Cite slicer docs or papers (PrusaSlicer, Cura, or academic toolpath papers) where possible.
3. **Maze and labyrinth algorithms.** Distinguish: (a) ordinary perfect mazes (branching tree of passages — walls are usually multiple disconnected loops, a problem for this use case unless there's a trick), (b) "weave" or braid mazes, (c) classical unicursal labyrinths (7-circuit Cretan, 11-circuit Chartres, and the general algorithm for drawing them from a seed pattern) — these are non-branching by definition, single path in and out. Also look for any known method to generate a **toroidal** (wrap-around, seamless) maze by running standard generation algorithms (Kruskal's, Prim's, recursive backtracker) on a grid with wrapped edges.
4. **Celtic knotwork generators.** The term "unicursal" originates here. Look for the standard grid-based algorithm (lay a grid, place break points, trace the resulting weave) — key question: does a typical Celtic knot pattern come out as one single closed loop, or several independent loops, and is there a known rule for break placement that forces exactly one loop? Note existing open-source implementations (any language) as algorithm references even though this app won't use them directly.
5. **Islamic geometric star patterns / girih strapwork**, traced as line art rather than filled tiles. Look for Craig Kaplan's published work on constructing these ("taprats", polygons-in-contact method) and whether the resulting strapwork is known to form a single Eulerian circuit or multiple loops. Note whether these patterns are natively periodic (they usually are, unlike Penrose).
6. **Lusona / sona sand drawings** (Chokwe people, Angola) — traditional grid-based unicursal figures, studied mathematically by Paulus Gerdes ("Geometry from Africa" and related papers). These are drawn without lifting the finger by construction. Look for the grid/mirror-curve algorithm behind them (sometimes called "mirror curves" in the math literature) and whether it's been implemented in code anywhere.
7. **Spiral and rose-curve families** distinct from the existing guilloche generator: Archimedean spiral, Fermat spiral, logarithmic/golden spiral, rhodonea/rose curves, Lissajous curves, harmonograph curves. Check which of these the existing guilloche (hypotrochoid/epitrochoid-based, per the code) does NOT already cover, and which are single continuous closed curves vs need multiple passes.
8. **Newer aperiodic tilings** beyond Penrose: Ammann-Beenker (8-fold), Socolar-Taylor, and the 2023 "hat" and "spectre" aperiodic monotile discoveries. Check whether anyone has published a periodic-approximant construction analogous to what this app already did for Penrose (cut-and-project with a strained window), and whether the tile edges are naturally traceable as one connected strapwork line.
9. **Anything else you find** in laser-cutting, papercutting, or stencil-art communities specifically discussed as "single continuous line" or "no floating pieces" patterns — this is a well-known problem in that hobby space (search terms like "laser cut continuous line pattern," "papercut no islands," "single line stencil design," "kirigami connected pattern"). Note the community-sourced technique even if there's no academic citation.
10. **TSP-art / single-stroke line art from a density field**, as a general *technique* rather than one fixed pattern: turning a raster image or density function into one continuous wandering line (traveling-salesman heuristics on stipple points, or space-filling-curve-based methods like "TSP art via Hilbert curve ordering"). Flag this as a possible fix/upgrade for the existing Julia/Mandelbrot generator too, if you find that raster-traced contours in that style are typically multiple disconnected loops rather than one line — note that as an aside, don't spend much time on it.

### B. For each candidate that survives A, answer:

- **Continuity guarantee**: mathematically guaranteed unicursal / Eulerian (cite the reason), reliably achievable via a known stitching algorithm (name it), or "usually but not guaranteed — needs per-instance checking."
- **Seamless potential**: natively periodic, known periodic-approximant method (cite it), closed-medallion only, or unclear.
- **Implementation shape**: is this a grid/graph algorithm, a parametric curve, a cut-and-project construction, or a raster/tracing method? One or two sentences — no code.
- **Prior art**: any existing open-source implementation (any language) worth reading as an algorithm reference. Link + license.
- **Visual distinctiveness**: how different does it look from the 14 existing generators listed above?

## Rules

- Prefer primary/authoritative sources: academic papers (Gerdes, Kaplan), slicer documentation, well-known math-art references (mathworld, Wikipedia is fine as a starting point but corroborate). Note dates.
- Do not guess whether something is truly unicursal — if a source doesn't say so explicitly, mark it "unverified, needs checking."
- "Not found" is a valid answer for any subsection.
- Keep opinions confined to the Assessment section, labeled as opinion.

## Output format

```
# Findings 04: new continuous-line pattern candidates

## 1. Survey by domain
One subsection per A1–A10, each candidate as a short block: name, source/origin, visual character, one-line why it might fit.

## 2. Candidate detail table
| Pattern | Continuity guarantee | Seamless potential | Implementation shape | Prior art (link) | Distinctiveness |
One row per candidate that survived the survey — everything from section A with enough substance to evaluate.

## 3. Not found / dead ends
What was searched and came up empty, with where you looked.

## 4. Shortlist (opinion, labeled)
Rank the top 6–8 candidates for this app specifically, weighing: continuity guarantee strength first, seamless potential second, implementation difficulty third, visual distinctiveness fourth. One paragraph per shortlisted candidate: why it ranks where it does, and the single best source to start an implementation from.

## 5. Sources
Numbered URLs with access dates.
```
