# Findings 04: new continuous-line pattern candidates

Research executed 2026-09-03. All URLs accessed 2026-09-03 (see §5).

**A framing note that shapes everything below.** The brief asks for "unicursal", but the
app's actual requirement is weaker and worth naming explicitly: the *kept material* (the
stroke set) must be **connected**, not necessarily a single stroke. A set of several closed
loops that all cross or touch each other is one connected piece of material. The real
failure mode is *mutually disjoint nested loops* — concentric rings, Apollonian circles,
marching-squares iso-contours — where every inner loop is a flying island. Several
candidates below are "multi-strand but connected", which is fine for cutouts; they are
flagged as such rather than rejected. Where a source states unicursality explicitly it is
cited; where it does not, the row says "unverified".

---

## 1. Survey by domain

### A1. Space-filling and other continuous fractal curves beyond Hilbert

**Moore curve** — Wikipedia / standard SFC literature [1]. The loop version of the Hilbert
curve: "the union of four copies of the Hilbert curves combined in such a way to make the
endpoints coincide" [1]. Same L-system production rules as Hilbert with a different axiom
(`LFL+F+LFL`). Visual character: identical texture to the app's Hilbert generator but with
4-fold symmetry and no free ends.
*Why it might fit:* a closed loop is guaranteed single-piece as a medallion.
*Caveat, and this answers the brief's question directly:* being a closed loop does **not**
give seamlessness for free — it does the opposite. Hilbert had two free endpoints that
could be butted against the next tile's endpoints, which is exactly how the app made it
join across horizontal repeats. Moore closes those endpoints off, so a grid of Moore tiles
is a grid of mutually disjoint loops. To tile it you would have to deliberately re-open the
loop (cut one edge per tile and cross-link to the neighbour), which is the same work as
Hilbert plus an extra step. Best used as a medallion, or as a "closed" toggle on the
existing Hilbert generator.

**Sierpiński curve (the square-filling one)** — Wacław Sierpiński; MacTutor / Wolfram [2][3].
"A recursively defined sequence of continuous **closed** plane fractal curves … which in
the limit completely fill the unit square" [2]. Distinct from both the arrowhead curve and
the gasket already in the app. More symmetric than Hilbert/Peano, which is why it is used
for fast TSP approximations [2]. Visual character: diagonal, diamond-lattice weave rather
than Hilbert's rectilinear one.
*Why it might fit:* mathematically a closed curve, and visually distinct from Hilbert.

**Peano curve and its variants (Coil, Half-coil, Meurthe, PeanoZZ)** — Peano 1890;
Encyclopedia of Mathematics; Haverkort's SFC taxonomy [4][5]. Base-3 rather than base-2,
scale factor 9. Classified as a FASS curve (space-filling, self-Avoiding, Simple,
self-Similar) with a substitution-tiling description [6]. Visual character: denser,
more "switchback" than Hilbert, with 3-fold subdivision.
*Why it might fit:* same family as an existing generator, so cheap; a different rhythm.

**Gosper curve / flowsnake** — Bill Gosper; Wikipedia + MathWorld + Bridges 2017 [7][8][9].
Fills the Gosper island, which "seamlessly tiles the plane in a triangular lattice" and is
rep-7 [7][8]. "The lines drawn in the individual hexagons form a single path with its start
and end points one-third of the way round the larger shape" [10]. Visual character:
hexagonal, organic, snowflake-edged — nothing in the app looks like it.
*Why it might fit:* a genuine single open path whose supporting island tiles the plane.

**Sierpiński arrowhead curve** — MathWorld [11]; L-system: axiom `YF`, `X → YF+XF+Y`,
`Y → XF-YF-X`, angle 60°. "Traces out the Sierpiński triangle by a **single continuous**
directed path" [11]. Explicitly distinct from the gasket already in the app (item 9), which
is not drawn as one line.
*Why it might fit:* it is literally the single-stroke version of a shape the app already
ships as a non-single-stroke medallion. Direct upgrade path.

**Dragon curve, terdragon, Lévy C curve** — Wikipedia; folding-curve literature [12][13].
Dragon curve "completely tiles a portion of the two-dimensional grid, [yet] the path
remains perfectly self-avoiding" [12]. Terdragons "are self-avoiding" and "three terdragons
tile the plane … forming a periodic covering known as the fudgeflake" [13]. Lévy C has
Hausdorff dimension 2 and tiles the complex plane [12].
*Why it might fit:* single open self-avoiding paths with documented periodic tilings
(fudgeflake being the cleanest for a repeating unit).

*Not carried forward:* Cesàro / Koch-variant curves — the app already has Koch, and the
Koch snowflake is already a closed loop, so this is a parameter on an existing generator
rather than a new family.

### A2. 3D-printing slicer and CNC toolpaths

**Connected Fermat spirals** — Zhao, Gu, Huang, Garcia, Chen, Tu, Benes, Zhang, Cohen-Or,
Chen, *ACM TOG* 35(4), SIGGRAPH 2016 [14][15]. Decomposes a 2D region into sub-regions each
fillable by one Fermat spiral; the key lemma is that "it is always possible to start and
end a Fermat spiral fill at approximately the same location on the outer boundary", which
lets the sub-spirals "be joined systematically along a graph traversal of the decomposed
sub-regions, resulting in a globally continuous curve" [15]. Explicitly contrasted with
Hilbert/Peano: "formed mostly by long, low-curvature paths" [14]. Visual character: smooth
nested-then-reversing spirals that read as fingerprint whorls.
*Why it might fit:* it is a published algorithm whose entire purpose is "one continuous
line covering an arbitrary region".

**Contour-parallel → spiral conversion (the ring-to-ring connector)** — Held & Spielberger,
"A smooth spiral tool path for high speed machining of 2D pockets", *Computer-Aided Design*
41(7), 2009, 539–550 [16]. Builds nested Jordan "wave fronts" from the Voronoi diagram of
the pocket and links them into a spiral with no self-intersections and no retractions [16].
This is the authoritative answer to the brief's question "how do slicers actually do the
ring-to-ring connector": in CAM it is a documented Voronoi/offset-based linking algorithm;
in hobby slicers it is much cruder.
PrusaSlicer ships **Archimedean Chords** and **Octagram Spiral** as spiral infills; the KB
says the top layer of Archimedean chords "is printed in a spiral" [17], and the community
bug report confirms the honest limitation: the slicer "will nicely spiral the infill
from/to the center where it can form a continuous line, but as soon as the pattern
intersects a wall, it randomly fills the remaining area" [18]. Plain **Concentric** infill
in PrusaSlicer has *no* connector at all — "there is nothing tying the concentric loops
together" [19]. So: concentric-with-jog is real, but it is a CAM algorithm, not a
PrusaSlicer feature.

**Cura's two stitching settings** — the closest thing to documented, simple "make it one
line" rules [20][21]. *Connect Infill Lines* (internal name `zig_zaggify_infill`) "connects
the endpoints of the infill pattern, where the infill meets the inner wall or skin, using a
line that follows the edge of the infill area … converts the entire infill pattern into a
single or very few lines" [21]. *Connect Infill Polygons* "fuses adjacent closed infill
loops into a single continuous loop" by "making small connections where polygons are
adjacent" — but the SettingsGuide is explicit that it only applies where infill consists of
adjacent loops (Cross / Cross 3D, multiplied infill lines), **not** to Concentric [20].
*Why it might fit:* the zig-zaggify rule (walk the boundary to link consecutive line-ends)
is the simplest correct stitcher for any boustrophedon-style fill and is trivial to
implement.

**Boustrophedon / rectilinear zigzag** — Choset & Pignon, "Coverage Path Planning: The
Boustrophedon Cellular Decomposition" [22]. Decompose the region into convex cells, cover
each with back-and-forth motions, then cover the cell-adjacency graph with an exhaustive
path [22]. Trivially one continuous line inside a convex cell.
*Why it might fit:* dull on its own, but it is the guaranteed-continuity fallback and the
cell-adjacency-graph traversal idea generalises to stitching *any* decomposed fill.

