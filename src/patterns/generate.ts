import type { ManifoldToplevel } from 'manifold-3d'
import { resolveDef, type TileDef } from './definition'
import { generatorById } from './index'
import type { Pt, Tile } from './types'
import { seededRandom } from '../geom/random'
import { mirrorTile, mirrorPolygons } from './mirror'
import { tileToPolygons, polygonsArea } from './pipeline'

export interface TileGenerationInput {
  def: TileDef
  lineWidth: number
  /** Fit a single motif into these final dimensions, including any mirroring. */
  size?: { width: number; height: number }
}
export interface TileGenerationResult { tile: Tile | null; polygons: Pt[][]; warnings: string[] }

/** Shared generation semantics for the pattern preview and fitted surface motifs. */
export function generateTile(m: ManifoldToplevel, { def, lineWidth, size }: TileGenerationInput): TileGenerationResult {
  const resolved = resolveDef(def), gen = def.generatorId === 'svg' ? undefined : generatorById(def.generatorId)
  const params = { ...resolved.params }
  const gw = size ? size.width / (resolved.mirror ? 2 : 1) : 0
  const gh = size ? size.height / (resolved.mirror ? 2 : 1) : 0
  if (size) { params.width = gw; params.height = gh }
  let tile: Tile | null = null, subtract = def.svgSubtract
  if (def.generatorId === 'svg') {
    tile = def.svgTile ?? null
    if (tile && size) {
      const src = tile, k = Math.min(gw / src.width, gh / src.height)
      const scale = (ps: Pt[][]) => ps.map(p => p.map(([x, y]) => [x * k + (gw - src.width * k) / 2, y * k + (gh - src.height * k) / 2] as Pt))
      tile = { width: gw, height: gh, ribWidth: src.ribWidth * k, polygons: scale(src.polygons), curves: src.curves.map(c => ({ ...c, points: scale([c.points])[0] })) }
      subtract = subtract ? scale(subtract) : undefined
    }
  } else if (gen) tile = gen.generate(params, { rand: seededRandom(Number(params.seed ?? 1)) })
  // A recipe naming a generator this build does not have produces nothing. Say so:
  // silence here surfaces much later as an empty layout or a zero-sized tile.
  if (!tile) {
    const why = def.generatorId === 'svg' ? 'the imported artwork is missing' : `unknown pattern '${def.generatorId}'`
    return { tile: null, polygons: [], warnings: [`No tile was generated: ${why}.`] }
  }
  if (resolved.mirror) {
    if (subtract) subtract = mirrorPolygons(subtract, tile.width, tile.height)
    tile = mirrorTile(tile)
  }
  const warnings = [...(tile.notes ?? [])]
  const polygons = tileToPolygons(m, tile, { invert: def.invert, subtract, minFeature: lineWidth * 2, connectMaterial: def.connectMaterial && !(gen?.connectedRibs && def.invert), periodic: def.seamless !== false || resolved.mirror, notes: warnings })
  const area = polygonsArea(polygons), boxArea = tile.width * tile.height
  if (area < boxArea * .02) warnings.push('Feature covers under 2% of the tile; check invert or sizes.')
  if (area > boxArea * .98) warnings.push('Feature covers almost the whole tile; nothing would remain.')
  const points = polygons.reduce((n, p) => n + p.length, 0)
  if (points > 20000) warnings.push(`Very detailed tile (${points} points); operations will be slow.`)
  return { tile, polygons, warnings }
}
