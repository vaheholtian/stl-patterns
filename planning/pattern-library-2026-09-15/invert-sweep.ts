// Does inverting a design flip whether a through-cut severs the box?
//
// sweep-cut.ts only ever measured invert:false, so every "N pieces" figure it
// produced is one orientation's answer to a question the app lets you flip with
// a checkbox. brick-wall-1 severs the 50 mm box into 6 pieces as drawn and holds
// as one inverted; its filled twin does the opposite. That makes the one-sided
// number actively misleading, so measure both here.
//
//   node --import ./tests/register.mjs .../invert-sweep.ts <start> <count>
//
// Sliced for the same reason sweep-cut.ts is: Manifold's WASM heap does not
// survive many hundreds of box-sized booleans in one process.
import { m, box } from '../../tests/physical-fixtures.ts'
import { flattenPieces } from '../../src/geom/regionFlatten.ts'
import { layoutTile, toolMitres } from '../../src/geom/layout.ts'
import { buildSurfaceTool, mitreTool, toolOffsetRange, type Polygon } from '../../src/geom/tileTool.ts'
import { thinConnectionParts, countMaterial, type ProbePiece } from '../../src/geom/thinConnection.ts'
import { generateTile } from '../../src/patterns/generate.ts'
import { defaultParams } from '../../src/patterns/index.ts'
import { libraryGenerator, libraryPatterns } from '../../src/patterns/library/index.ts'
import { writeFileSync } from 'node:fs'

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

const from = Number(process.argv[2]) || 0
const count = Number(process.argv[3]) || libraryPatterns.length
const chosen = libraryPatterns.slice(from, from + count)
const rows: Record<string, unknown>[] = []
const t0 = Date.now()
for (const [i, p] of chosen.entries()) {
  const row: Record<string, unknown> = { slug: p.slug, title: p.title, mode: p.mode }
  for (const invert of [false, true]) {
    const def = { name: p.title, generatorId: 'library', invert, seamless: true,
      params: { ...defaultParams(libraryGenerator), pattern: p.slug, width: 50, ribWidth: 1.2, layers: p.layers.length } }
    try {
      const g = generateTile(m, { def, lineWidth: LINE_WIDTH })
      if (!g.tile || !g.polygons.length) { row[invert ? 'inv' : 'as'] = { skipped: 'tile is empty' }; continue }
      row[invert ? 'inv' : 'as'] = cut(g.polygons as [number, number][][], g.tile.width, g.tile.height) ?? { skipped: 'nothing laid on the walls' }
    } catch (e) { row[invert ? 'inv' : 'as'] = { error: (e as Error).message } }
  }
  rows.push(row)
  const a = row.as as { thin?: number }, b = row.inv as { thin?: number }
  console.error(`  ${from + i + 1}/${libraryPatterns.length} ${p.slug.padEnd(24)} as=${a?.thin ?? '-'} inv=${b?.thin ?? '-'}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
}
writeFileSync(new URL(`inv-${from}.json`, import.meta.url), JSON.stringify(rows, null, 1))