**Cura Cross / Cross 3D infill** — "produces a space-filling curve that produces something
that looks like crosses along the inside of the volume … produces no retractions at all"
[23]. Visual character: a hexagonal/cross fractal weave, distinct from Hilbert.

**Spiral vase mode** — Cura's "Spiralize Outer Contour" / Orca & Bambu "Spiral Vase". "One
perimeter wall with zero retractions, no infill, no travel moves except at the start" [24].
Conceptually just a single Archimedean spiral in the plane; not a 2D pattern family in
itself. Recorded for completeness.

### A3. Maze and labyrinth algorithms

**Classical unicursal labyrinth from a seed pattern** — Labyrinthos / Labyrinth Locator
[25][26]. The Cretan/classical 7-circuit labyrinth is "a single pathway that loops back and
forth to form seven circuits, bounded by eight walls" [25], generated from "a cross with a
dot in each quadrant" by connecting the free ends in a fixed order; the classical path
sequence is 3-2-1-4-7-6-5-8 [26]. The 11-circuit Chartres form is the medieval extension.
Non-branching by definition. Visual character: instantly recognisable, ancient, centred.
*Why it might fit:* unicursal by construction, and the seed-pattern rule is a short, exact,
documented algorithm.

**Unicursal maze from a perfect maze (the bisection trick)** — Walter D. Pullen,
*Think Labyrinth* [27]. The rule, quoted: "Take a perfect Maze, seal off the exit so
there's only the one entrance, then add walls bisecting each passage." Pullen adds the
practical refinement: "When creating the perfect Maze, never add segments attached to the
right or bottom walls … Have the entrance at the upper right, and after bisecting to create
the unicursal routing, remove the right and bottom wall" [27]. This is the
spanning-tree-boundary construction: the contour of a spanning tree is a single closed
curve. Visual character: an organic, meandering, maze-like single line at any density.
*Why it might fit:* single continuous path guaranteed for **arbitrary size and arbitrary
random seed** — the strongest combination of guarantee + variety + easy implementation
found in this survey.

**Perfect-maze walls are one connected piece** — the tree/cotree duality. For a planar
graph, the duals of the edges *not* in a spanning tree form a spanning tree of the dual —
so a perfect maze's walls are connected and loop-free. Classical theory (Biggs 1971;
Rosenstiehl & Read 1978), with the surface generalisation stated below [28].
*Why it matters:* a maze rendered as *walls* is already island-free, even though the maze
passage is a branching tree rather than one stroke. This is the "multi-strand but
connected" category.

**Braid mazes** — Pullen: "one without any dead ends … passages that coil around and run
back into each other" [27]. A braid maze's passage graph contains cycles, so by the same
duality its **wall** structure becomes disconnected — a braid maze rendered as walls
produces exactly the flying islands the brief wants to avoid. Rejected, with reason.

**Toroidal / wrap-around mazes** — Pullen calls this *planair* topology: "Mazes that are
equivalent to being on a torus with the left and right sides wrapping and the top and
bottom wrapping" [27]. Jamis Buck gives a concrete toroidal-grid implementation (index the
grid mod width/height; every standard algorithm — Kruskal, Prim, recursive backtracker —
then runs unmodified) [29]. On a genus-1 surface, Rosenstiehl & Read: the complement of a
spanning tree "splits into a (dual) spanning tree and 2g additional edges" [28], so the
walls stay connected on the torus too — the extra 2 edges add cycles, not components.
*Why it might fit:* this is a clean, cited route to a **seamless random maze**: run the
generator on a modulo-indexed grid, and both the unicursal-bisection trick and the
wall-rendering stay valid.

**L-system closed-loop mazes on a torus** — Chelladurai, Madeya & Diaz, ICVARS 2024,
DOI 10.1145/3657547.3657552 [30]. Two-phase L-system + recursive block removal on a
toroidal surface. Paywalled (ACM returned HTTP 403); abstract only. Listed as a lead, not
verified.

### A4. Celtic knotwork

**Grid-and-barriers Celtic knot construction** — Connor & Ward (supervisors Ranicki &
Collins), *Celtic Knot Theory*, University of Edinburgh, 12 March 2012 [31]. Formal
definition: a boundary of dimensions 2m×2n, plus "barriers" (even-length horizontal or
vertical segments) that reflect the strands; tile placement in each cell is determined
purely by the neighbouring barriers and the parity of x+y [31].
The component count is exactly what the brief asked for:
- **Theorem 8: "If gcd(m, n) = k then the plait C_mn has exactly k components."** [31]
- and the coprime corollary: "if gcd(m, n) = 1 … we create a link of 1 component (a knot)"
  [31].
Cross-checked independently: Fisher & Mellor state the general rule as gcd(|p−q|, n), and
give the worked example "a 12 × 15 panel has 3 = gcd(12, 15) strands" [32].
So **yes, there is a rule that forces exactly one loop**: pick coprime grid dimensions for
the barrier-free plait. Barriers change the count, and the merge/split behaviour is the
same as the mirror-curve rule in A6 (see below).
Visual character: the archetypal over-under interlace. Nothing in the app resembles it.

### A5. Islamic geometric star patterns / girih strapwork

**Hankin's polygons-in-contact, as formalised by Kaplan** — Craig S. Kaplan, "Islamic Star
Patterns from Polygons in Contact", *Graphics Interface 2005* [33]; and Kaplan & Salesin,
"Islamic Star Patterns in Absolute Geometry", *ACM TOG* 23(2), 2004 [34]. Input is a tiling
plus a **contact angle** θ; a pair of rays is emitted from every contact position on every
tile edge at angle θ, and an inference algorithm fills irregular tiles [33]. Output is line
art / strapwork, not filled tiles. Kaplan is explicit about periodicity: "Our current
software handles only periodic tilings (though there is no such limitation in the
underlying technique). A tiling is represented by two translation vectors and a collection
of untransformed polygons." [33]
**Is it one Eulerian circuit? No — and this is documented.** Grünbaum & Shephard, "Interlace
patterns in Islamic and Moorish art", *Leonardo* 25 (1992), analysed strand structure with
Cayley diagrams and showed that for periodic tilings "there are a small number of unique
strand shapes … arranged periodically", forming "either finite, closed loops or infinitely
long, unbounded strands"; their survey found "most medieval compositions contain fewer than
4 strand shapes" [35]. Ostromoukhov extended the method to all 17 wallpaper groups [35].
*Why it might still fit:* strapwork strands **cross each other everywhere**, so the union
is a connected planar graph even though it is 2–4 strands, not one. Category: multi-strand
but connected. Also natively periodic, unlike Penrose — a real advantage for this app.
Aside: Cline (Bridges 2024) applied girih rules to an aperiodic Penrose P2 tiling instead
and found "all strands are closed loops, with no obvious limits to the number of unique
strand shapes and crossing numbers", one surveyed strand having 452,618 crossings [35].
Interesting, but the opposite of what this app wants for tileability.

### A6. Lusona / sona sand drawings and mirror curves

**Mirror curves — the algorithm.** Slavik Jablan et al., "Mirror-Curves and Knot Mosaics",
arXiv:1106.3784 (2011) [36]. On a rectangular grid RG[p,q], connect midpoints of adjacent
edges to get a 4-valent graph; traverse by "leaving each vertex via the middle outgoing
edge"; returning to the start closes one component. The stated result:
**"The number of components of a knot or link L obtained from a rectangular grid RG[p, q]
without internal mirrors is c(L) = GCD(p, q)"** [36] — i.e. coprime dimensions give a
single closed curve covering the whole rectangle. Adding internal two-sided mirrors bends
the ray and changes the component count.

