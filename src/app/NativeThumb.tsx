import { useEffect, useState } from 'react'

/**
 * Prebuilt thumbnails (scripts/build-thumbs.ts) as lazily loaded markup, one
 * small chunk per variant, kept for the session once seen. Inlined rather
 * than shown through <img>: see thumbnailSvg.
 */
const loaders = import.meta.glob('../patterns/thumbs/*.svg', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>
const cache = new Map<string, string>()

function load(variantId: string): Promise<string> {
  const hit = cache.get(variantId)
  if (hit !== undefined) return Promise.resolve(hit)
  const loader = loaders[`../patterns/thumbs/${variantId}.svg`]
  if (!loader) return Promise.resolve('')
  return loader().then((svg) => { cache.set(variantId, svg); return svg })
}

export function NativeThumb({ variantId, className = 'pb-thumb' }: { variantId: string; className?: string }) {
  const cached = cache.get(variantId)
  // only an id whose markup has not arrived yet needs the effect; it resolves asynchronously
  const [loaded, setLoaded] = useState<{ id: string; svg: string } | null>(null)
  useEffect(() => {
    if (cache.get(variantId) !== undefined) return
    let live = true
    load(variantId).then((svg) => { if (live) setLoaded({ id: variantId, svg }) })
    return () => { live = false }
  }, [variantId])
  const svg = cached ?? (loaded?.id === variantId ? loaded.svg : undefined)
  if (!svg) return <span className={`${className} pb-placeholder`}>{svg === '' ? 'no preview' : ''}</span>
  return <span className={className} dangerouslySetInnerHTML={{ __html: svg }} />
}
