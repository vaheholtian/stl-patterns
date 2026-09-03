# Night build report, 2026-09-02

Written by Claude during the overnight build. Read this first in the morning.

## Where to find things

- Live app: https://vaheholtian.github.io/stl-patterns/ (deploys automatically on every push to main)
- Repo: https://github.com/vaheholtian/stl-patterns (public)
- Local dev: `npm run dev` in `C:\Code\STL-patterns`, then open http://localhost:5173/stl-patterns/
  - Dev shortcuts: `?load=/stl-patterns/fixtures/pen-cup.3mf` auto-loads the cup; `?load=demo:sphere`, `demo:sphere-prism`, `demo:box` build test bodies in code.
- Test files: `fixtures/pen-cup.3mf` (your cup), `fixtures/two-cubes-onshape.3mf`
- Spike pages (dev only): `/stl-patterns/spikes/a.html?auto=1` (Voronoi on a sphere) and `/stl-patterns/spikes/b.html?auto=1` (tile on a hemisphere)

## What to check yourself (in order)

1. **Bambu Studio import.** `C:\Users\vaheh\Downloads\pen-cup-voronoi-cut.3mf` is your cup with a Voronoi through-cut on the outer wall (8 mm cells, 2 mm ribs, 3 mm solid band at the rim and bottom edges). Open it in Bambu Studio. It should arrive at the right size (about 97 mm across, 55 mm tall) with no repair warnings.
2. **Test 1 print.** If it slices cleanly, print it. No supports should be needed for holes this size on a vertical wall.
3. **Try the app on the cup**: load it, click the outer wall, press Apply Voronoi. About 1.5 s.
4. **Test 2 candidate.** `C:\Users\vaheh\Downloads\pen-cup-truchet-emboss.3mf` is the same cup with a Truchet tile (10 mm cells, 2 mm ribs) embossed 1 mm on the outer wall, 8 whole repeats around, 3 mm solid bands. To redo it yourself: Pattern screen, pick Truchet; Apply screen, click the outer wall, "1. Flatten region", "3. Apply tile" with mode Emboss.
5. **Something with a sphere**: `?load=demo:sphere-prism`, click the sphere, flatten, apply. Then click a box face and apply a different tile. That is the shape of Test 3 without needing your own model yet.

## Note on your cup file

The file measures 97.2 mm across and 55 mm tall with a 5 mm wall, not 50 mm across. Onshape exported in meters and the app scales correctly, so the number is what Onshape has. If you meant 50 mm, the model is twice the size you think.

## What was built (phases 0 to 5, all committed and pushed)

**Phase 0.** Repo, Vite + React + TypeScript, GitHub Pages deploy, geometry worker. Both spikes passed. The important finding: xatlas (the planned flattening library) chops even a plain hemisphere into 21 charts, so I replaced it with a hand-written least-squares conformal map. It flattens 2300 triangles in about 160 ms with no seams.

**Phase 1.** Apply screen: STL and 3MF loading (units-aware; your Onshape file is in meters), body list, region selection by clicking a face (flood fill stops at edges sharper than the slider, default 30°; Shift adds, Alt removes), watertight check, STL and 3MF export. 3MF export is a minimal core-spec file; Bambu's own file format was used as the reference.

**Phase 2.** Surface-native Voronoi: cell size, rib width, relaxation, seed, three modes (through-cut, recess, emboss), cells or ribs as the feature, a solid margin along region edges, island removal with a count, rib width clamped to two line widths. Cup outer wall, 303 cells: 1.5 s.

**Phase 3.** Pattern screen: generators with live 3×3 preview, invert switch, tile library in the browser plus JSON export/import, SVG import (black shapes become the feature, white shapes are subtracted; text and strokes must be outlined first), SVG export. Generators: Voronoi cells and Delaunay mesh (both seamless, with density gradients), Truchet, guilloche, Hilbert, phyllotaxis, moiré, Sierpinski, Koch, Penrose, hyperbolic tiling, Apollonian gasket, Julia/Mandelbrot (raster traced). The current tile is remembered across reloads.

