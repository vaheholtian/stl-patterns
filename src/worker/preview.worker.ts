/// <reference lib="webworker" />
import { getManifold } from '../geom/manifold'
import { generateTile } from '../patterns/generate'
import { layoutTile } from '../geom/layout'
import { analyzePieces } from '../patterns/loosePieces'
import type { PreviewRequest, PreviewResponse } from './preview-protocol'
const ctx = self as unknown as DedicatedWorkerGlobalScope
ctx.onmessage = async ({ data: req }: MessageEvent<PreviewRequest>) => {
  let initialized = false
  try {
    const m = await getManifold()
    initialized = true
    let result
    if (req.type === 'generate') result = generateTile(m, req.input)
    else if (req.type === 'pieces') {
      const { def, lineWidth: modelLineWidth, mode, scale = 1, polygons, width, height } = req.input
      // necks are judged on the model: a nozzle line in tile millimetres
      const lineWidth = modelLineWidth / (scale > 0 ? scale : 1)
      const current = analyzePieces(m, polygons, width, height, { lineWidth })
      const strict = analyzePieces(m, polygons, width, height, { lineWidth: lineWidth * 1.1 }).pieces
      const flipped = generateTile(m, { def: { ...def, invert: !def.invert }, lineWidth: modelLineWidth, mode, scale })
      const other = flipped.tile ? analyzePieces(m, flipped.polygons, flipped.tile.width, flipped.tile.height, { lineWidth }).pieces : 0
      result = { current, other: { pieces: other }, strict }
    } else {
      const { flat, polygons, width, height, settings } = req.input
      const { param: _param, ...layout } = layoutTile(m, flat, polygons, width, height, settings)
      result = layout
    }
    ctx.postMessage({ id: req.id, ok: true, result } satisfies PreviewResponse)
  } catch (e) {
    ctx.postMessage({ id: req.id, ok: false, error: e instanceof Error ? e.message : String(e), fatal: !initialized || e instanceof WebAssembly.RuntimeError } satisfies PreviewResponse)
  }
}
