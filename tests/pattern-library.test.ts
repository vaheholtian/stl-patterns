// The pattern.monster library.
//
// seamless.test.ts asserts a blanket property of every generator: opposite box
// edges carry identical profiles, and the raw output is periodic-complete. That
// is a fair demand on a generator this project wrote. It is not a property of
// 330 third-party drawings, and a handful of them genuinely do not have it --
// some are drawn past their repeat box, and some legitimately end a filled
// shape on the box edge, which tiles perfectly but does not "match".
//
// So the library is measured here instead of being asserted at wholesale, and
// the designs that fall short are pinned by name. That keeps the strict test
// strict for everything it was written for, while still failing loudly if a
// change makes one more library design break.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import Module from 'manifold-3d'
import { intervals, mismatch } from './seam-helpers.ts'
import { libraryPatterns, libraryGenerator, libraryPattern } from '../src/patterns/library/index.ts'
import { buildLibraryTile, sourceHeight } from '../src/patterns/library/tile.ts'
import { defaultParams, generatorById, isSeamless } from '../src/patterns/index.ts'
import { tileToCrossSection, polygonsArea } from '../src/patterns/pipeline.ts'
import { generateTile } from '../src/patterns/generate.ts'
import { ringParts } from '../src/patterns/ringParts.ts'
import type { Pt } from '../src/patterns/types.ts'

const m = await Module(); m.setup()
const base = defaultParams(libraryGenerator)
const tileAt = (slug: string, width: number, extra: Record<string, number> = {}) =>
  libraryGenerator.generate({ ...base, pattern: slug, width, ...extra }, { rand: () => 0 })

// Measured by planning/pattern-library-2026-09-15/measure-seams.ts and pinned so a
// regression that breaks a fourth design cannot pass unnoticed. Each is a drawing
// whose two edges genuinely differ, not a fault in the pipeline.
const EDGES_DO_NOT_MATCH = ['terrazzo-1', 'triangles-8']

test('the library generator is registered and declares itself seamless', () => {
  const g = generatorById('library')
  assert.ok(g, 'library generator is in the picker')
  assert.equal(isSeamless(g!), true, 'its tiles repeat without being mirrored into a kaleidoscope')
  assert.ok(libraryPatterns.length > 300, `${libraryPatterns.length} patterns loaded`)
  assert.equal(new Set(libraryPatterns.map(p => p.slug)).size, libraryPatterns.length, 'slugs are unique')
})

test('every design produces a finite, non-empty tile', () => {
  const empty: string[] = []
  for (const p of libraryPatterns) {
    const tile = tileAt(p.slug, 50)
    assert.ok(tile.width > 0 && tile.height > 0, `${p.slug}: ${tile.width} x ${tile.height}`)
    for (const q of [...tile.polygons.flat(), ...tile.curves.flatMap(c => c.points)]) {
      assert.ok(Number.isFinite(q[0]) && Number.isFinite(q[1]), `${p.slug}: non-finite coordinate`)
    }
    if (!tile.polygons.length && !tile.curves.length) empty.push(p.slug)
  }
  assert.deepEqual(empty, [], 'every design draws something')
})

test('every design survives the full pipeline and covers part of its box', () => {
  const collapsed: string[] = []
  for (const p of libraryPatterns) {
    const def = { name: p.title, generatorId: 'library', invert: false, seamless: true, params: { ...base, pattern: p.slug, width: 50 } }
    const r = generateTile(m, { def, lineWidth: 0.42 })
    assert.ok(r.tile, `${p.slug}: no tile`)
    const fraction = polygonsArea(r.polygons) / (r.tile!.width * r.tile!.height)
    assert.ok(fraction < 0.995, `${p.slug}: fills the whole box (${fraction.toFixed(3)})`)
    if (fraction < 0.02) collapsed.push(p.slug)
  }
  // a handful are too fine to survive the printability floor at 50 mm; they are
  // warned about rather than hidden, so only the count is pinned
  assert.ok(collapsed.length <= 8, `${collapsed.length} designs collapse at a 50 mm repeat: ${collapsed.join(', ')}`)
})

test('opposite edges match on every design but the pinned few', () => {
  const bad: string[] = []
  for (const p of libraryPatterns) {
    const tile = tileAt(p.slug, 40)
    let worst = 0
    for (const invert of [false, true]) {
      const cs = tileToCrossSection(m, tile, { periodic: true, invert, minFeature: 0.84 })
      try {
        const polys = cs.toPolygons() as Pt[][]
        for (const axis of [0, 1]) worst = Math.max(worst, mismatch(intervals(polys, axis, 0), intervals(polys, axis, axis ? tile.height : tile.width)).max)
      } finally { cs.delete() }
    }
    if (worst > 0.02) bad.push(p.slug)
  }
  assert.deepEqual(bad.sort(), [...EDGES_DO_NOT_MATCH].sort())
})

