/**
 * One design side by side with the drawing it came from, for looking at what a
 * number in compare-source.ts is actually complaining about.
 *
 *   node --import ./tests/register.mjs planning/cut-renders-2026-09-19/compare-one.ts <slug> [more slugs]
 *
 * Left: the source SVG, painted the way the site paints it. Right: our tile,
 * repeated over the same field. Writes exports/side-<slug>.png.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { m } from '../../tests/physical-fixtures.ts'
import { generateTile } from '../../src/patterns/generate.ts'
import { defaultParams } from '../../src/patterns/index.ts'
import { libraryGenerator, libraryPattern } from '../../src/patterns/library/index.ts'

const require = createRequire(import.meta.url)
const sharp = require('sharp')
const REPEAT = 50

for (const slug of process.argv.slice(2)) {
  const p = libraryPattern(slug)
  if (!p) { console.error(`no such design: ${slug}`); continue }
  const k = REPEAT / p.w
  const g = generateTile(m, {
    def: {
      name: p.title, generatorId: 'library', invert: false, seamless: true,
      params: { ...defaultParams(libraryGenerator), pattern: slug, width: REPEAT, ribWidth: Math.max(0.05, p.maxStroke * k), layers: p.layers.length },
    },
    lineWidth: 0.42,
  })
  if (!g.tile) { console.error(`${slug}: no tile`); continue }
  const W = g.tile.width / k, H = g.tile.height / k
  const d = (g.polygons as [number, number][][])
    .map(poly => 'M' + poly.map(q => `${(q[0] / k).toFixed(3)} ${(H - q[1] / k).toFixed(3)}`).join('L') + 'Z').join('')
  const ours = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">` +
    `<defs><pattern id="t" x="0" y="0" width="${W}" height="${H}" patternUnits="userSpaceOnUse">` +
    `<path d="${d}" fill="#000" fill-rule="evenodd"/></pattern></defs>` +
    `<rect width="100%" height="100%" fill="#fff"/><rect width="100%" height="100%" fill="url(#t)"/></svg>`
  const paint = p.mode === 'fill'
    ? `fill='#000' stroke='none'`
    : `fill='none' stroke='#000' stroke-width='${p.maxStroke}'${p.mode === 'stroke-join' ? ` stroke-linecap='square'` : ''}`
  const theirs = readFileSync(`C:/Code/Patterns/${slug}.svg`, 'utf8').replace(/<g[^>]*>/g, `<g ${paint}>`)

  const [a, b] = await Promise.all([theirs, ours].map(s => sharp(Buffer.from(s)).resize(600, 400, { fit: 'fill' }).png().toBuffer()))
  await sharp({ create: { width: 1220, height: 400, channels: 3, background: '#c9c7c2' } })
    .composite([{ input: a, left: 0, top: 0 }, { input: b, left: 620, top: 0 }])
    .png().toFile(`exports/side-${slug}.png`)
  console.log(`exports/side-${slug}.png   left: the source, right: our tile   (mode ${p.mode}, stroke ${p.maxStroke}, repeat ${p.w} x ${p.h})`)
}
