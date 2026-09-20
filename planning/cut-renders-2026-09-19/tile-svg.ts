/**
 * One library design's finished tile polygons, drawn as an SVG, 3x3 so the seam
 * shows. This is the shape the cut tool is built from -- not the source drawing --
 * so it is where a pipeline regression is visible.
 *
 *   node --import ./tests/register.mjs planning/cut-renders-2026-09-19/tile-svg.ts <slug> [width] [out.svg]
 */
import { writeFileSync } from 'node:fs'
import { m } from '../../tests/physical-fixtures.ts'
import { generateTile } from '../../src/patterns/generate.ts'
import { defaultParams } from '../../src/patterns/index.ts'
import { libraryGenerator, libraryPattern } from '../../src/patterns/library/index.ts'

const slug = process.argv[2] ?? 'waves-1'
const width = Number(process.argv[3]) || 50
const out = process.argv[4] ?? `exports/tile-${slug}-${width}.svg`
const p = libraryPattern(slug)
if (!p) throw new Error(`no such design: ${slug}`)

const def = {
  name: p.title, generatorId: 'library', invert: false, seamless: true,
  params: { ...defaultParams(libraryGenerator), pattern: slug, width, ribWidth: 1.2, layers: p.layers.length },
}
const g = generateTile(m, { def, lineWidth: 0.42 })
if (!g.tile) throw new Error('no tile')
const W = g.tile.width, H = g.tile.height
const d = (g.polygons as [number, number][][]).map(poly => 'M' + poly.map(q => `${q[0].toFixed(3)} ${q[1].toFixed(3)}`).join('L') + 'Z').join('')
const S = 3
let body = ''
for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) body += `<g transform="translate(${i * W} ${j * H})"><path d="${d}" fill="#1b2430" fill-rule="evenodd"/></g>`
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S * W * 8}" height="${S * H * 8}" viewBox="0 0 ${S * W} ${S * H}">` +
  `<rect width="100%" height="100%" fill="#fff"/>${body}` +
  `<g fill="none" stroke="#e11d48" stroke-width="0.15" opacity="0.7">` +
  Array.from({ length: S + 1 }, (_, i) => `<path d="M${i * W} 0V${S * H}"/><path d="M0 ${i * H}H${S * W}"/>`).join('') +
  `</g></svg>`
writeFileSync(out, svg)
console.log(`${out}  tile ${W.toFixed(2)} x ${H.toFixed(2)} mm, ${g.polygons.length} polygons`)
