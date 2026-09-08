import type { ParamValue, Pt, Tile } from './types'
import { generatorById, defaultParams, isSeamless } from './index'

/** Everything needed to regenerate a tile. */
export interface TileDef {
  name: string
  generatorId: string          // 'svg' for imported artwork
  params: Record<string, ParamValue>
  /** for imported SVGs: the raw tile since it cannot be regenerated */
  svgTile?: Tile
  svgSubtract?: Pt[][]
  invert: boolean
  /** Connect kept material across both repeat directions using rib-width bridges. */
  connectMaterial?: boolean
  /** kaleidoscope: reflect the tile into a 2 x 2 arrangement so any pattern repeats seamlessly */
  mirror?: boolean
  /** lock every setting that would break seamless repetition (default on) */
  seamless?: boolean
}

/** A tile definition with the Seamless lock applied. */
export interface ResolvedDef {
  /** generator parameters with defaults filled in and locked values forced */
  params: Record<string, ParamValue>
  mirror: boolean
  /** parameter keys held at their seamless value */
  lockedParams: Set<string>
  /** mirror is on because nothing else makes this pattern seamless */
  mirrorForced: boolean
}

export function resolveDef(def: TileDef): ResolvedDef {
  const gen = def.generatorId === 'svg' ? undefined : generatorById(def.generatorId)
  const params: Record<string, ParamValue> = gen ? { ...defaultParams(gen), ...def.params } : { ...def.params }
  const lockedParams = new Set<string>()
  let mirror = Boolean(def.mirror)
  let mirrorForced = false
  if (def.seamless !== false) {
    if (gen) {
      for (const p of gen.params) {
        if (p.seamlessValue === undefined) continue
        params[p.key] = p.seamlessValue
        lockedParams.add(p.key)
      }
    }
    const inherentlySeamless = gen ? isSeamless(gen, params) : false // imported SVGs are not
    if (!inherentlySeamless) { mirror = true; mirrorForced = true }
  }
  return { params, mirror, lockedParams, mirrorForced }
}
