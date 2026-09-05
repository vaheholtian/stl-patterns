import assert from 'node:assert/strict'
import { test } from 'node:test'
import Module from 'manifold-3d'
import { generators, defaultParams, repeatKind, isSeamless } from '../src/patterns/index.ts'
import { seededRandom } from '../src/geom/random.ts'
import { tileToCrossSection } from '../src/patterns/pipeline.ts'
import type { Pt } from '../src/patterns/types.ts'

const m = await Module(); m.setup()
function intervals(polys: Pt[][], axis: number, edge: number): number[][] {
  const list: number[][] = []
  for (const poly of polys) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    if (Math.abs(a[axis] - edge) < 1e-6 && Math.abs(b[axis] - edge) < 1e-6) {
      const lo = Math.min(a[1 - axis], b[1 - axis]), hi = Math.max(a[1 - axis], b[1 - axis])
      if (hi - lo > 1e-5) list.push([lo, hi])
    }
  }
  list.sort((a, b) => a[0] - b[0])
  const merged: number[][] = []
  for (const interval of list) {
    const last = merged[merged.length - 1]
    if (last && interval[0] - last[1] < 1e-5) last[1] = Math.max(last[1], interval[1])
    else merged.push(interval)
  }
  return merged
}
for (const g of generators.filter((g) => repeatKind(g) === 'field')) test(`${g.name}: native opposite-edge audit, without mirrors or repair bars`, () => {
  assert.equal(isSeamless(g), true)
  for (const seed of [1, 7, 42]) for (const minFeature of [0, 0.8]) {
  const tile = g.generate({ ...defaultParams(g), seed }, { rand: seededRandom(seed) })
  const cs = tileToCrossSection(m, tile, { periodic: true, invert: Boolean(g.cutoutDefault), minFeature })
  try {
    const polys = cs.toPolygons() as Pt[][]
    for (const axis of [0, 1]) {
      const a = intervals(polys, axis, 0), b = intervals(polys, axis, axis ? tile.height : tile.width)
      assert.equal(a.length, b.length, `axis ${axis}: seam openings`)
      for (let i = 0; i < a.length; i++) for (let k = 0; k < 2; k++) assert.ok(Math.abs(a[i][k] - b[i][k]) < 0.02, `axis ${axis}: ${a[i][k]} vs ${b[i][k]}`)
    }
  } finally { cs.delete() }
  }
})
test('Motifs and horizontal bands are not advertised as all-over fields', () => {
  for (const id of ['fermatSpirals', 'gosper', 'arrowhead', 'terdragon', 'apollonian', 'hyperbolic', 'phyllotaxis', 'penrose', 'julia', 'sierpinski']) {
    assert.equal(repeatKind(generators.find((g) => g.id === id)!), 'motif')
  }
  for (const id of ['hilbert', 'greekKey']) assert.equal(repeatKind(generators.find((g) => g.id === id)!), 'band')
})
