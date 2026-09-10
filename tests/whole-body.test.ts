// A whole-body through-cut on a thin-walled open box (the "recipe 1 - debug"
// case) must not fold the flattening: every face is flattened on its own (then
// unfolded into one sheet), the back sides of through-cut walls are left alone,
// and the result is one solid piece whose only non-planar triangles are the small hole walls.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import Module from 'manifold-3d'
import { triMeshFromManifold, type TriMesh, type Manifold } from '../src/geom/manifold.ts'
import { flattenPieces, splitSmoothPieces, isBackSide } from '../src/geom/regionFlatten.ts'
import { layoutTile } from '../src/geom/layout.ts'
import { Parameterization } from '../src/geom/parameterization.ts'
import { buildSurfaceTool, isPlanar, mitreTool, type Polygon } from '../src/geom/tileTool.ts'
import { generatorById } from '../src/patterns/index.ts'
import { resolveDef } from '../src/state/tileStore.ts'
import { tileToPolygons } from '../src/patterns/pipeline.ts'
import { seededRandom } from '../src/geom/random.ts'

const m = await Module(); m.setup()
const M = m.Manifold

function openBox(): { body: Manifold; mesh: TriMesh } {
  // 83.36 x 53.36 x 40 outside, 80 x 50 cavity from z = 1: 1.68 mm walls, 1 mm floor
  const body = M.difference(M.cube([83.36, 53.36, 40], false).translate([-41.68, -26.68, 0]), M.cube([80, 50, 40], false).translate([-40, -25, 1]))
  return { body, mesh: triMeshFromManifold(body) }
}

function wholeRegion(mesh: TriMesh): Uint32Array {
  const region = new Uint32Array(mesh.indices.length / 3)
  for (let i = 0; i < region.length; i++) region[i] = i
  return region
}

test('a box splits into one smooth piece per face and each face flattens without fold-overs', () => {
  const { mesh } = openBox()
  const parts = splitSmoothPieces(mesh, wholeRegion(mesh), 30)
  assert.equal(parts.length, 11) // 5 outer faces, 5 inner faces, the rim
  const { pieces, log } = flattenPieces(mesh, wholeRegion(mesh), [-13.33, -13.33, 2], 30)
  assert.equal(pieces.length, 11)
  assert.ok(log.some((l) => l.includes('11 smooth pieces')), log.join('\n'))
  for (const piece of pieces) {
    // no inverted triangle in any flattening
    const { uv, indices: ix } = piece
    for (let t = 0; t < ix.length / 3; t++) {
      const a = ix[t * 3], b = ix[t * 3 + 1], c = ix[t * 3 + 2]
      const a2 = (uv[b * 2] - uv[a * 2]) * (uv[c * 2 + 1] - uv[a * 2 + 1]) - (uv[c * 2] - uv[a * 2]) * (uv[b * 2 + 1] - uv[a * 2 + 1])
      assert.ok(Math.abs(a2) > 1e-6, 'degenerate uv triangle')
    }
    // a planar face never wraps
    assert.equal(piece.period, null)
    assert.equal(piece.topology, 'disk')
  }
  // the rim is a flat ring: seam cut but no wrap
  const rim = pieces.find((p) => p.region.length === 8)!
  assert.ok(rim.log.some((l) => l.includes('lies flat')), rim.log.join('\n'))
  // every inner face is the back of the larger outer face 1.68 mm (walls) or 1 mm (floor) away
  const inner = pieces.filter((p) => isBackSide(p, 'cut', 5))
  assert.equal(inner.length, 5)
  for (const p of inner) assert.ok(p.backing!.distance < 2, `backing ${p.backing!.distance}`)
  // the rim looks down the walls at the bottom face 40 mm away: too far to count for a 5 mm cut
  assert.ok(rim.backing && rim.backing.distance > 39 && !isBackSide(rim, 'cut', 5))
  // outer faces are not backed by anything larger
  for (const p of pieces) if (!inner.includes(p) && p !== rim) assert.equal(p.backing, null)
  // and nothing is skipped for a recess or an emboss
  for (const p of pieces) { assert.equal(isBackSide(p, 'recess', 5), false); assert.equal(isBackSide(p, 'emboss', 5), false) }
})