**The mirror merge/split rule — this is the key to *forcing* monolinearity.** Darrah Chavey,
"Mathematical Experiments with African Sona Designs", Bridges 2009 [37]: "if a sona with
one or more lines has a mirror added where two **different** lines cross, those lines will
merge into one, while adding a mirror where a line crosses **itself** splits that line into
two." Chavey confirms the gcd rule independently ("It takes gcd(m, n) lines") and gives
constructive corollaries: a grid with gcd r can be made monolinear by erasing r−1 corner
dots, and figure 4's tri-lineal 3×6 grid "can be made monolineal by many different choices
of 2 symmetrically placed mirror walls" [37].
This gives a **repair algorithm with a guarantee**: colour the components, find any crossing
between two different components, place a mirror, repeat — each mirror strictly decreases
the component count by one, so you reach 1 in (components−1) steps.

**Cultural/mathematical grounding.** Paulus Gerdes, *Sona Geometry* and "African Sona,
Mirror Curves and Lunda-Designs" — divides the drawings into classes by grid dimension and
construction method, studies monolinearity as a cultural value, and gives rules that
transform a 2-linear drawing into a monolinear one plus "chain rules" that chain two
monolinear drawings into a bigger one [38][39]. Demaine, Demaine, Taslakian & Toussaint,
"Sand drawings and Gaussian graphs", *Journal of Mathematics and the Arts* (2007; Bridges
2006 preliminary) formalise sona as **Gaussian graphs**: 4-regular, and traversed by "going
straight" at each vertex you "visit every edge exactly once before returning to your
starting point" — a property strictly stronger than Eulerian [40].
Visual character: a woven diagonal lattice of a single ribbon, unlike anything in the app.

**Kolam / pulli kolam** — the South-Indian cousin: "a continuously closed curve that
partitions the planar space into as many bounded regions as there are dots, so that each
bounded region contains exactly one dot" [40]. A recent paper gives an explicit one-stroke
generation algorithm using a "gating structure" [41], and a lattice-angle simulation method
exists [42]. Same graph model, rounder visual style.

### A7. Spiral and rose-curve families vs the existing guilloche

The app's `src/patterns/guilloche.ts` (read directly) implements exactly two things: polar
rosettes `r(θ) = R0 + A·sin(kθ + φ_i)` with a rigid per-curve twist and nested inner rings,
and a "band" style of superposed sinusoids `y = cy + A·sin(2πkx/w + φ_i)` plus mirrors. It
does **not** implement hypotrochoids/epitrochoids as such, and it does **not** cover:

**Rhodonea / rose curves `r = cos(kθ)` with rational k = n/d** — Wikipedia / MathWorld
[43][44]. "If either a or b is even the curve has 2a petals and closes at Δθ = 2πb,
otherwise it has a petals and closes at Δθ = πb" [43]. For rational k the whole figure is
**one closed single-stroke curve**; for irrational k it never closes. Distinct from the
existing rosette because the pole is on the curve (petals meet at the centre) rather than
`R0 + A·sin` staying in an annulus — so the rose is self-connected at the origin where the
existing rosette family is a set of nested non-touching ovals unless amplitudes overlap.

**Fermat spiral `r = ±a√θ`** — the double-armed form is a single continuous curve through
the origin, and is the base primitive of the A2 connected-Fermat-spiral method [14].
**Archimedean `r = aθ`** and **logarithmic/golden `r = ae^(bθ)`** spirals — single open
curves; the Archimedean one is what "concentric with a jog" degenerates to and is
inherently island-free (it is one line, not rings).

**Lissajous and harmonograph curves** — "When the ratio of the frequencies of the
oscillations is a rational number … the curve is closed; it loops back on itself" [45].
Damped harmonograph curves are one continuous inward-spiralling stroke by construction (the
pen never lifts). Neither is covered by the current band or rosette styles.

### A8. Newer aperiodic tilings beyond Penrose

**Ammann–Beenker (8-fold) with square periodic approximants** — Jagannathan & Duneau,
"Properties of the Ammann-Beenker tiling and its square approximants", arXiv:2308.07701
(15 Aug 2023, rev. 27 Feb 2024); published in *Israel J. Chem.* 2024 [46][47]. This is the
**direct analogue of the Penrose approximant the app already built**. The construction,
quoted: "The perfect AB tiling … has been obtained by projecting onto an irrational plane
E. If this irrational plane is slightly tilted, to a rational orientation, the resulting
tiling is a periodic structure" [46]. The rational orientations are given by **Pell number**
ratios (silver mean λ = 1+√2 replaced by ratios of Pell numbers 𝒫ₙ), with normalisation
2𝒩ₙ² = 4𝒫ₙ² + (−1)ⁿ; the approximants have approximate D₄ symmetry [46]. Squares and 45°
rhombi; 8-fold-looking, visibly different from Penrose's 5-fold.
*Continuity:* the edge skeleton of any edge-to-edge tiling is a connected planar graph, so
drawn as ribs it is one connected piece. Not unicursal.

**Ammann bars** — Tilings Encyclopedia [48]. The prototiles can be decorated with line
segments such that "these segments extend to biinfinite straight lines throughout the
tiling", forming five (Penrose) or parallel 45° (Ammann–Beenker) families of infinite
straight lines with Fibonacci-word spacing [48]. Every bar is an infinite straight line, so
the whole grid is trivially connected — a very cheap, very distinct "quasiperiodic
straight-line grid" pattern.

**Socolar–Taylor hexagonal monotile** — Taylor 2010 / Socolar & Taylor, "An aperiodic
hexagonal tile" and "Forcing nonperiodicity with a single tile" [49][50]. The matching rules
are literally line-continuity rules: "(R1) the black stripes must be continuous across all
edges in the tiling" [49]. Adjacent tiles' markings "line up … to create an extended black
path" [49].
*Why it might fit:* a tiling whose defining decoration is a continuous line network. But it
is aperiodic-only and (unlike AB) no periodic-approximant construction was found.

**Hat / Spectre (2023)** — Smith, Myers, Kaplan & Goodman-Strauss [51]. The Hat family "is
topologically conjugate to a self-similar model set (the CAP tiling) with pure-point
spectrum … [which] comes from a natural cut-and-project scheme, with all other members of
the Hat family obtained via small modifications of the projection from this cut-and-project
scheme" [52]. So a CP scheme exists — but **no published periodic-approximant construction
analogous to the AB/Penrose one was found** (see §3). No source describes the tile edges as
a single traceable strapwork line either.

### A9. Laser-cutting / papercutting / stencil-art community techniques

**Islands and bridges** — the community's standard framing of exactly this problem: "Islands
are connected by bridges to stop them floating away"; "the positive space (the material that
remains) must all be connected in one continuous piece"; recommended minimum bridge width
~1.5–2 mm for mylar, ~1 mm minimum line width [53][54]. Stencil typefaces are the
"design it out" answer: "every letter [is drawn] with built-in gaps so no counter is ever
enclosed" [53].
*Relevance to this app:* a generic **auto-bridging post-pass** — find connected components
of the rib set, connect each orphan to its nearest neighbour with a rib-width bar — is the
community-standard safety net and would make *any* generator cutout-safe, including the
existing Apollonian, Julia and Voronoi-derived ones. No academic citation, but it is
universal practice.

**Truchet–Smith quarter-circle tiles** — Cyril Stanley Smith, 1987 [55]. Worth naming even
though Truchet is already generator #3, because the specific quarter-circle variant is the
one with the continuity property: "because the arcs meet the sides of the square
perpendicularly and at the centers of the sides, any orientation of the tiles in an
edge-to-edge tessellation will allow the arcs to meet, forming smooth seamless blobs and
loops" [55]. The result is a set of closed loops — mutually disjoint, so **islands**. The
diagonal-line Truchet labyrinth variant's connectivity is a bond-percolation problem at
criticality [55], i.e. genuinely random and unguaranteed. If the app's existing Truchet
generator uses the quarter-circle style, it is a live island risk worth auditing.

