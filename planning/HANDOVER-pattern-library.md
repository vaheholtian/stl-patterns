# Handover — importing the pattern.monster library

Written 2026-09-15 for a fresh session, at commit `c46c75e` plus the uncommitted working tree.
Everything stated as a number below was measured in this repo; where a call is a judgement it
says so. **No accept/reject list has been agreed with the user yet** — the tiers in
`final.json` are a proposal, and the thresholds that produce them are the first thing to
re-litigate, not to build on.

Working directory for everything here: `planning/pattern-library-2026-09-15/`.

## What the user wants

Add the patterns from <https://github.com/catchspider2002/svelte-svg-patterns> (the data behind
pattern.monster, MIT) to this app **as customizable patterns**, not as one-off imported SVGs.
Before that, they asked which ones are bad for this app's purpose — single-colour cut, recess or
emboss on a 3D-printed part — and that audit is what most of this document covers.

Attribution is required by the MIT licence (`LICENSE.md` in that repo, © pattern.monster). Ship
the notice with the data.

## The source data

One file, `src/routes/_index.js`, is a 330-entry JSON array. A copy is checked in here as
`patterns.json` so nothing needs cloning. Each entry:

| field | meaning |
|---|---|
| `path` | one or more `<path .../>` strings joined by `~` — **one per colour layer** |
| `mode` | `fill` (223), `stroke` (59), `stroke-join` (48 — square caps) |
| `width`, `height` | the repeat box, in the artwork's own units |
| `vHeight` | >0 on 8 tiles: dropping a colour layer also shrinks the box by this much |
| `maxStroke`, `maxScale`, `maxSpacing` | slider limits on the website |
| `tags`, `title`, `slug` | metadata |

Path data uses only `M`, `C`, `c`, `s`. 140 tiles are single-layer, 190 have 2–5 layers.
The website renders them inside an SVG `<pattern>` element at `stroke-width: 1`, scale 2,
spacing 0 — so its own preview **clips everything outside the repeat box**.

## What was measured, and how

`render.mjs` (sharp/librsvg) renders every colour layer twice — one copy alone, and a 3×3
repeat — at 3–15 px/unit, 2,079 images into `r/`. `analyze.py` (numpy/scipy) measures them and
writes `analysis.json`. `classify.py` applies thresholds and writes `final.json`.

```
cd planning/pattern-library-2026-09-15
node render.mjs          # -> r/*.png   (76 MB, gitignored, ~1 min)
python analyze.py        # -> analysis.json (~1.5 min)
python classify.py       # -> final.json
node thumbs.mjs          # -> thumbs/*.png, one-colour and colour swatches
python sheets.py         # -> sheets/p00..p10.png, labelled contact sheets
```

The measurements, per tile:

- **Edge loss** — `1 − edges(union of layers) / Σ edges(each layer)` inside the cell. How much of
  the drawing disappears when the colour layers merge into one colour.
- **Hidden** — the largest share of one layer that sits inside the layers drawn under it.
- **Connectivity** — 4-connected components of the material phase and of the hole phase over the
  3×3 repeat. A phase counts as connected only if one component spans the whole 3×3 image and
  holds ≥97% of that phase inside the centre cell.
