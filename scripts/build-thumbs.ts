/**
 * Thumbnails for every native catalog variant, drawn from the same definition
 * that choosing the card applies (its defaults, on the orientation that survives
 * a through-cut), through the same pipeline as the preview.
 *
 *   node --import ./tests/register.mjs scripts/build-thumbs.ts [variantId ...]
 *
 * Writes src/patterns/thumbs/<variantId>.svg, which the browser imports as
 * inline markup. Library designs need none: their swatch is drawn live from
 * the path data already in the bundle.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Module from 'manifold-3d'
import { nativeVariants, defForVariant } from '../src/patterns/catalog.ts'
import { generateTile } from '../src/patterns/generate.ts'
import { thumbnailSvg, THUMB_WINDOW_MM } from '../src/patterns/thumbnail.ts'
import type { TileDef } from '../src/patterns/definition.ts'

/** the app's default nozzle line width, which sets the printable minimum feature */
const LINE_WIDTH = 0.42

const OUT = new URL('../src/patterns/thumbs/', import.meta.url)
mkdirSync(fileURLToPath(OUT), { recursive: true })

const m = await Module(); m.setup()
const only = new Set(process.argv.slice(2))
let failures = 0
for (const { entry, variant } of nativeVariants()) {
  if (only.size && !only.has(variant.id)) continue
  const def = { name: variant.label, invert: false, ...defForVariant(entry, variant) } as TileDef
  const t0 = Date.now()
  try {
    const { tile, polygons, warnings } = generateTile(m, { def, lineWidth: LINE_WIDTH })
    if (!tile) throw new Error(warnings.join('; '))
    // a motif larger than the window is shown whole rather than cropped
    const svg = thumbnailSvg(tile, polygons, Math.max(THUMB_WINDOW_MM, tile.width, tile.height), variant.id)
    writeFileSync(new URL(`${variant.id}.svg`, OUT), svg)
    console.log(`${variant.id.padEnd(20)} ${tile.width.toFixed(0)}x${tile.height.toFixed(0)} mm  ${polygons.length} shapes  ${(svg.length / 1024).toFixed(0)} KB  ${Date.now() - t0} ms`)
  } catch (e) {
    failures++
    console.error(`${variant.id}: ${(e as Error).message}`)
  }
}
if (failures) { console.error(`${failures} thumbnail(s) failed`); process.exit(1) }
