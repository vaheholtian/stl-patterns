// The outer wall of an oval bowl is not developable, so its conformal flattening
// (LSCM) comes out bent into an arc: straight rows of tiles laid in that arc are
// level only near the origin and tilt more and more going round the bowl, with a
// kink where the seam closes. "Level rows" parameterizes such a ring so the rows
// follow the rim all the way round and the two sides of the seam coincide after
// a plain translation.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import Module from 'manifold-3d'
import { triMeshFromManifold } from '../src/geom/manifold.ts'
import { FaceAdjacency } from '../src/geom/segmentation.ts'
import { flattenRegion, type FlattenedRegion } from '../src/geom/regionFlatten.ts'
import { buildParameterization } from '../src/geom/layout.ts'

const m = await Module(); m.setup()
const M = m.Manifold

// an oval bowl: a squashed hollow sphere, walls between the 30° tilt lines, so the doubly curved bottom is in
const outer = M.sphere(30, 96).scale([1.6, 1, 0.9]), inner = M.sphere(28, 96).scale([1.6, 1, 0.9])
const mesh = triMeshFromManifold(M.difference(outer, inner))
const adj = new FaceAdjacency(mesh)
const centroid = (t: number) => { const c = [0, 0, 0]; for (let k = 0; k < 3; k++) for (let d = 0; d < 3; d++) c[d] += mesh.positions[mesh.indices[t * 3 + k] * 3 + d] / 3; return c }
let seed = -1
for (let t = 0; t < adj.nTri && seed < 0; t++) {
  const c = centroid(t)
  if (Math.abs(adj.normals[t * 3 + 2]) < 0.05 && c[1] < -25 && Math.abs(c[0]) < 3) seed = t
}
const band = adj.floodFill(seed, 30, null, 30)
const origin = centroid(seed) as [number, number, number]

/** Per triangle: how far the tile's x axis (after the layout's base rotation) tilts from level, degrees, with the triangle's azimuth. */
function rowTilts(flat: FlattenedRegion): { tilt: number; az: number }[] {
  const { param } = buildParameterization(flat, { origin, rotationDeg: 0, scale: 1, margin: 0, fitSeam: true, minScale: 0 })
  const P = param.sub.positions, I = param.sub.indices, uv = param.uv
  const out: { tilt: number; az: number }[] = []
  for (let t = 0; t < I.length / 3; t++) {
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2]
    const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]]
    const e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]]
    const u1 = uv[b * 2] - uv[a * 2], v1 = uv[b * 2 + 1] - uv[a * 2 + 1], u2 = uv[c * 2] - uv[a * 2], v2 = uv[c * 2 + 1] - uv[a * 2 + 1]
    const det = u1 * v2 - u2 * v1
    if (Math.abs(det) < 1e-12) continue
    const al = v2 / det, be = -v1 / det
    const d = [al * e1[0] + be * e2[0], al * e1[1] + be * e2[1], al * e1[2] + be * e2[2]]
    const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3, cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3
    out.push({ tilt: (Math.atan2(d[2], Math.hypot(d[0], d[1])) * 180) / Math.PI, az: (Math.atan2(cy, cx) * 180) / Math.PI })
  }
  return out
}
const meanAbs = (xs: number[]) => xs.reduce((s, x) => s + Math.abs(x), 0) / xs.length

test('the conformal flattening of an oval bowl wall lets the rows drift off level away from the origin', () => {
  const flat = flattenRegion(mesh, band, origin, false)
  assert.equal(flat.topology, 'seam')
  const tilts = rowTilts(flat)
  const back = tilts.filter((x) => Math.abs(x.az - 90) < 30).map((x) => x.tilt)
  assert.ok(meanAbs(back) > 4, `rows at the back tilt ${meanAbs(back).toFixed(1)}° on average`)
})

test('level rows keep the tile rows level with the rim all the way round', () => {
  const flat = flattenRegion(mesh, band, origin, true)
  assert.equal(flat.topology, 'seam')
  assert.ok(flat.log.some((l) => l.startsWith('level rows')), flat.log.join('\n'))
  const tilts = rowTilts(flat).map((x) => x.tilt)
  assert.ok(meanAbs(tilts) < 0.5, `mean |tilt| ${meanAbs(tilts).toFixed(2)}°`)
  assert.ok(Math.max(...tilts.map(Math.abs)) < 3, `worst tilt ${Math.max(...tilts.map(Math.abs)).toFixed(2)}°`)
  // the two sides of the seam are exactly one period apart, so the pattern meets itself without a kink
  const period = flat.period!
  assert.ok(period[0] > 100 && Math.abs(period[1]) < 1e-9, `period ${period}`)
  for (let i = 0; i + 1 < flat.seamVertices.length; i += 2) {
    const a = flat.seamVertices[i], b = flat.seamVertices[i + 1]
    const dx = Math.abs(Math.abs(flat.uv[b * 2] - flat.uv[a * 2]) - period[0]), dy = Math.abs(flat.uv[b * 2 + 1] - flat.uv[a * 2 + 1])
    assert.ok(dx < 1e-3 * period[0] && dy < 1e-3 * period[0], `seam pair off by ${dx.toFixed(3)}, ${dy.toFixed(3)} mm`)
  }
  // the sheet is the right size: about the wall's mean perimeter round and its height up
  let zLo = Infinity, zHi = -Infinity
  for (const t of band) { const z = centroid(t)[2]; zLo = Math.min(zLo, z); zHi = Math.max(zHi, z) }
  let vLo = Infinity, vHi = -Infinity
  for (let i = 1; i < flat.uv.length; i += 2) { vLo = Math.min(vLo, flat.uv[i]); vHi = Math.max(vHi, flat.uv[i]) }
  assert.ok(vHi - vLo > (zHi - zLo) && vHi - vLo < 2 * (zHi - zLo), `sheet ${(vHi - vLo).toFixed(1)} mm high for a wall ${(zHi - zLo).toFixed(1)} mm tall`)
})

test('a flat ring keeps the conformal flattening: it has no rim to keep level with', () => {
  // a washer lying on the bed
  const washer = triMeshFromManifold(M.difference(M.cylinder(2, 30, 30, 64), M.cylinder(2, 20, 20, 64)))
  const wadj = new FaceAdjacency(washer)
  let top = -1
  for (let t = 0; t < wadj.nTri && top < 0; t++) if (wadj.normals[t * 3 + 2] > 0.99) top = t
  const ring = wadj.floodFill(top, 30, null, 45)
  const flat = flattenRegion(washer, ring, [25, 0, 2], true)
  assert.ok(!flat.log.some((l) => l.startsWith('level rows')), flat.log.join('\n'))
  assert.equal(flat.topology, 'disk')
})
