import assert from 'node:assert/strict'
import { test } from 'node:test'
import Module from 'manifold-3d'
import { generators, defaultParams, generatorById, isSeamless } from '../src/patterns/index.ts'
import { mirrorTile } from '../src/patterns/mirror.ts'
import { tileToCrossSection } from '../src/patterns/pipeline.ts'
import { seededRandom } from '../src/geom/random.ts'
import type { ParamValue, Pt, Tile } from '../src/patterns/types.ts'

const m = await Module(); m.setup()
const newGenerators = generators.filter((g) => g.cutoutDefault)
const generate = (id: string, params: Record<string, ParamValue> = {}, seed = 1) => {
  const g = generatorById(id)!
  return g.generate({ ...defaultParams(g), ...params }, { rand: seededRandom(seed) })
}
function count(cs: ReturnType<typeof m.CrossSection.square>): number {
  const parts = cs.decompose()
  try { return parts.length } finally { for (const p of parts) p.delete() }
}
function edgeIntervals(polys: Pt[][], axis: number, value: number): number[][] {
  const intervals: number[][] = []
  for (const poly of polys) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    if (Math.abs(a[axis] - value) < 1e-6 && Math.abs(b[axis] - value) < 1e-6) {
      const low = Math.min(a[1 - axis], b[1 - axis]), high = Math.max(a[1 - axis], b[1 - axis])
      if (high - low > 1e-5) intervals.push([low, high])
    }
  }
  return intervals.sort((a, b) => a[0] - b[0])
}
function checkMaterial(tile: Tile, invert = true, repeat = false) {
  const notes: string[] = []
  const cuts = tileToCrossSection(m, tile, { invert, connectMaterial: true, periodic: true, minFeature: 0.8, notes })
  const box = m.CrossSection.square([tile.width, tile.height], false)
  const kept = m.CrossSection.difference(box, cuts)
  try {
    assert.equal(count(kept), 1, notes.join('; '))
    assert.ok(cuts.area() > 0, 'Pattern must leave actual cutouts')
    assert.ok(notes.some((s) => s.includes('1 connected component')))
    if (repeat) {
      const copies = [kept, kept.translate([tile.width, 0]), kept.translate([0, tile.height]), kept.translate([tile.width, tile.height])]
      const grid = m.CrossSection.union(copies)
      assert.equal(count(grid), 1, '2 × 2 kept-material repeats must join')
      const solid = grid.extrude(2)
      assert.equal(solid.status(), 'NoError')
      const bodies = solid.decompose()
      assert.equal(bodies.length, 1, 'Extruded printed panel must be one body')
      bodies.forEach((b) => b.delete()); solid.delete(); grid.delete(); copies.slice(1).forEach((c) => c.delete())
    }
  } finally { kept.delete(); box.delete(); cuts.delete() }
}

for (const g of newGenerators) test(`${g.name}: default geometry, repeat connectivity and printable extrusion`, () => {
  const raw = generate(g.id)
  const tile = isSeamless(g) ? raw : mirrorTile(raw)
  assert.ok(tile.curves.length)
  assert.ok(tile.curves.every((c) => c.points.length > 1 && c.points.every((p) => p.every(Number.isFinite))))
  assert.deepEqual(raw, generate(g.id), 'A saved definition must regenerate identically')
  checkMaterial(tile, true, true)
})

for (const g of newGenerators) test(`${g.name}: final cut geometry matches opposite tile edges without a frame`, () => {
  const raw = generate(g.id), tile = isSeamless(g) ? raw : mirrorTile(raw)
  const cuts = tileToCrossSection(m, tile, { invert: true, periodic: true, connectMaterial: true, minFeature: 0.8 })
  try {
    const polys = cuts.toPolygons() as Pt[][]
    for (const axis of [0, 1]) {
      const a = edgeIntervals(polys, axis, 0), b = edgeIntervals(polys, axis, axis ? tile.height : tile.width)
      assert.ok(a.length > 0, 'Cutouts must cross the seam, rather than stopping at a frame')
      assert.equal(a.length, b.length, `axis ${axis}: interval count`)
      for (let i = 0; i < a.length; i++) for (let k = 0; k < 2; k++) assert.ok(Math.abs(a[i][k] - b[i][k]) < 0.0001, `axis ${axis}: ${a[i][k]} != ${b[i][k]}`)
    }
  } finally { cuts.delete() }
})

