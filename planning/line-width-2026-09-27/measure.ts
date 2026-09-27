// Which side of each filled library design reads as its lines, and how wide
// those lines and the gaps between them are, as the app draws them at a 50 mm
// repeat with every layer. The thinner side is the lines: both sides share one
// outline, so mean width goes with area and the side covering less of the tile
// is the narrower one. Writes widths.json beside this file.
//   node --import ./tests/register.mjs planning/line-width-2026-09-27/measure.ts
import { writeFileSync } from 'node:fs'
import { m } from '../../tests/physical-fixtures.ts'
import { generateTile } from '../../src/patterns/generate.ts'
import { defaultParams } from '../../src/patterns/index.ts'
import { libraryGenerator, libraryPatterns } from '../../src/patterns/library/index.ts'
import type { CrossSection } from 'manifold-3d'
import type { Pt } from '../../src/patterns/types.ts'

const WIDTH = 50
const base = defaultParams(libraryGenerator)
const rows: { slug: string; cover: number; drawnMax: number; gapMax: number; ms: number }[] = []
const fills = libraryPatterns.filter((q) => q.mode === 'fill')
for (const [i, p] of fills.entries()) {
  const t0 = performance.now()
  const g = generateTile(m, { def: { name: p.slug, generatorId: 'library', invert: false, seamless: true, params: { ...base, pattern: p.slug, width: WIDTH } }, lineWidth: 0.42 })
  const w = g.tile!.width, h = g.tile!.height, halo = Math.min(w, h) / 4
  const box = m.CrossSection.square([w, h])
  const drawn = new m.CrossSection(g.polygons as Pt[][], 'EvenOdd')
  const cover = drawn.area() / (w * h)
  const near = m.CrossSection.square([w + 2 * halo, h + 2 * halo]).translate([-halo, -halo])
  const copies: CrossSection[] = []
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) { const c = drawn.translate([x * w, y * h]); copies.push(m.CrossSection.intersection(c, near)); c.delete() }
  const mat = m.CrossSection.union(copies)
  const gap = m.CrossSection.difference(near, mat)
  // widest point: twice the largest erosion that leaves anything in the box
  const widest = (cs: CrossSection) => {
    let lo = 0, hi = halo
    for (let k = 0; k < 11; k++) {
      const r = (lo + hi) / 2, e = cs.offset(-r, 'Square'), c = m.CrossSection.intersection(e, box)
      if (c.area() > 1e-6) lo = r; else hi = r
      e.delete(); c.delete()
    }
    return +(2 * lo).toFixed(2)
  }
  rows.push({ slug: p.slug, cover: +cover.toFixed(3), drawnMax: widest(mat), gapMax: widest(gap), ms: Math.round(performance.now() - t0) })
  for (const cs of [box, drawn, near, ...copies, mat, gap]) cs.delete()
  if (i % 20 === 0) console.log(i, p.slug, rows.at(-1))
}
writeFileSync(new URL('widths.json', import.meta.url), JSON.stringify(rows, null, 1))
for (const s of ['interlocked-hexagons-1', 'interlocked-hexagons-2', 'interlocked-hexagons-3']) console.log(rows.find((r) => r.slug === s))
const gapsAreLines = rows.filter((r) => r.cover > 0.5)
console.log(`${rows.length} filled designs; in ${gapsAreLines.length} the drawn shapes cover more than half, so the gaps are the lines`)
console.log('near half (0.4-0.6):', rows.filter((r) => r.cover > 0.4 && r.cover < 0.6).map((r) => `${r.slug} ${r.cover}`).join(', '))
const lines = rows.map((r) => (r.cover > 0.5 ? r.gapMax : r.drawnMax)).sort((a, b) => a - b)
const others = rows.map((r) => (r.cover > 0.5 ? r.drawnMax : r.gapMax)).sort((a, b) => a - b)
const q = (v: number[]) => [0, .1, .25, .5, .75, .9, 1].map((f) => v[Math.min(v.length - 1, Math.floor(f * v.length))]).join(' ')
console.log('widest line, mm  min/p10/q1/med/q3/p90/max:', q(lines))
console.log('widest space between lines, mm:', q(others))
console.log('slowest', rows.toSorted((a, b) => b.ms - a.ms).slice(0, 3).map((r) => `${r.slug} ${r.ms}ms`).join(', '))
