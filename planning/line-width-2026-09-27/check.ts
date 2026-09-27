// Spot check: thicken a few fill designs and report area, mean line width, seam mismatch, pieces.
//   node --import ./tests/register.mjs planning/line-width-2026-09-27/check.ts
import { m } from '../../tests/physical-fixtures.ts'
import { generateTile } from '../../src/patterns/generate.ts'
import { defaultParams } from '../../src/patterns/index.ts'
import { libraryGenerator } from '../../src/patterns/library/index.ts'
import { polygonsArea } from '../../src/patterns/pipeline.ts'
import { analyzePieces } from '../../src/patterns/loosePieces.ts'
import { intervals, mismatch } from '../../tests/seam-helpers.ts'
import type { Pt } from '../../src/patterns/types.ts'

const base = defaultParams(libraryGenerator)
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : ['interlocked-hexagons-1', 'interlocked-hexagons-2', 'interlocked-hexagons-3']
for (const slug of slugs) for (const invert of [false, true]) for (const thicken of [-1, -0.4, 0, 0.4, 1, 2]) {
  const t0 = performance.now()
  const g = generateTile(m, { def: { name: slug, generatorId: 'library', invert, seamless: true, params: { ...base, pattern: slug, width: 50, thicken } }, lineWidth: 0.42 })
  const ms = performance.now() - t0
  const P = g.polygons as Pt[][], w = g.tile!.width, h = g.tile!.height
  const seam = Math.max(mismatch(intervals(P, 0, 0), intervals(P, 0, w)).max, mismatch(intervals(P, 1, 0), intervals(P, 1, h)).max)
  const pieces = analyzePieces(m, P, w, h, { lineWidth: 0.42 })
  console.log(`${slug.padEnd(24)} inv=${invert ? 1 : 0} thicken=${String(thicken).padStart(4)} cover=${(polygonsArea(P) / (w * h) * 100).toFixed(1).padStart(5)}% seam=${seam.toExponential(1)} pieces=${pieces.pieces} ${ms.toFixed(0)}ms ${g.warnings.filter((x) => !x.includes('colour layers')).join(' | ').slice(0, 140)}`)
}
