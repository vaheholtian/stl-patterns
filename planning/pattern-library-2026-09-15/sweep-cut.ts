// Every library pattern cut through fixtures/box-50.stl, the way the app cuts
// it, at several repeat sizes. Writes cuts.json.
//
//   node --import ./tests/register.mjs planning/pattern-library-2026-09-15/sweep-cut.ts [firstN]
//
// This replaces the `nocut` flag, which was inferred from a 3x3 PNG of the tile.
// Here the answer is what the box actually does: how many separate pieces it
// falls into, counted both by decompose() and by the thin-connection probe that
// discounts ribbons no nozzle can lay down.
import { writeFileSync } from 'node:fs'
import { m, box } from '../../tests/physical-fixtures.ts'
import { flattenPieces } from '../../src/geom/regionFlatten.ts'
import { layoutTile, toolMitres } from '../../src/geom/layout.ts'
import { buildSurfaceTool, mitreTool, toolOffsetRange, type Polygon } from '../../src/geom/tileTool.ts'
import { thinConnectionParts, countMaterial, type ProbePiece } from '../../src/geom/thinConnection.ts'
import { generateTile } from '../../src/patterns/generate.ts'
import { defaultParams } from '../../src/patterns/index.ts'
import { libraryPatterns, libraryGenerator } from '../../src/patterns/library/index.ts'

const LINE_WIDTH = 0.42, MIN_VOLUME = 5, WALL = 1.6, MARGIN = 3
const SIZES = [25, 50]
const [zMin, zMax] = toolOffsetRange('cut', WALL, WALL)

const fixture = box(true)
// the flattening of the box's four walls does not depend on the pattern
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
  const volume = solid.volume()
  let thin = parts
  try { thin = Math.max(parts, thinConnectionParts(m, fixture.body, probe, LINE_WIDTH, zMin, zMax, 2, MIN_VOLUME)) } catch { /* advisory */ }
  decomposed.forEach(p => p.delete()); solid.delete(); if (cutRaw !== solid) cutRaw.delete(); tool.delete(); tools.forEach(t => t.delete())
  return { parts, thin, volume: +volume.toFixed(1) }
}

// Manifold's WASM heap does not survive hundreds of box-sized booleans in one
// process: past roughly 200 it corrupts and every later call fails with "null
// function or function signature mismatch". The app only ever cuts once, so
// this is a property of sweeping, not of the patterns -- run it in slices.
//   sweep-cut.ts <start> <count>   writes cuts-<start>.json
//   sweep-cut.ts                   all of them, in one process
const from = Number(process.argv[2]) || 0
const count = Number(process.argv[3]) || libraryPatterns.length
const chosen = libraryPatterns.slice(from, from + count)
const limit = chosen.length
const rows: Record<string, unknown>[] = []
const t0 = Date.now()
for (const [i, p] of chosen.entries()) {
  const row: Record<string, unknown> = { slug: p.slug, title: p.title, mode: p.mode, tags: p.tags }
  for (const width of SIZES) {
    const def = {
      name: p.title, generatorId: 'library', invert: false, seamless: true,
      params: { ...defaultParams(libraryGenerator), pattern: p.slug, width, ribWidth: 1.2, layers: p.layers.length },
    }
    try {
      const g = generateTile(m, { def, lineWidth: LINE_WIDTH })
      if (!g.tile || !g.polygons.length) { row[`w${width}`] = { skipped: 'tile is empty at this size' }; continue }
      row[`w${width}`] = cut(g.polygons as [number, number][][], g.tile.width, g.tile.height) ?? { skipped: 'nothing laid on the walls' }
    } catch (e) {
      row[`w${width}`] = { error: (e as Error).message }
    }
  }
  rows.push(row)
  console.error(`  ${i + 1}/${limit} ${p.slug} (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
}
writeFileSync(new URL(process.argv[2] ? `cuts-${from}.json` : 'cuts.json', import.meta.url), JSON.stringify(rows, null, 1))

console.log(`\n${rows.length} patterns cut through the 50 mm box in ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min\n`)
for (const width of SIZES) {
  const at = rows.map(r => r[`w${width}`] as { parts?: number; thin?: number; skipped?: string; error?: string })
  const done = at.filter(a => a.parts !== undefined)
  const whole = done.filter(a => a.thin === 1).length
  const fellApart = done.filter(a => (a.parts ?? 1) > 1).length
  const onlyThin = done.filter(a => a.parts === 1 && (a.thin ?? 1) > 1).length
  console.log(`at a ${width} mm repeat, of ${done.length} cut:`)
  console.log(`  ${whole} stay one printable piece`)
  console.log(`  ${fellApart} visibly fall apart`)
  console.log(`  ${onlyThin} look whole but hang on sub-nozzle ribbons (only the probe catches these)`)
  console.log(`  ${at.filter(a => a.skipped).length} skipped, ${at.filter(a => a.error).length} errored`)
}