- **Minimum feature** — largest morphological opening radius that costs a phase ≤5% of its area,
  bisected, converted to *the tile width in mm at which the thinnest feature reaches 0.84 mm*
  (2 × 0.42 mm line width, the app's floor). For `fill` tiles both phases count. For stroke tiles
  only the gaps count, because the rib is a millimetre setting in this app, not part of the
  artwork.
- **Fill fraction**, **fill-rule sensitivity** (nonzero vs even-odd), and **near-duplicates**
  (`dups.py`, 48×48 signatures over all cyclic shifts).

## Results

284 of 330 are usable in some mode. The proposed tiers:

| tier | count | meaning |
|---|---|---|
| `good` | 148 | no flag at all |
| `limited` | 136 | usable, with a constraint the UI should surface |
| `drop` | 46 | not worth importing |

Flags (a tile can carry several):

| flag | count | rule | consequence |
|---|---|---|---|
| `nocut` | 112 | neither phase connected across the repeat | falls apart as a through-cut on a closed region; fine for recess/emboss, and fine cut on a bounded patch |
| `nocutThin` | 2 | same, but connects at a thick rib | `triangles-5`, `diamonds-15` — verified in `thick.py` |
| `fine` | 38 | needs a repeat wider than 50 mm | worst: `stripes-1` 190 mm, `interlocked-hexagons-3` 169 mm, `waves-10` 165 mm |
| `fine?` | 26 | needs 35–50 mm | flag only |
| `recolour` | 28 | edge loss ≥0.25 or hidden ≥0.5 | looks different from the website, usually still reads |
| `lost` | 8 | judgement: design genuinely gone in one colour | `concentric-circles-6`, `circles-11`, `diamonds-6`, `stripes-2`, `japanese-pattern-7`, `egyptian-2`, `egyptian-6`, `waves-14` |
| `solid` | 4 | fill fraction >0.85 | nothing useful left |

A browsable gallery of all 330 — one-colour swatch, flags and min tile size per card — is
published at <https://claude.ai/artifact/5x4geKGMgtWaY79ucb71zo> (`gallery.html` here is the
same page; it embeds `final.json`).

### Where the judgement is, and where it already went wrong once

The four thresholds in `classify.py` (50 mm, 35 mm, 0.25 edge loss, 0.5 hidden) are arbitrary
and are the user's to set. Two lessons from the first pass:

1. **Edge loss was first used as a reject rule, and that was wrong.** It measures "differs from
   the website preview", not "unusable". `leaves-9` loses 59% of its edges yet reads perfectly as
   leaves in one colour, because the author left hairline gaps between them — it just needs a
   ≥30 mm repeat for those gaps to print. The rule was demoted to a warning and only 8 tiles,
   picked by eye off `sheets/collapse.png`, are still rejected for it. That hand-picked list is
   the least defensible part of the set; re-check it before relying on it.
2. **Rib width does not rescue a fragmented pattern.** `thick.py` re-ran the connectivity test at
   half of each tile's `maxStroke`: of 29 stroke tiles flagged `nocut`, exactly 2 change. Stripes
   stay stripes at any width.

### What is *not* known

- **Seams were never proven by measurement.** Two attempts failed: comparing a clipped copy
  against a periodic union (`seams.py`) mostly detects geometry drawn outside the box, and
  comparing wrap-around edge columns (`seam2.py`, deleted) fires on every checkerboard whose
  colour boundary sits on the tile edge. The current claim — no visible seam defects at default
  settings — rests on a visual pass over all 330 one-colour swatches plus the close-ups in
  `sheets/seams.png`. Treat it as unverified.
- **19 tiles carry geometry outside the repeat box that is not a periodic duplicate** (listed by
  `seamOverflow` in `final.json`; `scales-1..4`, `eyes-1..3`, `chinese-6/7`, `tribal-1/2`…). The
  website clips it away. Any importer must clip to the box; never union the raw paths
  periodically.
- **5 tiles render differently under even-odd vs nonzero** (`plus-5` 0.22, `new-5` 0.13,
  `memphis-2` 0.15, `snowflakes-1`, `plaid-pattern-3`). `svgImport.ts` uses even-odd. Union them
  as nonzero when porting.
- Nothing was measured at non-default spacing or rotation, and "still reads well in one colour"
  is a human call throughout.
- Near-duplicates are rare: `triangles-14`≈`chevron-5`, `octagons-1`≈`octagons-2`,
  `cross-section`≈`plus-1`, `stars-3`≈`stars-4`.

## The end-to-end test that was actually run

