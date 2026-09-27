// The live piece count and loose-piece removal: the vector model of the ring
// ringParts() rasterises, on shapes whose answer is known, and on every native
// generator against the reference table the cards show.
//   node --import ./tests/register.mjs --test tests/loose-pieces.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { m } from './physical-fixtures.ts'
import { analyzePieces } from '../src/patterns/loosePieces.ts'
import { generateTile, DROP_LOOSE_LIMIT } from '../src/patterns/generate.ts'
import { NATIVE_CUT_PARTS } from '../src/patterns/cutParts.ts'
import { defaultParams, generators } from '../src/patterns/index.ts'
import { polygonsArea } from '../src/patterns/pipeline.ts'
import type { Pt } from '../src/patterns/types.ts'
import { intervals, mismatch } from './seam-helpers.ts'

const rect = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
const W = 20, H = 20

test('an island inside a closed cut is loose; the wall around it holds', () => {
  // a 1 mm wide square moat around a 6 mm island in the middle of the tile
  const moat = [rect(6, 6, 8, 8), rect(7, 7, 6, 6)]
  const r = analyzePieces(m, moat, W, H)
  assert.equal(r.pieces, 17, 'the wall plus one island in each of the 4 x 4 repeats on the ring')
  assert.equal(r.loosePieces, 1)
  assert.equal(r.crumbs, 0)
  // the island is reported one nozzle line inside its true outline
  const grownSide = 6 - 2 * 0.42
  assert.ok(Math.abs(r.looseArea - grownSide * grownSide) < 0.05, `island area ${r.looseArea.toFixed(2)} vs ${grownSide * grownSide}`)
  assert.ok(r.materialArea > r.looseArea * 5, 'the wall is most of the material')
})

test('a cut across the tile leaves bands around the ring, and the bands are loose', () => {
  const stripe = [rect(-1, 8, W + 2, 4)]
  const r = analyzePieces(m, stripe, W, H)
  // four rows: the bottom band joins the bottom margin, the top band the top margin, three bands between
  assert.equal(r.pieces, 5)
  assert.equal(r.loosePieces, 1, 'one band per repeat')
  assert.ok(r.looseArea > r.materialArea * .99, 'the whole material is the band')
})

test('a cut up the tile leaves one wall: the strips climb to both margins', () => {
  const stripe = [rect(8, -1, 4, H + 2)]
  const r = analyzePieces(m, stripe, W, H)
  assert.equal(r.pieces, 1)
  assert.equal(r.loosePieces, 0)
  assert.equal(r.loose.length, 0)
})

test('a neck under two nozzle lines does not hold an island; a wider one does', () => {
  const island = (neck: number) => {
    // a moat with one gap of width `neck` on its right side
    const gapY = 10 - neck / 2
    return [rect(6, 6, 8, 1), rect(6, 13, 8, 1), rect(6, 6, 1, 8), rect(13, 6, 1, gapY - 6), rect(13, gapY + neck, 1, 14 - gapY - neck)]
  }
  const thin = analyzePieces(m, island(0.6), W, H)
  assert.equal(thin.pieces, 17, 'a 0.6 mm neck is under two lines of 0.42 mm: the wall plus 16 islands')
  assert.equal(thin.loosePieces, 1)
  const wide = analyzePieces(m, island(1.2), W, H)
  assert.equal(wide.pieces, 1)
  assert.equal(wide.loosePieces, 0)
})

test('nothing to cut, and the empty report', () => {
  const r = analyzePieces(m, [], W, H)
  assert.equal(r.pieces, 0)
  assert.equal(r.loose.length, 0)
})