for (const id of ['lusona', 'unicursalMaze']) test(`${id}: periodic generators vary by seed and stay finite across grids`, () => {
  for (const seed of [0, 1, 7, 12345]) for (const [columns, rows] of [[2, 2], [3, 6], [8, 5], [24, 24]]) for (const mirrors of [0, 0.5, 1]) {
    const tile = generate(id, { columns, rows, mirrors, rounding: 0 }, seed)
    assert.ok(tile.curves.length > 1)
    assert.ok(tile.curves.every((c) => c.points.every((p) => p.every(Number.isFinite))))
  }
  assert.notDeepEqual(generate(id, {}, 1).curves, generate(id, {}, 7).curves, 'Seed must vary the artwork')
})

test('Periodic maze walls connect in a finite panel with a solid edge margin', () => {
  for (let seed = 0; seed < 10; seed++) {
    const tile = generate('unicursalMaze', { style: 'walls' }, seed)
    const ribs = tileToCrossSection(m, tile)
    const outer = m.CrossSection.square([tile.width + 2, tile.height + 2]).translate([-1, -1])
    const inner = m.CrossSection.square([tile.width - 0.2, tile.height - 0.2]).translate([0.1, 0.1])
    const rim = m.CrossSection.difference(outer, inner), panel = m.CrossSection.union([ribs, rim])
    assert.equal(count(panel), 1); panel.delete(); rim.delete(); inner.delete(); outer.delete(); ribs.delete()
    checkMaterial(tile)
  }
})

test('Hankin contact-angle range has no unmatched rays', () => {
  for (let angle = 25; angle <= 75; angle++) {
    const tile = generate('hankin', { angle, columns: 1, rows: 1 })
    assert.ok(tile.curves.length > 0, `angle ${angle}`)
  }
  for (const angle of [25, 45, 60, 75]) checkMaterial(generate('hankin', { angle }))
})

test('Ammann–Beenker period matches in both directions for each Pell order', () => {
  for (const order of [1, 2, 3]) for (const seed of [1, 7]) {
    const tile = generate('ammannBeenker', { order }, seed)
    const key = ([x, y]: Pt) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)}`
    const points = tile.curves.flatMap((c) => c.points), set = new Set(points.map(key))
    let checked = 0
    for (const [x, y] of points) {
      if (x >= -0.5 && x < 0.5 && y >= 0 && y <= tile.height) { assert.ok(set.has(key([x + tile.width, y]))); checked++ }
      if (y >= -0.5 && y < 0.5 && x >= 0 && x <= tile.width) { assert.ok(set.has(key([x, y + tile.height]))); checked++ }
    }
    assert.ok(checked > 0)
  }
})

test('Nested rings connect across repeat edges in both cut polarities', () => {
  const circles = [4, 9, 15].map((r) => ({ closed: true, points: Array.from({ length: 100 }, (_, i): Pt => [20 + r * Math.cos(i * Math.PI / 50), 20 + r * Math.sin(i * Math.PI / 50)]) }))
  const tile = { width: 40, height: 40, ribWidth: 1.6, polygons: [], curves: circles }
  for (const invert of [true, false]) checkMaterial(tile, invert, true)
})

for (const id of ['apollonian', 'julia', 'truchet']) test(`${id}: existing generator supports material repair`, () => {
  assert.ok(generatorById(id), `Expected registered generator ${id}`)
  checkMaterial(generate(id))
})

test('Single-stroke fractals stay inside the box at maximum order', () => {
  for (const id of ['gosper', 'arrowhead', 'terdragon']) {
    const tile = generate(id, { order: 99, width: 85, height: 37 })
    assert.equal(tile.curves.length, 1)
    assert.ok(tile.curves[0].points.length < 10000)
    for (const [x, y] of tile.curves[0].points) assert.ok(x > 0 && x < tile.width && y > 0 && y < tile.height)
  }
})

test('Self-crossing closed ribs leave their lobes hollow, in either traversal direction', () => {
  const points: Pt[] = [[5, 5], [35, 35], [5, 35], [35, 5]]
  for (const path of [points, points.slice().reverse()]) {
    const tile: Tile = { width: 40, height: 40, ribWidth: 1, polygons: [], curves: [{ points: path, closed: true }] }
    const ribs = tileToCrossSection(m, tile)
    const square = m.CrossSection.square([1, 1]), probe = square.translate([19.5, 9.5])
    const overlap = m.CrossSection.intersection(ribs, probe)
    assert.equal(overlap.area(), 0, 'Interior of a lobe must not be filled as material')
    assert.equal(count(ribs), 1, 'Crossing must fuse the ribs')
    overlap.delete(); probe.delete(); square.delete(); ribs.delete()
  }
})
