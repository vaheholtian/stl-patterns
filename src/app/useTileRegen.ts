import { useEffect, useState } from 'react'
import { useTileStore } from '../state/tileStore'
import { useStore } from '../state/store'
import { PreviewClient } from '../worker/preview-client'

/**
 * Regenerate in a cancellable worker; only the latest definition may publish.
 * The polygons land first, so the preview stays quick; the piece count follows
 * as a second request on the same worker, since it costs up to a second on a
 * detailed tile.
 */
export function useTileRegen() {
  const def = useTileStore((s) => s.def)
  const lineWidth = useStore((s) => s.lineWidth)
  const mode = useStore((s) => s.tileLayout.mode)
  const scale = useStore((s) => s.tileLayout.scale)
  const [client] = useState(() => new PreviewClient())
  useEffect(() => () => client.dispose(), [client])
  useEffect(() => {
    let cancelled = false
    useTileStore.getState().setResult(null, [], ['Generating pattern…'])
    const h = setTimeout(async () => {
      let result
      try {
        result = await client.generate({ def, lineWidth, mode, scale })
        if (cancelled) return
        useTileStore.getState().setResult(result.tile, result.polygons, result.warnings, result.dropped)
      } catch (e) {
        if (!cancelled) useTileStore.getState().setResult(null, [], [`generation failed: ${(e as Error).message}`])
        return
      }
      if (!result.tile) return
      try {
        const pieces = await client.pieces({ def, lineWidth, mode, scale, polygons: result.polygons, width: result.tile.width, height: result.tile.height })
        if (!cancelled) useTileStore.getState().setPieces(pieces)
      } catch {
        if (!cancelled) useTileStore.getState().setPieces('failed')
      }
    }, 120)
    return () => { cancelled = true; clearTimeout(h); client.cancel() }
  }, [def, lineWidth, mode, scale, client])
}
