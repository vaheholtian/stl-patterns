// 2D pipeline: turn a Tile (polygons + stroked curves) into closed polygons
// that are ready to be extruded. Runs wherever manifold is initialised.
import type { ManifoldToplevel, CrossSection } from 'manifold-3d'
import type { Pt, Tile } from '../../src/patterns/types'
import { connectMaterial } from '../../src/patterns/connectMaterial'

export interface PipelineOptions {
  /** swap material and feature: feature = box minus feature */
  invert?: boolean
  /** extra polygons to subtract (e.g. white shapes from an SVG) */
  subtract?: Pt[][]
  /** clip everything to the repeat box (default true) */
  clipToBox?: boolean
  /** minimum feature width in mm; thinner slivers are removed by open/close (0 = off) */
  minFeature?: number
  /** Connect the kept material, irrespective of which polarity is being cut. */
  connectMaterial?: boolean
  /** Filter on a repeated neighbourhood, so minimum-feature cleanup preserves seams. */
  periodic?: boolean
  /** Optional diagnostics returned to the screen. */
  notes?: string[]
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
 * forward, round cap, right side backward, round cap). Closed curves use a
 * union of segment strips, preserving hollow lobes at self-crossings.
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
    // A self-crossing closed path has no global "inside" offset. Filling two
    // offset outlines can fill entire lobes instead of just the rib. Union
    // consistently wound segment strips; shared miter vertices close the joins.
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      loops.push([left[i], left[j], right[j], right[i]])
    }
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
  // consistent orientation for every filled strip/disc
  for (let i = 0; i < loops.length; i++) {
    const a = signedArea(loops[i])
    if (a < 0) loops[i].reverse()
  }
  return loops
}

/**
 * Douglas-Peucker simplification that keeps every vertex on the tile box
 * boundary (snapped exactly onto it). Chains between those anchors are
 * simplified on their own, so the profile on x = 0 stays identical to the one
 * on x = width for a periodic tile. Loops that never touch the box are
 * anchored at their first vertex and the vertex farthest from it.
 */
export function simplifyAnchored(polys: Pt[][], w: number, h: number, eps: number): Pt[][] {
  const tol = 1e-4
  const snap = (v: number, size: number) => (Math.abs(v) < tol ? 0 : Math.abs(v - size) < tol ? size : v)
  const onBoundary = (p: Pt) => p[0] === 0 || p[0] === w || p[1] === 0 || p[1] === h
  const out: Pt[][] = []
  for (const loop of polys) {
    const pts: Pt[] = []
    for (const p of loop) {
      const q: Pt = [snap(p[0], w), snap(p[1], h)]
      const last = pts[pts.length - 1]
      if (!last || segLen(last, q) > 1e-9) pts.push(q)
    }
    while (pts.length > 1 && segLen(pts[0], pts[pts.length - 1]) <= 1e-9) pts.pop()
    const n = pts.length
    if (n < 3) continue
    let anchors: number[] = []
    for (let i = 0; i < n; i++) if (onBoundary(pts[i])) anchors.push(i)
    if (anchors.length < 2) {
      let far = 0, best = -1
      for (let i = 1; i < n; i++) { const d = segLen(pts[0], pts[i]); if (d > best) { best = d; far = i } }
      anchors = [0, far]
    }
    const kept: Pt[] = []
    for (let a = 0; a < anchors.length; a++) {
      const from = anchors[a], to = anchors[(a + 1) % anchors.length]
      const chain: Pt[] = [pts[from]]
      for (let i = (from + 1) % n; i !== to; i = (i + 1) % n) chain.push(pts[i])
      chain.push(pts[to])
      const keep = douglasPeucker(chain, eps)
      for (let i = 0; i < keep.length - 1; i++) kept.push(keep[i])
    }
    if (kept.length >= 3) out.push(kept)
  }
  return out
}

/** Iterative Douglas-Peucker on an open chain; both ends are always kept. */
function douglasPeucker(chain: Pt[], eps: number): Pt[] {
  const n = chain.length
  if (n <= 2) return chain
  const keep = new Uint8Array(n)
  keep[0] = 1; keep[n - 1] = 1
  const stack: [number, number][] = [[0, n - 1]]
  while (stack.length) {
    const [i, j] = stack.pop()!
    if (j - i < 2) continue
    const a = chain[i], b = chain[j]
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy)
    let worst = -1, at = -1
    for (let k = i + 1; k < j; k++) {
      const p = chain[k]
      const d = len < 1e-12 ? segLen(a, p) : Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / len
      if (d > worst) { worst = d; at = k }
    }
    if (worst > eps) { keep[at] = 1; stack.push([i, at], [at, j]) }
  }
  const out: Pt[] = []
  for (let k = 0; k < n; k++) if (keep[k]) out.push(chain[k])
  return out
}

