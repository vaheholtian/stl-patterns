// Lay a tile out over a flattened region: repeat, fit around seams, clip.
import type { ManifoldToplevel, CrossSection } from 'manifold-3d'
import type { Pt } from '../patterns/types'
import { Parameterization } from './parameterization'
import type { FlattenedRegion, FlattenedPiece } from './regionFlatten'
import { crossSectionToPolygons, strokePolyline } from '../patterns/pipeline'
import { mitreReach, mitreBendDeg, type Mitre } from './tileTool'

/** A flattening, optionally one piece of an unfolded sheet that shares its layout frame with the other pieces. */
export type Flat = FlattenedRegion & Partial<Pick<FlattenedPiece, 'frame' | 'foldVertices' | 'foldEdges' | 'mitres' | 'closure'>>

/**
 * The mitres a piece's tool is trimmed at: its folds, plus the sheet's closure
 * when this layout joined it (the tile repeats a whole number of times around
 * the ring, so the pattern meets itself there).
 */
export function toolMitres(flat: Flat, layout: Pick<LayoutResult, 'closureJoined'>): Mitre[] {
  return [...(flat.mitres ?? []), ...(layout.closureJoined && flat.closure ? [flat.closure.mitre] : [])]
}

/**
 * Farthest (mm) a tool is allowed to continue past a fold; beyond it the bend
 * is too sharp to mitre (an 0.8 mm emboss over a 170° bend already reaches 9 mm
 * and would raise a 9 mm fin along the edge).
 */
export const MAX_FOLD_REACH = 20

export interface LayoutSettings {
  origin: [number, number, number]
  rotationDeg: number
  /** 1 = true size */
  scale: number
  /** untouched band along the region boundary, mm */
  margin: number
  /** stretch the tile so it repeats a whole number of times around a seam */
  fitSeam: boolean
  /** leave the surface solid where the local tile size falls below this fraction of true size (0 = off) */
  minScale: number
  /** place one copy centred on the origin instead of repeating (the caller sizes the tile to the region) */
  single?: boolean
  /**
   * The tool's extent along the surface normal, mm (see toolOffsetRange). The
   * pattern is continued past each fold exactly as far as such a tool needs to
   * reach the neighbour's mitre plane; without it the pattern stops at the fold.
   */
  normalRange?: [number, number]
}

/** Size a single-copy tile should have to cover the flattened region. */
export function fittedTileSize(flat: Flat, settings: LayoutSettings): { width: number; height: number; period: number | null } {
  const { param, period } = buildParameterization(flat, settings)
  const b = param.bounds()
  const p = period ? Math.hypot(period[0], period[1]) : null
  // a ring wraps exactly once; otherwise cover the bounds symmetrically around the origin
  const width = p ?? 2 * Math.max(Math.abs(b.minX), Math.abs(b.maxX))
  const height = 2 * Math.max(Math.abs(b.minY), Math.abs(b.maxY))
  return { width: Math.max(width, 1), height: Math.max(height, 1), period: p }
}

export interface LayoutResult {
  param: Parameterization
  polygons: Pt[][]
  /** the pattern continued past the folds as far as the tool (settings.normalRange) must reach: for the tool only, not shown */
  foldPolygons: Pt[][]
  repeatsAround: number | null
  /** the tile is stretched by this much along x (or y, when the wrap runs that way) so whole repeats fit around the seam */
  stretch: number
  stretchY: number
  /** repeat box in the flattened space after stretch */
  tileWidth: number
  tileHeight: number
  /**
   * The sheet's ring closure (see FlattenedPiece.closure) was joined: the
   * pattern meets itself there, so the edge is patterned to the fold and the
   * tool is mitred at it. False when there is no closure, or the tile does not
   * repeat a whole number of times around the ring at this rotation.
   */
  closureJoined: boolean
  /** mm per uv-unit range across the region (1 = true size) */
  scaleMin: number
  scaleMax: number
  log: string[]
}

