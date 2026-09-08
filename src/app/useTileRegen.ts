import { useEffect, useState } from 'react'
import { useTileStore } from '../state/tileStore'
import { useStore } from '../state/store'
import { PreviewClient } from '../worker/preview-client'

/** Regenerate in a cancellable worker; only the latest definition may publish. */
export function useTileRegen() {
  const def = useTileStore((s) => s.def)
  const lineWidth = useStore((s) => s.lineWidth)
  const [client] = useState(() => new PreviewClient())
  useEffect(() => () => client.dispose(), [client])
  useEffect(() => {
    let cancelled = false
    useTileStore.getState().setResult(null, [], ['Generating pattern…'])
    const h = setTimeout(async () => {
      try {
        const result = await client.generate({ def, lineWidth })
        if (!cancelled) useTileStore.getState().setResult(result.tile, result.polygons, result.warnings)
      } catch (e) {
        if (!cancelled) useTileStore.getState().setResult(null, [], [`generation failed: ${(e as Error).message}`])
      }
    }, 120)
    return () => { cancelled = true; clearTimeout(h); client.cancel() }
  }, [def, lineWidth, client])
}
