// "Skip where smaller than" is relative to the size the user asked for. A tile
// placed at half size is at 100% of its intended size at the origin, so a 50%
// threshold must not mask a flat plate laid at scale 0.5 (it used to mask
// roughly half of every curved wall, wherever the flattening shrank at all).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { m, plate } from './physical-fixtures.ts'
import { layoutTile } from '../src/geom/layout.ts'
import { flattenPieces } from '../src/geom/regionFlatten.ts'
import { toolOffsetRange } from '../src/geom/tileTool.ts'

const square: [number, number][][] = [[[0, 0], [20, 0], [20, 20], [0, 20]]]

for (const scale of [1, 0.5, 0.25]) {
  test(`a flat plate at scale ${scale} is never masked by a 50% threshold and reports 100% of the chosen size`, () => {
    const f = plate(0)
    const [zLo, zHi] = toolOffsetRange('cut', 1.6, 1.6)
    const { pieces } = flattenPieces(f.mesh, f.region, f.origin, 30, true)
    const laid = pieces.map((piece) => layoutTile(m, piece, square, 20, 20, { origin: piece.origin, scale, rotationDeg: 0, margin: 2, fitSeam: true, minScale: 0.5, normalRange: [zLo, zHi] }))
    for (const l of laid) {
      assert.ok(!l.log.some((x) => x.includes('left solid where')), l.log.join('\n'))
      assert.ok(Math.abs(l.scaleMin - 1) < 1e-3 && Math.abs(l.scaleMax - 1) < 1e-3, `range ${l.scaleMin}..${l.scaleMax}`)
      assert.ok(l.polygons.length > 0)
    }
  })
}
