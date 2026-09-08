import assert from 'node:assert/strict'
import { test } from 'node:test'
import Module from 'manifold-3d'
import type { CrossSection } from 'manifold-3d'
import { generatorById, defaultParams } from '../src/patterns/index.ts'
import { seededRandom } from '../src/geom/random.ts'
import { tileToCrossSection } from '../src/patterns/pipeline.ts'
import type { Pt } from '../src/patterns/types.ts'

test('moving the repeat origin does not move a cleanup defect into the interior', async () => {
  const m = await Module(); m.setup()
  const cases: [string, Record<string, number | string>, number][] = [
    ['voronoiTile', { width: 40, height: 40, relax: 0 }, .4],
    ['penroseApproximant', { width: 40, height: 40, ribWidth: .4, style: 'edges' }, .4],
    ['moire', { width: 61, height: 11, angleA: 40, angleB: -2 }, .84],
  ]
  for (const [id, params, minFeature] of cases) {
    const g = generatorById(id)!
    const tile = g.generate({ ...defaultParams(g), ...params, seed: 7 }, { rand: seededRandom(7) })
    const owned: CrossSection[] = [], own = (cs: CrossSection) => { owned.push(cs); return cs }
    try {
      const box = own(m.CrossSection.square([tile.width, tile.height]))
      const raw = own(tileToCrossSection(m, tile, { minFeature: 0 }))
      const shift = (cs: CrossSection, dx: number, dy: number) => {
        const copies: CrossSection[] = []
        for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) copies.push(own(cs.translate([dx + x * tile.width, dy + y * tile.height])))
        return own(m.CrossSection.intersection(own(m.CrossSection.union(copies)), box))
      }
      const clean = (cs: CrossSection) => own(tileToCrossSection(m, { ...tile, curves: [], polygons: cs.toPolygons() as Pt[][] }, { periodic: true, minFeature }))
      const base = clean(raw)
      for (const [dx, dy] of [[tile.width * .37, tile.height * .29], [tile.width / 2, tile.height / 2]]) {
        const expected = shift(base, dx, dy), actual = clean(shift(raw, dx, dy))
        // Both contours undergo a 0.01 mm simplification. Compare coverage
        // outside a 0.025 mm tolerance band, including the former collar edges.
        const outside = own(m.CrossSection.difference(actual, own(expected.offset(.025))))
        const missing = own(m.CrossSection.difference(expected, own(actual.offset(.025))))
        assert.ok(outside.area() + missing.area() < 1e-5, `${id}: ${outside.area() + missing.area()} mm² beyond the geometric tolerance`)
      }
    } finally { owned.forEach(cs => cs.delete()) }
  }
})