/** Build a recentred parameterization from a flattening result. */
export function buildParameterization(flat: Flat, settings: LayoutSettings): { param: Parameterization; period: [number, number] | null; baseRotation: number } {
  const sub = { positions: flat.positions, indices: flat.indices, normals: flat.normals, sourceTriangles: new Uint32Array(0) }
  const param = new Parameterization(sub, new Float32Array(flat.uv))
  const [x, y, z] = settings.origin
  // locate the origin's triangle in the flattened mesh
  const t = flat.originTriangle
  // a piece of an unfolded sheet recentres on the sheet's shared frame, which need
  // not lie on this piece at all; a lone flattening recentres on its own origin
  const frame = flat.frame
  if (frame) param.recenterAt(frame.u0, frame.v0, frame.scale, 0, 1)
  else param.recenter(t, x, y, z, 0, 1)
  let baseRotation = 0
  let period: [number, number] | null = null
  if (flat.period) {
    const p0 = param.transformVector(flat.period)
    baseRotation = (-Math.atan2(p0[1], p0[0]) * 180) / Math.PI
  }
  if (frame) param.recenterAt(0, 0, 1, baseRotation + settings.rotationDeg, settings.scale)
  else param.recenter(t, x, y, z, baseRotation + settings.rotationDeg, settings.scale)
  if (flat.period) period = param.transformVector(flat.period)
  return { param, period, baseRotation }
}

export function layoutTile(
  m: ManifoldToplevel,
  flat: Flat,
  tilePolygons: Pt[][],
  tileWidth: number,
  tileHeight: number,
  settings: LayoutSettings,
): LayoutResult {
  const log: string[] = []
  const { param, period } = buildParameterization(flat, settings)
  // seam fitting: the period is along +x after baseRotation when the user rotation is 0.
  // A period along the tile's x axis is fitted by stretching x, one along y by stretching y.
  let stretch = 1, stretchY = 1
  let repeats: number | null = null
  const len = period ? Math.hypot(period[0], period[1]) : 0
  const alongX = !!period && Math.abs(period[1]) < 1e-8 * len + 1e-6, alongY = !!period && Math.abs(period[0]) < 1e-8 * len + 1e-6
  if (settings.single) {
    // one copy, centred on the origin; the caller already sized the tile to the region
    const tw = tileWidth, th = tileHeight
    const copy = tilePolygons.map((p) => p.map(([x, y]) => [x - tw / 2, y - th / 2] as Pt))
    log.push('single copy centred on the origin')
    // it meets itself round a ring only when it is exactly the ring's circumference
    const closes = (alongX && Math.abs(tw - len) < 1e-3) || (alongY && Math.abs(th - len) < 1e-3)
    const eff = closing(flat, closes, log)
    return finish(m, param, eff, [copy], settings, log, null, 1, 1, tw, th, foldReaches(param, eff, settings), closes && !!flat.closure)
  }
  if (period && settings.fitSeam) {
    // buildParameterization already expresses this vector in placement coordinates.
    if (alongX) {
      repeats = Math.max(1, Math.round(len / tileWidth))
      stretch = len / (repeats * tileWidth)
      log.push(`${repeats} repeats around the seam, tile stretched ${((stretch - 1) * 100).toFixed(1)}%`)
    } else if (alongY) {
      repeats = Math.max(1, Math.round(len / tileHeight))
      stretchY = len / (repeats * tileHeight)
      log.push(`${repeats} repeats around the seam, tile stretched ${((stretchY - 1) * 100).toFixed(1)}% along its height`)
    } else {
      log.push('rotated tile: automatic seam fit unsupported at this angle (rotate to 0, 90, 180 or 270 degrees to fit the wrap)')
    }
  }
  const eff = closing(flat, repeats !== null, log)
  const tw = tileWidth * stretch, th = tileHeight * stretchY
  const b = param.bounds()
  // copies must also cover the strips continued past the folds
  const folds = foldReaches(param, eff, settings)
  const pad = folds.reduce((max, f) => Math.max(max, f.ext), 0)
  b.minX -= pad; b.minY -= pad; b.maxX += pad; b.maxY += pad
  const i0 = Math.floor(b.minX / tw) - 1, i1 = Math.ceil(b.maxX / tw) + 1
  const j0 = Math.floor(b.minY / th) - 1, j1 = Math.ceil(b.maxY / th) + 1
  const copyCount = (i1 - i0 + 1) * (j1 - j0 + 1)
  if (copyCount > 4000) throw new Error(`Tile is too small for this region (${copyCount} copies). Increase the tile size or scale.`)
  const stretched = tilePolygons.map((p) => p.map(([x, y]) => [x * stretch, y * stretchY] as Pt))
  const copies: Pt[][][] = []
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const ox = i * tw, oy = j * th
      // skip copies whose box is entirely outside the bounds
      if (ox + tw < b.minX || ox > b.maxX || oy + th < b.minY || oy > b.maxY) continue
      copies.push(stretched.map((p) => p.map(([x, y]) => [x + ox, y + oy] as Pt)))
    }
  }
  return finish(m, param, eff, copies, settings, log, repeats, stretch, stretchY, tw, th, folds, repeats !== null && !!flat.closure)
}