`Waves - 1` (four wavy strokes, 120×80) was cut through `fixtures/box-50.stl` using the app's own
pipeline, as an imported SVG tile scaled to a 50 mm repeat with a 1.2 mm rib, on the ring of four
walls, margin 3, wall 1.6, mode `cut`:

```
node --import ./tests/register.mjs planning/pattern-library-2026-09-15/waves-cut.ts
python planning/pattern-library-2026-09-15/render-waves.py   # -> sheets/waves-cut-views.png
```

Both orientations closed the ring cleanly: *"4 repeats around the seam, tile stretched 0.0%"*,
*"the pattern meets itself round the ring: its closing edge is continuous"*.

| rotation | result |
|---|---|
| 0° (waves around the box) | wall cut into six horizontal bands; `decompose()` says **1 solid** |
| 90° (waves up the box) | vertical slits, material continuous through the rims: genuinely one solid |

The rotation-0 box is **not** actually one piece. Removing 4 mm off each vertical edge leaves it
connected (`waves-corner.ts`), and the 2D layout shows why (`waves-2d.ts`): each rib stops at
x = 0.000000 and the next copy starts at x = 0.008071. The bands hang together on ribbons of
uncut material **0.008–0.014 mm wide**, which no 0.4 mm nozzle will produce. This is the concrete
evidence behind the `nocut` flag, and behind bug 3 below.

## Three app bugs this turned up

1. **Unanchored simplify shaves the repeat box** — `src/patterns/pipeline.ts:249` runs
   `cs.simplify(0.01)` before the periodic block. `simplifyAnchored` at line 271 exists precisely
   to pin box-boundary vertices, but by then the points have moved inward and are interior. That
   0.01 tolerance is exactly the 0.008 mm sliver measured above. The earlier simplify is there to
   shrink the 3×3 neighbourhood for the seam stitching, so gating it on `opts.periodic` (or
   routing it through `simplifyAnchored`) should be safe. Affects any tile whose features touch
   the box edge while `periodic` is off.
2. **An imported SVG cannot declare itself seamless** — `src/patterns/definition.ts:46` hardcodes
   `inherentlySeamless = false` for `generatorId === 'svg'`, so Seamless on forces kaleidoscope
   mirroring and the only way to keep the artwork intact is Seamless off, which also switches off
   the periodic cleanup that would have welded those ribs. Every pattern.monster tile is
   genuinely periodic, so a batch import hits this on all of them. Suggested fix: detect it —
   translate the pre-clip CrossSection by the tile width and compare inside a collar along the
   seam; near-zero symmetric difference means periodic in x. Keep mirror as a manual override,
   since a hand-drawn SVG that does *not* line up is exactly the case the current behaviour was
   written for. **Porting as generators sidesteps this**, because a generator declares
   `seamless()` itself.
3. **The island check cannot see how thin a connection is** — `decompose()` counted the 0.01 mm
   ribbons as connections, so a part that separates on the plate passed. Everything downstream
   (the removed-island count, the printability warning) inherits the blind spot. Erode by half the
   minimum feature before decomposing, or run the check in 2D on the layout polygons with an
   opening.

Plus one robustness gap, reproduced in `zero-tile.ts`: `generateTile` with an unknown generator
id returns `{tile: null, polygons: [], warnings: []}` silently, and `layoutTile` with
`tileWidth/Height = 0` never terminates. A typo cost this session 10 minutes at 100% CPU; in the
app it would hang the geom worker, which per `planning/pattern-stress-2026-09-14/REPORT.md`
finding 1 never restarts.

## Proposed port: one generator, pattern as a parameter

Not the `svg` route: no parameters, no `seamless()`, and 330 hand-imports. Not 330 generators
either — `src/app/PatternScreen.tsx:383` renders `generators` into a `<select>` that has 29
entries today.

