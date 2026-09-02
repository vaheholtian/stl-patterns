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

function signedArea(p: Pt[]): number {
  let s = 0
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; s += p[i][0] * q[1] - q[0] * p[i][1] }
  return s / 2
}

/**
 * Stroke a polyline with round joins and caps. Returns loops to be filled with
 * the NonZero rule as one CrossSection: an open curve gives one loop (left side
 * forward, round cap, right side backward, round cap); a closed curve gives an
 * outer loop and an oppositely wound inner loop. Sharp corners produce small
 * self-overlaps, which NonZero fills correctly.
 */
export function strokePolyline(points: Pt[], closed: boolean, width: number): Pt[][] {
  const r = width / 2
  // drop repeated points
  const pts: Pt[] = []
  for (const p of points) if (!pts.length || segLen(pts[pts.length - 1], p) > 1e-9) pts.push(p)
  if (closed && pts.length > 1 && segLen(pts[0], pts[pts.length - 1]) < 1e-9) pts.pop()
  const n = pts.length
  if (n === 0) return []
  if (n === 1) return [circle(pts[0], r)]
  // per-vertex offset direction: averaged edge normals with a miter limit
  const left: Pt[] = [], right: Pt[] = []
  const edgeNormal = (a: Pt, b: Pt): Pt => { const l = segLen(a, b); return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l] }
  for (let i = 0; i < n; i++) {
    const hasPrev = closed || i > 0, hasNext = closed || i < n - 1
    const nPrev = hasPrev ? edgeNormal(pts[(i - 1 + n) % n], pts[i]) : null
    const nNext = hasNext ? edgeNormal(pts[i], pts[(i + 1) % n]) : null
    let nx: number, ny: number
    if (nPrev && nNext) {
      nx = nPrev[0] + nNext[0]; ny = nPrev[1] + nNext[1]
      const l = Math.hypot(nx, ny)
      if (l < 1e-6) { nx = nNext[0]; ny = nNext[1] } else {
        // miter length = 1/cos(theta/2) = 2/l ; clamp to 2 (round-ish joins are added below for sharp turns)
        const miter = Math.min(2 / l, 2)
        nx = (nx / l) * miter; ny = (ny / l) * miter
      }
    } else {
      const nn = (nPrev ?? nNext)!
      nx = nn[0]; ny = nn[1]
    }
    left.push([pts[i][0] + nx * r, pts[i][1] + ny * r])
    right.push([pts[i][0] - nx * r, pts[i][1] - ny * r])
  }
  const arc = (c: Pt, from: number, to: number, segs = 8): Pt[] => {
    const out: Pt[] = []
    for (let k = 1; k < segs; k++) { const a = from + ((to - from) * k) / segs; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]) }
    return out
  }
  const loops: Pt[][] = []
  if (!closed) {
    const loop: Pt[] = [...left]
    // end cap: from left to right around the last point
    const e = pts[n - 1], le = left[n - 1]
    const a0 = Math.atan2(le[1] - e[1], le[0] - e[0])
    loop.push(...arc(e, a0, a0 - Math.PI))
    for (let i = n - 1; i >= 0; i--) loop.push(right[i])
    const s = pts[0], rs = right[0]
    const a1 = Math.atan2(rs[1] - s[1], rs[0] - s[0])
    loop.push(...arc(s, a1, a1 - Math.PI))
    loops.push(loop)
  } else {
    const outer = left, inner = right.slice().reverse()
    // the two loops must wind in opposite directions to leave the middle hollow
    if (Math.sign(signedArea(outer)) === Math.sign(signedArea(inner))) inner.reverse()
    loops.push(outer, inner)
  }
  // discs at sharp corners so joins are round rather than mitred
  const cosMin = Math.cos((25 * Math.PI) / 180)
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n]
    const l1 = segLen(p, c), l2 = segLen(c, q)
    const d = ((c[0] - p[0]) * (q[0] - c[0]) + (c[1] - p[1]) * (q[1] - c[1])) / (l1 * l2)
    if (d < cosMin) loops.push(circle(c, r, 12))
  }
  // consistent orientation for every filled loop (holes are already opposite)
  for (let i = 0; i < loops.length; i++) {
    const isHole = closed && i === 1
    const a = signedArea(loops[i])
    if ((a < 0) !== isHole) loops[i].reverse()
  }
  return loops
}

/** Build the feature region of a tile as a CrossSection in tile coordinates. */
export function tileToCrossSection(m: ManifoldToplevel, tile: Tile, opts: PipelineOptions = {}): CrossSection {
  const parts: CrossSection[] = []
  if (tile.polygons.length) parts.push(new m.CrossSection(tile.polygons, 'EvenOdd'))
  if (tile.curves.length) {
    // each curve's loops are consistently wound, so all strokes can share one NonZero fill
    const loops: Pt[][] = []
    for (const c of tile.curves) loops.push(...strokePolyline(c.points, c.closed, tile.ribWidth))
    if (loops.length) parts.push(new m.CrossSection(loops, 'NonZero'))
  }
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