/**
 * The piece as the layout sees it once the sheet's ring closure is decided:
 * joined, the closing edge is one more fold (patterned to the edge, continued
 * past it for the tool, mitred); not joined, it stays a real edge with its
 * margin, and the log says why and what would close it.
 */
function closing(flat: Flat, fits: boolean, log: string[]): Flat {
  if (!flat.closure) return flat
  if (!fits) {
    log.push(`the ring's closing edge is left as a cut: the tile does not repeat a whole number of times around the ring at this rotation (rotate to 0, 90, 180 or 270 degrees and fit whole repeats around the seam to close it)`)
    return flat
  }
  log.push('the pattern meets itself round the ring: its closing edge is continuous')
  return { ...flat, foldEdges: [...(flat.foldEdges ?? []), ...flat.closure.edges], foldVertices: [...(flat.foldVertices ?? []), ...flat.closure.vertices], mitres: [...(flat.mitres ?? []), flat.closure.mitre] }
}

function finish(
  m: ManifoldToplevel,
  param: Parameterization,
  flat: Flat,
  copies: Pt[][][],
  settings: LayoutSettings,
  log: string[],
  repeats: number | null,
  stretch: number,
  stretchY: number,
  tw: number,
  th: number,
  folds: FoldEdge[],
  closureJoined: boolean,
): LayoutResult {
  if (!copies.length) return { param, polygons: [], foldPolygons: [], repeatsAround: repeats, stretch, stretchY, tileWidth: tw, tileHeight: th, scaleMin: 1, scaleMax: 1, log, closureJoined }
  const owned: CrossSection[] = []
  const own = (cs: CrossSection) => { owned.push(cs); return cs }
  try {
  // each copy keeps its holes (even-odd over its own contours); copies are then unioned
  const tiles = own(m.CrossSection.union(copies.map((c) => own(new m.CrossSection(c, 'EvenOdd')))))
  // region polygon in 2D, inset by the margin
  const loops = flat.loops.map((loop) => loop.map((v) => [param.uv[v * 2], param.uv[v * 2 + 1]] as Pt))
  let regionCs = own(new m.CrossSection(loops, 'EvenOdd'))
  let marginCs: CrossSection | null = null
  if (settings.margin > 0) {
    // keep a solid band along real boundary edges only: neither the wrap seam nor a
    // fold to a neighbouring piece of the same sheet is an edge of the part. Folds are
    // matched by edge: a wall's rim edge runs between two fold corners yet is a real edge.
    const seam = new Set(flat.seamVertices)
    const foldKeys = new Set((flat.foldEdges ?? []).map(([a, b]) => (a < b ? `${a},${b}` : `${b},${a}`)))
    const foldVertices = new Set(flat.foldVertices ?? [])
    const owner = edgeOwners(param)
    const reach = folds.reduce((max, f) => Math.max(max, f.ext), 0)
    const bands: Pt[][] = []
    for (const loop of flat.loops) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length]
        if (seam.has(a) && seam.has(b)) continue
        const key = a < b ? `${a},${b}` : `${b},${a}`
        if (foldKeys.has(key)) continue
        const ax = param.uv[a * 2], ay = param.uv[a * 2 + 1], bx = param.uv[b * 2], by = param.uv[b * 2 + 1]
        const len = Math.hypot(bx - ax, by - ay)
        if (len < 1e-9) continue
        const dx = (bx - ax) / len, dy = (by - ay) / len
        // the band is `margin` millimetres wide on the surface, whatever the local uv scale
        const t = owner.get(key)?.t
        const width = (2 * settings.margin) / (t === undefined ? param.scale[flat.originTriangle] || 1 : param.directionalScale(t, -dy, dx))
        // where the edge ends at a fold corner it continues past the fold, so the strip
        // the pattern is carried across the fold in cannot bypass this margin at the rim
        const ea = foldVertices.has(a) ? reach : 0, eb = foldVertices.has(b) ? reach : 0
        bands.push(...strokePolyline([[ax - dx * ea, ay - dy * ea], [bx + dx * eb, by + dy * eb]], false, width))
      }
    }
    if (bands.length) {
      marginCs = own(new m.CrossSection(bands, 'NonZero'))
      regionCs = own(m.CrossSection.difference(regionCs, marginCs))
    }
  }
  // mask out triangles where the pattern would come out too small to print
  let masked = 0
  if (settings.minScale > 0) {
    const small: Pt[][] = []
    const ix = param.sub.indices, uv = param.uv
    for (let t = 0; t < param.scale.length; t++) {
      if (param.scale[t] >= settings.minScale) continue
      const a = ix[t * 3], b2 = ix[t * 3 + 1], c = ix[t * 3 + 2]
      small.push([[uv[a * 2], uv[a * 2 + 1]], [uv[b2 * 2], uv[b2 * 2 + 1]], [uv[c * 2], uv[c * 2 + 1]]])
    }
    masked = small.length
    if (small.length) {
      const smallCs = own(m.CrossSection.union(small.map((p) => own(new m.CrossSection([p], 'NonZero')))))
      // grow the mask a little (in mm at the origin) so ribs at the edge of the masked zone stay solid
      regionCs = own(m.CrossSection.difference(regionCs, own(smallCs.offset((settings.margin > 0 ? settings.margin : 1) / (param.scale[flat.originTriangle] || 1), 'Round', 2, 8))))
    }
  }
  const intersection = own(m.CrossSection.intersection(tiles, regionCs))
  // Simplifying paired wrap boundaries independently can pull one side into
  // the surface, leaving a thin wall after extrusion. Keep the clipped seam.
  const clipped = flat.period ? intersection : own(intersection.simplify(0.01))
  const polygons = crossSectionToPolygons(clipped)
  // continue the pattern past each fold in a strip as deep as the tool needs to reach the mitre plane
  let foldPolygons: Pt[][] = []
  const strips = folds.filter((f) => f.ext > 0).map((f) => f.strip)
  if (strips.length) {
    let band = own(m.CrossSection.union(strips.map((q) => own(new m.CrossSection([q], 'NonZero')))))
    if (marginCs) band = own(m.CrossSection.difference(band, marginCs))
    foldPolygons = crossSectionToPolygons(own(own(m.CrossSection.intersection(tiles, band)).simplify(0.01)))
  }
  let sMin = Infinity, sMax = 0
  for (const s of param.scale) if (s > 0) { sMin = Math.min(sMin, s); sMax = Math.max(sMax, s) }
  log.push(`${polygons.length} shapes laid out; local size ranges ${(sMin * 100).toFixed(0)}% to ${(sMax * 100).toFixed(0)}% of true`)
  if (!polygons.length && marginCs && regionCs.area() < 1e-6) log.push(`the ${settings.margin} mm margin covers this piece entirely (a narrow piece such as a rim): it is left solid`)
  if (masked) log.push(`left solid where the pattern would shrink below ${(settings.minScale * 100).toFixed(0)}% (${masked} triangles)`)
  return { param, polygons, foldPolygons, repeatsAround: repeats, stretch, stretchY, tileWidth: tw, tileHeight: th, scaleMin: sMin, scaleMax: sMax, log, closureJoined }
  } finally { for (const cs of owned) cs.delete() }
}

