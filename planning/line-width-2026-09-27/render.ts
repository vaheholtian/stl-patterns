// Side-by-side SVG of a design at several Thicken values, 2x2 repeats each.
//   node --import ./tests/register.mjs planning/line-width-2026-09-27/render.ts interlocked-hexagons-3 0 0.6 1.5
import { writeFileSync } from 'node:fs'
import { m } from '../../tests/physical-fixtures.ts'
import { generateTile } from '../../src/patterns/generate.ts'
import { defaultParams } from '../../src/patterns/index.ts'
import { libraryGenerator } from '../../src/patterns/library/index.ts'
import type { Pt } from '../../src/patterns/types.ts'

const [slug, ...vals] = process.argv.slice(2)
const base = defaultParams(libraryGenerator)
let x0 = 0, body = '', H = 0
for (const v of vals.map(Number)) {
  const g = generateTile(m, { def: { name: slug, generatorId: 'library', invert: false, seamless: true, params: { ...base, pattern: slug, width: 30, thicken: v } }, lineWidth: 0.42 })
  const w = g.tile!.width, h = g.tile!.height
  H = Math.max(H, 2 * h)
  const d = (g.polygons as Pt[][]).map((p) => 'M' + p.map(([x, y]) => `${x.toFixed(3)},${(h - y).toFixed(3)}`).join('L') + 'Z').join('')
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) body += `<path transform="translate(${x0 + i * w},${j * h})" d="${d}" fill="#222" fill-rule="evenodd"/>`
  body += `<text x="${x0 + 1}" y="${2 * h + 4}" font-size="3">thicken ${v}</text>`
  x0 += 2 * w + 4
}
writeFileSync(new URL(`${slug}.svg`, import.meta.url), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${x0 + 2} ${H + 9}" width="${(x0 + 4) * 12}" height="${(H + 11) * 12}"><rect x="-2" y="-2" width="100%" height="100%" fill="#fff"/>${body}</svg>`)
