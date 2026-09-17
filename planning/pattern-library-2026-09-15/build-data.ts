// Build src/patterns/library/data.json from the pattern.monster source dump.
//
//   node --import ./tests/register.mjs planning/pattern-library-2026-09-15/build-data.ts
//
// Overlapping subpaths inside one colour layer are resolved here at build time,
// because the source fills them with the nonzero rule and a Tile's polygons are
// filled even-odd, which would void the overlaps instead of keeping them.
//
// The measured fields are filled in afterwards: clipLoss and ribBreak by
// measure-seams.ts, ringParts by sweep-cut.ts + merge-cuts.py, both of which run
// the designs through this app's own pipeline.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import Module from 'manifold-3d'
import type { LibraryPattern } from '../../src/patterns/library/tile.ts'
import { flattenPath } from '../../src/patterns/svg/pathFlatten.ts'
import type { Pt } from '../../src/patterns/types.ts'

const m = await Module(); m.setup()
const here = new URL('./', import.meta.url)
const outDir = new URL('../../src/patterns/library/', import.meta.url)

interface Source { title: string; slug: string; mode: string; width: number; height: number; vHeight: number; tags: string[]; path: string; maxStroke: number }
const source: Source[] = JSON.parse(readFileSync(new URL('patterns.json', here), 'utf8'))

const dAttributes = (layer: string) => [...layer.matchAll(/\bd\s*=\s*(?:'([^']*)'|"([^"]*)")/g)].map(mm => mm[1] ?? mm[2])

/** Rings of a layer as a single `d` string of straight segments. */
function ringsToPath(rings: Pt[][]): string {
  return rings.map(r => `M${r.map(([x, y]) => `${+x.toFixed(3)} ${+y.toFixed(3)}`).join('L')}Z`).join('')
}

/**
 * Does this layer's own subpaths overlap? Under the nonzero rule the source
 * uses, an overlap stays filled; under even-odd it becomes a hole. Where the
 * two disagree, the nonzero outline is baked in so the tile draws as designed.
 */
function resolveLayer(layer: string, tol: number): { d: string; rewritten: boolean } {
  const loops: Pt[][] = []
  for (const d of dAttributes(layer)) for (const sub of flattenPath(d, tol)) loops.push(sub.points)
  if (loops.length < 2) return { d: dAttributes(layer).join(''), rewritten: false }
  const nonZero = new m.CrossSection(loops, 'NonZero')
  const evenOdd = new m.CrossSection(loops, 'EvenOdd')
  const a = nonZero.area(), b = evenOdd.area()
  const differs = Math.abs(a - b) > Math.max(1e-9, a * 0.002)
  const out = differs ? ringsToPath(nonZero.toPolygons() as Pt[][]) : dAttributes(layer).join('')
  nonZero.delete(); evenOdd.delete()
  return { d: out, rewritten: differs }
}

const patterns: LibraryPattern[] = []
const rewritten: string[] = []
for (const s of source) {
  const mode = (s.mode === 'fill' ? 'fill' : s.mode === 'stroke-join' ? 'stroke-join' : 'stroke') as LibraryPattern['mode']
  const tol = Math.min(s.width, s.height) / 4000
  const layers: string[] = []
  for (const layer of s.path.split('~')) {
    const r = mode === 'fill' ? resolveLayer(layer, tol) : { d: dAttributes(layer).join(''), rewritten: false }
    if (r.rewritten) rewritten.push(`${s.slug}#${layers.length}`)
    layers.push(r.d)
  }
  const p: LibraryPattern = {
    slug: s.slug, title: s.title, mode, w: s.width, h: s.height, vHeight: s.vHeight,
    layers, tags: s.tags, maxStroke: s.maxStroke, clipLoss: 0, clipLossPct: 0, ribBreak: 0, ringParts: 1,
  }
  patterns.push(p)
}

mkdirSync(outDir, { recursive: true })
writeFileSync(new URL('data.json', outDir), JSON.stringify(patterns))
writeFileSync(new URL('NOTICE.md', outDir), `# Pattern library

The ${patterns.length} designs in \`data.json\` come from pattern.monster, via
<https://github.com/catchspider2002/svelte-svg-patterns>, and are used under the
MIT licence reproduced below. Everything else in this directory is this project's
own work.

MIT License

Copyright (c) pattern.monster

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`)

const bytes = readFileSync(new URL('data.json', outDir)).length
console.log(`wrote ${patterns.length} patterns, ${(bytes / 1024).toFixed(0)} kB`)
console.log(`  layers rewritten for the nonzero fill rule: ${rewritten.length}${rewritten.length ? ` (${rewritten.slice(0, 12).join(', ')}${rewritten.length > 12 ? ', …' : ''})` : ''}`)
console.log('  now run measure-seams.ts to fill in the measured fields')