/** The triangle owning each mesh edge (keyed "lo,hi") and its third vertex. */
function edgeOwners(param: Parameterization): Map<string, { t: number; c: number }> {
  const ix = param.sub.indices
  const owner = new Map<string, { t: number; c: number }>()
  for (let t = 0; t < ix.length / 3; t++) for (let c = 0; c < 3; c++) {
    const a = ix[t * 3 + c], b = ix[t * 3 + ((c + 1) % 3)]
    owner.set(a < b ? `${a},${b}` : `${b},${a}`, { t, c: ix[t * 3 + ((c + 2) % 3)] })
  }
  return owner
}

/** The mitre whose fold line this 3D edge lies on. */
function mitreOf(mitres: Mitre[], p: Float32Array, a: number, b: number): Mitre | null {
  for (const mitre of mitres) {
    const { point, direction: d, halfLength } = mitre
    let on = true
    for (const v of [a, b]) {
      const w = [p[v * 3] - point[0], p[v * 3 + 1] - point[1], p[v * 3 + 2] - point[2]]
      const along = w[0] * d[0] + w[1] * d[1] + w[2] * d[2]
      if (Math.abs(along) > halfLength + 0.05 || Math.hypot(w[0] - along * d[0], w[1] - along * d[1], w[2] - along * d[2]) > 0.05) { on = false; break }
    }
    if (on) return mitre
  }
  return null
}