**Greek key / meander friezes** — a continuous right-angled line where "the path never lifts
off and never crosses itself", built so it "can repeat forever" as a frieze [56]. Trivially
unicursal and trivially periodic in one direction. Low-effort, high-recognition band
pattern; the app has nothing rectilinear-decorative like it.

**Single-line fonts / one-line art tools** — the plotter and laser community's practice of
"one continuous line that modulates its path", with SVG optimisers like vpype reordering
strokes to minimise pen-up travel [57]. Technique, not a pattern family.

### A10. TSP-art / single-stroke line art from a density field

**TSP art** — Bosch & Herman, "Continuous line drawings via the traveling salesman
problem", *Operations Research Letters* 32(4), 2004; Kaplan & Bosch, "TSP Art", Bridges
2005 [58][59]. Method: stipple the target density field into "cities", run a TSP heuristic,
draw the tour. Because a TSP tour is a Hamiltonian **cycle**, the output is by construction
a single closed loop. Kaplan's contribution is better city distributions (Voronoi/Lloyd
stippling) for more attractive results [59].

**Space-filling-curve ordering as the cheap alternative** — Velho & Gomes, "Digital
Halftoning with Space Filling Curves", SIGGRAPH '91 [60]. Traverse the region along a
space-filling curve and modulate cluster size by local density. Much cheaper than a TSP
solve and gives a genuinely single path.

**The aside the brief asked for.** Yes — raster-traced contours are the disconnected case.
Marching squares "divides a field into squares and determines contour lines based on
threshold values", and "there might be multiple connected contour lines for a given level"
[61]; a Julia set "is either path-connected or totally disconnected", and a filled Julia
set "can have infinitely many connected components" [62]. So the app's generator #14 almost
certainly emits multiple mutually disjoint closed contours — flying islands. Two documented
fixes: (a) re-emit it as TSP art / SFC-dithered art over the escape-time field, giving one
line; (b) run the A9 auto-bridging post-pass.

**Direct precedent for exactly this kind of repair** — Feijs & Toeters, "Single Line
Apollonian Gaskets for Fashion", Bridges 2022, plus the follow-up arXiv:2204.05729 [63][64].
They take the Apollonian gasket — which in its normal form is a set of *mutually tangent
but topologically separate* circles, i.e. the app's generator #13 — and "draw all circles as
one line without lifting the pen and without crossing itself", by a tracing algorithm that
goes around the circles in generation order; then they laser-engraved the result on
garments [63][64]. This is the single most on-point piece of prior art found, and it is
about a generator the app already has.

---

## 2. Candidate detail table

