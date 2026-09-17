// Every library pattern through the app's own tile pipeline, at the sizes a
// person would actually pick. Writes tiles.json.
//
//   node --import ./tests/register.mjs planning/pattern-library-2026-09-15/sweep-tiles.ts
//
// This is the measurement the tiering in final.json was missing: it is the app
// generating the tile, not a PNG of it.
import { writeFileSync } from 'node:fs'
import Module from 'manifold-3d'
import { libraryPatterns, libraryGenerator } from '../../src/patterns/library/index.ts'
import { generateTile } from '../../src/patterns/generate.ts'
import { defaultParams } from '../../src/patterns/index.ts'
import { polygonsArea } from '../../src/patterns/pipeline.ts'

const m = await Module(); m.setup()
const LINE_WIDTH = 0.42
const SIZES = [20, 35, 50, 80]

const rows: Record<string, unknown>[] = []
let failures = 0
const t0 = Date.now()
for (const p of libraryPatterns) {
  const row: Record<string, unknown> = { slug: p.slug, title: p.title, mode: p.mode, tags: p.tags, layers: p.layers.length, clipLossPct: p.clipLossPct, ribBreak: p.ribBreak }
  for (const width of SIZES) {
    const def = {
      name: p.title, generatorId: 'library', invert: false, seamless: true,
      params: { ...defaultParams(libraryGenerator), pattern: p.slug, width, ribWidth: 1.2, layers: p.layers.length },
    }
    try {
      const r = generateTile(m, { def, lineWidth: LINE_WIDTH })
      if (!r.tile) { row[`w${width}`] = { error: 'no tile' }; failures++; continue }
      const box = r.tile.width * r.tile.height
      const area = polygonsArea(r.polygons)
      row[`w${width}`] = {
        fill: +(area / box).toFixed(4),
        points: r.polygons.reduce((n, q) => n + q.length, 0),
        rings: r.polygons.length,
        // the pipeline's own printability complaints for this tile
        warnings: r.warnings.filter(w => !w.startsWith(p.title) && !w.startsWith('Dropping') && !w.startsWith('This design')),
      }
    } catch (e) {
      row[`w${width}`] = { error: (e as Error).message }
      failures++
    }
  }
  rows.push(row)
}
writeFileSync(new URL('tiles.json', import.meta.url), JSON.stringify(rows, null, 1))

console.log(`${rows.length} patterns x ${SIZES.length} sizes in ${((Date.now() - t0) / 1000).toFixed(0)} s, ${failures} failures\n`)

// what survives at each size: a tile that collapses to nothing, or fills the box
// solid, cannot make a part whatever the mode
for (const width of SIZES) {
  const at = rows.map(r => r[`w${width}`] as { fill?: number; error?: string; warnings?: string[] })
  const gone = at.filter(a => a.fill !== undefined && a.fill < 0.02).length
  const solid = at.filter(a => a.fill !== undefined && a.fill > 0.98).length
  const warned = at.filter(a => (a.warnings?.length ?? 0) > 0).length
  const errored = at.filter(a => a.error).length
  console.log(`  at ${String(width).padStart(3)} mm:  ${gone} collapse to nothing, ${solid} fill solid, ${warned} carry a pipeline warning, ${errored} error`)
}

const worstAt20 = rows.filter(r => { const a = r.w20 as { warnings?: string[] }; return (a.warnings?.length ?? 0) > 0 })
console.log(`\nfirst 25 of the ${worstAt20.length} that warn at a 20 mm repeat:`)
for (const r of worstAt20.slice(0, 25)) console.log(`  ${String(r.slug).padEnd(26)} ${((r.w20 as { warnings: string[] }).warnings).join(' | ')}`)