test('a design drawn past its box is drawn from its neighbours, not cut off', () => {
  // waves-1's ribs run well beyond the repeat box; the part of the box near the
  // seam has to come from the neighbouring copy or the rib stops dead there
  const p = libraryPattern('waves-1')!
  const plain = buildLibraryTile(p, { widthMm: 50, ribWidth: 1.2, layers: p.layers.length, spacingX: 0, spacingY: 0 })
  const left = plain.curves.filter(c => c.points.some(([x]) => x < -1)).length
  const right = plain.curves.filter(c => c.points.some(([x]) => x > plain.width + 1)).length
  assert.ok(left > 0 && right > 0, 'the tile carries its neighbours on both sides')
  const cs = tileToCrossSection(m, plain, { periodic: true, minFeature: 0.84 })
  try {
    const polys = cs.toPolygons() as Pt[][]
    for (const axis of [0, 1]) {
      const d = mismatch(intervals(polys, axis, 0), intervals(polys, axis, axis ? plain.height : plain.width))
      assert.ok(d.max <= 0.02, `waves-1 axis ${axis}: ${JSON.stringify(d)}`)
    }
  } finally { cs.delete() }
})

test('the measured warnings reach the tile', () => {
  // circles-11 loses the most design to the box clip of anything in the library
  const worst = libraryPatterns.reduce((a, b) => (a.clipLossPct > b.clipLossPct ? a : b))
  assert.ok(worst.clipLossPct > 5, `${worst.slug} is recorded as losing ${worst.clipLossPct}%`)
  const notes = tileAt(worst.slug, 50).notes ?? []
  assert.match(notes.join(' '), /drawn past its repeat box/)
  // a clean design says nothing about seams
  const clean = libraryPatterns.find(p => p.clipLossPct === 0 && p.ribBreak === 0)!
  assert.ok(!(tileAt(clean.slug, 50).notes ?? []).some(n => /repeat box|ribs stop/.test(n)), `${clean.slug} should carry no seam warning`)

  // the cut result reaches the tile too: waves-1 cuts the wall into bands either way
  const waves = libraryPattern('waves-1')!
  assert.equal(waves.cutAs, 17, 'measured by ring-sweep.ts with ringParts()')
  assert.equal(waves.cutInv, 18, 'and it severs the wall inverted too, so it is warned about')
  assert.match((tileAt('waves-1', 50).notes ?? []).join(' '), /leaves 17 loose pieces; inverted, 18/)
  const holds = libraryPatterns.find(p => p.cutAs === 1)!
  assert.ok(!(tileAt(holds.slug, 50).notes ?? []).some(n => /loose pieces/.test(n)), `${holds.slug} survives the cut and should not be warned about`)
  // every design carries a measured count, not a default
  assert.ok(libraryPatterns.every(p => Number.isInteger(p.cutAs) && Number.isInteger(p.cutInv)))
  assert.ok(libraryPatterns.filter(p => p.cutAs > 1).length > 100, 'most designs do sever a closed box as drawn')
})

test('dropping colour layers shortens the repeat where the source says it should', () => {
  // seven designs are bands stacked up the box: with fewer bands the box is shorter
  const p = libraryPattern('waves-1')!
  assert.ok(p.vHeight > 0 && p.layers.length === 4)
  const full = tileAt(p.slug, 50, { layers: 4 }), half = tileAt(p.slug, 50, { layers: 2 })
  assert.equal(+full.height.toFixed(3), +(sourceHeight(p, 4) * (50 / p.w)).toFixed(3))
  assert.ok(half.height < full.height * 0.6, `${half.height} should be about half of ${full.height}`)
  // a design with no vHeight keeps its box whatever is drawn on it
  const flat = libraryPatterns.find(q => q.vHeight === 0 && q.layers.length > 1)!
  assert.equal(tileAt(flat.slug, 50, { layers: 1 }).height, tileAt(flat.slug, 50, { layers: flat.layers.length }).height)
})

test('spacing grows the box and centres the design in it', () => {
  const plain = tileAt('hexagon-1', 40)
  const spaced = tileAt('hexagon-1', 40, { spacingX: 10, spacingY: 6 })
  assert.equal(spaced.width, plain.width + 10)
  assert.equal(spaced.height, plain.height + 6)
})

test('a design is judged on both orientations, not just the one it is drawn in', () => {
  // The first sweep measured invert:false only and reported it as the design's
  // property. brick-wall-1 and its filled twin are the same wall drawn inside
  // out, and they gave opposite answers, which is what exposed it.
  const stroked = libraryPattern('brick-wall-1')!, filled = libraryPattern('brick-wall-2')!
  assert.deepEqual([stroked.cutAs, stroked.cutInv], [30, 1], 'the mortar lines cut the wall into bands; inverted the web holds')
  assert.deepEqual([filled.cutAs, filled.cutInv], [1, 58], 'and the filled twin does the exact opposite')

  const onlyInverted = libraryPatterns.filter(p => p.cutAs !== 1 && p.cutInv === 1)
  assert.ok(onlyInverted.length > 50, `${onlyInverted.length} designs survive a through-cut only inverted`)
  // usable, so they must not carry the note that tells you to give up on cutting
  for (const p of onlyInverted) {
    assert.ok(!(tileAt(p.slug, 50).notes ?? []).some(n => /loose pieces/.test(n)), `${p.slug} holds inverted and should not be condemned`)
  }
})

