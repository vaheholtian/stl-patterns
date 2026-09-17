// In the flattened sheet: does each wave rib run the full 200 mm circumference,
// or is it chopped where tile copies meet?
import { readFileSync } from 'node:fs'
import { m, selectByNormals, layoutOnBody, DEFAULTS, type Body } from '../box50-review-2026-09-09/helpers.ts'
import { manifoldFromTriMesh, triMeshFromManifold } from '../../src/geom/manifold.ts'
import { parseStl } from '../../src/io/stl.ts'
import { buildTile } from './waves-tile.ts'
const bytes = readFileSync(new URL('../../fixtures/box-50.stl', import.meta.url))
const body = manifoldFromTriMesh(m, parseStl(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)))
const mesh = triMeshFromManifold(body)
const faceNormals: [number, number, number][] = [[0, -1, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0]]
const ring: Body = { name: 'ring', body, mesh, faceNormals, origin: [37, 0, 23], region: selectByNormals(mesh, faceNormals, (x, y) => x < .001 || y < .001 || x > 49.999 || y > 49.999) }
const tile = buildTile()
const s = { ...DEFAULTS, mode: 'cut' as const, wallThickness: 1.6, depth: 1.6, margin: 3, scale: 1, detail: 2, rotationDeg: 0 }
const { laid } = layoutOnBody(ring, 'svg', {}, s, ring.origin, 30, { svgTile: tile, invert: false, seamless: false, mirror: false, connectMaterial: false })
for (const [i, l] of laid.entries()) {
  const polys = l.layout.polygons
  console.log(`piece ${i}: ${polys.length} polygons`)
  for (const p of polys) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const [x, y] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    console.log(`   x ${x0.toFixed(6)}..${x1.toFixed(6)}  y ${y0.toFixed(3)}..${y1.toFixed(3)}  pts ${p.length}`)
  }
}
