/**
 * The same cut and the same eight views, for a generator this project wrote rather
 * than a library drawing.
 *
 *   node --import ./tests/register.mjs planning/cut-renders-2026-09-19/render-native.ts <generatorId> [more ids]
 *
 * A library design has one knob that sets its repeat, `width`, so the gallery's two
 * sizes are simply that knob at 50 and 25. A native generator has its own
 * parameters and no such knob, so each one says here how to reach those two repeat
 * sizes with the rest of its defaults left alone. Nothing is invented: the
 * variants below are the generator's own defaults with the one parameter that
 * controls the repeat moved, so what you see is what the picker gives.
 *
 * Rows go to `rows/rows-native-<id>.json` and carry `lost` themselves, because
 * fine-sweep.ts walks the library and these are not in it.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { generateTile } from '../../src/patterns/generate.ts'
import { defaultParams, generatorById } from '../../src/patterns/index.ts'
import { tileToCrossSection, polygonsArea } from '../../src/patterns/pipeline.ts'
import { NATIVE_CUT_PARTS } from '../../src/patterns/cutParts.ts'
import type { Pt } from '../../src/patterns/types.ts'
import { cutBox, shootCut, m, LINE_WIDTH, type Mode } from './cutbox.ts'

/**
 * How to make each generator repeat at 50 mm and at 25 mm, starting from its own
 * defaults.
 *
 * All but one of these take `width` and `height` in millimetres and fit the pattern
 * to them, so the fallback below sets both to the repeat and leaves everything else
 * alone -- and setting both matters: `width` on its own would leave a "50 mm
 * repeat" 60 mm tall. Feature counts (`columns`, `order`, `depth`) stay as they
 * are, so a smaller repeat means finer features, exactly as it does for a library
 * design. A generator that carries its repeat elsewhere says so here; one with
 * neither is skipped, because guessing at someone else's knob is how a render stops
 * being what the app gives.
 */
const REPEAT: Record<string, Record<50 | 25, Record<string, number>>> = {
  // cellSize is one repeat of the weave and the tile is `columns` of them, so five
  // cells of the default 10 mm is a 50 mm repeat and the same five at 5 mm is 25.
  caneWeave: {
    50: { cellSize: 10, columns: 5, rows: 5 },
    25: { cellSize: 5, columns: 5, rows: 5 },
  },
}

/** both cut modes for every generator: wrapped round the ring, and each face alone */
const MODES: Mode[] = ['wrap', 'faces']

mkdirSync(new URL('rows/', import.meta.url), { recursive: true })

for (const id of process.argv.slice(2)) {
  const gen = generatorById(id)
  if (!gen) { console.error(`no such generator: ${id}`); continue }
  const base = defaultParams(gen)
  const slug = `native-${id}`
  const cutParts = NATIVE_CUT_PARTS[id]
  const row: Record<string, unknown> = {
    slug, title: gen.name, mode: 'native', tags: ['this project', id], layers: 1, native: true,
    ...(cutParts ? { cutAs: cutParts[0], cutInv: cutParts[1] } : {}),
  }
  const t0 = Date.now()
  for (const width of [50, 25] as const) {
    const override = REPEAT[id]?.[width]
      ?? ('width' in base && 'height' in base ? { width, height: width } : 'width' in base ? { width } : null)
    if (!override) {
      for (const invert of [false, true]) for (const mode of MODES)
        row[`w${width}${invert ? 'i' : ''}${mode === 'faces' ? 'f' : ''}`] = { skipped: 'no repeat size to set on this generator' }
      continue
    }
    const params = { ...base, ...override }
    for (const invert of [false, true]) {
      const def = { name: gen.name, generatorId: id, invert, seamless: true, params }
      let g: ReturnType<typeof generateTile>
      try {
        g = generateTile(m, { def, lineWidth: LINE_WIDTH })
      } catch (e) {
        for (const mode of MODES) row[`w${width}${invert ? 'i' : ''}${mode === 'faces' ? 'f' : ''}`] = { error: (e as Error).message }
        continue
      }
      // the tile, and what the printability floor took from it, do not depend on
      // how it is then laid on the box -- so measure once and cut twice
      let lost = 0
      if (g.tile && g.polygons.length) {
        try {
          const cs = tileToCrossSection(m, g.tile, { minFeature: 0, periodic: true, invert })
          const raw = cs.area(); cs.delete()
          // two constructions of the same area differ in the last digit, so a floor
          // that took nothing must read as nothing rather than as a small negative
          lost = raw > 0 ? Math.max(0, +(1 - polygonsArea(g.polygons as Pt[][]) / raw).toFixed(4)) : 0
        } catch { /* advisory */ }
      }
      for (const mode of MODES) {
        const key = `w${width}${invert ? 'i' : ''}${mode === 'faces' ? 'f' : ''}`
        try {
          if (!g.tile || !g.polygons.length) { row[key] = { skipped: 'the tile comes out empty at this size' }; continue }
          const c = cutBox(g.polygons as [number, number][][], g.tile.width, g.tile.height, mode)
          if (!c) { row[key] = { skipped: 'nothing lands on the walls' }; continue }
          await shootCut(c, `${slug}-${key}`)
          row[key] = { parts: c.parts, thin: c.thin, volume: c.volume, lost, broken: c.parts > 1, tile: `${g.tile.width.toFixed(1)} x ${g.tile.height.toFixed(1)} mm` }
          console.error(`  ${key.padEnd(6)} ${JSON.stringify(row[key])}`)
        } catch (e) {
          row[key] = { error: (e as Error).message }
          console.error(`  ${key} FAILED: ${(e as Error).message}`)
        }
      }
    }
  }
  writeFileSync(new URL(`rows/rows-native-${id}.json`, import.meta.url), JSON.stringify([row], null, 1))
  console.log(`${gen.name} in ${((Date.now() - t0) / 1000).toFixed(0)} s`)
}
