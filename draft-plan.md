# Unified pattern browser

## Summary

Replace the generator dropdown and the separate library picker with one
visual browser holding every built-in option plus saved designs. Organize
it by what a pattern looks like, not by how it is built. Layout, seams, and
cut survival become filters and badges rather than folders.

Flow: "Choose pattern" opens a large dialog; picking a card returns to the
existing preview and controls. On phones the dialog fills the screen.
Browsing or closing without choosing leaves the active tile unchanged.

## Catalog: the data layer under the browser

The browser reads a catalog, not the generator list directly. Each catalog
entry has a stable ID, title, primary category, shape tags, search aliases,
layout kind, default tile definition, thumbnail reference, and reference
cut advice. Existing generator IDs, library slugs, and saved-file formats
are preserved; the catalog maps onto them.

- **Cards with variants.** Where several registered generators are one
  look with a switch, the catalog presents one card and a variant picker:
  the five perforation shapes, the three single-stroke fractals, Penrose
  medallion + Penrose tiling, and moiré's radial mode. Each variant still
  resolves to its existing generator ID and default parameters, so nothing
  in the pipeline or saved files changes. The 29 natives collapse to about
  18 cards; the 330 library designs stay one card each.

- **Category lives on the entry.** A `family` field on each catalog entry,
  not a lookup table keyed by ID. The lookup-table approach is what let the
  current list drift.

- **Names lose their suffixes.** "Penrose tiling (seamless)" becomes
  "Penrose tiling" with a seamless badge; "Ammann–Beenker (Pell repeat)"
  becomes "Ammann–Beenker". The qualifiers move into badges and detail text.

- **Open item.** `celtic.ts` (Celtic plait) exists but is not registered in
  the generator list. Decide whether to register it before the catalog
  count is fixed in tests.

## Categories

Eight primary appearance categories:

| Category | What belongs there |
|---|---|
| Grids & holes | Honeycomb, perforations, squares, diamonds, slots |
| Lines & waves | Stripes, waves, moiré, flowing curves |
| Weaves & knots | Cane weave, Celtic plait, Islamic strapwork, mirror curves, Greek key, Truchet |
| Tiles & geometry | Penrose, Ammann–Beenker, hyperbolic, stars, triangles, geometric repeats |
| Organic & cellular | Voronoi, Delaunay, irregular cells, scales |
| Nature & decorative | Leaves, floral, animals, textile (plaid, herringbone, batik), cultural, holiday |
| Mazes & fractals | Periodic maze, Hilbert, Gosper, arrowhead, terdragon, Sierpinski, Koch, Julia, Fermat spirals |
| Rosettes & medallions | Guilloche, phyllotaxis, Apollonian, radial moiré, centred motifs |

- **Tiles & geometry gets shape chips** as a second axis: triangles,
  squares/rectangles, diamonds, circles, hexagons, stars, mixed/other.
  Without this it swallows over a hundred library designs and is no more
  browsable than today's dropdown.

- **Nature & decorative gets sub-buckets** the same way: floral, animals,
  textile, cultural, holiday, kids.

- **Library assignment is a two-pass job.** First pass: a mapping table
  from the source's raw tags to a category and shape chip (the top tags are
  triangles, lines, country, circles, curves, squares, waves, diamonds).
  Second pass: visual review of every design, fixing the mis-assigned ones
  in the catalog metadata. Raw tags, including seasonal and cultural terms,
  stay searchable but never appear as headings.

## Browser

- **Collections:** Start here (initial view), All patterns, Favorites,
  Recent, My designs. Remember browsing position and filters while the
  screen stays mounted.

- **Start here** is a fixed, reviewed list of 20 visually varied entries,
  weighted toward straightforward repeats with favourable reference cut
  measurements. Recorded in the catalog, not computed.

- **Search** covers titles, tags, and aliases. Aliases are a short list per
  entry: "hex" → honeycomb, "vent" → perforations, "knot" → Celtic plait and
  strapwork, "mesh" → Delaunay and grids. Only registered, implemented
  options are returned.

- **Filters:** layout (surface repeat, band, motif), seamless (the existing
  library toggle, extended to natives), and cut survival labelled "Holds
  together at reference settings".

