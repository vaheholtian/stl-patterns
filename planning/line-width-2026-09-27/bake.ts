// widths.json -> src/patterns/library/lines.json, the table the Thicken lines
// control reads. The drawn shapes count as the lines unless they clearly cover
// most of the tile: near half, as on a checkerboard, neither side is lines, and
// the drawn shapes are what the thumbnail shows in ink.
//   node --import ./tests/register.mjs planning/line-width-2026-09-27/bake.ts
import { readFileSync, writeFileSync } from 'node:fs'
const GAPS_ABOVE = 0.55
const rows = JSON.parse(readFileSync(new URL('widths.json', import.meta.url), 'utf8')) as { slug: string; cover: number; drawnMax: number; gapMax: number }[]
const out: Record<string, { gaps: boolean; line: number; space: number }> = {}
for (const r of rows) {
  const gaps = r.cover > GAPS_ABOVE
  out[r.slug] = { gaps, line: gaps ? r.gapMax : r.drawnMax, space: gaps ? r.drawnMax : r.gapMax }
}
writeFileSync(new URL('../../src/patterns/library/lines.json', import.meta.url), '{\n' + Object.entries(out).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n}\n')
console.log(`${rows.length} designs, ${Object.values(out).filter((v) => v.gaps).length} with gaps as lines`)