/** One boundary edge of the piece that is a fold, with how far past it the pattern continues. */
interface FoldEdge {
  a: number
  b: number
  /** physical reach past the fold, mm */
  reach: number
  /** that reach in the layout's uv units, measured perpendicular to the fold */
  ext: number
  /** quad just outside the region along the edge, `ext` deep, with square ends */
  strip: Pt[]
}

/**
 * How far the pattern continues past each fold edge: the physical reach a tool
 * spanning settings.normalRange needs to meet the fold's mitre plane, converted
 * to uv through the local metric perpendicular to the edge. A curved fold has
 * no mitre plane and gets the tool's full offset. Nothing without a normal range.
 */
function foldReaches(param: Parameterization, flat: Flat, settings: LayoutSettings): FoldEdge[] {
  const range = settings.normalRange
  if (!range || !flat.foldEdges?.length) return []
  const [zMin, zMax] = range
  const uv = param.uv, p = param.sub.positions
  const owner = edgeOwners(param)
  const out: FoldEdge[] = []
  for (const [a, b] of flat.foldEdges) {
    const o = owner.get(a < b ? `${a},${b}` : `${b},${a}`)
    if (!o) continue
    const ax = uv[a * 2], ay = uv[a * 2 + 1], bx = uv[b * 2], by = uv[b * 2 + 1]
    let nx = -(by - ay), ny = bx - ax
    const len = Math.hypot(nx, ny)
    if (len < 1e-9) continue
    nx /= len; ny /= len
    // the strip lies outside the region: away from the owning triangle's third vertex
    if ((uv[o.c * 2] - ax) * nx + (uv[o.c * 2 + 1] - ay) * ny > 0) { nx = -nx; ny = -ny }
    const mitre = mitreOf(flat.mitres ?? [], p, a, b)
    const reach = mitre ? mitreReach(mitre, zMin, zMax) : Math.max(-zMin, zMax, 0)
    if (!(reach <= MAX_FOLD_REACH)) {
      const bend = mitre ? `${mitreBendDeg(mitre).toFixed(0)}°` : 'a curved edge'
      throw new Error(`Fold too sharp: the tool would have to continue ${Number.isFinite(reach) ? reach.toFixed(1) + ' mm' : 'without limit'} past a bend of ${bend} to meet the neighbouring face. Reduce the depth, or select the faces separately.`)
    }
    const ext = reach / param.directionalScale(o.t, nx, ny)
    out.push({ a, b, reach, ext, strip: [[ax, ay], [bx, by], [bx + nx * ext, by + ny * ext], [ax + nx * ext, ay + ny * ext]] })
  }
  return out
}

/** 3D line segments (xyz pairs) for previewing polygons on the surface. */
export function polygonsToSurfaceSegments(param: Parameterization, polygons: Pt[][], lift = 0.15): Float32Array {
  let n = 0
  for (const p of polygons) n += p.length
  const out = new Float32Array(n * 6)
  const tmp = new Float32Array(3)
  let k = 0
  for (const p of polygons) {
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length]
      param.toSurface(a[0], a[1], lift, tmp); out[k++] = tmp[0]; out[k++] = tmp[1]; out[k++] = tmp[2]
      param.toSurface(b[0], b[1], lift, tmp); out[k++] = tmp[0]; out[k++] = tmp[1]; out[k++] = tmp[2]
    }
  }
  return out
}
