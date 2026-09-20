// A smooth shape whose floor blends into its walls has no edge sharp enough to
// stop the region flood fill, so clicking the wall used to select the floor too.
// The tilt split classes faces by their angle from the print bed and refuses to
// cross from wall to floor or ceiling, which gives the same regions a CAD user
// would expect (walls, floor, top) on a bowl.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import Module from 'manifold-3d'
import { triMeshFromManifold } from '../src/geom/manifold.ts'
import { FaceAdjacency } from '../src/geom/segmentation.ts'

const m = await Module(); m.setup()
const M = m.Manifold

// hollow sphere: one smooth surface inside and one outside, nothing sharper than ~4° between faces
const mesh = triMeshFromManifold(M.difference(M.sphere(30, 96), M.sphere(28, 96)))
const adj = new FaceAdjacency(mesh)
const nTri = adj.nTri
const centroidZ = (t: number) => (mesh.positions[mesh.indices[t * 3] * 3 + 2] + mesh.positions[mesh.indices[t * 3 + 1] * 3 + 2] + mesh.positions[mesh.indices[t * 3 + 2] * 3 + 2]) / 3
const findFace = (pred: (nz: number, z: number, outward: boolean) => boolean): number => {
  for (let t = 0; t < nTri; t++) {
    const nz = adj.normals[t * 3 + 2], z = centroidZ(t)
    const dot = adj.normals[t * 3] * mesh.positions[mesh.indices[t * 3] * 3] + adj.normals[t * 3 + 1] * mesh.positions[mesh.indices[t * 3] * 3 + 1] + nz * mesh.positions[mesh.indices[t * 3] * 3 + 2]
    if (pred(nz, z, dot > 0)) return t
  }
  throw new Error('no such face')
}
const outerEquator = findFace((nz, _z, out) => out && Math.abs(nz) < 0.05)
const outerTop = findFace((nz, _z, out) => out && nz > 0.99)

test('without the tilt split a smooth closed surface is one region', () => {
  assert.equal(adj.floodFill(outerEquator, 30).length, nTri / 2)
  assert.equal(adj.segmentAll(30).count, 2) // inside and outside
})

test('with the tilt split the outer sphere becomes a top cap, a wall band and a bottom cap', () => {
  const { count, regionOf } = adj.segmentAll(30, 45)
  assert.equal(count, 6)
  const band = adj.floodFill(outerEquator, 30, null, 45)
  const cap = adj.floodFill(outerTop, 30, null, 45)
  assert.ok(band.length > 0 && cap.length > 0)
  assert.notEqual(regionOf[outerEquator], regionOf[outerTop])
  // every band face tilts at least 45° from flat, every cap face less than that
  const cos45 = Math.cos(Math.PI / 4)
  for (const t of band) assert.ok(Math.abs(adj.normals[t * 3 + 2]) <= cos45 + 1e-6)
  for (const t of cap) assert.ok(adj.normals[t * 3 + 2] >= cos45 - 1e-6)
  // the band is the 30 mm sphere between z = ±21.2 (sin 45°), give or take one triangle row
  let zMin = Infinity, zMax = -Infinity
  for (const t of band) { const z = centroidZ(t); if (z < zMin) zMin = z; if (z > zMax) zMax = z }
  assert.ok(zMin > -23 && zMin < -19, `band bottom ${zMin}`)
  assert.ok(zMax > 19 && zMax < 23, `band top ${zMax}`)
})

test('a threshold of zero disables the split and the class cache follows the threshold', () => {
  assert.equal(adj.floodFill(outerEquator, 30, null, 0).length, nTri / 2)
  assert.equal(adj.floodFill(outerEquator, 30, null, 60).length < adj.floodFill(outerEquator, 30, null, 45).length, true)
  assert.equal(adj.floodFill(outerEquator, 30, null, 45).length < adj.floodFill(outerEquator, 30, null, 30).length, true)
})