test('a design that produces nothing at 50 mm says so instead of passing as whole', () => {
  // merge-cuts.py defaulted a skipped design to one piece, so four designs whose
  // tile came out empty were recorded as surviving a through-cut.
  // A zero is recorded per orientation, not for the design as a whole: every
  // one of these still draws something the other way round.
  // straight-lines used to be a fifth. Its zero was the box again, not the
  // drawing: an 80 mm-tall repeat laid nothing on a 44 mm wall. It cuts a wall
  // into 17 bands, and is warned about for that instead.
  const empty = libraryPatterns.filter(p => p.cutAs === 0 || p.cutInv === 0)
  assert.equal(empty.length, 4, empty.map(p => p.slug).join(', '))
  assert.ok(empty.every(p => p.cutAs !== 0 || p.cutInv !== 0), 'none is empty both ways')
  for (const p of empty) {
    // an empty side is never 1, so none of these can be mistaken for surviving
    assert.notEqual(Math.min(p.cutAs, p.cutInv), 1, `${p.slug} must not read as whole`)
    if (p.cutAs !== 1 && p.cutInv !== 1) {
      assert.match((tileAt(p.slug, 50).notes ?? []).join(' '), /nothing the printer can lay down/, p.slug)
    }
  }
})

test('whole or in pieces is a property of the tiling, not of the box it was measured on', () => {
  // Greek Key wraps every repeat in a closed frame, so a through-cut drops the
  // middle of each copy out. It was recorded as whole because the only fixture
  // measured was a 50 mm box: its walls are about 44 mm between the margins, no
  // 54.8 mm repeat ever fitted, and the margin held in what the frame cut loose.
  // Cut on that same box at a 15 mm repeat it falls into 25 pieces.
  for (const slug of ['greek-key', 'brick-wall-1', 'brick-wall-2', 'triangles-1']) {
    const p = libraryPattern(slug)!
    for (const invert of [false, true]) {
      const g = generateTile(m, { def: { name: slug, generatorId: 'library', invert, seamless: true, params: { ...base, pattern: slug, width: 50, ribWidth: 1.2, layers: p.layers.length } }, lineWidth: 0.42 })
      assert.equal(ringParts(m, g.polygons, g.tile!.width, g.tile!.height), invert ? p.cutInv : p.cutAs,
        `${slug}${invert ? ' inverted' : ''}: the recorded count must be what the tiling gives today`)
    }
  }
  const greek = libraryPattern('greek-key')!
  assert.ok(greek.cutAs !== 1 && greek.cutInv !== 1, 'a closed frame around every repeat cannot survive a through-cut')
  assert.match((tileAt('greek-key', 50).notes ?? []).join(' '), /Neither orientation survives/)
})

test('a neighbouring copy of a rib is drawn only where it brings something new', () => {
  // waves-1 is drawn 220 units wide inside a 120-wide repeat, and that overflow is
  // a lead-in rather than the continuation: over the overlap it drifts 1.45 units,
  // 0.6 mm at a 50 mm repeat, against a 2.7 mm rib. Drawing the neighbour copy
  // anyway unions the two into a rib that steps wider and back twice per crest --
  // small, but visible on the print and in the cut.
  const waves = libraryPattern('waves-1')!
  const opts = { widthMm: 50, ribWidth: 1.2, layers: waves.layers.length, spacingX: 0, spacingY: 0 }
  const tile = buildLibraryTile(waves, opts)
  assert.equal(tile.curves!.length, waves.layers.length, 'one rib per drawn path, with nothing retraced on top of it')

  // and the rib holds one width: no point of the finished outline is further from
  // its own centreline than half a rib
  const g = generateTile(m, {
    def: { name: 'waves-1', generatorId: 'library', invert: false, seamless: true, params: { ...base, pattern: 'waves-1', width: 50, ribWidth: 1.2, layers: waves.layers.length } },
    lineWidth: 0.42,
  })
  const segs: [Pt, Pt][] = []
  for (const c of tile.curves!) for (let i = 0; i + 1 < c.points.length; i++) segs.push([c.points[i], c.points[i + 1]])
  const near = ([px, py]: Pt) => {
    let best = Infinity
    for (const [[ax, ay], [bx, by]] of segs) {
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
      const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0
      best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy))
    }
    return best
  }
  let worst = 0
  for (const poly of g.polygons as Pt[][]) for (const pt of poly) worst = Math.max(worst, near(pt))
  assert.ok(worst <= 0.66, `the rib reaches ${worst.toFixed(3)} mm from its centreline, against a 0.6 mm half-rib`)

  // a design whose overflow really is the continuation still gets its copies, or
  // every rib that crosses the repeat edge would stop dead there
  const hex = libraryPattern('hexagon-1')!
  const hexTile = buildLibraryTile(hex, { ...opts, layers: hex.layers.length })
  assert.ok(hexTile.curves!.length > hex.layers.length, `hexagon-1 draws ${hexTile.curves!.length} ribs from ${hex.layers.length} paths`)
})