**Phase 4.** Tile mapping: flatten the selected region (ring-shaped regions get a seam cut so the tile wraps with a whole number of repeats, closed surfaces get a small cap removed on the far side), place the origin by clicking, rotate and scale, solid edge margin, live outline preview on the surface, apply as cut, recess or emboss. On curved surfaces the tile shrinks away from the origin (that is Option 1 from the decision log); where it would shrink below a chosen percentage the surface is left solid, default 50%. Cup with Truchet: 8 repeats around, 1.1 s.

**Phase 5.** Tier 2 and 3 generators (above), recipes (save the region, tile and settings; reload them on a re-exported part), undo per body, cancel button.

## Known limitations and honest caveats

- **Drag handles** for rotation and scale are a slider and a number, not 3D gizmos. Origin placement is by clicking. Good enough to use, not the dragging feel you asked for. Worth doing properly later.
- **Region selection on a mesh that was already cut** can leak across cut walls when the angle threshold is loose. Select regions before cutting, or lower the angle slider.
- **Stretch warning colouring** on the model (per-triangle) is not drawn; the layout log reports the size range instead, and the solid-masking rule handles the printability side.
- **Very fine tiles** on big regions make big files. The "Detail" setting (default 2 mm) controls how finely the tool mesh follows the surface; raise it on gently curved parts.
- **Bambu Studio's auto-repair** was not tested tonight; the exporter relies on manifold's watertight guarantee.
- **Hilbert order 7** exceeds the point budget; keep it at 5 or 6.
- Nothing has been printed yet. Tests 1 to 3 are yours.

## Decisions I made without you

- Kept the spike pages in the repo as dev-only regression pages instead of deleting them.
- Default rib width floor is 2 × line width (0.84 mm at 0.42). Changeable in the Voronoi panel.
- The tile pipeline removes slivers thinner than 2 × line width from every tile before use.
- Recipes re-find a region by nearest triangle with a compatible normal, then flood-fill with the saved angle.

## Update 2026-09-03: seamless patterns

- New generator **Penrose tiling (seamless)**: periodic approximant with true rhombi. Set width and edge; height snaps to the nearest period and the info line under the preview reports the period, strain and vertex count. "Min order" 2 is the default; raise it for a closer-to-Penrose look with smaller rhombi.
- **Mirror (kaleidoscope, seamless)** checkbox on the Pattern screen makes any tile seamless by reflection, including Julia and the Penrose medallion.
- Hilbert now joins across horizontal repeats; moiré snaps to seamless angles and pitches (the notes say what it snapped to; untick Seamless to keep exact values); guilloche has a woven **Band** style that wraps.
- Apollonian, hyperbolic, phyllotaxis, Koch, Sierpinski and the guilloche rosette are marked seamless (grid of medallions), so the Auto layout repeats them around the cup instead of stretching one copy.
- **Seamless switch** (Pattern screen, on by default): holds every setting that would break seamless repetition. Moiré's "Snap to box" is locked on; patterns with no seamless form of their own (Julia, Penrose medallion, imported SVG) get Mirror forced on. Untick Seamless to get the raw pattern back. The generator picker now lists surface-filling patterns first and the centred medallions last.

## Update 2026-09-03: the Pattern screen as a phone app

- The site is now an **installable PWA**. On Android/Chrome an **Install** button appears in the top bar; on iPhone use Safari's share button then **Add to Home Screen**. It opens full screen with no browser bars and works **offline**: the app shell and the geometry WASM are precached, so patterns generate with no network.
- Updates are not silent. When a new version is deployed the top bar shows an **Update** button; tapping it swaps in the new version and reloads.
- On a phone the Pattern screen gets its own layout: the preview is pinned to the top and the controls live in a sheet you can **drag up** for more room (three snap positions, and tapping the handle cycles them). Numbers are **sliders with a tappable value** so the preview follows your finger; tap the number to type an exact one.
- The **Apply** screen is desktop-only: it needs the 3D viewport and a loaded 3MF. On a phone, save tiles and use **Send library** to hand the JSON to AirDrop, mail or a cloud drive, then **Import library** on the desktop.
- `?mobile=1` forces the phone layout on a desktop browser (and `?mobile=0` the desktop one), which is how to check it without a phone.
- Icons and the favicon are generated from the app's own Penrose approximant, so the home-screen icon is a real tile from the tool.
