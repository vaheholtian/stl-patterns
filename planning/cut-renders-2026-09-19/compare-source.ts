/**
 * Does the tile we build actually reproduce the drawing it came from?
 *
 *   node --import ./tests/register.mjs planning/cut-renders-2026-09-19/compare-source.ts <label>
 *
 * The source SVGs in C:\Code\Patterns draw each design as an SVG `<pattern>`, which
 * clips every copy to its own cell. That rendering is the answer: it is what the
 * design is supposed to look like tiled. So both sides are rasterised over the same
 * 600 x 400 field and compared as ink.
 *
 * The comparison is not expected to reach zero. The source joins and caps its
 * strokes mitre/butt where the pipeline rounds them, and the pipeline simplifies
 * to 0.01 mm. What the number is for is before-and-after: a change that makes the
 * tile less like its source shows up here as a rise.
 *
 * Run it once per build, with a label, and diff the two JSON files.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { m } from '../../tests/physical-fixtures.ts'
import { generateTile } from '../../src/patterns/generate.ts'
import { defaultParams } from '../../src/patterns/index.ts'
import { libraryPatterns, libraryGenerator } from '../../src/patterns/library/index.ts'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const SRC = 'C:/Code/Patterns'
const REPEAT = 50           // the tile is built at the size the app uses, then scaled back
const label = process.argv[2] ?? 'run'
mkdirSync(new URL('compare/', import.meta.url), { recursive: true })

/** ink mask of an SVG rendered over the source's own 600 x 400 field */
async function ink(svg: string): Promise<Uint8Array> {
  const { data, info } = await sharp(Buffer.from(svg)).resize(600, 400, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true })
  const out = new Uint8Array(info.width * info.height)
  // the sources draw in whatever colour they like, some of them pale, so ink is
  // anything that is not the white ground rather than anything dark
  for (let i = 0; i < out.length; i++) out[i] = data[i] < 235 ? 1 : 0
  return out
}

const rows: { slug: string; diff: number; ours: number; theirs: number }[] = []
for (const p of libraryPatterns) {
  const file = `${SRC}/${p.slug}.svg`
  if (!existsSync(file)) continue
  const k = REPEAT / p.w
  const def = {
    name: p.title, generatorId: 'library', invert: false, seamless: true,
    // the same stroke the source draws with, so only the shape is being compared
    params: { ...defaultParams(libraryGenerator), pattern: p.slug, width: REPEAT, ribWidth: Math.max(0.05, p.maxStroke * k), layers: p.layers.length },
  }
  let ourSvg: string
  try {
    const g = generateTile(m, { def, lineWidth: 0.42 })
    if (!g.tile || !g.polygons.length) continue
    const W = g.tile.width / k, H = g.tile.height / k      // back into the source's units
    const d = (g.polygons as [number, number][][])
      .map(poly => 'M' + poly.map(q => `${(q[0] / k).toFixed(3)} ${(H - q[1] / k).toFixed(3)}`).join('L') + 'Z').join('')
    ourSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">` +
      `<defs><pattern id="t" x="0" y="0" width="${W}" height="${H}" patternUnits="userSpaceOnUse">` +
      `<path d="${d}" fill="#000" fill-rule="evenodd"/></pattern></defs>` +
      `<rect width="100%" height="100%" fill="#fff"/><rect width="100%" height="100%" fill="url(#t)"/></svg>`
  } catch { continue }

  // Most of these files are stored with their paint stripped -- `stroke='none'
  // stroke-width='0'` -- because the site sets it from its own controls. Paint them
  // the way the site does, with the widest stroke it offers, which is the one the
  // tile was built with above.
  const paint = p.mode === 'fill'
    ? `fill='#000' stroke='none'`
    : `fill='none' stroke='#000' stroke-width='${p.maxStroke}'${p.mode === 'stroke-join' ? ` stroke-linecap='square'` : ''}`
  const theirSvg = readFileSync(file, 'utf8').replace(/<g[^>]*>/g, `<g ${paint}>`)

  const [a, b] = await Promise.all([ink(theirSvg), ink(ourSvg)])
  let both = 0, either = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i]) na++
    if (b[i]) nb++
    if (a[i] || b[i]) either++
    if (a[i] && b[i]) both++
  }
  rows.push({ slug: p.slug, diff: either ? +(1 - both / either).toFixed(4) : 0, ours: nb, theirs: na })
}

writeFileSync(new URL(`compare/${label}.json`, import.meta.url), JSON.stringify(rows, null, 1))
const sorted = [...rows].sort((x, y) => y.diff - x.diff)
const mean = rows.reduce((s, r) => s + r.diff, 0) / rows.length
console.log(`${rows.length} designs compared with their source drawing`)
console.log(`mean disagreement ${(mean * 100).toFixed(2)}%, median ${(sorted[Math.floor(rows.length / 2)].diff * 100).toFixed(2)}%`)
console.log('\nfurthest from the source:')
for (const r of sorted.slice(0, 15)) console.log(`  ${r.slug.padEnd(26)} ${(r.diff * 100).toFixed(1)}%  (ink ours ${r.ours}, theirs ${r.theirs})`)
