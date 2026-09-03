# STL patterns

Put decorative patterns on the surface of 3D-printable parts, in the browser.

Load an STL or 3MF (Onshape exports work as-is, including the ones in meters), click a surface region, and either scatter a surface-native Voronoi lattice on it or wrap a flat tile around it: Truchet, guilloche, Hilbert, a seamless periodic Penrose approximant, hyperbolic tilings, Julia sets, your own SVG, and more. A mirror switch turns any tile into a seamless kaleidoscope. Output is a watertight mesh as STL or 3MF, ready for Bambu Studio.

Live: https://vaheholtian.github.io/stl-patterns/

## How it works

- **Pattern screen** makes a flat tile in millimetres: closed shapes become holes or relief, stroked curves become grooves or ridges. Everything is turned into clean polygons with [manifold-3d](https://github.com/elalish/manifold)'s 2D engine before it goes anywhere near 3D.
- **Apply screen** selects a region by flood-filling across smooth faces, flattens it with a least-squares conformal map (ring-shaped regions get a seam so the tile repeats a whole number of times around; closed surfaces lose a small cap on the far side), lays the tile out with the origin you click, and builds tool solids by extruding the polygons and warping them onto the surface. Cut, recess or emboss are booleans in a web worker.
- **Surface-native Voronoi** skips the flattening: seeds are scattered on the mesh, cells are convex polyhedra trimmed by bisector planes, and the whole lattice is one variadic boolean.

## Develop

```
npm install
npm run dev      # http://localhost:5173/stl-patterns/
npm run build
```

Dev shortcuts: `?load=/stl-patterns/fixtures/pen-cup.3mf` loads a test part, `?load=demo:sphere-prism` builds one in code. `spikes/a.html` and `spikes/b.html` are the original feasibility spikes.

Planning and decisions live in `planning/`; research that led here is in `research/`.
