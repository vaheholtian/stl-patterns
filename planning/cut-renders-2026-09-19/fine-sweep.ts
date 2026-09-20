/**
 * How much of each design the printability floor takes away, at each repeat size.
 *
 *   node --import ./tests/register.mjs planning/cut-renders-2026-09-19/fine-sweep.ts
 *
 * A box that comes back almost uncut has two quite different causes, and the
 * volume left cannot tell them apart: the design may simply be sparse -- plus-1 is
 * one plus sign of 1.2 mm lines per 50 mm, and removing 1.2% of the box is exactly
 * right -- or it may be far finer than the nozzle, in which case the pipeline's
 * opening erodes it to specks before the tool is ever built and the box is
 * untouched for the wrong reason.
 *
 * What separates them is not how much is cut but how much is *lost*: the tile's
 * area with the minimum-feature filter against its area without. Writes fine.json.
 */
import { writeFileSync } from 'node:fs'
import { m } from '../../tests/physical-fixtures.ts'
import { generateTile } from '../../src/patterns/generate.ts'
import { defaultParams } from '../../src/patterns/index.ts'
import { libraryGenerator, libraryPatterns } from '../../src/patterns/library/index.ts'
import { tileToCrossSection, polygonsArea } from '../../src/patterns/pipeline.ts'
import type { Pt } from '../../src/patterns/types.ts'

const LINE_WIDTH = 0.42
const SIZES = [50, 25]
const out: Record<string, Record<string, { raw: number; kept: number; lost: number }>> = {}

for (const p of libraryPatterns) {
  const row: Record<string, { raw: number; kept: number; lost: number }> = {}
  for (const width of SIZES) for (const invert of [false, true]) {
    const params = { ...defaultParams(libraryGenerator), pattern: p.slug, width, ribWidth: 1.2, layers: p.layers.length }
    const def = { name: p.title, generatorId: 'library', invert, seamless: true, params }
    try {
      const tile = libraryGenerator.generate(params, { rand: () => 0 })
      if (!tile) continue
      // the same construction the app uses, with and without the floor
      const cs = tileToCrossSection(m, tile, { minFeature: 0, periodic: true, invert })
      const raw = cs.area()
      cs.delete()
      const kept = polygonsArea((generateTile(m, { def, lineWidth: LINE_WIDTH }).polygons) as Pt[][])
      row[`w${width}${invert ? 'i' : ''}`] = { raw: +raw.toFixed(2), kept: +kept.toFixed(2), lost: raw > 0 ? +(1 - kept / raw).toFixed(4) : 0 }
    } catch { /* the render sweep records the failure; this is only the floor */ }
  }
  out[p.slug] = row
}
writeFileSync(new URL('fine.json', import.meta.url), JSON.stringify(out))

for (const size of ['w50', 'w25', 'w50i', 'w25i']) {
  const rows = Object.entries(out).map(([slug, r]) => ({ slug, ...r[size] })).filter(r => r.raw !== undefined)
  const gone = rows.filter(r => r.lost > 0.5).sort((a, b) => b.lost - a.lost)
  console.log(`\n${size.endsWith('i') ? 'inverted' : 'as drawn'} at a ${size.replace(/\D/g, '')} mm repeat, of ${rows.length}: ${gone.length} lose over half the design to the printability floor`)
  for (const r of gone.slice(0, 14)) console.log(`  ${r.slug.padEnd(24)} ${(r.lost * 100).toFixed(1)}% gone  (${r.raw} -> ${r.kept} mm²)`)
  console.log(`  over 90% gone: ${rows.filter(r => r.lost > 0.9).length}`)
}
