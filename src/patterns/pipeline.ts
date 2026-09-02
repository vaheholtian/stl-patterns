// 2D pipeline: turn a Tile (polygons + stroked curves) into closed polygons
// that are ready to be extruded. Runs wherever manifold is initialised.
import type { ManifoldToplevel, CrossSection } from 'manifold-3d'
import type { Pt, Tile } from './types'

export interface PipelineOptions {
  /** swap material and feature: feature = box minus feature */
  invert?: boolean
  /** extra polygons to subtract (e.g. white shapes from an SVG) */
  subtract?: Pt[][]
  /** clip everything to the repeat box (default true) */
  clipToBox?: boolean
  /** minimum feature width in mm; thinner slivers are removed by open/close (0 = off) */
  minFeature?: number
}

function segLen(a: Pt, b: Pt) { return Math.hypot(b[0] - a[0], b[1] - a[1]) }

function circle(c: Pt, r: number, n = 16): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < n; i++) out.push([c[0] + r * Math.cos((i / n) * Math.PI * 2), c[1] + r * Math.sin((i / n) * Math.PI * 2)])
  return out
}

/** Stroke a polyline with round joins and caps into a list of simple polygons (to be unioned). */
export function strokePolyline(points: Pt[], closed: boolean, width: number): Pt[][] {
  const r = width / 2
  const out: Pt[][] = []
  const n = points.length
  if (n === 0) return out
  if (n === 1) return [circle(points[0], r)]
  const segCount = closed ? n : n - 1
  for (let i = 0; i < segCount; i++) {
    const a = points[i], b = points[(i + 1) % n]
    const len = segLen(a, b)
    if (len < 1e-9) continue
    const nx = (-(b[1] - a[1]) / len) * r, ny = ((b[0] - a[0]) / len) * r
    out.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]])
  }
  // joints: a disc where the direction changes noticeably, plus the two caps
  const cosMin = Math.cos((8 * Math.PI) / 180)
  for (let i = 0; i < n; i++) {
    const isEnd = !closed && (i === 0 || i === n - 1)
    if (isEnd) { out.push(circle(points[i], r)); continue }
    const p = points[(i - 1 + n) % n], c = points[i], q = points[(i + 1) % n]
    const l1 = segLen(p, c), l2 = segLen(c, q)
    if (l1 < 1e-9 || l2 < 1e-9) continue
    const d = ((c[0] - p[0]) * (q[0] - c[0]) + (c[1] - p[1]) * (q[1] - c[1])) / (l1 * l2)
    if (d < cosMin) out.push(circle(c, r))
  }
  return out
}

/** Build the feature region of a tile as a CrossSection in tile coordinates. */
export function tileToCrossSection(m: ManifoldToplevel, tile: Tile, opts: PipelineOptions = {}): CrossSection {
  const parts: CrossSection[] = []
  if (tile.polygons.length) parts.push(new m.CrossSection(tile.polygons, 'EvenOdd'))
  const strokes: Pt[][] = []
  for (const c of tile.curves) strokes.push(...strokePolyline(c.points, c.closed, tile.ribWidth))
  if (strokes.length) parts.push(m.CrossSection.union(strokes.map((s) => new m.CrossSection([s], 'NonZero'))))
  let cs = parts.length ? (parts.length === 1 ? parts[0] : m.CrossSection.union(parts)) : new m.CrossSection([], 'EvenOdd')
  if (opts.subtract?.length) {
    const sub = new m.CrossSection(opts.subtract, 'EvenOdd')
    cs = m.CrossSection.difference(cs, sub)
  }
  const box = m.CrossSection.square([tile.width, tile.height], false)
  if (opts.invert) cs = m.CrossSection.difference(box, cs)
  if (opts.clipToBox !== false) cs = m.CrossSection.intersection(cs, box)
  if (opts.minFeature && opts.minFeature > 0) {
    // morphological opening removes slivers thinner than minFeature
    const r = opts.minFeature / 2
    cs = cs.offset(-r, 'Round', 2, 32).offset(r, 'Round', 2, 32)
  }
  return cs.simplify(0.01)
}

/** Polygons (with holes, even-odd) from a CrossSection. */
export function crossSectionToPolygons(cs: CrossSection): Pt[][] {
  return cs.toPolygons().map((p) => p.map((v) => [v[0], v[1]] as Pt))
}

/** Convenience: tile -> polygons. */
export function tileToPolygons(m: ManifoldToplevel, tile: Tile, opts: PipelineOptions = {}): Pt[][] {
  const cs = tileToCrossSection(m, tile, opts)
  return crossSectionToPolygons(cs)
}

/** Area of a polygon set under even-odd (absolute). */
export function polygonsArea(polys: Pt[][]): number {
  let a = 0
  for (const p of polys) {
    let s = 0
    for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; s += p[i][0] * q[1] - q[0] * p[i][1] }
    a += s / 2
  }
  return Math.abs(a)
}