/** Build the feature region of a tile as a CrossSection in tile coordinates. */
export function tileToCrossSection(m: ManifoldToplevel, tile: Tile, opts: PipelineOptions = {}): CrossSection {
  const owned: CrossSection[] = []
  const own = (cs: CrossSection) => { owned.push(cs); return cs }
  try {
  const parts: CrossSection[] = []
  if (tile.polygons.length) parts.push(own(new m.CrossSection(tile.polygons, 'EvenOdd')))
  if (tile.curves.length) {
    // each curve's loops are consistently wound, so all strokes can share one NonZero fill
    const loops: Pt[][] = []
    for (const c of tile.curves) loops.push(...strokePolyline(c.points, c.closed, tile.ribWidth))
    if (loops.length) parts.push(own(new m.CrossSection(loops, 'NonZero')))
  }
  let cs = parts.length ? (parts.length === 1 ? parts[0] : own(m.CrossSection.union(parts))) : own(m.CrossSection.square([0, 0]))
  if (opts.subtract?.length) {
    const sub = own(new m.CrossSection(opts.subtract, 'EvenOdd'))
    cs = own(m.CrossSection.difference(cs, sub))
  }
  const box = own(m.CrossSection.square([tile.width, tile.height], false))
  if (opts.invert) cs = own(m.CrossSection.difference(box, cs))
  if (opts.clipToBox !== false || opts.periodic) cs = own(m.CrossSection.intersection(cs, box))
  if (opts.periodic) {
    const copies: CrossSection[] = []
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) copies.push(own(cs.translate([x * tile.width, y * tile.height])))
    cs = own(m.CrossSection.union(copies))
  }
  if (opts.minFeature && opts.minFeature > 0) {
    // morphological opening removes slivers thinner than minFeature
    const r = opts.minFeature / 2
    cs = own(own(cs.offset(-r, 'Round', 2, 32)).offset(r, 'Round', 2, 32))
  }
  // Thin out the neighbourhood before cropping: cheap, and any seam drift it
  // introduces is removed by the stitching below.
  cs = own(cs.simplify(0.001))
  if (opts.periodic) {
    // The boolean kernel is not exactly translation invariant: a hairline
    // residue of the opening can survive at one seam junction and vanish at
    // the other. Take the strip just beyond the left and bottom edges as the
    // right and top edge content, so opposite edges are literally the same
    // polygons, translated.
    const w = tile.width, h = tile.height, c = Math.min(w, h) / 8
    const strip = (x: number, y: number, sx: number, sy: number) => own(m.CrossSection.square([sx, sy], false).translate([x, y]))
    // one cut of the large neighbourhood; the stitching then works on tile-sized pieces
    const near = own(m.CrossSection.intersection(cs, strip(-c, -c, w + c, h + c)))
    const stitchedX = own(m.CrossSection.union([
      own(m.CrossSection.intersection(near, strip(0, -c, w - c, h + c))),
      own(own(m.CrossSection.intersection(near, strip(-c, -c, c, h + c))).translate([w, 0])),
    ]))
    cs = own(m.CrossSection.union([
      own(m.CrossSection.intersection(stitchedX, strip(0, 0, w, h - c))),
      own(own(m.CrossSection.intersection(stitchedX, strip(0, -c, w, c))).translate([0, h])),
    ]))
  }
  // Simplify with the box-boundary vertices pinned: a general simplifier decides
  // differently on each side of a seam, so opposite-edge profiles drift apart.
  const lean = simplifyAnchored(cs.toPolygons() as Pt[][], tile.width, tile.height, 0.001)
  const simplified = own(lean.length ? new m.CrossSection(lean, 'EvenOdd') : m.CrossSection.square([0, 0]))
  if (opts.connectMaterial) {
    return connectMaterial(m, simplified, tile.width, tile.height, Math.max(tile.ribWidth, opts.minFeature ?? 0), opts.notes)
  }
  owned.pop() // transfer ownership of the returned simplified section
  return simplified
  } finally { for (const cs of owned) cs.delete() }
}

/** Polygons (with holes, even-odd) from a CrossSection. */
export function crossSectionToPolygons(cs: CrossSection): Pt[][] {
  return cs.toPolygons().map((p) => p.map((v) => [v[0], v[1]] as Pt))
}

/** Convenience: tile -> polygons. */
export function tileToPolygons(m: ManifoldToplevel, tile: Tile, opts: PipelineOptions = {}): Pt[][] {
  const cs = tileToCrossSection(m, tile, opts)
  try { return crossSectionToPolygons(cs) } finally { cs.delete() }
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
