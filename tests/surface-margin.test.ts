// The solid edge margin, applied per surface.
//
// Unfolding a box's walls into one sheet is what lets a pattern run across a
// corner instead of restarting on each face. The cost is that a corner is no
// longer an edge of anything, so the margin skips it and the pattern meets
// itself there with no solid band. marginPerSurface bands those folds too,
// while leaving the sheet unfolded so the repeats stay in phase around the box.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { m, box } from './physical-fixtures.ts'
import { flattenPieces } from '../src/geom/regionFlatten.ts'
import { layoutTile, type LayoutSettings } from '../src/geom/layout.ts'
import { toolOffsetRange } from '../src/geom/tileTool.ts'
import { generateTile } from '../src/patterns/generate.ts'
import { defaultParams, generatorById } from '../src/patterns/index.ts'

const MARGIN = 3, WALL = 1.6
const [zMin, zMax] = toolOffsetRange('cut', WALL, WALL)

const g = generatorById('squareGrid')!
const def = { name: g.name, generatorId: g.id, invert: false, connectMaterial: false, seamless: true, mirror: false, params: defaultParams(g) }
const tile = generateTile(m, { def, lineWidth: 0.42 })

/** mm from the nearest laid shape to this edge, or Infinity if nothing was laid. */
function clearance(uv: Float64Array | number[], polygons: [number, number][][], a: number, b: number, scale: number): number {
  const ax = uv[a * 2], ay = uv[a * 2 + 1], bx = uv[b * 2], by = uv[b * 2 + 1]
  const ex = bx - ax, ey = by - ay, len2 = ex * ex + ey * ey
  let best = Infinity
  for (const poly of polygons) {
    for (const [px, py] of poly) {
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / len2)) : 0
      best = Math.min(best, Math.hypot(px - (ax + t * ex), py - (ay + t * ey)))
    }
  }
  return best * scale
}

function layOut(marginPerSurface: boolean) {
  const fixture = box(true)
  const { pieces } = flattenPieces(fixture.mesh, fixture.region, fixture.origin, 30, true)
  assert.equal(pieces.length, 4, 'the four walls')
  assert.equal(new Set(pieces.map((p) => p.sheet)).size, 1, 'unfolded into one sheet')

  const settings: LayoutSettings = { origin: pieces[0].origin, scale: 1, rotationDeg: 0, margin: MARGIN, marginPerSurface, fitSeam: true, minScale: .5, normalRange: [zMin, zMax] }
  const folds: number[] = [], rims: number[] = []
  for (const piece of pieces) {
    const lay = layoutTile(m, piece, tile.polygons as [number, number][][], tile.tile!.width, tile.tile!.height, { ...settings, origin: piece.origin })
    if (!lay.polygons.length) continue
    const uv = lay.param.uv
    const scale = lay.param.scale[piece.originTriangle] || 1
    const foldKeys = new Set((piece.foldEdges ?? []).map(([a, b]) => (a < b ? `${a},${b}` : `${b},${a}`)))
    const closure = new Set((piece.closure?.edges ?? []).map(([a, b]) => (a < b ? `${a},${b}` : `${b},${a}`)))
    for (const loop of piece.loops) {
      for (let k = 0; k < loop.length; k++) {
        const a = loop[k], b = loop[(k + 1) % loop.length]
        const key = a < b ? `${a},${b}` : `${b},${a}`
        const d = clearance(uv, lay.polygons as [number, number][][], a, b, scale)
        if (!Number.isFinite(d)) continue
        if (foldKeys.has(key)) folds.push(d)
        else if (!closure.has(key)) rims.push(d)
      }
    }
  }
  return { folds, rims }
}

test('the rim of a box always keeps its solid margin', () => {
  for (const perSurface of [false, true]) {
    const { rims } = layOut(perSurface)
    assert.ok(rims.length >= 4, `${rims.length} rim edges measured`)
    // a real edge of the part is banded whatever this setting does
    assert.ok(Math.min(...rims) >= MARGIN - 0.5, `closest shape to a rim is ${Math.min(...rims).toFixed(2)} mm, wanted ${MARGIN}`)
  }
})

test('off, the pattern runs through the unfolded corners; on, they come out solid', () => {
  const off = layOut(false)
  assert.ok(off.folds.length >= 4, `${off.folds.length} fold edges measured`)
  // the whole point of unfolding: the pattern reaches the corner and crosses it
  assert.ok(Math.min(...off.folds) < 0.5, `pattern should touch a corner, nearest is ${Math.min(...off.folds).toFixed(2)} mm`)

  const on = layOut(true)
  assert.equal(on.folds.length, off.folds.length, 'the same corners are measured either way')
  assert.ok(Math.min(...on.folds) >= MARGIN - 0.5,
    `every corner should be solid for ${MARGIN} mm, nearest shape is ${Math.min(...on.folds).toFixed(2)} mm`)
})

test('turning it on only removes material from the pattern, never adds any', () => {
  // the band is subtracted from the region, so every shape laid with it on must
  // also have been laid with it off -- it cannot move the pattern or its phase
  const fixture = box(true)
  const { pieces } = flattenPieces(fixture.mesh, fixture.region, fixture.origin, 30, true)
  const base: Omit<LayoutSettings, 'marginPerSurface'> = { origin: pieces[0].origin, scale: 1, rotationDeg: 0, margin: MARGIN, fitSeam: true, minScale: .5, normalRange: [zMin, zMax] }
  for (const piece of pieces) {
    const off = layoutTile(m, piece, tile.polygons as [number, number][][], tile.tile!.width, tile.tile!.height, { ...base, origin: piece.origin, marginPerSurface: false })
    const on = layoutTile(m, piece, tile.polygons as [number, number][][], tile.tile!.width, tile.tile!.height, { ...base, origin: piece.origin, marginPerSurface: true })
    assert.equal(on.tileWidth, off.tileWidth, 'the tile is not resized')
    assert.equal(on.repeatsAround, off.repeatsAround, 'the repeat count around the sheet is unchanged')
    const area = (polys: [number, number][][]) => polys.reduce((sum, p) => {
      let a = 0
      for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1 }
      return sum + Math.abs(a) / 2
    }, 0)
    assert.ok(area(on.polygons as [number, number][][]) <= area(off.polygons as [number, number][][]) + 1e-6,
      'per-surface margin must only take material away')
  }
})
