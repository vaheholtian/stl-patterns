/**
 * Every pattern-library design cut through `fixtures/box-50.stl`, the way the app
 * cuts it, and rendered so it can be looked at rather than counted.
 *
 *   node --import ./tests/register.mjs planning/cut-renders-2026-09-19/render-cut.ts <start> <count> [invert] [faces]
 *
 * The cut, the camera and the margins all live in `cutbox.ts`, shared with
 * `render-native.ts`, so every card in the gallery is the same photograph of the
 * same experiment. The wrapped cut is the one
 * `planning/pattern-library-2026-09-15/sweep-cut.ts` measures, so the picture and
 * that sweep's parts count describe the same body.
 *
 * Three axes, because each changes the answer:
 *
 *   repeat size  at 50 mm one copy of the design fills a wall, at 25 mm the wall
 *                shows the design as a pattern.
 *   orientation  which side of the drawing is material decides whether the cut
 *                severs the box, and the app has a checkbox for it: 77 of these
 *                designs survive a through-cut only inverted.
 *   cut mode     wrapped round the ring, or each face cut on its own.
 *
 * Manifold's WASM heap does not survive hundreds of box-sized booleans in one
 * process (see that sweep's note), so this runs in slices.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { generateTile } from '../../src/patterns/generate.ts'
import { defaultParams } from '../../src/patterns/index.ts'
import { libraryPatterns, libraryGenerator } from '../../src/patterns/library/index.ts'
import { cutBox, shootCut, m, LINE_WIDTH, type Mode } from './cutbox.ts'

const SIZES = [50, 25]
mkdirSync(new URL('rows/', import.meta.url), { recursive: true })

const from = Number(process.argv[2]) || 0
const count = Number(process.argv[3]) || libraryPatterns.length
const flags = process.argv.slice(4)
const INVERT = flags.includes('invert')
const MODE: Mode = flags.includes('faces') ? 'faces' : 'wrap'
/** w50 / w25, then `i` for inverted and `f` for per-face, in that order */
const SUFFIX = (INVERT ? 'i' : '') + (MODE === 'faces' ? 'f' : '')

const chosen = libraryPatterns.slice(from, from + count)
const rows: Record<string, unknown>[] = []
const t0 = Date.now()

for (const [i, p] of chosen.entries()) {
  const row: Record<string, unknown> = { slug: p.slug, title: p.title, mode: p.mode, tags: p.tags, layers: p.layers.length }
  for (const width of SIZES) {
    const key = `w${width}${SUFFIX}`
    const def = {
      name: p.title, generatorId: 'library', invert: INVERT, seamless: true,
      params: { ...defaultParams(libraryGenerator), pattern: p.slug, width, ribWidth: 1.2, layers: p.layers.length },
    }
    try {
      const g = generateTile(m, { def, lineWidth: LINE_WIDTH })
      if (!g.tile || !g.polygons.length) { row[key] = { skipped: 'the tile comes out empty at this size' }; continue }
      const c = cutBox(g.polygons as [number, number][][], g.tile.width, g.tile.height, MODE)
      if (!c) { row[key] = { skipped: 'nothing lands on the walls' }; continue }
      await shootCut(c, `${p.slug}-${key}`)
      row[key] = { parts: c.parts, thin: c.thin, volume: c.volume, broken: c.parts > 1 }
    } catch (e) {
      row[key] = { error: (e as Error).message }
    }
  }
  rows.push(row)
  console.error(`  ${from + i + 1} ${p.slug} (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
}

const name = `rows-${INVERT ? 'inv-' : ''}${MODE === 'faces' ? 'faces-' : ''}${from}.json`
writeFileSync(new URL(`rows/${name}`, import.meta.url), JSON.stringify(rows, null, 1))
console.log(`${rows.length} rendered ${MODE}${INVERT ? ' inverted' : ''} in ${((Date.now() - t0) / 60000).toFixed(1)} min -> ${name}`)
