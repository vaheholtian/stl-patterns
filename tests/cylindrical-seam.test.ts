import assert from 'node:assert/strict'
import { test } from 'node:test'
import Module from 'manifold-3d'
import { triMeshFromManifold, manifoldFromTriMesh } from '../src/geom/manifold.ts'
import { extractSubMesh } from '../src/geom/submesh.ts'
import { flattenRegion } from '../src/geom/regionFlatten.ts'
import { layoutTile } from '../src/geom/layout.ts'
import { buildSurfaceTool } from '../src/geom/tileTool.ts'
import { generateTile } from '../src/patterns/generate.ts'
import { parseStl, writeBinaryStl } from '../src/io/stl.ts'

const m = await Module(); m.setup()
function fixture() {
  const outer = m.Manifold.cylinder(40, 20, 20, 64), inner = m.Manifold.cylinder(40, 18, 18, 64)
  const body = outer.subtract(inner); outer.delete(); inner.delete()
  const mesh = triMeshFromManifold(body), region: number[] = []
  for (let t = 0; t < mesh.indices.length / 3; t++) {
    const vs = [0, 1, 2].map(j => mesh.indices[t * 3 + j] * 3)
    if (vs.every(v => Math.hypot(mesh.positions[v], mesh.positions[v + 1]) > 19.9)
      && new Set(vs.map(v => mesh.positions[v + 2])).size > 1) region.push(t)
  }
  return { body, mesh, region: Uint32Array.from(region) }
}
test('cylinder normals are radial at both rims despite diagonal triangulation', () => {
  const { body, mesh, region } = fixture()
  try {
    const sub = extractSubMesh(mesh, region)
    for (let v = 0; v < sub.positions.length; v += 3) {
      const r = Math.hypot(sub.positions[v], sub.positions[v + 1])
      assert.ok(Math.hypot(sub.normals[v] - sub.positions[v] / r, sub.normals[v + 1] - sub.positions[v + 1] / r, sub.normals[v + 2]) < 1e-6)
    }
  } finally { body.delete() }
})
test('exported cylindrical cuts preserve real openings across the wrap at several detail settings', () => {
  const { body, mesh, region } = fixture()
  try {
    const origin: [number, number, number] = [20, 0, 20]
    const flat = flattenRegion(mesh, region, origin)
    assert.equal(flat.topology, 'seam')
    const generated = generateTile(m, { def: { name: 'Voronoi', generatorId: 'voronoiTile', params: { width: 23, height: 37, seed: 7 }, invert: false, seamless: true }, lineWidth: .42 })
    const tile = generated.tile!
    const laid = layoutTile(m, flat, generated.polygons, tile.width, tile.height, { origin, rotationDeg: 0, scale: 1, margin: 2, minScale: 0, fitSeam: true })
    assert.ok(laid.repeatsAround)
    const v = flat.seamVertices[0] * 3, theta = Math.atan2(flat.positions[v + 1], flat.positions[v])
    for (const detail of [1, 2, 3]) {
      const polygons = laid.polygons.map(p => p.map(([x, y]) => [Math.fround(x), Math.fround(y)] as [number, number]))
      const tool = buildSurfaceTool(m, laid.param, polygons, -3, 1, detail)
      const cut = body.subtract(tool); tool.delete()
      // Curved tiled cuts retain the boolean mesh, as in the geometry worker.
      const data = writeBinaryStl(triMeshFromManifold(cut)); cut.delete()
      const reimported = manifoldFromTriMesh(m, extractSubMesh(parseStl(data), null))
      try {
        assert.equal(reimported.status(), 'NoError')
        let holes = 0, material = 0
        for (let i = 0; i < 400; i++) {
          const z = 2 + (i + .5) * 36 / 400
          const sides = [-1, 1].map(sign => {
            const a = theta + sign * 1e-5
            return reimported.rayCast([0, 0, z], [22 * Math.cos(a), 22 * Math.sin(a), z]).length > 0
          })
          assert.equal(sides[0], sides[1], `detail ${detail}, height ${z}`)
          if (sides[0]) material++; else holes++
        }
        assert.ok(holes > 100 && material > 100, 'seam must contain both openings and ribs')
      } finally { reimported.delete() }
    }
  } finally { body.delete() }
})
