import assert from 'node:assert/strict'
import { test } from 'node:test'
import Module from 'manifold-3d'
import { insetConvex } from '../src/patterns/penrose.ts'
import { insetConvexPolygon } from '../src/patterns/voronoiTile.ts'
import { generatorById, defaultParams } from '../src/patterns/index.ts'
import { seededRandom } from '../src/geom/random.ts'
import { layoutTile, buildParameterization } from '../src/geom/layout.ts'
import type { Pt } from '../src/patterns/types.ts'
import { tileToCrossSection, simplifyAnchored } from '../src/patterns/pipeline.ts'
import { intervals, mismatch } from './seam-helpers.ts'
import { mirrorTile } from '../src/patterns/mirror.ts'

const square: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1]]
test('simplification preserves a shallow excursion beside the seam', () => {
  const p: Pt[] = [[0, 1], [.005, 1.05], [0, 1.1], [-1, 1.1], [-1, 1]]
  const result = simplifyAnchored([p], 40, 40, .01)
  assert.equal(mismatch(intervals([p], 0, 0), intervals(result, 0, 0)).max, 0)
})
const area = (p: Pt[] | null) => p ? Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - a[1] * b[0] }, 0)) / 2 : 0
for (const inset of [insetConvex, insetConvexPolygon]) {
  test(`${inset.name}: erosion stays empty after collapse, for either winding`, () => {
    for (const p of [square, [...square].reverse()]) {
      assert.equal(area(inset(p, 0)), 1)
      assert.equal(area(inset(p, .25)), .25)
      assert.equal(inset(p, .5), null)
      assert.equal(inset(p, 2), null)
    }
  })
  test(`${inset.name}: losing a short edge does not invalidate the remaining inset`, () => {
    const clippedCorner: Pt[] = [[0, 0], [4, 0], [4, 3.9], [3.9, 4], [0, 4]]
    assert.ok(Math.abs(area(inset(clippedCorner, 1)) - 4) < 1e-8)
    let last = area(clippedCorner)
    for (let d = 0; d <= 4; d += .1) {
      const p = inset(clippedCorner, d), a = area(p)
      assert.ok(a <= last + 1e-8)
      for (const q of p ?? []) assert.ok(q[0] >= d - 1e-8 && q[1] >= d - 1e-8 && q[0] <= 4 - d + 1e-8 && q[1] <= 4 - d + 1e-8)
      last = a
    }
  })
}
test('impossible Hilbert spans are rejected before allocating the curve', () => {
  const g = generatorById('hilbert')!
  for (const [width, height] of [[5, 5], [5, 61], [61, 5], [23, 5]]) for (const order of [1, 4, 7]) for (const rounded of [false, true]) {
    assert.throws(() => g.generate({ ...defaultParams(g), width, height, ribWidth: 6, order, rounded }, { rand: seededRandom(7) }), /rib width.*tile|tile.*rib width/i)
  }
  const tile = g.generate(defaultParams(g), { rand: seededRandom(7) })
  assert.ok(tile.curves[0].points.length > 10)
})
test('Guilloche rejects the recorded abort settings before kernel work', () => {
  const g = generatorById('guilloche')!
  for (const [width, height, ribWidth] of [[5, 5, 6], [5, 61, 6], [61, 5, 6], [61, 11, 5.8]]) {
    assert.throws(() => g.generate({ ...defaultParams(g), width, height, ribWidth }, { rand: seededRandom(7) }), /rib width.*tile|tile.*rib width/i)
  }
  assert.ok(g.generate(defaultParams(g), { rand: seededRandom(7) }).curves.length)
})
test('surface fit only claims a repeat when the actual placement period matches', async () => {
  const m = await Module(); m.setup()
  const flat = { positions: new Float32Array([0,0,0,100,0,0,100,50,0,0,50,0]), indices: new Uint32Array([0,1,2,0,2,3]), normals: new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]), uv: new Float32Array([0,0,100,0,100,50,0,50]), period: [100,0] as Pt, originTriangle: 0, loops: [[0,1,2,3]], seamVertices: [0,1,2,3], topology: 'seam' as const, log: [], removedCap: new Uint32Array() }
  for (const rotationDeg of [-30, 0, 15, 30, 45, 90, 180, 360]) for (const scale of [.5, 1, 2]) {
    const settings = { origin: [13,17,0] as [number,number,number], rotationDeg, scale, margin: 0, fitSeam: true, minScale: 0 }
    const result = layoutTile(m, flat, [square], 23, 37, settings)
    const { period } = buildParameterization(flat, settings)
    if (rotationDeg % 180 === 0) {
      assert.notEqual(result.repeatsAround, null)
      assert.ok(Math.abs(period![0] / result.tileWidth - Math.round(period![0] / result.tileWidth)) < 1e-6)
      assert.ok(Math.abs(period![1]) < 1e-6)
    } else {
      assert.equal(result.repeatsAround, null, `${rotationDeg} degrees must not claim an x-only fit`)
      assert.equal(result.stretch, 1)
    }
  }
})

