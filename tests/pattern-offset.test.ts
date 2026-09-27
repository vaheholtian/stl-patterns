// Moving the pattern over the surface: a new origin recentres the sheet without
// flattening again, and the offset slides the pattern along and up the wall in
// millimetres, whatever the user's rotation and scale.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import Module from 'manifold-3d'
import { triMeshFromManifold } from '../src/geom/manifold.ts'
import { flattenPieces, reframePieces } from '../src/geom/regionFlatten.ts'
import { buildParameterization, layoutTile } from '../src/geom/layout.ts'

const m = await Module(); m.setup()
// a cylindrical wall, 40 mm tall, radius 20
const body = m.Manifold.cylinder(40, 20, 20, 64).subtract(m.Manifold.cylinder(40, 18, 18, 64))
const mesh = triMeshFromManifold(body)
const region: number[] = []
for (let t = 0; t < mesh.indices.length / 3; t++) {
  const vs = [0, 1, 2].map((j) => mesh.indices[t * 3 + j] * 3)
  if (vs.every((v) => Math.hypot(mesh.positions[v], mesh.positions[v + 1]) > 19.9) && new Set(vs.map((v) => mesh.positions[v + 2])).size > 1) region.push(t)
}
const wall = Uint32Array.from(region)
const A: [number, number, number] = [20, 0, 10], B: [number, number, number] = [0, 20, 30]
const pieces = flattenPieces(mesh, wall, A, 30, true, true).pieces
assert.equal(pieces.length, 1)
const piece = pieces[0]

/** uv of a surface point under the given layout settings */
function uvOf(settings: Parameters<typeof buildParameterization>[1], p: [number, number, number]): [number, number] {
  const { param } = buildParameterization(piece, settings)
  // triangle nearest the point
  const P = param.sub.positions, I = param.sub.indices
  let best = 0, bd = Infinity
  for (let t = 0; t < I.length / 3; t++) {
    let cx = 0, cy = 0, cz = 0
    for (let c = 0; c < 3; c++) { const v = I[t * 3 + c] * 3; cx += P[v]; cy += P[v + 1]; cz += P[v + 2] }
    const d = (cx / 3 - p[0]) ** 2 + (cy / 3 - p[1]) ** 2 + (cz / 3 - p[2]) ** 2
    if (d < bd) { bd = d; best = t }
  }
  return param.uvAt3D(best, p[0], p[1], p[2])
}
const near = (a: [number, number], b: [number, number], tol: number, what: string) => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < tol, `${what}: ${a.map((v) => v.toFixed(2))} vs ${b.map((v) => v.toFixed(2))}`)

test('a new origin moves the sheet frame without flattening again', () => {
  const base = { origin: A, rotationDeg: 0, scale: 1, margin: 0, fitSeam: true, minScale: 0 }
  near(uvOf(base, A), [0, 0], 0.05, 'origin A at (0,0)')
  const before = uvOf(base, B)
  assert.ok(Math.hypot(before[0], before[1]) > 20, 'B is well away from A')
  assert.ok(reframePieces(pieces, B))
  assert.deepEqual(piece.origin, B)
  near(uvOf({ ...base, origin: B }, B), [0, 0], 0.05, 'origin B at (0,0) after reframing')
  assert.ok(reframePieces(pieces, A))
})

test('the offset slides the pattern along and up the wall in surface millimetres', () => {
  const base = { origin: A, rotationDeg: 0, scale: 1, margin: 0, fitSeam: true, minScale: 0 }
  // the point 5 mm up the wall from the origin
  const P: [number, number, number] = [20, 0, 15]
  near(uvOf(base, P), [0, 5], 0.1, 'P sits 5 mm up')
  // moving the pattern up by 5 mm puts its origin cell at P: P maps to (0,0)
  near(uvOf({ ...base, offset: [0, 5] }, P), [0, 0], 0.1, 'offset up by 5')
  // 10 mm along the wall: a point 10 mm round the cylinder maps to (0, 0) too
  const th = 10 / 20
  const Q: [number, number, number] = [20 * Math.cos(th), 20 * Math.sin(th), 10]
  const q = uvOf(base, Q)
  assert.ok(Math.abs(Math.abs(q[0]) - 10) < 0.1 && Math.abs(q[1]) < 0.1, `Q sits 10 mm along: ${q}`)
  near(uvOf({ ...base, offset: [q[0], 0] }, Q), [0, 0], 0.1, 'offset along by 10')
  // with rotation and scale the offset is still millimetres on the surface, before both
  const rot = { ...base, rotationDeg: 30, scale: 0.5 }
  const p0 = uvOf(rot, P), p1 = uvOf({ ...rot, offset: [0, 5] }, P)
  near(p1, [0, 0], 0.1, 'offset up by 5 under rotation and scale')
  // and (0,5) mm on the surface is 10 layout units at scale 0.5, turned by the rotation
  const a = (30 * Math.PI) / 180
  near(p0, [-Math.sin(a) * 10, Math.cos(a) * 10], 0.1, 'P before the offset')
})

test('the offset keeps the seam fit: the same whole number of repeats', () => {
  const tile: [number, number][][] = [[[0, 0], [9, 0], [9, 9], [0, 9]]]
  const settings = { origin: A, rotationDeg: 0, scale: 1, margin: 2, fitSeam: true, minScale: 0 }
  const a = layoutTile(m, piece, tile, 10, 10, settings)
  const b = layoutTile(m, piece, tile, 10, 10, { ...settings, offset: [3.3, -4.1] })
  assert.equal(a.repeatsAround, b.repeatsAround)
  assert.ok(Math.abs(a.stretch - b.stretch) < 1e-9)
  assert.ok(b.polygons.length > 0)
})
