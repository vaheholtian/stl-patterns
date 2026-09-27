import type { ManifoldToplevel } from 'manifold-3d'
import { resolveDef, type TileDef } from './definition'
import { generatorById } from './index'
import type { Pt, Tile } from './types'
import { seededRandom } from '../geom/random'
import { mirrorTile, mirrorPolygons } from './mirror'
import { tileToPolygons, polygonsArea } from './pipeline'
import { analyzePieces, removeLoose } from './loosePieces'

export type ApplyMode = 'cut' | 'recess' | 'emboss'

/**
 * Narrowest opening kept in a through-cut or recess. There the feature is air:
 * a gap between printed parts, which the slicer keeps however narrow, and which
 * only ooze and squish close up, around a fifth of a millimetre.
 */
export const GAP_FLOOR = 0.2

/**
 * The narrowest feature worth keeping, in tile millimetres, and why. Embossed
 * features are printed plastic and need two extrusion lines; cut and recessed
 * ones are gaps. Both limits hold on the model, where the tile lands at `scale`.
 */
export function minFeatureFor(mode: ApplyMode, lineWidth: number, scale = 1): { size: number; why: string } {
  const k = scale > 0 ? scale : 1
  const [onModel, reason] = mode === 'emboss'
    ? [lineWidth * 2, 'two nozzle lines, the narrowest printable rib']
    : [GAP_FLOOR, 'the narrowest gap that stays open when printed']
  const at = k === 1 ? '' : `${onModel.toFixed(2)} mm on the model at ${Math.round(k * 100)}% scale: `
  return { size: onModel / k, why: at + reason }
}

export interface TileGenerationInput {
  def: TileDef
  lineWidth: number
  /** how the feature goes onto the model, which sets its minimum width; through-cut when omitted */
  mode?: ApplyMode
  /**
   * The layout scale: a tile millimetre is this many on the model. Printability
   * limits hold on the model, so they are divided by it here. 1 when omitted.
   */
  scale?: number
  /** Fit a single motif into these final dimensions, including any mirroring. */
  size?: { width: number; height: number }
}
/** What "Remove loose pieces" did to this tile. */
export interface DroppedReport {
  /** loose pieces per repeat before removal, crumbs included */
  pieces: number
  /** share of the material they made up, 0 to 1 */
  share: number
  /** true when they were most of the material, so nothing was removed */
  refused: boolean
}
export interface TileGenerationResult { tile: Tile | null; polygons: Pt[][]; warnings: string[]; dropped?: DroppedReport }

/** Above this share of the material, loose pieces are the pattern, not a flaw in it. */
export const DROP_LOOSE_LIMIT = 0.5

/** Shared generation semantics for the pattern preview and fitted surface motifs. */
export function generateTile(m: ManifoldToplevel, { def, lineWidth: modelLineWidth, size, mode = 'cut', scale = 1 }: TileGenerationInput): TileGenerationResult {
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
  const periodic = def.seamless !== false || resolved.mirror
  const min = minFeatureFor(mode, modelLineWidth, scale)
  // a nozzle line measured in tile millimetres, for the piece count's necks
  const lineWidth = modelLineWidth / (scale > 0 ? scale : 1)
  let polygons = tileToPolygons(m, tile, { invert: def.invert, subtract, minFeature: min.size, minFeatureWhy: min.why, connectMaterial: def.connectMaterial && !(gen?.connectedRibs && def.invert), periodic, notes: warnings })
  let dropped: DroppedReport | undefined
  if (def.dropLoose) {
    const report = analyzePieces(m, polygons, tile.width, tile.height, { lineWidth })
    if (report.loose.length) {
      const share = report.materialArea > 0 ? report.looseArea / report.materialArea : 1
      const refused = share > DROP_LOOSE_LIMIT
      if (!refused) polygons = removeLoose(m, tile, polygons, report.loose, { lineWidth, periodic })
      dropped = { pieces: report.loosePieces + report.crumbs, share, refused }
    }
  }
  const area = polygonsArea(polygons), boxArea = tile.width * tile.height
  if (area < boxArea * .02) warnings.push('Feature covers under 2% of the tile; check invert or sizes.')
  if (area > boxArea * .98) warnings.push('Feature covers almost the whole tile; nothing would remain.')
  const points = polygons.reduce((n, p) => n + p.length, 0)
  if (points > 20000) warnings.push(`Very detailed tile (${points} points); operations will be slow.`)
  return { tile, polygons, warnings, dropped }
}