```ts
export const libraryGenerator: Generator = {
  id: 'library', name: 'Pattern library', seamless: () => true,
  params: [
    { key: 'pattern',  type: 'select', options: /* the accepted slugs */ },
    { key: 'width',    type: 'number' },   // height follows the artwork's aspect ratio
    { key: 'ribWidth', type: 'number' },   // stroke sources only
    { key: 'spacingX' }, { key: 'spacingY' },  // the website's h/v spacing: grow the box, centre the art
    { key: 'layers',   type: 'int' },      // how many colour layers to draw
  ],
  generate(p) { /* flatten stored path data into a Tile */ },
}
```

Why this shape:

- `seamless: () => true` — they are all periodic, so bug 2 never applies to this library and the
  periodic stitching runs, which also keeps bug 1 off this path.
- **`layers` is the interesting knob** and is specific to this source: dropping a layer is the
  direct fix for the 28 `recolour` tiles, because the layer that vanished was only distinguishable
  by colour. On the 8 tiles with `vHeight > 0` fewer layers also shrinks the repeat box, as on the
  website.
- Rib width becomes real millimetres on `curves`, instead of the website's fixed stroke.
- Recipes stay stable: `{generatorId: 'library', params: {pattern: 'scales-6', …}}`.

Work items:

1. **Build script**: read `_index.js`, drop the rejects, emit `src/patterns/library/data.json`
   (~750 kB of path strings; lazy `import()` so it is its own chunk) plus the MIT notice. Carry
   `minTileMm`, `nocut` and `recolour` into the data and emit them as tile `notes`, which the app
   already surfaces — then picking `leaves-9` at a 20 mm repeat warns automatically.
2. **A DOM-free path flattener** (`src/patterns/svg/pathFlatten.ts`). This is the only real work.
   `svgImport.ts` uses `getScreenCTM`/`getPointAtLength`, so it needs a document and cannot run
   inside `preview.worker`/`geom.worker` where generators run. ~60 lines for `M/L/C/S` and their
   relative forms (all this library uses) — `waves-tile.ts` here has a working one; covering
   `Q/T/A/H/V/Z` too would later let `svgImport` shed its DOM dependency and become testable in
   node.
3. **The generator**, plus a seam test over the whole library alongside `tests/seamless.test.ts`.
4. **Picker UI** — the real cost. A 284-option `<select>` works but nobody browses that way; this
   wants a searchable thumbnail grid. `gallery.html` here is a working prototype of exactly that.

## Open decisions for the user

1. The four thresholds, and whether `drop` should reject anything at all beyond the 4 `solid`
   tiles — a warning-only library is a legitimate alternative, since `nocut` and `fine` are both
   context-dependent (bounded patch vs closed ring; tile size is a slider).
2. Whether the 8 hand-picked `lost` tiles stay rejected.
3. Whether to ship all 330 with warnings, or only the accepted set.
4. Whether bugs 1 and 3 get fixed before the import (3 is independent of this work and arguably
   the most valuable single fix in the list).

## File inventory

| file | what |
|---|---|
| `patterns.json` | the 330 source entries, extracted from `_index.js` |
| `render.mjs`, `analyze.py`, `classify.py` | the measurement pipeline |
| `analysis.json`, `meta.json`, `final.json` | raw measurements, render metadata, tiered result |
| `thumbs.mjs`, `sheets.py`, `seams.py`, `thick.py`, `dups.py` | swatches, contact sheets, the rib-width and duplicate checks |
| `gallery.html` | the published gallery, `final.json` embedded |
| `sheets/p00.png` | one labelled contact sheet (p01–p10 regenerate with `sheets.py`) |
| `sheets/bad.png`, `sheets/collapse.png`, `sheets/seams.png` | the rejected set, the colour-collapse review, the overflow close-ups |
| `sheets/waves-cut-views.png` | the two cut results on the 50 mm box |
| `waves-cut.ts`, `waves-tile.ts`, `waves-2d.ts`, `waves-corner.ts`, `render-waves.py` | the end-to-end cut test and its analysis |
| `zero-tile.ts` | repro for the null-tile hang |

`r/`, `thumbs/` and `out/` are generated and gitignored.
