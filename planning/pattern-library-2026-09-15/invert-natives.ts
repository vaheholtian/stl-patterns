// Every generator this app ships, cut through fixtures/box-50.stl both ways.
//
// The native generators declare `cutoutDefault` to say which orientation they
// are meant to be cut in. That is a claim in the source, not a measurement --
// nobody had ever cut them the other way and counted. Before locking a UI
// control to that flag, check it actually holds, and find any generator whose
// non-default orientation is fine (where a lock would only get in the way) or
// whose DEFAULT orientation is broken (which would be a real bug).
//
//   node --import ./tests/register.mjs planning/pattern-library-2026-09-15/invert-natives.ts
import { writeFileSync } from 'node:fs'
import { m, box } from '../../tests/physical-fixtures.ts'
import { flattenPieces } from '../../src/geom/regionFlatten.ts'
import { layoutTile, toolMitres } from '../../src/geom/layout.ts'
import { buildSurfaceTool, mitreTool, toolOffsetRange, type Polygon } from '../../src/geom/tileTool.ts'
import { thinConnectionParts, countMaterial, type ProbePiece } from '../../src/geom/thinConnection.ts'
import { generateTile } from '../../src/patterns/generate.ts'
import { generators, defaultParams } from '../../src/patterns/index.ts'

const LINE_WIDTH = 0.42, MIN_VOLUME = 5, WALL = 1.6, MARGIN = 3
const [zMin, zMax] = toolOffsetRange('cut', WALL, WALL)
const fixture = box(true)
const { pieces } = flattenPieces(fixture.mesh, fixture.region, fixture.origin, 30, true)

function cut(polygons: [number, number][][], tw: number, th: number) {
  const laid = pieces.map(piece => ({ piece, layout: layoutTile(m, piece, polygons, tw, th, { origin: piece.origin, scale: 1, rotationDeg: 0, margin: MARGIN, fitSeam: true, minScale: .5, normalRange: [zMin, zMax] }) }))
    .filter(l => l.layout.polygons.length)
  if (!laid.length) return null
  const probe: ProbePiece[] = laid.map(l => ({ param: l.layout.param, polygons: [...l.layout.polygons, ...l.layout.foldPolygons] as Polygon[], mitres: toolMitres(l.piece, l.layout) }))
  const tools = probe.map(p => mitreTool(m, buildSurfaceTool(m, p.param, p.polygons, zMin, zMax, 2), p.mitres, zMin, zMax))
  const tool = m.Manifold.union(tools)
  const cutRaw = fixture.body.subtract(tool)
  const solid = cutRaw.simplify(.005)
  const decomposed = solid.decompose()
  const parts = countMaterial(decomposed, MIN_VOLUME)
  const volume = +solid.volume().toFixed(0)
  let thin = parts
  try { thin = Math.max(parts, thinConnectionParts(m, fixture.body, probe, LINE_WIDTH, zMin, zMax, 2, MIN_VOLUME)) } catch { /* advisory */ }
  decomposed.forEach(p => p.delete()); solid.delete(); if (cutRaw !== solid) cutRaw.delete(); tool.delete(); tools.forEach(t => t.delete())
  return { parts, thin, volume }
}

// the library generator has its own per-design sweep; here it would only measure
// whichever design happens to be its default
const native = generators.filter(g => g.id !== 'library')
const rows: Record<string, unknown>[] = []

for (const [i, g] of native.entries()) {
  // the def the app itself builds when you pick this generator (PatternScreen.tsx)
  const dflt = Boolean(g.cutoutDefault)
  const connectMaterial = Boolean(g.cutoutDefault && !g.connectedRibs)
  const row: Record<string, unknown> = { id: g.id, name: g.name, cutoutDefault: dflt, connectedRibs: Boolean(g.connectedRibs) }
  for (const invert of [false, true]) {
    const def = { name: g.name, generatorId: g.id, invert, connectMaterial, seamless: true, mirror: false, params: defaultParams(g) }
    try {
      const t = generateTile(m, { def, lineWidth: LINE_WIDTH })
      if (!t.tile || !t.polygons.length) { row[invert ? 'inv' : 'plain'] = { skipped: 'tile is empty' }; continue }
      row[invert ? 'inv' : 'plain'] = cut(t.polygons as [number, number][][], t.tile.width, t.tile.height) ?? { skipped: 'nothing laid on the walls' }
    } catch (e) { row[invert ? 'inv' : 'plain'] = { error: (e as Error).message } }
  }
  rows.push(row)
  const a = row.plain as { thin?: number }, b = row.inv as { thin?: number }
  console.error(`  ${i + 1}/${native.length} ${g.id.padEnd(22)} default=${dflt ? 'invert' : 'plain '}  plain=${a?.thin ?? '-'} invert=${b?.thin ?? '-'}`)
}

writeFileSync(new URL('natives.json', import.meta.url), JSON.stringify(rows, null, 1))

console.log('\nid                     default   plain  invert   verdict')
for (const r of rows) {
  const a = (r.plain as { thin?: number }).thin
  const b = (r.inv as { thin?: number }).thin
  const chosen = r.cutoutDefault ? b : a
  const other = r.cutoutDefault ? a : b
  const verdict = chosen === 1 && other !== 1 ? 'flag is right: lock it'
    : chosen === 1 && other === 1 ? 'both orientations hold: no lock needed'
    : chosen !== 1 && other === 1 ? 'FLAG IS BACKWARDS'
    : 'neither orientation holds'
  console.log(`${String(r.id).padEnd(22)} ${(r.cutoutDefault ? 'invert' : 'plain').padEnd(8)} ${String(a ?? '-').padStart(5)} ${String(b ?? '-').padStart(7)}   ${verdict}`)
}
