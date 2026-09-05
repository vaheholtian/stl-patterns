import { useEffect } from 'react'
import { useTileStore, resolveDef } from '../state/tileStore'
import { useStore } from '../state/store'
import { generatorById } from '../patterns'
import type { Pt, Tile } from '../patterns/types'
import { seededRandom } from '../geom/random'
import { getManifold } from '../geom/manifold'
import { tileToPolygons, polygonsArea } from '../patterns/pipeline'
import { mirrorTile, mirrorPolygons } from '../patterns/mirror'

/** Keeps the tile store's generated tile and pipeline output in sync with its definition. Mount once. */
export function useTileRegen() {
  const def = useTileStore((s) => s.def)
  const lineWidth = useStore((s) => s.lineWidth)
  useEffect(() => {
    let cancelled = false
    const h = setTimeout(async () => {
      try {
        const m = await getManifold()
        const gen = def.generatorId === 'svg' ? null : generatorById(def.generatorId)
        const resolved = resolveDef(def)
        let t: Tile | null = null
        let subtract: Pt[][] | undefined
        if (def.generatorId === 'svg') {
          t = def.svgTile ?? null
          subtract = def.svgSubtract
        } else if (gen) {
          const seed = Number(resolved.params.seed ?? 1)
          t = gen.generate(resolved.params, { rand: seededRandom(seed) })
        }
        if (cancelled) return
        if (!t) { useTileStore.getState().setResult(null, [], []); return }
        if (resolved.mirror) {
          if (subtract) subtract = mirrorPolygons(subtract, t.width, t.height)
          t = mirrorTile(t)
        }
        const w: string[] = [...(t.notes ?? [])]
        const polys = tileToPolygons(m, t, { invert: def.invert, subtract, minFeature: lineWidth * 2, connectMaterial: def.connectMaterial, periodic: def.seamless !== false || resolved.mirror, notes: w })
        const area = polygonsArea(polys), boxArea = t.width * t.height
        if (area < boxArea * 0.02) w.push('Feature covers under 2% of the tile; check invert or sizes.')
        if (area > boxArea * 0.98) w.push('Feature covers almost the whole tile; nothing would remain.')
        const pts = polys.reduce((a, p) => a + p.length, 0)
        if (pts > 20000) w.push(`Very detailed tile (${pts} points); operations will be slow.`)
        useTileStore.getState().setResult(t, polys, w)
      } catch (e) {
        if (!cancelled) useTileStore.getState().setResult(null, [], [`generation failed: ${(e as Error).message}`])
      }
    }, 120)
    return () => { cancelled = true; clearTimeout(h) }
  }, [def, lineWidth])
}
