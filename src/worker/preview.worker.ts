/// <reference lib="webworker" />
import { getManifold } from '../geom/manifold'
import { generateTile } from '../patterns/generate'
import { layoutTile } from '../geom/layout'
import type { PreviewRequest, PreviewResponse } from './preview-protocol'
const ctx = self as unknown as DedicatedWorkerGlobalScope
ctx.onmessage = async ({ data: req }: MessageEvent<PreviewRequest>) => {
  let initialized = false
  try {
    const m = await getManifold()
    initialized = true
    let result
    if (req.type === 'generate') result = generateTile(m, req.input)
    else {
      const { flat, polygons, width, height, settings } = req.input
      const { param: _param, ...layout } = layoutTile(m, flat, polygons, width, height, settings)
      result = layout
    }
    ctx.postMessage({ id: req.id, ok: true, result } satisfies PreviewResponse)
  } catch (e) {
    ctx.postMessage({ id: req.id, ok: false, error: e instanceof Error ? e.message : String(e), fatal: !initialized || e instanceof WebAssembly.RuntimeError } satisfies PreviewResponse)
  }
}
