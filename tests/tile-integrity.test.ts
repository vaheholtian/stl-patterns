// Four ways a tile could quietly produce an unprintable part, each checked
// against the geometry rather than against what the pipeline reports about itself.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { m, box, type Fixture } from './physical-fixtures.ts'
import { flattenPieces } from '../src/geom/regionFlatten.ts'
import { layoutTile, toolMitres } from '../src/geom/layout.ts'
import { buildSurfaceTool, mitreTool, toolOffsetRange, type Polygon } from '../src/geom/tileTool.ts'
import { thinConnectionParts, countMaterial, type ProbePiece } from '../src/geom/thinConnection.ts'
import { tileToCrossSection, strokePolyline } from '../src/patterns/pipeline.ts'
import { tilePeriodicity } from '../src/patterns/periodic.ts'
import { resolveDef } from '../src/patterns/definition.ts'
import { generateTile } from '../src/patterns/generate.ts'
import type { Pt, Tile } from '../src/patterns/types.ts'

const MIN_FEATURE = 0.84, MIN_VOLUME = 5, WALL = 1.6

/** Cut `tilePolygons` through the fixture's walls as the app does, and count the parts both ways. */
function cutAndCount(f: Fixture, tilePolygons: Pt[][], tw: number, th: number) {
  const [zMin, zMax] = toolOffsetRange('cut', WALL, WALL)
  const { pieces } = flattenPieces(f.mesh, f.region, f.origin, 30, true)
  const laid = pieces.map(piece => ({ piece, layout: layoutTile(m, piece, tilePolygons, tw, th, { origin: piece.origin, scale: 1, rotationDeg: 0, margin: 3, fitSeam: true, minScale: .5, normalRange: [zMin, zMax] }) }))
    .filter(l => l.layout.polygons.length)
  const probe: ProbePiece[] = laid.map(l => ({ param: l.layout.param, polygons: [...l.layout.polygons, ...l.layout.foldPolygons] as Polygon[], mitres: toolMitres(l.piece, l.layout) }))
  const tools = probe.map(p => mitreTool(m, buildSurfaceTool(m, p.param, p.polygons, zMin, zMax, 2), p.mitres, zMin, zMax))
  const tool = m.Manifold.union(tools)
  const cutRaw = f.body.subtract(tool)
  const solid = cutRaw.simplify(.005)
  const decomposed = solid.decompose()
  const parts = countMaterial(decomposed, MIN_VOLUME)
  const thin = thinConnectionParts(m, f.body, probe, MIN_FEATURE / 2, zMin, zMax, 2, MIN_VOLUME)
  decomposed.forEach(p => p.delete()); solid.delete(); if (cutRaw !== solid) cutRaw.delete(); tool.delete(); tools.forEach(t => t.delete())
  return { parts, thin }
}

test('a cut held together by sub-nozzle ribbons is not reported as one part', () => {
  const f = box(true)
  // bands whose ends stop 0.005 mm short of the repeat box: consecutive copies
  // leave a 0.01 mm ligature of uncut wall, far under any nozzle.
  const e = 0.005, band: Pt[][] = [[[e, 2], [50 - e, 2], [50 - e, 8], [e, 8]]]
  const { parts, thin } = cutAndCount(f, band, 50, 10)
  assert.equal(parts, 1, 'decompose() counts the ligatures as connections, as it always has')
  assert.ok(thin > 1, `the thin-connection probe must see through them (got ${thin})`)
  f.body.delete()
})

test('a cut that stays connected through the rims is not condemned', () => {
  const f = box(true)
  // vertical slits: each wall is sliced top to bottom, but the box's rims are
  // outside the margin and hold every strip together. A per-face 2D check would
  // call this fragmented; it is one solid and must be reported as one.
  const slit: Pt[][] = [[[4, -100], [8, -100], [8, 100], [4, 100]]]
  const { parts, thin } = cutAndCount(f, slit, 12, 200)
  assert.equal(parts, 1)
  assert.equal(thin, 1, 'the probe must not fire on material that genuinely connects')
  f.body.delete()
})

