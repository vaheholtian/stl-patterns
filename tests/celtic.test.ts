import assert from 'node:assert/strict'
import { test } from 'node:test'
import Module from 'manifold-3d'
import { celticGenerator as g } from '../src/patterns/celtic.ts'
import { defaultParams, isSeamless } from '../src/patterns/index.ts'
import { seededRandom } from '../src/geom/random.ts'
import { tileToCrossSection } from '../src/patterns/pipeline.ts'
import type { Pt } from '../src/patterns/types.ts'

const m = await Module(); m.setup()
test('Celtic is a native repeat, with no inset, rescaling, or closing chords across the tile', () => {
  assert.equal(isSeamless(g), true)
  const params = { ...defaultParams(g), width: 72, height: 45 }
  const tile = g.generate(params, { rand: seededRandom(7) })
  assert.equal(tile.width, 72); assert.equal(tile.height, 45)
  const points = tile.curves.flatMap((c) => c.points)
  assert.ok(points.some(([x]) => x < 0) && points.some(([x]) => x > 72))
  assert.ok(points.some(([, y]) => y < 0) && points.some(([, y]) => y > 45))
  const key = ([x, y]: Pt) => `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`
  const pointSet = new Set(points.map(key))
  for (const [x, y] of points) {
    if (x >= -1 && x <= 1 && y > 0 && y < 45) assert.ok(pointSet.has(key([x + 72, y])))
    if (y >= -1 && y <= 1 && x > 0 && x < 72) assert.ok(pointSet.has(key([x, y + 45])))
  }
  for (const c of tile.curves) for (let i = 1; i < c.points.length; i++) assert.ok(Math.hypot(c.points[i][0] - c.points[i - 1][0], c.points[i][1] - c.points[i - 1][1]) <= 5, 'No artificial tile-spanning joining chord')
})

test('Celtic remains connected across repeated tiles without the bridge pass', () => {
  for (const seed of [1, 7, 123]) for (const mirrors of [0, 0.25, 1]) for (const [columns, rows] of [[2, 2], [6, 5], [7, 3]]) {
    const tile = g.generate({ ...defaultParams(g), columns, rows, mirrors, ribWidth: 0.6 }, { rand: seededRandom(seed) })
    const ribs = tileToCrossSection(m, tile, { periodic: true })
    const copies = []
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) copies.push(ribs.translate([x * tile.width, y * tile.height]))
    const union = m.CrossSection.union(copies)
    // Remove only clipped fringe fragments by testing the enclosing rim used
    // on a finite panel. All interior loops must connect without added bars.
    const outside = m.CrossSection.square([tile.width * 3 + 2, tile.height * 3 + 2]).translate([-1, -1])
    const inside = m.CrossSection.square([tile.width * 3 - 0.2, tile.height * 3 - 0.2]).translate([0.1, 0.1])
    const rim = m.CrossSection.difference(outside, inside), panel = m.CrossSection.union([union, rim]), parts = panel.decompose()
    assert.equal(parts.length, 1, `seed ${seed}, barriers ${mirrors}, ${columns} × ${rows}`)
    parts.forEach((p) => p.delete()); panel.delete(); rim.delete(); inside.delete(); outside.delete(); union.delete(); copies.forEach((c) => c.delete()); ribs.delete()
  }
})