- **Cards** show thumbnail, title, favourite toggle, variant count where
  relevant, and the cut badge.

- **Cut badge has three states:** Holds together, Creates loose pieces, and
  Not measured (grey). Missing or zero measurements are Not measured, never
  success. The app already flips Invert to the surviving orientation on
  selection, so an "invert to hold" state is not shown; the badge reports
  the orientation the card will open on.

- **In the editor,** the same badge stays visible next to the parameters
  and turns grey the moment any parameter departs from the reference
  defaults. Reference measurements never certify tuned settings or the
  current model. Detail text explains what was measured (a closed box,
  default parameters, through-cut).

## Thumbnails

- Deterministic SVG thumbnails for every built-in, generated ahead of time
  from the same default definition selection applies. Black feature, white
  material, one consistent 100 × 100 mm viewing window so scale reads across
  cards. Variant cards show the first variant; the variant picker shows the
  rest.

- Generated by a build script through the existing tile pipeline, the way
  the cut-render harness already renders every library design. Not hundreds
  of geometry jobs at dialog open.

- Saved designs and imported SVGs are thumbnailed on demand, sequentially,
  through a dedicated preview worker; cached in memory; cancelled when the
  dialog closes. A selectable placeholder stands in when generation fails.

## Selection

- Choosing a built-in applies its defaults, library slug where relevant,
  and the existing orientation and connection defaults. Choosing a variant
  applies that variant's generator and defaults.

- Choosing a saved design restores its full definition and custom name.

- The library's "Design" parameter select is removed; the unified chooser
  replaces it. SVG import, export/share, and all editing controls stay.

## Favorites and saved designs

- Favourite IDs and the 20 most recent selections live in a versioned
  localStorage record. Browsing and favouriting never change the active
  pattern. Stale IDs are ignored; a missing or malformed record is treated
  as empty and never touches saved designs.

- My designs reuses the existing saved-tile store (its limit, import, and
  export unchanged), including imported SVGs. The visible "Save tile" action
  is renamed "Save design". A saved design is a named generator plus
  parameters, so this is also the presets feature: "bowl side vents" sits in
  the browser next to the built-ins.

- Keyboard selection, labelled favourite controls, focus trapping, Escape
  to close, focus restored to the chooser button.

## Order of work

1. Catalog module: entry type, family field, variant cards, aliases, Start
   here list, tag-to-category mapping for the library. Tests for coverage.
2. Thumbnail build script and generated assets for every built-in.
3. Browser dialog with collections, categories, chips, search, filters,
   badges. Replaces the dropdown and the library picker.
4. Favourites, recents, My designs, on-demand saved-design thumbnails.
5. Editor badge greying, accessibility pass, mobile layout, visual review
   of every category.

## Verification

- Catalog coverage: every registered generator and library slug appears
  exactly once (as a card or a variant), every entry has a valid category,
  a resolvable definition, and a thumbnail; every Start here ID resolves.
- Search and filter combinations, aliases, favourites, recent ordering,
  storage failures, and import of existing saved-design files.
- Selection parity: native generators, variants, library designs, tuned
  saved tiles, and imported SVGs produce the same tile definition the old
  controls produced.
- Visual inspection of thumbnails across every category; desktop and
  mobile browsing; keyboard access; empty results; saved-design deletion;
  return to editing.
- Existing tests, lint, and `npm run build` (the only typecheck that
  checks anything here).

## Follow-ups, in order

1. **Live piece count in 2D.** Done 2026-09-22: `loosePieces.ts` is the
   ring count in vector form (cut shapes grown by one nozzle line, material
   components joined across the seams, counted on the same 4 x 4 ring). The
   editor shows it live for both orientations, tints loose material red,
   offers Swap orientation / Use as recess, and a Remove loose pieces switch
   cuts the loose material away (refused above half the material). Cards
   keep the reference badge; the tables were re-measured with this method.
2. **Printability check for the user's printer.** Bambu A1, 0.4 mm nozzle:
   flag any rib or wall thinner than two perimeters at the current tile
   scale, using the pattern's mm parameters. Catches what only the slicer
   shows today.
3. **Compare on model.** Pick two to four candidates and have the worker
   render each on the current model as a small preview. Expensive; last.
