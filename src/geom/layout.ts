// Lay a tile out over a flattened region: repeat, fit around seams, clip.
import type { ManifoldToplevel } from 'manifold-3d'
import type { Pt } from '../patterns/types'
import { Parameterization } from './parameterization'
import type { FlattenedRegion } from './regionFlatten'
import { crossSectionToPolygons, strokePolyline } from '../patterns/pipeline'

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
}

/** Size a single-copy tile should have to cover the flattened region. */
export function fittedTileSize(flat: FlattenedRegion, settings: LayoutSettings): { width: number; height: number; period: number | null } {
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
  repeatsAround: number | null
  stretch: number
  /** repeat box in the flattened space after stretch */
  tileWidth: number
  tileHeight: number
  /** mm per uv-unit range across the region (1 = true size) */
  scaleMin: number
  scaleMax: number
  log: string[]
}

/** Build a recentred parameterization from a flattening result. */
export function buildParameterization(flat: FlattenedRegion, settings: LayoutSettings): { param: Parameterization; period: [number, number] | null; baseRotation: number } {
  const sub = { positions: flat.positions, indices: flat.indices, normals: flat.normals, sourceTriangles: new Uint32Array(0) }
  const param = new Parameterization(sub, new Float32Array(flat.uv))
  const [x, y, z] = settings.origin
  // locate the origin's triangle in the flattened mesh
  const t = flat.originTriangle
  param.recenter(t, x, y, z, 0, 1)
  let baseRotation = 0
  let period: [number, number] | null = null
  if (flat.period) {
    const p0 = param.transformVector(flat.period)
    baseRotation = (-Math.atan2(p0[1], p0[0]) * 180) / Math.PI
  }
  param.recenter(t, x, y, z, baseRotation + settings.rotationDeg, settings.scale)
  if (flat.period) period = param.transformVector(flat.period)
  return { param, period, baseRotation }
}

export function layoutTile(
  m: ManifoldToplevel,
  flat: FlattenedRegion,
  tilePolygons: Pt[][],
  tileWidth: number,
  tileHeight: number,
  settings: LayoutSettings,
): LayoutResult {
  const log: string[] = []
  const { param, period } = buildParameterization(flat, settings)
  // seam fitting: period is along +x after baseRotation when user rotation is 0.
  // With user rotation the tile grid no longer aligns with the seam; stretch still
  // uses the period length projected on the tile x axis.
  let stretch = 1
  let repeats: number | null = null
  if (settings.single) {
    // one copy, centred on the origin; the caller already sized the tile to the region
    const tw = tileWidth, th = tileHeight
    const copy = tilePolygons.map((p) => p.map(([x, y]) => [x - tw / 2, y - th / 2] as Pt))
    log.push('single copy centred on the origin')
    return finish(m, param, flat, [copy], settings, log, null, 1, tw, th)
  }
  if (period && settings.fitSeam) {
    const rot = (settings.rotationDeg * Math.PI) / 180
    // period expressed in the rotated tile frame
    const px = period[0] * Math.cos(-rot) - period[1] * Math.sin(-rot)
    const py = period[0] * Math.sin(-rot) + period[1] * Math.cos(-rot)
    const len = Math.hypot(px, py)
    if (Math.abs(py) < 1e-3 * len + 1e-6) {
      repeats = Math.max(1, Math.round(len / tileWidth))
      stretch = len / (repeats * tileWidth)
      log.push(`${repeats} repeats around the seam, tile stretched ${((stretch - 1) * 100).toFixed(1)}%`)
    } else {
      log.push('rotated tile: seam fit skipped (rotate to 0 for a seamless wrap)')
    }
  }
  const tw = tileWidth * stretch, th = tileHeight
  const b = param.bounds()
  const i0 = Math.floor(b.minX / tw) - 1, i1 = Math.ceil(b.maxX / tw) + 1
  const j0 = Math.floor(b.minY / th) - 1, j1 = Math.ceil(b.maxY / th) + 1
  const copyCount = (i1 - i0 + 1) * (j1 - j0 + 1)
  if (copyCount > 4000) throw new Error(`Tile is too small for this region (${copyCount} copies). Increase the tile size or scale.`)
  const stretched = tilePolygons.map((p) => p.map(([x, y]) => [x * stretch, y] as Pt))
  const copies: Pt[][][] = []
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const ox = i * tw, oy = j * th
      // skip copies whose box is entirely outside the bounds
      if (ox + tw < b.minX || ox > b.maxX || oy + th < b.minY || oy > b.maxY) continue
      copies.push(stretched.map((p) => p.map(([x, y]) => [x + ox, y + oy] as Pt)))
    }
  }
  return finish(m, param, flat, copies, settings, log, repeats, stretch, tw, th)
}

function finish(
  m: ManifoldToplevel,
  param: Parameterization,
  flat: FlattenedRegion,
  copies: Pt[][][],
  settings: LayoutSettings,
  log: string[],
  repeats: number | null,
  stretch: number,
  tw: number,
  th: number,
): LayoutResult {
  if (!copies.length) return { param, polygons: [], repeatsAround: repeats, stretch, tileWidth: tw, tileHeight: th, scaleMin: 1, scaleMax: 1, log }
  // each copy keeps its holes (even-odd over its own contours); copies are then unioned
  const tiles = m.CrossSection.union(copies.map((c) => new m.CrossSection(c, 'EvenOdd')))
  // region polygon in 2D, inset by the margin
  const loops = flat.loops.map((loop) => loop.map((v) => [param.uv[v * 2], param.uv[v * 2 + 1]] as Pt))
  let regionCs = new m.CrossSection(loops, 'EvenOdd')
  if (settings.margin > 0) {
    // keep a solid band along real boundary edges only; the seam is not an edge of the part
    const seam = new Set(flat.seamVertices)
    const bands: Pt[][] = []
    for (const loop of flat.loops) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length]
        if (seam.has(a) && seam.has(b)) continue
        bands.push(...strokePolyline([[param.uv[a * 2], param.uv[a * 2 + 1]], [param.uv[b * 2], param.uv[b * 2 + 1]]], false, 2 * settings.margin))
      }
    }
    if (bands.length) regionCs = m.CrossSection.difference(regionCs, new m.CrossSection(bands, 'NonZero'))
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
      const smallCs = m.CrossSection.union(small.map((p) => new m.CrossSection([p], 'NonZero')))
      // grow the mask a little so ribs at the edge of the masked zone stay solid
      regionCs = m.CrossSection.difference(regionCs, smallCs.offset(settings.margin > 0 ? settings.margin : 1, 'Round', 2, 8))
    }
  }
  const clipped = m.CrossSection.intersection(tiles, regionCs).simplify(0.01)
  const polygons = crossSectionToPolygons(clipped)
  let sMin = Infinity, sMax = 0
  for (const s of param.scale) if (s > 0) { sMin = Math.min(sMin, s); sMax = Math.max(sMax, s) }
  log.push(`${polygons.length} shapes laid out; local size ranges ${(sMin * 100).toFixed(0)}% to ${(sMax * 100).toFixed(0)}% of true`)
  if (masked) log.push(`left solid where the pattern would shrink below ${(settings.minScale * 100).toFixed(0)}% (${masked} triangles)`)
  return { param, polygons, repeatsAround: repeats, stretch, tileWidth: tw, tileHeight: th, scaleMin: sMin, scaleMax: sMax, log }
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