test('a tile whose features touch the repeat box keeps them without the periodic path', () => {
  // The pre-stitch simplifier used to move box-boundary vertices inward, so a
  // rib crossing the seam stopped a few microns short and consecutive copies
  // met across a gap no nozzle could bridge.
  const pts: Pt[] = []
  for (let i = -20; i <= 220; i++) { const x = (i / 200) * 50; pts.push([x, 10 + 4 * Math.sin((x / 50) * 2 * Math.PI)]) }
  const tile: Tile = { width: 50, height: 20, polygons: [], ribWidth: 1.2, curves: [{ points: pts, closed: false }] }
  for (const periodic of [false, true]) {
    const cs = tileToCrossSection(m, tile, { minFeature: MIN_FEATURE, periodic })
    const xs = (cs.toPolygons() as Pt[][]).flat().map(p => p[0])
    assert.ok(Math.min(...xs) < 1e-9, `periodic=${periodic}: left edge pulled in to ${Math.min(...xs)}`)
    assert.ok(Math.max(...xs) > 50 - 1e-9, `periodic=${periodic}: right edge pulled in to ${50 - Math.max(...xs)}`)
    cs.delete()
  }
})

test('an imported repeat is measured, not assumed unmirrorable', () => {
  const bar: Tile = { width: 40, height: 40, ribWidth: 1, polygons: [[[0, 15], [40, 15], [40, 25], [0, 25]]], curves: [] }
  const lopsided: Tile = { width: 40, height: 40, ribWidth: 1, polygons: [[[0, 15], [20, 15], [20, 25], [0, 25]]], curves: [] }
  const slanted: Tile = { width: 40, height: 40, ribWidth: 1, polygons: [[[0, 5], [40, 25], [40, 33], [0, 13]]], curves: [] }
  assert.deepEqual(tilePeriodicity(m, bar), { x: true, y: true })
  assert.deepEqual(tilePeriodicity(m, lopsided), { x: false, y: true })
  assert.deepEqual(tilePeriodicity(m, slanted), { x: false, y: true })
  const def = (t: Tile, svgSeamless?: boolean) => ({ name: 't', generatorId: 'svg', params: {}, invert: false, svgTile: t, svgSeamless })
  assert.equal(resolveDef(def(bar, true)).mirrorForced, false, 'artwork that lines up must survive Seamless unmirrored')
  assert.equal(resolveDef(def(lopsided, false)).mirrorForced, true, 'artwork that does not line up still needs the kaleidoscope')
  assert.equal(resolveDef(def(bar)).mirrorForced, true, 'a tile saved before this was measured keeps the old behaviour')
})

test('a tile with no size is refused instead of spinning forever', () => {
  const f = box(true)
  const { pieces } = flattenPieces(f.mesh, f.region, f.origin, 30, true)
  const base = { origin: pieces[0].origin, scale: 1, rotationDeg: 0, margin: 3, fitSeam: true, minScale: .5, normalRange: toolOffsetRange('cut', WALL, WALL) as [number, number] }
  // 0 x 0 makes the copy-grid bounds infinite; `j++` never advances from -Infinity
  assert.throws(() => layoutTile(m, pieces[0], [], 0, 0, base), /no size/)
  assert.throws(() => layoutTile(m, pieces[0], [], 50, NaN, base), /no size/)
  f.body.delete()
})

test('a recipe naming a pattern this build does not have says so', () => {
  const r = generateTile(m, { def: { name: 'x', generatorId: 'waves-1', params: {}, invert: false }, lineWidth: .42 })
  assert.equal(r.tile, null)
  assert.match(r.warnings.join(' '), /unknown pattern 'waves-1'/)
})

test('a stroke that doubles back keeps its width and does not erase what it crosses', () => {
  // SVG draws a single line as `M x y v h z`: out and straight back. The two
  // edge normals at each end cancel; strips built on their average twisted
  // into bowties, the line vanished, and its reversed lobe cut a notch in any
  // stroke it overlapped (circles-7 lost every crosshair and broke its rings).
  const area = (loops: Pt[][]) => { const cs = new m.CrossSection(loops, 'NonZero'); const a = cs.area(); cs.delete(); return a }
  const w = 1, len = 10, full = len * w + Math.PI * (w / 2) ** 2
  for (const closed of [true, false]) {
    const line = area(strokePolyline([[0, 0], [0, len], [0, 0]], closed, w))
    assert.ok(Math.abs(line - full) < 0.05 * full, `closed=${closed}: ${line.toFixed(3)} mm² of ~${full.toFixed(3)}`)
  }
  const ring: Pt[] = Array.from({ length: 64 }, (_, i) => [8 * Math.cos(i * Math.PI / 32), 8 * Math.sin(i * Math.PI / 32)] as Pt)
  const alone = area(strokePolyline(ring, true, w))
  const crossed = area([...strokePolyline(ring, true, w), ...strokePolyline([[0, 4], [0, 12], [0, 4]], true, w)])
  assert.ok(crossed > alone, `a line across the ring adds material (${crossed.toFixed(3)} vs ${alone.toFixed(3)}), never removes it`)
})