test('recorded precision failures match after final cleanup at every tested width', async () => {
  const m = await Module(); m.setup()
  const cases: [string, Record<string, number | string>][] = [
    ['voronoiTile', { width: 40, height: 40, relax: 0 }],
    ['penroseApproximant', { width: 40, height: 40, style: 'edges', ribWidth: .4 }],
    ['moire', { width: 61, height: 11, angleA: 40, angleB: -2 }],
  ]
  for (const [id, params] of cases) for (const minFeature of [0, .2, .4, .84, 1.6]) {
    const g = generatorById(id)!, tile = g.generate({ ...defaultParams(g), ...params, seed: 7 }, { rand: seededRandom(7) })
    const cs = tileToCrossSection(m, tile, { periodic: true, minFeature })
    try {
      const polys = cs.toPolygons() as Pt[][]
      for (const axis of [0, 1]) assert.ok(mismatch(intervals(polys, axis, 0), intervals(polys, axis, axis ? tile.height : tile.width)).max <= .02, `${id} cleanup ${minFeature} axis ${axis}`)
    } finally { cs.delete() }
  }
})
test('filled Penrose gaps preserve final seams throughout the targeted matrix', async () => {
  const m = await Module(); m.setup()
  const g = generatorById('penroseApproximant')!
  for (const width of [5, 10, 23, 40, 61]) for (const gap of [1, 3, 5]) for (const style of ['thin', 'all']) for (const minFeature of [.2, .84]) {
    const tile = g.generate({ ...defaultParams(g), width, height: 37, gap, style, seed: 7 }, { rand: seededRandom(7) })
    const cs = tileToCrossSection(m, tile, { periodic: true, minFeature })
    try {
      const polys = cs.toPolygons() as Pt[][]
      for (const axis of [0, 1]) assert.ok(mismatch(intervals(polys, axis, 0), intervals(polys, axis, axis ? tile.height : tile.width)).max <= .02, `${width} gap ${gap} ${style} cleanup ${minFeature} axis ${axis}`)
    } finally { cs.delete() }
  }
})
test('Diamond bridges connect vertex-touching material islands without erasing them', async () => {
  const m = await Module(); m.setup()
  const g = generatorById('diamondLattice')!
  const tile = mirrorTile(g.generate({ ...defaultParams(g), width: 61, height: 11, holeSize: 21, aspect: .75, ribWidth: 1.6 }, { rand: seededRandom(0) }))
  const box = m.CrossSection.square([tile.width, tile.height])
  try {
    for (const minFeature of [0, .2, .4, .84, 1.6]) {
      const feature = tileToCrossSection(m, tile, { periodic: true, connectMaterial: true, minFeature })
      const material = m.CrossSection.difference(box, feature), parts = material.decompose()
      try {
        assert.equal(parts.length, 1)
        const polys = feature.toPolygons() as Pt[][]
        for (const axis of [0, 1]) assert.ok(mismatch(intervals(polys, axis, 0), intervals(polys, axis, axis ? tile.height : tile.width)).max <= .02)
        assert.ok(material.area() > 2266, 'retain the two 15.75 mm² islands as well as the main web')
      } finally { parts.forEach(p => p.delete()); material.delete(); feature.delete() }
    }
  } finally { box.delete() }
})