test('every native generator at its defaults agrees with the reference table, both ways', () => {
  for (const g of generators) {
    if (g.id === 'library') continue
    const ref = NATIVE_CUT_PARTS[g.id]
    assert.ok(ref, `${g.id} has a reference measurement`)
    for (const invert of [false, true]) {
      const def = { name: g.id, generatorId: g.id, invert, seamless: true, params: defaultParams(g) }
      const r = generateTile(m, { def, lineWidth: 0.42 })
      const live = analyzePieces(m, r.polygons, r.tile!.width, r.tile!.height, { lineWidth: 0.42 })
      assert.equal(live.pieces, ref[invert ? 1 : 0], `${g.id}${invert ? ' inverted' : ''}`)
      // whole means nothing loose, counting crumbs aside; loose pieces mean more than one piece
      if (live.pieces === 1) assert.equal(live.loosePieces, 0, `${g.id}${invert ? ' inverted' : ''} is whole yet has loose pieces`)
      if (live.loosePieces > 0) assert.ok(live.pieces > 1, `${g.id}${invert ? ' inverted' : ''} has loose pieces yet counts as whole`)
    }
  }
})

test('Remove loose pieces takes out the islands and leaves one wall with matching seams', () => {
  const g = generators.find((x) => x.id === 'truchet')!
  const base = { name: 'truchet', generatorId: 'truchet', invert: false, seamless: true, params: defaultParams(g) }
  const before = generateTile(m, { def: base, lineWidth: 0.42 })
  const after = generateTile(m, { def: { ...base, dropLoose: true }, lineWidth: 0.42 })
  assert.ok(after.dropped && !after.dropped.refused, 'a minority of loose material is removed')
  assert.equal(after.dropped.pieces, 3)
  assert.ok(after.dropped.share > .1 && after.dropped.share < DROP_LOOSE_LIMIT)
  const w = after.tile!.width, h = after.tile!.height
  const live = analyzePieces(m, after.polygons, w, h)
  assert.equal(live.pieces, 1)
  assert.equal(live.loosePieces + live.crumbs, 0)
  assert.ok(polygonsArea(after.polygons) > polygonsArea(before.polygons), 'the cut grew by the removed material')
  // opposite edges still match, so the tile still repeats
  assert.equal(mismatch(intervals(after.polygons, 0, 0), intervals(after.polygons, 0, w)).total, 0, 'left and right edges')
  assert.equal(mismatch(intervals(after.polygons, 1, 0), intervals(after.polygons, 1, h)).total, 0, 'bottom and top edges')
  for (const poly of after.polygons) for (const [x, y] of poly) assert.ok(x > -1e-6 && x < w + 1e-6 && y > -1e-6 && y < h + 1e-6, 'inside the tile')
})

test('Remove loose pieces refuses when the loose pieces are the pattern', () => {
  const g = generators.find((x) => x.id === 'honeycomb')!
  const def = { name: 'honeycomb', generatorId: 'honeycomb', invert: true, seamless: true, params: defaultParams(g), dropLoose: true }
  const plain = generateTile(m, { def: { ...def, dropLoose: false }, lineWidth: 0.42 })
  const r = generateTile(m, { def, lineWidth: 0.42 })
  assert.ok(r.dropped?.refused, 'inverted honeycomb is nothing but loose hexagons')
  assert.ok(r.dropped!.share > DROP_LOOSE_LIMIT)
  assert.deepEqual(r.polygons, plain.polygons, 'nothing was removed')
})

test('crumbs are removed too, and count as loose pieces for the report', () => {
  const g = generators.find((x) => x.id === 'terdragon')!
  const base = { name: 'terdragon', generatorId: 'terdragon', invert: false, seamless: true, params: defaultParams(g) }
  const before = generateTile(m, { def: base, lineWidth: 0.42 })
  const live = analyzePieces(m, before.polygons, before.tile!.width, before.tile!.height)
  assert.equal(live.pieces, 1, 'the crumbs do not count against the wall')
  assert.ok(live.crumbs > 100, `${live.crumbs} crumbs`)
  const after = generateTile(m, { def: { ...base, dropLoose: true }, lineWidth: 0.42 })
  assert.equal(after.dropped?.pieces, live.crumbs + live.loosePieces)
  const clean = analyzePieces(m, after.polygons, after.tile!.width, after.tile!.height)
  assert.equal(clean.crumbs + clean.loosePieces, 0)
})
