// Every library design, and every native generator at its defaults, through
// ringParts(): the pieces a closed ring of wall falls into, as drawn and inverted.
// Replaces the fixtures/box-50.stl figures in invert-sweep.ts, which depended on
// how the repeat size compared with that box's wall height.
//
//   node --import ./tests/register.mjs planning/pattern-library-2026-09-15/ring-sweep.ts
import { writeFileSync } from 'node:fs'
import { m } from '../../tests/physical-fixtures.ts'
import { generateTile } from '../../src/patterns/generate.ts'
import { defaultParams, generators } from '../../src/patterns/index.ts'
import { libraryGenerator, libraryPatterns } from '../../src/patterns/library/index.ts'
import { ringParts } from '../../src/patterns/ringParts.ts'

const one = (generatorId: string, params: Record<string, unknown>, invert: boolean) => {
  const g = generateTile(m, { def: { name: generatorId, generatorId, invert, seamless: true, params } as never, lineWidth: 0.42 })
  if (!g.tile) return 0
  let out = 0
  for (const poly of g.polygons) for (const [x, y] of poly) out = Math.max(out, -x, -y, x - g.tile.width, y - g.tile.height)
  if (out > 1e-3) console.error(`  ${generatorId} ${params.pattern ?? ''}: polygons reach ${out.toFixed(3)} past the tile`)
  return ringParts(m, g.polygons, g.tile.width, g.tile.height)
}
const lib: Record<string, [number, number]> = {}
for (const p of libraryPatterns) {
  const params = { ...defaultParams(libraryGenerator), pattern: p.slug, width: 50, ribWidth: 1.2, layers: p.layers.length }
  lib[p.slug] = [one('library', params, false), one('library', params, true)]
}
const native: Record<string, [number, number]> = {}
for (const g of generators) if (g.id !== 'library') {
  try { native[g.id] = [one(g.id, defaultParams(g), false), one(g.id, defaultParams(g), true)] } catch (e) { console.error(`  ${g.id}: ${(e as Error).message}`) }
}
writeFileSync(new URL('ring.json', import.meta.url), JSON.stringify({ library: lib, native }, null, 1))
const whole = (r: Record<string, [number, number]>, i: number) => Object.values(r).filter(v => v[i] === 1).length
console.log(`library ${Object.keys(lib).length}: whole as drawn ${whole(lib, 0)}, inverted ${whole(lib, 1)}; neither ${Object.values(lib).filter(v => v[0] !== 1 && v[1] !== 1).length}`)
console.log(`native ${Object.keys(native).length}:`, JSON.stringify(native))
