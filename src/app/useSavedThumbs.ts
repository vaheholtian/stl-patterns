import { useEffect, useState } from 'react'
import { PreviewClient } from '../worker/preview-client'
import { useStore } from '../state/store'
import type { SavedTile } from '../state/tileStore'
import { thumbnailSvg, THUMB_WINDOW_MM } from '../patterns/thumbnail'

/** id -> inline SVG markup, or '' when the design could not be drawn */
const cache = new Map<string, string>()

/**
 * Thumbnails for saved designs, drawn one at a time through a preview worker
 * of their own while the browser is open, and kept for the session. A saved
 * design never changes under its id, so a thumbnail never goes stale.
 */
export function useSavedThumbs(saved: SavedTile[], active: boolean): ReadonlyMap<string, string> {
  const [, bump] = useState(0)
  const lineWidth = useStore((s) => s.lineWidth)
  useEffect(() => {
    if (!active) return
    const todo = saved.filter((s) => !cache.has(s.id))
    if (!todo.length) return
    const client = new PreviewClient()
    let cancelled = false
    void (async () => {
      for (const s of todo) {
        if (cancelled) return
        const { id: _id, savedAt: _t, ...def } = s
        void _id; void _t
        try {
          const r = await client.generate({ def, lineWidth })
          if (cancelled) return
          cache.set(s.id, r.tile ? thumbnailSvg(r.tile, r.polygons, Math.max(THUMB_WINDOW_MM, r.tile.width, r.tile.height), 'saved-' + s.id) : '')
        } catch {
          if (cancelled) return
          cache.set(s.id, '')
        }
        bump((n) => n + 1)
      }
    })()
    return () => { cancelled = true; client.dispose() }
  }, [saved, active, lineWidth])
  return cache
}
