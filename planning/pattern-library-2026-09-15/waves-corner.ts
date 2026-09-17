// Is the rot-0 result one piece only because the slits break at the corners?
// Remove a column at each vertical edge and re-count the separate solids.
import { readFileSync } from 'node:fs'
import { m } from '../box50-review-2026-09-09/helpers.ts'
import { manifoldFromTriMesh } from '../../src/geom/manifold.ts'
import { parseStl } from '../../src/io/stl.ts'
const M = m.Manifold
const load = (f: string) => { const b = readFileSync(new URL(f, import.meta.url)); return manifoldFromTriMesh(m, parseStl(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))) }
for (const rot of [0, 90]) {
  const solid = load(`./out/box50-waves1-cut-rot${rot}.stl`)
  console.log(`\nrotation ${rot}°: as exported -> ${solid.decompose().length} solid(s)`)
  for (const w of [1, 2, 3, 4]) {
    const cols = [[0, 0], [50, 0], [0, 50], [50, 50]].map(([x, y]) =>
      M.cube([2 * w, 2 * w, 60], false).translate([x - w, y - w, -5]))
    const cut = M.difference(solid, M.union(cols))
    const parts = cut.decompose().map(p => p.volume()).filter(v => v > 5).sort((a, b) => b - a)
    console.log(`  minus ${w} mm off each vertical edge -> ${parts.length} solid(s) over 5 mm3: ${parts.map(v => v.toFixed(0)).join(', ')}`)
  }
}