test('unfolding an open box joins its faces into one sheet; the rim is then patterned too', () => {
  const { mesh } = openBox()
  const origin: [number, number, number] = [-13.33, -13.33, 2]
  const { pieces, log } = flattenPieces(mesh, wholeRegion(mesh), origin, 30)
  assert.equal(new Set(pieces.map((p) => p.sheet)).size, 1, log.join('\n'))
  assert.ok(log.some((l) => l.includes('10 sharp edge(s) unfolded')), log.join('\n'))
  // every piece lays out in the same frame: the user's origin
  for (const p of pieces) { assert.deepEqual(p.origin, origin); assert.equal(p.frame, pieces[0].frame) }
  const rim = pieces.find((p) => p.region.length === 8)!
  assert.ok(rim.foldVertices.length >= 8, 'both rim edges are folds')
  // with unfolding off, every piece is its own sheet, centred on itself
  const separate = flattenPieces(mesh, wholeRegion(mesh), origin, 30, false)
  assert.equal(new Set(separate.pieces.map((p) => p.sheet)).size, 11)
  assert.equal(separate.pieces.filter((p) => p.foldVertices.length).length, 0)
})

for (const joinEdges of [true, false]) test(`whole-body Voronoi through-cut leaves one solid with clean geometry (unfold ${joinEdges})`, () => {
  const { body, mesh } = openBox()
  const origin: [number, number, number] = [-13.333333333333334, -13.333333333333334, 2]
  const { pieces } = flattenPieces(mesh, wholeRegion(mesh), origin, 30, joinEdges)
  const def = { name: 'Voronoi cells', generatorId: 'voronoiTile', params: { width: 80, height: 50, cellSize: 8.5, relax: 4, ribWidth: 1.6, seed: 5, gradient: 'radialOut', gradientStrength: 2 }, invert: false }
  const gen = generatorById(def.generatorId)!
  const resolved = resolveDef(def)
  const tile = gen.generate(resolved.params, { rand: seededRandom(5) })
  const polys = tileToPolygons(m, tile, { invert: false, minFeature: 0.84, connectMaterial: false, periodic: true })
  const wallThickness = 5
  const tools: Manifold[] = []
  let planarTools = 0
  for (const piece of pieces) {
    if (isBackSide(piece, 'cut', wallThickness)) continue
    // as the geometry worker does: continue the pattern past the folds, then mitre the tool there
    const layout = layoutTile(m, piece, polys, tile.width, tile.height, { origin: piece.origin, rotationDeg: 0, scale: 0.85, margin: 1.6, fitSeam: true, minScale: 0.65, single: false, normalRange: [-(wallThickness + 1), 1] })
    if (!layout.polygons.length) continue
    const param = new Parameterization({ ...layout.param.sub, sourceTriangles: new Uint32Array(0) }, layout.param.uv)
    assert.ok(isPlanar(param))
    const polygons: Polygon[] = [...layout.polygons, ...layout.foldPolygons].map((p) => p.map(([x, y]) => [x, y] as [number, number]))
    const tool = mitreTool(m, buildSurfaceTool(m, param, polygons, -(wallThickness + 1), 1, 0.5), piece.mitres, -(wallThickness + 1), 1)
    assert.equal(tool.status(), 'NoError')
    // a planar face is not refined: far fewer triangles than the 0.5 mm refinement would give
    assert.ok(tool.numTri() < 20000, `tool has ${tool.numTri()} triangles`)
    planarTools++
    tools.push(tool)
  }
  // outer walls and bottom; the rim is all margin on its own, but once unfolded into the
  // sheet its edges are folds, not boundaries, so the pattern wraps over it as well
  assert.equal(planarTools, joinEdges ? 6 : 5)
  const tool = M.union(tools)
  const cut = M.difference(body, tool).simplify(0.005)
  assert.equal(cut.status(), 'NoError')
  // zero-volume shells can remain where three mitred tools meet along a line; the worker's
  // island filter drops them, so only real material counts here
  const parts = cut.decompose().filter((p) => Math.abs(p.volume()) > 0.01)
  assert.equal(parts.length, 1, `result fell into ${parts.length} pieces: ${parts.map((p) => p.volume().toFixed(3)).join(', ')}`)
  const removed = 1 - cut.volume() / body.volume()
  assert.ok(removed > 0.1 && removed < 0.75, `removed ${(removed * 100).toFixed(0)}% of the volume`)
  // every triangle either lies on one of the box planes or is a hole wall no longer than a cell;
  // the folded flattening produced slivers of 80 to 99 mm here
  const out = triMeshFromManifold(cut)
  const { positions: p, indices: ix } = out
  let slivers = 0
  for (let t = 0; t < ix.length / 3; t++) {
    const v = [0, 1, 2].map((c) => { const a = ix[t * 3 + c] * 3; return [p[a], p[a + 1], p[a + 2]] })
    const planar = [0, 1, 2].some((d) => Math.abs(v[0][d] - v[1][d]) < 1e-3 && Math.abs(v[0][d] - v[2][d]) < 1e-3)
    let longest = 0
    for (let c = 0; c < 3; c++) { const a = v[c], b = v[(c + 1) % 3]; longest = Math.max(longest, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])) }
    if (!planar && longest > 15) slivers++
  }
  assert.equal(slivers, 0)
})