| Pattern | Continuity guarantee | Seamless potential | Implementation shape | Prior art (link) | Distinctiveness |
|---|---|---|---|---|---|
| **Mirror curves / lusona** | **Guaranteed.** c(L) = gcd(p,q) components on RG[p,q], so coprime ⇒ 1 closed curve [36]; plus a constructive merge rule — a mirror at a crossing of two *different* components merges them, strictly reducing the count [37]. Gaussian ⇒ stronger than Eulerian [40]. | Natively periodic: it lives on a rectangular dot grid; tiling is a matter of choosing the repeat and mirroring the boundary reflections. Grid dimensions are free parameters. | Grid/graph. Build the 4-valent midpoint graph, walk "straight through" each vertex, flip at mirrors. | [Jablan, arXiv:1106.3784](https://arxiv.org/pdf/1106.3784) (paper, no licence); [Beloit College Sona-Drawing](https://github.com/beloitcollegecomputerscience/Sona-Drawing) (code, licence unstated) | Very high. A woven single-ribbon diagonal lattice; nothing in the 14 resembles it. |
| **Unicursal maze (spanning-tree bisection)** | **Guaranteed.** Any perfect maze's passage tree, bisected, yields one snake-like path [27]. Equivalent to tracing a spanning tree's contour. | Strong: run the maze generator on a modulo-indexed toroidal grid [29]; Pullen's "planair" topology names this case [27]. Wall connectivity survives on the torus (cotree + 2g edges [28]). | Grid/graph. Spanning tree (Kruskal / Prim / recursive backtracker) on a wrapped grid, then contour-trace. | [Jamis Buck, toroidal grid](https://weblog.jamisbuck.org/2015/11/21/representing-toroidal-grid.html); [theseus (Ruby)](https://github.com/jamis/theseus); [mazelib (MIT)](https://github.com/john-science/mazelib) | High. Organic wandering meander, seed-varied, at any density. |
| **Perfect maze rendered as walls** | **Guaranteed connected (not unicursal).** Tree/cotree duality: duals of non-tree edges form a spanning tree of the dual ⇒ walls connected, no islands [28]. Braid mazes break this. | Same toroidal trick [27][29]. On genus 1 the cotree gains 2 cycles but stays connected [28]. | Grid/graph, same generator, different rendering (walls not path). | [Think Labyrinth](https://www.astrolog.org/labyrnth/algrithm.htm); [mazelib (MIT)](https://github.com/john-science/mazelib) | High, and visually distinct from the unicursal version (branching vs snaking). |
| **Classical labyrinth (Cretan 7 / Chartres 11)** | **Guaranteed.** Unicursal by definition — no junctions, one path in and out [25][27]. | Medallion only (a centred figure). Tiles as a grid of medallions, like the app's phyllotaxis/hyperbolic. | Constructive: seed pattern (cross + 4 dots + 4 corners), connect free ends in a fixed order [25][26]. | [Labyrinthos layout](https://www.labyrinthos.net/layout.html); [Labyrinth Locator typology](https://labyrinthlocator.org/labyrinth-typology/classical-labyrinths/) | High and instantly readable; culturally iconic. |
| **Connected Fermat spirals** | **Guaranteed by the paper's construction** — sub-region spirals start/end at the same boundary point and are joined along a graph traversal into "a globally continuous curve" [14][15]. | Medallion / region-shaped. No published periodic form; you would fill a square tile and the seam would need explicit handling. | Region decomposition + offset isocontours + spiral rewiring + graph traversal. The heaviest lift here. | [ejbosia/connected-fermat-spirals](https://github.com/ejbosia/connected-fermat-spirals) (Python); [reso1/MCFS](https://github.com/reso1/MCFS); [project page](https://haisenzhao.github.io/CFS/index.html) — licences not stated on the pages checked | Very high. Fingerprint-whorl texture; nothing like it in the 14. |
| **Celtic knotwork (plait + barriers)** | **Guaranteed and tunable.** Theorem 8: plait C_mn has exactly gcd(m,n) components; coprime ⇒ exactly one knot [31]; independently corroborated [32]. Barriers change the count (same merge/split logic as mirror curves [37]). | Natively periodic — it *is* a rectangular grid construction with a fixed repeat. | Grid/graph. Place barriers on parity-valid dots, choose one of ~6 tile types per cell from neighbouring barriers and (x+y) parity [31]. | [mbasaglia/Knotter](https://github.com/mbasaglia/Knotter); [dmackinnon1/celtic](https://github.com/dmackinnon1/celtic) (JS); [BorisTheBrave/celtic-knot](https://github.com/BorisTheBrave/celtic-knot) (MIT) | Very high. The interlace look is unmistakable and absent from the app. |
| **Moore curve** | **Guaranteed closed loop** — union of four Hilbert copies with coinciding endpoints [1]. | **Weak, and worse than Hilbert.** Closing the loop removes the free ends the app used to join Hilbert across repeats; tiled Moore = disjoint loops. Medallion-first. | Parametric/L-system. Axiom `LFL+F+LFL`, same rules as Hilbert [1]. | Trivial from the app's existing `hilbert.ts`. | Low — reads as a symmetric Hilbert. |
| **Sierpiński curve (square-filling, closed)** | **Guaranteed closed** — "a recursively defined sequence of continuous closed plane fractal curves" [2][3]. | Medallion; no free ends, same objection as Moore. | Parametric/L-system recursion. | [Wolfram `SierpinskiCurve`](https://reference.wolfram.com/language/ref/SierpinskiCurve.html); [MacTutor](https://mathshistory.st-andrews.ac.uk/Extras/Sierpinski_curve/) | Medium — diagonal weave, visibly not Hilbert. |
| **Sierpiński arrowhead curve** | **Guaranteed single stroke** — "traces out the Sierpiński triangle by a single continuous directed path" [11]. | Open ends at two triangle corners ⇒ joins in a triangular strip; rectangular seamlessness unverified. | L-system: axiom `YF`, `X→YF+XF+Y`, `Y→XF-YF-X`, 60° [11]. | [MathWorld](https://mathworld.wolfram.com/SierpinskiArrowheadCurve.html); [Fractal Garden L-system](https://www.fractal.garden/l-system/sierpinski-arrowhead) | Medium — it is a *fix* for the app's existing Sierpinski gasket rather than a new look. |
| **Gosper / flowsnake** | **Guaranteed single self-avoiding open path**; "the lines … form a single path with its start and end points one-third of the way round the larger shape" [10]. | Gosper island "seamlessly tiles the plane in a triangular lattice" [7][8] — periodic on a hex lattice, awkward on the app's rectangular tile. Needs checking. | L-system / recursive substitution, hexagonal grid, 60° turns. | [andrewcb/Flowsnake](https://github.com/andrewcb/Flowsnake) (Haskell); [Bridges 2017 "Flowsnake Earth"](https://archive.bridgesmathart.org/2017/bridges2017-237.pdf) | High — organic hexagonal snowflake edge, unlike Hilbert. |
| **Dragon / terdragon (fudgeflake)** | **Guaranteed self-avoiding single path** [12][13]. | Terdragon: three copies tile the plane as the "fudgeflake", "a periodic covering" [13]; dragon curve "tiles the plane in many ways" [12]. | L-system / paper-folding sequence. | [arXiv:1712.09545](https://arxiv.org/pdf/1712.09545) (self-avoidance proofs for terdragons) | High — jagged, asymmetric, unlike anything present. |
| **Islamic star strapwork (Hankin / polygons-in-contact)** | **Multi-strand but connected.** Grünbaum & Shephard: typically <4 distinct strands, "finite closed loops or infinitely long unbounded strands" [35]. Strands cross everywhere ⇒ the union is a connected graph. Not Eulerian. | **Natively periodic** — Kaplan: "Our current software handles only periodic tilings … represented by two translation vectors" [33]. Big advantage over Penrose. | Parametric on a tiling: emit two rays per edge contact point at contact angle θ, intersect greedily, infer irregular tiles [33]. | [Taprats (GPL)](https://sourceforge.net/projects/taprats/); [CodingTrain/StarPatterns](https://github.com/CodingTrain/StarPatterns); [Alhambra C++ port](https://github.com/pierrebai/Alhambra); [Kaplan 2005 PDF](https://cs.uwaterloo.ca/~csk/publications/Papers/kaplan_2005.pdf) | High. Star/rosette strapwork; the app has no periodic star pattern. |
| **Ammann–Beenker + square (Pell) approximants** | **Multi-strand but connected** (tiling edge skeleton). Not unicursal; no source claims it. | **Documented approximant method** — tilt the irrational projection plane to a rational orientation given by Pell-number ratios [46][47]. Direct analogue of the app's Penrose approximant. | Cut-and-project from a 4D lattice, rational slope, octagonal window. | [arXiv:2308.07701](https://arxiv.org/abs/2308.07701); [Tilings Encyclopedia: Ammann-Beenker](https://tilings.math.uni-bielefeld.de/substitution/ammann-beenker/) | Medium-high — 8-fold vs the existing 5-fold Penrose; recognisably a sibling. |
| **Ammann bars** | **Guaranteed connected** — every bar is an infinite straight line crossing the others [48]. Not unicursal. | Natively quasiperiodic; on an approximant it becomes periodic. Fibonacci-word spacing. | Parametric: four or five families of parallel lines with Fibonacci-word gaps. | [Tilings Encyclopedia: Ammann Bars](https://tilings.math.uni-bielefeld.de/glossary/ammann-bars/); [arXiv:2205.13973](https://arxiv.org/pdf/2205.13973) | Medium. A straight-line quasilattice — cheap to build, visually clean, not present in the app. |
| **Socolar–Taylor tile** | Decoration is *defined* by line continuity: "the black stripes must be continuous across all edges" [49]. Global single-strand status **unverified**. | Aperiodic-only; **no periodic approximant found**. Medallion/patch only. | Substitution or matching-rule tiling of a marked hexagon. | [arXiv:1003.4279](https://arxiv.org/pdf/1003.4279); [arXiv:1009.1419](https://arxiv.org/pdf/1009.1419); [Tilings Encyclopedia](https://tilings.math.uni-bielefeld.de/substitution/hexagonal-aperiodic-monotile/) | High — hexagonal, stripe-network look. |
| **Hat / Spectre monotile** | Unverified. No source describes a single-line traversal of the tile edges. | CP scheme exists (CAP tiling, pure-point spectrum) [52], but **no periodic-approximant construction found**. | Substitution / combinatorial coordinates. | [Smith et al., arXiv:2303.10798](https://arxiv.org/pdf/2303.10798); [Tatham, combinatorial coordinates](https://www.chiark.greenend.org.uk/~sgtatham/quasiblog/aperiodic-spectre/); [vmagnin/hat_polykite](https://github.com/vmagnin/hat_polykite) | Very high (topical, recognisable) — but the continuity story is unproven. |
| **Rose / rhodonea curves (rational k)** | **Guaranteed single closed stroke** for k = n/d rational; closes at Δθ = 2πb or πb depending on parity [43][44]. | Medallion (centred), seamless as a grid of medallions like the existing rosette. | Parametric polar curve. Trivial. | [Wikipedia: Rose (mathematics)](https://en.wikipedia.org/wiki/Rose_(mathematics)); [MathWorld](https://mathworld.wolfram.com/RoseCurve.html) | Low-medium — adjacent to the existing guilloche rosette, but *petals meet at the pole* where the existing `R0 + A·sin` family does not. Argue distinctness carefully. |
| **Fermat / Archimedean / logarithmic spiral** | **Guaranteed single curve** (one stroke by definition). Fermat's double arm passes through the origin. | Medallion only. | Parametric polar. Trivial. | Standard; also the primitive inside [14]. | Low alone — but high value as the "concentric without islands" primitive and as a compositing rib. |
| **Lissajous / harmonograph** | **Guaranteed closed** when the frequency ratio is rational [45]; the damped harmonograph is one continuous stroke by construction. | Medallion. | Parametric. Trivial. | [Springer, "Recurrence in Lissajous Curves" (2023)](https://link.springer.com/article/10.1007/s10699-023-09930-z) | Medium — the damped/decaying variant looks unlike the app's undamped rosette family. |
| **Greek key / meander frieze** | **Guaranteed unicursal** — "the path never lifts off and never crosses itself" [56]. | Natively periodic in one direction; it "resolves perfectly so it can repeat forever" [56]. Corner variants exist for framing. | Grid/turtle: a fixed sequence of right-angled moves per repeat unit. Trivial. | Classical; [Wikipedia: Meander (art)](https://en.wikipedia.org/wiki/Meander_(art)) | Medium-high — the app has no rectilinear decorative band. |
| **Cura zig-zaggify / boustrophedon stitcher** | **Guaranteed** for a fill inside a simply-connected region: connect consecutive line-ends along the boundary [21]; boustrophedon cell coverage + adjacency-graph traversal [22]. | Applies to any tile; the stitch runs along the tile border. | Post-process on an existing line set — a *technique*, not a pattern. | [SettingsGuide zig_zaggify_infill](https://github.com/Ghostkeeper/SettingsGuide/blob/master/resources/articles/infill/zig_zaggify_infill.md); [CuraEngine infill.cpp](https://github.com/Ultimaker/CuraEngine/blob/main/src/infill.cpp) | N/A — infrastructure. |
| **TSP art / SFC-dither from a density field** | **Guaranteed single closed loop** (a TSP tour is a Hamiltonian cycle) [58][59]; the SFC version is one path by construction [60]. | Field-dependent; seamless if the density field is periodic and the tour is built on a torus. Unverified for the toroidal case. | Raster/tracing: stipple → order → connect. | [Kaplan & Bosch, Bridges 2005](https://archive.bridgesmathart.org/2005/bridges2005-301.pdf); [kalyaninagaraj/TSP-Art](https://github.com/kalyaninagaraj/TSP-Art); [Velho & Gomes 1991](https://lhf.impa.br/cursos/rr/Velho-Gomes-1991.pdf) | High, and it is a *general* mechanism: any density field (including Julia escape-time) becomes one line. |
| **Single-line Apollonian tracing** | **Guaranteed by the published algorithm** — "draw all circles as one line without lifting the pen and without crossing itself" [63][64]. | Medallion (same as the app's existing Apollonian). | Tracing: walk the circles in generation order, hugging each. | [Feijs & Toeters, Bridges 2022](http://www.m.archive.bridgesmathart.org/2022/bridges2022-119.pdf); [arXiv:2204.05729](https://arxiv.org/pdf/2204.05729) | N/A as a new family — it is a **repair for existing generator #13**. |

---

## 3. Not found / dead ends

- **A periodic-approximant construction for the Hat or Spectre monotile.** Searched arXiv,
  the Tilings Encyclopedia, and the 2023–2025 follow-up literature. Found the CP scheme for
  the Hat family (CAP tiling, pure-point spectrum, "all other members … obtained via small
  modifications of the projection" [52]) and the quasicrystalline analysis of the Smith
  monotiles, but **no paper constructing a rational-slope periodic approximant** the way
  Jagannathan & Duneau do for Ammann–Beenker. Treat as genuinely open, not as "I missed it".
- **Any claim that the Hat/Spectre tile edges are traceable as one connected strapwork
  line.** Nothing found either way. Unverified.
- **Whether a Socolar–Taylor stripe network forms a single global path.** The matching rules
  force local stripe continuity [49] and stripes join into "an extended black path" [49],
  but no source states the global component count. Unverified.
- **Chelladurai et al., "L-System on a Toroidal Topology: Crafting Refined Closed-Loop
  Mazes" (ICVARS 2024).** ACM DL returned HTTP 403; only the abstract was readable via
  search. Its "closed-loop maze" may or may not mean a single closed curve. Unverified.
- **A documented ring-to-ring connector inside PrusaSlicer's Concentric infill.** There
  isn't one — the GitHub issues confirm concentric loops are left unconnected ("there is
  nothing tying the concentric loops together" [19]) and it is an open feature request [19].
  The real algorithm lives in CAM (Held & Spielberger [16]) and in Cura's separate
  Connect-Infill-Polygons setting, which the docs say does **not** apply to concentric [20].
- **Cura's Connect Infill Polygons applied to Concentric.** Explicitly not supported — the
  SettingsGuide lists Cross, Cross 3D, and multiplied infill lines as the applicable cases
  [20].
- **An authoritative statement that Islamic strapwork forms one Eulerian circuit.** The
  literature says the opposite (2–4 strand shapes for periodic tilings [35]).
- **A rule forcing exactly one loop in Celtic knotwork *with* barriers.** Found the exact
  rule for the barrier-free plait (coprime dimensions [31][32]) and the analogous
  merge/split rule from the mirror-curve literature [37], but no paper states the barrier
  case for Celtic knots directly. Marked "reliably achievable via the mirror-curve merge
  rule", not "proved for Celtic barriers".
- **Kirigami / papercutting academic sources on "no islands".** The kirigami literature is
  about mechanics and lattice defects (e.g. "Making the Cut: Lattice Kirigami Rules"), not
  connectivity for cutting. The usable material is entirely community/trade practice
  (stencil bridging [53][54]).
- **Full text of Gerdes' *Sona Geometry*.** Only accessible via secondary summaries and
  Google Books metadata [38][39]; the specific 2-linear→monolinear transform rules are cited
  via Demaine et al. [40] and Chavey [37] rather than read first-hand.
- **Licences for the Connected-Fermat-Spiral implementations.** Neither the project page nor
  the two GitHub repos surfaced a stated licence on the pages checked.
- **A published toroidal/seamless variant of TSP art.** Nothing found; the toroidal-tour
  idea in the table is an extrapolation, flagged as unverified.

---

## 4. Shortlist (opinion — this section is my judgement, not sourced fact)

Ranked by: continuity guarantee first, seamless potential second, implementation difficulty
third, visual distinctiveness fourth.

**1. Mirror curves / lusona.** This is the best fit in the entire survey and it isn't close.
It is the only candidate with *both* a proved closed-form guarantee (exactly gcd(p,q)
components, so coprime dimensions give one closed curve) *and* a constructive repair
operation (place a mirror at a crossing between two different components and they merge — so
you can start from any aesthetic mirror layout, colour the components, and greedily merge
down to one in a bounded number of steps). It is a plain grid walk, cheaper to implement
than the app's existing Penrose approximant, and it is natively rectangular so seamlessness
is a matter of choosing the repeat. Visually it is a woven single ribbon unlike any of the
14. Start from Jablan's arXiv:1106.3784 §2 for the RG[p,q] traversal and the gcd theorem,
then Chavey (Bridges 2009) for the merge/split rule that makes the repair loop work.

**2. Unicursal maze via spanning-tree bisection, on a toroidal grid.** Guaranteed single path
at arbitrary size with arbitrary seed variation, which is the property the app most lacks —
every existing guaranteed-continuous generator (Hilbert) is deterministic. The toroidal grid
makes it seamless with no cleverness: index mod width/height and run any standard algorithm
unchanged. Implementation is a spanning tree plus a contour trace. Ranked below mirror curves
only because the "bisect every passage" step needs care at the wrapped boundary and I found
no source that has done the toroidal-unicursal combination explicitly. Start from Pullen's
Think Labyrinth algorithm page for the exact bisection recipe, and Jamis Buck's toroidal-grid
post for the wrapping. Bonus: the same generator, rendered as *walls* instead of the path,
gives a second visually distinct pattern with its own connectivity guarantee via tree/cotree
duality.

**3. Celtic knotwork.** Theorem 8 in Connor & Ward gives an exact, checkable component count
(gcd of the half-dimensions), independently corroborated by Fisher & Mellor, so you can
*guarantee* one loop by construction rather than by post-hoc checking. It is natively
periodic on a rectangular grid — a perfect match for the app's tile model — and it is the
most visually distinctive candidate found, since nothing in the current 14 is an interlace.
The barrier system also gives a rich parameter space (barrier density and placement) with the
gcd rule as a safety floor. Ranked third only because barriers perturb the component count in
ways the sources don't fully characterise, so you'd want a runtime component count. Start from
Connor & Ward §6.2 (the tile-placement rules and Theorem 8), with `dmackinnon1/celtic` as a
readable JS reference.

**4. Ammann–Beenker with square (Pell) approximants.** The lowest-risk win, because the app
has already built exactly this machinery once. Jagannathan & Duneau give the recipe in one
sentence — tilt the irrational projection plane to a rational orientation, with the rational
orientations given by Pell-number ratios instead of the silver mean — which is the direct
8-fold analogue of the Fibonacci-ratio strained window the app used for Penrose. Continuity is
the weaker "connected because a tiling's edge skeleton is a connected graph" kind, not
unicursal, but that is exactly the same guarantee the existing Penrose approximant has, so it
is no regression. Visually it is a sibling of Penrose rather than something new, which is why
it sits at 4 rather than 2. Start from arXiv:2308.07701 §2–3.

**5. Islamic star strapwork via Hankin's polygons-in-contact.** The strongest *seamlessness*
story of anything here: natively periodic, defined by two translation vectors, with a single
intuitive parameter (contact angle) that sweeps a whole family of designs from one tiling.
Continuity is "multi-strand but connected" — Grünbaum & Shephard establish fewer than 4
distinct strands for typical periodic compositions, and since strapwork strands cross rather
than nest, the union is one connected piece of material even though it isn't one stroke. That
is good enough for cutouts. Cost is the main drag: you need an underlying tiling library and
the irregular-tile inference algorithm. Start from Kaplan's Graphics Interface 2005 paper (the
ray-emission construction and the inference algorithm), with Taprats (GPL) as the reference
implementation.

**6. Connected Fermat spirals.** The highest visual payoff and a genuinely guaranteed single
continuous curve over an arbitrary region — the exact problem statement of the brief, solved
in a SIGGRAPH paper. Two things push it down the list: it is the hardest to implement (region
decomposition, offset isocontours, spiral rewiring, graph traversal over sub-regions), and it
has no periodic form, so it is medallion-only unless you do extra seam work. Worth doing
eventually because the look — long, low-curvature whorls — is unlike every existing generator.
Start from Zhao et al. 2016 §4–5 and read `ejbosia/connected-fermat-spirals` alongside it.

**7. Gosper / flowsnake, plus the arrowhead and terdragon as a small "single-stroke fractal
curves" bundle.** Cheap: the app already has L-system machinery for Hilbert and Koch, so each
of these is a rules table plus a turtle. All three are proved single self-avoiding paths. The
catch is that their natural repeats are hexagonal or triangular (the Gosper island tiles a
triangular lattice; three terdragons make the fudgeflake), which fights the app's rectangular
tile — so ship them as medallions first and treat rectangular seamlessness as a stretch goal.
The Sierpiński arrowhead deserves special mention as a near-free *fix* for the existing
Sierpinski gasket generator: same silhouette, drawn as one line. Start from MathWorld's
arrowhead L-system and the Gosper curve Wikipedia/MathWorld pair.

**8. Greek key / meander frieze.** Included as the cheapest possible win. Unicursal by
construction, periodic by construction, implementable in an afternoon as a turtle over a fixed
move sequence, and it fills a real gap — the app has no rectilinear decorative band. It ranks
last only because it is a simple ornament rather than a rich generative family; the parameter
space is basically depth, pitch and corner style. No paper needed.

**Two non-pattern recommendations that I think outrank items 6–8 in practical value**
(flagged separately because the brief asked for pattern families, not infrastructure):
(a) a generic **auto-bridging post-pass** — component-label the rib set, connect orphans to
their nearest neighbour with a rib-width bar — which is the laser/stencil community's standard
fix and would retroactively make the existing Apollonian, Julia/Mandelbrot, Voronoi and
quarter-circle Truchet generators cutout-safe; and (b) **single-line tracing of the existing
Apollonian gasket** following Feijs & Toeters (Bridges 2022), who solved precisely that
generator and laser-engraved the result. The Julia/Mandelbrot generator is almost certainly
emitting disjoint marching-squares contours today and is the app's most likely current island
hazard.

---

## 5. Sources

All accessed 2026-09-03.

1. Moore curve — Wikipedia. https://en.wikipedia.org/wiki/Moore_curve
2. Sierpiński's space-filling curve — MacTutor. https://mathshistory.st-andrews.ac.uk/Extras/Sierpinski_curve/
3. `SierpinskiCurve` — Wolfram Language Documentation. https://reference.wolfram.com/language/ref/SierpinskiCurve.html
4. Peano curve — Encyclopedia of Mathematics. https://encyclopediaofmath.org/wiki/Peano_curve
5. Haverkort, "Sixteen space-filling curves and traversals for d-dimensional cubes and simplices", arXiv:1711.04473. https://arxiv.org/pdf/1711.04473
6. Peano curve substitution tiling — Tilings Encyclopedia. https://tilings.math.uni-bielefeld.de/substitution/peano-curve/
7. Gosper curve — Wikipedia. https://en.wikipedia.org/wiki/Gosper_curve
8. Gosper Island — Wolfram MathWorld. https://mathworld.wolfram.com/GosperIsland.html
9. "Flowsnake Earth" — Bridges 2017. https://archive.bridgesmathart.org/2017/bridges2017-237.pdf
10. "Math ⇔ Art: the Gosper curve" — The Aperiodical / HLF, 2017. https://aperiodical.com/2017/09/hlf-blogs-math-art-the-gosper-curve/
11. Sierpiński Arrowhead Curve — Wolfram MathWorld. https://mathworld.wolfram.com/SierpinskiArrowheadCurve.html
12. Dragon curve — Wikipedia. https://en.wikipedia.org/wiki/Dragon_curve
13. "Self-avoiding and plane-filling properties for terdragons and other triangular folding curves", arXiv:1712.09545. https://arxiv.org/pdf/1712.09545
14. Zhao et al., "Connected Fermat Spirals for Layered Fabrication", ACM TOG 35(4), SIGGRAPH 2016. https://dl.acm.org/doi/10.1145/2897824.2925958
15. Project page for [14]. https://haisenzhao.github.io/CFS/index.html
16. Held & Spielberger, "A smooth spiral tool path for high speed machining of 2D pockets", Computer-Aided Design 41(7), 2009, 539–550. https://www.sciencedirect.com/science/article/abs/pii/S0010448509001031
17. Infill patterns — Prusa Knowledge Base. https://help.prusa3d.com/article/infill-patterns_177130
18. PrusaSlicer issue #8740 — Archimedean Chords top fill discontinuity. https://github.com/prusa3d/PrusaSlicer/issues/8740
19. PrusaSlicer issue #15369 — "New infill options designed for no perimeters" (concentric loops unconnected). https://github.com/prusa3d/PrusaSlicer/issues/15369
20. Cura SettingsGuide, `connect_infill_polygons`. https://github.com/Ghostkeeper/SettingsGuide/blob/master/resources/articles/infill/connect_infill_polygons.md
21. Cura SettingsGuide, `zig_zaggify_infill` (Connect Infill Lines). https://github.com/Ghostkeeper/SettingsGuide/blob/master/resources/articles/infill/zig_zaggify_infill.md
22. Choset & Pignon, "Coverage Path Planning: The Boustrophedon Cellular Decomposition". https://link.springer.com/chapter/10.1007/978-1-4471-1273-0_32
23. Cura SettingsGuide, `infill_pattern` (Cross / Cross 3D). https://github.com/Ghostkeeper/SettingsGuide/blob/master/resources/articles/infill/infill_pattern.md
24. "Orca Slicer's Spiral Vase (Vase Mode): A Deep Dive" — Obico. https://www.obico.io/blog/orca-slicers-spiral-vase-vase-mode-a-deep-dive/
25. Classical labyrinths — Labyrinth Locator. https://labyrinthlocator.org/labyrinth-typology/classical-labyrinths/
26. Labyrinth layout / seed pattern — Labyrinthos. https://www.labyrinthos.net/layout.html
27. Walter D. Pullen, "Think Labyrinth: Maze Algorithms". https://www.astrolog.org/labyrnth/algrithm.htm
28. Tree–cotree decomposition on surfaces (Biggs 1971; Rosenstiehl & Read 1978), as summarised in Eppstein, "Dynamic Generators of Topologically Embedded Graphs". https://www.cs.jhu.edu/~misha/ReadingSeminar/Papers/Eppstein03.pdf
29. Jamis Buck, "Representing a Toroidal Grid". https://weblog.jamisbuck.org/2015/11/21/representing-toroidal-grid.html
30. Chelladurai, Madeya & Diaz, "L-System on a Toroidal Topology: Crafting Refined Closed-Loop Mazes", ICVARS 2024 (abstract only; DL returned 403). https://dl.acm.org/doi/abs/10.1145/3657547.3657552
31. Connor & Ward, *Celtic Knot Theory*, University of Edinburgh, 12 March 2012 (Theorem 8, gcd component count). https://webhomes.maths.ed.ac.uk/~v1ranick/knots/celtic.pdf
32. Fisher & Mellor, "On the Topology of Celtic Knot Designs". https://blakemellor.lmu.build/research/CelticKnots.pdf
33. Kaplan, "Islamic Star Patterns from Polygons in Contact", Graphics Interface 2005. https://cs.uwaterloo.ca/~csk/publications/Papers/kaplan_2005.pdf
34. Kaplan & Salesin, "Islamic Star Patterns in Absolute Geometry", ACM TOG 23(2), 2004. https://grail.cs.washington.edu/wp-content/uploads/2015/08/kaplan-2004-isp.pdf
35. Cline, "Interlace Patterns Emerging in a Penrose-Type Islamic Design", Bridges 2024 (summarising Grünbaum & Shephard, *Leonardo* 25, 1992, pp. 331–339, and Ostromoukhov). https://archive.bridgesmathart.org/2024/bridges2024-163.pdf
36. Jablan et al., "Mirror-Curves and Knot Mosaics", arXiv:1106.3784 (2011). https://arxiv.org/pdf/1106.3784
37. Chavey, "Mathematical Experiments with African Sona Designs", Bridges 2009. https://archive.bridgesmathart.org/2009/bridges2009-305.pdf
38. Gerdes, "African Sona, Mirror Curves and Lunda-Designs" (Semantic Scholar record). https://www.semanticscholar.org/paper/African-Sona,-Mirror-Curves-and-Lunda-Designs-Gerdes-Sona/bbc6f32420c524fc433b30753069cac65ce6674d
39. Gerdes, *Sona Geometry: Reflections on the Tradition of Sand Drawings in Africa South of the Equator*. https://books.google.com/books/about/Sona_geometry.html?id=9tsjAQAAIAAJ
40. Demaine, Demaine, Taslakian & Toussaint, "Sand drawings and Gaussian graphs", Journal of Mathematics and the Arts, 2007 (Bridges 2006 preliminary version). https://erikdemaine.org/papers/Sona_JMA/paper.pdf
41. "An algorithm for one-stroke kolam generation using a gating structure", npj Heritage Science. https://www.nature.com/articles/s40494-026-02310-3
42. "Kolam Simulation using Angles at Lattice Points", arXiv:2307.02144. https://arxiv.org/pdf/2307.02144
43. Rose (mathematics) — Wikipedia. https://en.wikipedia.org/wiki/Rose_(mathematics)
44. Rose Curve — Wolfram MathWorld. https://mathworld.wolfram.com/RoseCurve.html
45. "Recurrence in Lissajous Curves and the Visual Representation of Tuning Systems", Foundations of Science, 2023. https://link.springer.com/article/10.1007/s10699-023-09930-z
46. Jagannathan & Duneau, "Properties of the Ammann-Beenker tiling and its square approximants", arXiv:2308.07701 (15 Aug 2023, rev. 27 Feb 2024). https://arxiv.org/html/2308.07701v2
47. Published version, Israel Journal of Chemistry, 2024. https://onlinelibrary.wiley.com/doi/10.1002/ijch.202300119
48. Ammann Bars — Tilings Encyclopedia. https://tilings.math.uni-bielefeld.de/glossary/ammann-bars/
49. Socolar & Taylor, "An aperiodic hexagonal tile", arXiv:1003.4279. https://arxiv.org/pdf/1003.4279
50. Socolar & Taylor, "Forcing nonperiodicity with a single tile", arXiv:1009.1419. https://arxiv.org/pdf/1009.1419
51. Smith, Myers, Kaplan & Goodman-Strauss, "An aperiodic monotile", arXiv:2303.10798 / Combinatorial Theory 4(1), 2024. https://arxiv.org/pdf/2303.10798
52. "Dynamics and topology of the Hat family of tilings", arXiv:2305.05639. https://arxiv.org/html/2305.05639v4
53. "Best Fonts for Laser Cutting Text (and Why Letters Fall Apart)" — StencilCut. https://stencilcut.com/guides/best-fonts-for-laser-cutting-text
54. "How to Bridge a Stencil" — Bay Stencil. https://blog.baystencil.com/how-to-bridge-a-stencil/
55. Truchet tiles (Smith 1987 quarter-circle variant; percolation connectivity) — Wikipedia. https://en.wikipedia.org/wiki/Truchet_tiles
56. Meander (art) — Wikipedia. https://en.wikipedia.org/wiki/Meander_(art)
57. "Pen Plotter Art & Algorithms, Part 1" — Matt DesLauriers. https://mattdesl.svbtle.com/pen-plotter-1
58. Bosch & Herman, "Continuous line drawings via the traveling salesman problem", Operations Research Letters 32(4), 2004, 302–303. https://www.researchgate.net/publication/220060322
59. Kaplan & Bosch, "TSP Art", Bridges 2005. https://archive.bridgesmathart.org/2005/bridges2005-301.pdf
60. Velho & Gomes, "Digital Halftoning with Space Filling Curves", SIGGRAPH '91. https://lhf.impa.br/cursos/rr/Velho-Gomes-1991.pdf
61. Marching squares (multiple contour components) — Baeldung. https://www.baeldung.com/cs/marching-squares
62. Belk, "Julia Sets and the Mandelbrot Set" (connectivity dichotomy), Cornell. https://e.math.cornell.edu/people/belk/dynamicalsystems/NotesJuliaMandelbrot.pdf
63. Feijs & Toeters, "Single Line Apollonian Gaskets for Fashion", Bridges 2022. http://www.m.archive.bridgesmathart.org/2022/bridges2022-119.pdf
64. Feijs, "Single line Apollonian gaskets: is the limit a space filling fractal curve?", arXiv:2204.05729 (2022). https://arxiv.org/pdf/2204.05729
65. Taprats (Kaplan), GPL — SourceForge. https://sourceforge.net/projects/taprats/
66. Knotter — Celtic/Islamic interlace designer. https://github.com/mbasaglia/Knotter
67. `dmackinnon1/celtic` — JS Celtic knot generator. https://github.com/dmackinnon1/celtic
68. `BorisTheBrave/celtic-knot` (MIT). https://github.com/BorisTheBrave/celtic-knot
69. `beloitcollegecomputerscience/Sona-Drawing`. https://github.com/beloitcollegecomputerscience/Sona-Drawing
70. `ejbosia/connected-fermat-spirals`. https://github.com/ejbosia/connected-fermat-spirals
71. `john-science/mazelib` (MIT). https://github.com/john-science/mazelib
72. `kalyaninagaraj/TSP-Art`. https://github.com/kalyaninagaraj/TSP-Art
73. `CodingTrain/StarPatterns` (from Kaplan's project page). https://github.com/CodingTrain/StarPatterns
74. Ammann-Beenker — Tilings Encyclopedia. https://tilings.math.uni-bielefeld.de/substitution/ammann-beenker/
75. Tatham, "Combinatorial coordinates for the aperiodic Spectre tiling". https://www.chiark.greenend.org.uk/~sgtatham/quasiblog/aperiodic-spectre/
