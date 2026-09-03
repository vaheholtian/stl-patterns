// Penrose P3 (rhombus) tiling generator.
//
// Built by deflation/substitution of Robinson triangles, the standard way
// to generate a Penrose tiling. Ten "thin" (acute, apex 36 degrees) golden
// triangles are arranged as a wheel/decagon around the box centre, apex at
// the centre. Each triangle is represented as (color, A, B, C) where A is
// always the apex (the vertex where the two equal-length "leg" edges A-B
// and A-C meet) and B-C is the unique-length "base" edge:
//   - color 0 ("thin"): apex 36 degrees, base is the short edge.
//   - color 1 ("thick"): apex 108 degrees, base is the long edge.
// Deflating a triangle replaces it with 2 (thin) or 3 (thick) smaller
// triangles at 1/phi scale (phi = golden ratio), following the standard
// Robinson triangle substitution rule. Two same-color triangles that share
// a base edge (mirror images of one another) assemble into one rhombus:
// their 4 leg edges are the rhombus's 4 sides, and the shared base edge is
// the rhombus's internal diagonal (not drawn).
//
// `scale` is the leg length (mm) of the initial 10 triangles before any
// deflation; deflation only adds detail, it never shrinks the overall
// decagon, so `scale` is grown automatically (never shrunk) so the decagon's
// inscribed circle covers the box's bounding circle regardless of box
// aspect ratio or rotation - i.e. the tiling always covers the box at any
// depth. `depth` sets the requested deflation depth, but `minFeature` caps
// it per branch: a triangle stops deflating as soon as its children's leg
// length (current leg / phi) would be smaller than `minFeature`.
//
// This is a single centred motif clipped to the box (via a small
// Sutherland-Hodgman clip helper), not a repeating lattice - it is NOT
// seamless across tile edges.

import type { Generator, GeneratorContext, ParamValue, Pt, TileCurve } from './types'
import { getNum } from './types'

const PHI = (1 + Math.sqrt(5)) / 2
const MAX_TRIANGLES = 60000

type Color = 0 | 1

interface RTri {
  color: Color
  A: Pt // apex
  B: Pt // base vertex
  C: Pt // base vertex
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

/** Standard Robinson triangle deflation: replace one triangle with its
 * children at 1/phi scale. */
function subdivide(t: RTri): RTri[] {
  const { color, A, B, C } = t
  if (color === 0) {
    const P = lerp(A, B, 1 / PHI)
    return [
      { color: 0, A: C, B: P, C: B },
      { color: 1, A: P, B: C, C: A },
    ]
  }
  const Q = lerp(B, A, 1 / PHI)
  const R = lerp(B, C, 1 / PHI)
  return [
    { color: 1, A: R, B: C, C: A },
    { color: 1, A: Q, B: R, C: B },
    { color: 0, A: R, B: Q, C: A },
  ]
}

/** Recursively deflate `t`, stopping (and keeping `t` as a leaf) once the
 * requested depth is exhausted or the children's leg length would fall
 * below `minFeature`. Appends leaves to `out`. */
function deflate(t: RTri, depthRemaining: number, minFeature: number, out: RTri[], box?: { w: number; h: number }): void {
  if (out.length >= MAX_TRIANGLES) return
  // prune triangles that cannot touch the box (with a margin of one leg)
  if (box) {
    const leg = dist(t.A, t.B)
    const xs = [t.A[0], t.B[0], t.C[0]], ys = [t.A[1], t.B[1], t.C[1]]
    if (Math.max(...xs) < -leg || Math.min(...xs) > box.w + leg || Math.max(...ys) < -leg || Math.min(...ys) > box.h + leg) return
  }
  if (depthRemaining <= 0) {
    out.push(t)
    return
  }
  const leg = dist(t.A, t.B)
  if (leg / PHI < minFeature) {
    out.push(t)
    return
  }
  for (const child of subdivide(t)) deflate(child, depthRemaining - 1, minFeature, out, box)
}

/** Wheel of 10 thin triangles, apexes at the centre, base vertices on a
 * circle of the given radius. */
function initialTriangles(cx: number, cy: number, radius: number): RTri[] {
  const tris: RTri[] = []
  const apex: Pt = [cx, cy]
  for (let i = 0; i < 10; i++) {
    const a1 = ((2 * i - 1) * Math.PI) / 10
    const a2 = ((2 * i + 1) * Math.PI) / 10
    let B: Pt = [cx + radius * Math.cos(a1), cy + radius * Math.sin(a1)]
    let C: Pt = [cx + radius * Math.cos(a2), cy + radius * Math.sin(a2)]
    if (i % 2 === 0) {
      const tmp = B
      B = C
      C = tmp
    }
    tris.push({ color: 0, A: apex, B, C })
  }
  return tris
}

/** Sutherland-Hodgman clip of a (convex or simple) polygon to [0,w]x[0,h]. */
function clipEdge(pts: Pt[], inside: (p: Pt) => boolean, intersect: (a: Pt, b: Pt) => Pt): Pt[] {
  const n = pts.length
  if (n === 0) return pts
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const cur = pts[i]
    const prev = pts[(i - 1 + n) % n]
    const curIn = inside(cur)
    const prevIn = inside(prev)
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur))
      out.push(cur)
    } else if (prevIn) {
      out.push(intersect(prev, cur))
    }
  }
  return out
}

function clipPolygonToBox(poly: Pt[], width: number, height: number): Pt[] {
  let pts = poly
  pts = clipEdge(pts, (p) => p[0] >= 0, (a, b) => [0, a[1] + ((0 - a[0]) / (b[0] - a[0])) * (b[1] - a[1])])
  pts = clipEdge(pts, (p) => p[0] <= width, (a, b) => [width, a[1] + ((width - a[0]) / (b[0] - a[0])) * (b[1] - a[1])])
  pts = clipEdge(pts, (p) => p[1] >= 0, (a, b) => [a[0] + ((0 - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), 0])
  pts = clipEdge(pts, (p) => p[1] <= height, (a, b) => [a[0] + ((height - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), height])
  return pts
}

/** Clip an open 2-point segment to [0,w]x[0,h] with the Liang-Barsky
 * parametric line-clip; returns null if the segment misses the box
 * entirely. */
function clipSegmentToBox(a: Pt, b: Pt, width: number, height: number): [Pt, Pt] | null {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  let t0 = 0
  let t1 = 1
  const checks: [number, number][] = [
    [-dx, a[0]], // x >= 0
    [dx, width - a[0]], // x <= width
    [-dy, a[1]], // y >= 0
    [dy, height - a[1]], // y <= height
  ]
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null // parallel to this edge and outside it
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return null
      if (t > t0) t0 = t
    } else {
      if (t < t0) return null
      if (t < t1) t1 = t
    }
  }
  if (t0 > t1) return null
  return [
    [a[0] + dx * t0, a[1] + dy * t0],
    [a[0] + dx * t1, a[1] + dy * t1],
  ]
}

/** Inset a convex polygon inward by `dist`: offset each edge along its
 * inward normal by `dist`, then reconstruct the polygon by intersecting
 * consecutive offset edge lines. Returns null if it degenerates. */
export function insetConvex(poly: Pt[], distIn: number): Pt[] | null {
  const n = poly.length
  if (n < 3) return null
  let area = 0
  for (let i = 0; i < n; i++) {
    const [x0, y0] = poly[i]
    const [x1, y1] = poly[(i + 1) % n]
    area += x0 * y1 - x1 * y0
  }
  area *= 0.5
  if (Math.abs(area) < 1e-9) return null
  const sign = area > 0 ? 1 : -1

  const lines: { p: Pt; d: Pt }[] = []
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    let dx = b[0] - a[0]
    let dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    if (len < 1e-9) return null
    dx /= len
    dy /= len
    const nx = sign > 0 ? -dy : dy
    const ny = sign > 0 ? dx : -dx
    lines.push({ p: [a[0] + nx * distIn, a[1] + ny * distIn], d: [dx, dy] })
  }

  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const l0 = lines[(i - 1 + n) % n]
    const l1 = lines[i]
    const denom = l0.d[0] * l1.d[1] - l0.d[1] * l1.d[0]
    if (Math.abs(denom) < 1e-9) {
      out.push(l1.p)
      continue
    }
    const dx = l1.p[0] - l0.p[0]
    const dy = l1.p[1] - l0.p[1]
    const t = (dx * l1.d[1] - dy * l1.d[0]) / denom
    out.push([l0.p[0] + t * l0.d[0], l0.p[1] + t * l0.d[1]])
  }

  let outArea = 0
  for (let i = 0; i < n; i++) {
    const [x0, y0] = out[i]
    const [x1, y1] = out[(i + 1) % n]
    outArea += x0 * y1 - x1 * y0
  }
  outArea *= 0.5
  if (outArea * sign <= 1e-6) return null
  return out
}

function edgeKey(a: Pt, b: Pt): string {
  const r = (v: number) => Math.round(v * 1e4) / 1e4
  const pa = `${r(a[0])},${r(a[1])}`
  const pb = `${r(b[0])},${r(b[1])}`
  return pa < pb ? `${pa}|${pb}` : `${pb}|${pa}`
}

export const penroseGenerator: Generator = {
  id: 'penrose',
  name: 'Penrose medallion',
  description: 'True (aperiodic) Penrose P3 rhombus tiling built by deflation of Robinson triangles, clipped to the box. A single centred motif - not seamless across tile edges; use "Penrose tiling (seamless)" for a wrap, or turn on Mirror.',
  params: [
    { key: 'width', label: 'Width', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    { key: 'height', label: 'Height', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    {
      key: 'style', label: 'Style', type: 'select', default: 'edges',
      options: [
        { value: 'edges', label: 'Rhombus edges' },
        { value: 'thin', label: 'Thin rhombi only' },
        { value: 'thick', label: 'Thick rhombi only' },
      ],
    },
    { key: 'edge', label: 'Rhombus edge (mm)', type: 'number', default: 6, min: 1, max: 60, step: 0.5, hint: 'edge length of the final rhombi; the deflation depth is computed from it' },
    { key: 'minFeature', label: 'Min feature', type: 'number', default: 1.0, min: 0.1, max: 10, step: 0.1, hint: 'smallest detail; deeper recursion is skipped below this' },
    { key: 'gap', label: 'Gap', type: 'number', default: 1.0, min: 0, max: 5, step: 0.1, hint: 'inset applied to thin/thick rhombi, mm' },
    { key: 'ribWidth', label: 'Rib width', type: 'number', default: 1.6, min: 0.4, max: 6, step: 0.1 },
    { key: 'seed', label: 'Seed', type: 'int', default: 1, min: 0, max: 999999, step: 1 },
  ],
  generate(params: Record<string, ParamValue>, _ctx: GeneratorContext) {
    const width = getNum(params, 'width', 40)
    const height = getNum(params, 'height', 40)
    const style = String(params.style ?? 'edges')
    const minFeature = Math.max(0.01, getNum(params, 'minFeature', 1.0))
    const edge = Math.max(0.5, getNum(params, 'edge', getNum(params, 'scale', 6)))
    const gap = Math.max(0, getNum(params, 'gap', 1.0))
    const ribWidth = getNum(params, 'ribWidth', 1.6)

    const cx = width / 2
    const cy = height / 2
    // The initial decagon's inscribed circle (apothem = radius * cos(18deg))
    // must cover the box's bounding circle so the tiling fills it at any rotation.
    const halfDiag = 0.5 * Math.hypot(width, height)
    const radius = Math.max(edge, (halfDiag / Math.cos(Math.PI / 10)) * 1.02)
    // each deflation divides the leg by phi; pick the depth that lands on the requested edge
    const depth = Math.max(0, Math.min(12, Math.round(Math.log(radius / edge) / Math.log(PHI))))

    const leaves: RTri[] = []
    for (const tri of initialTriangles(cx, cy, radius)) {
      deflate(tri, depth, minFeature, leaves, { w: width, h: height })
    }

    if (style === 'edges') {
      const seen = new Set<string>()
      const curves: TileCurve[] = []
      for (const t of leaves) {
        for (const edge of [[t.A, t.B], [t.A, t.C]] as [Pt, Pt][]) {
          const key = edgeKey(edge[0], edge[1])
          if (seen.has(key)) continue
          seen.add(key)
          const clipped = clipSegmentToBox(edge[0], edge[1], width, height)
          if (clipped) curves.push({ points: [clipped[0], clipped[1]], closed: false })
        }
      }
      return { width, height, polygons: [], curves, ribWidth }
    }

    // 'thin' / 'thick': pair triangles sharing a base edge into rhombi.
    const wantColor: Color = style === 'thin' ? 0 : 1
    const groups = new Map<string, RTri[]>()
    for (const t of leaves) {
      const key = edgeKey(t.B, t.C)
      const g = groups.get(key)
      if (g) g.push(t)
      else groups.set(key, [t])
    }

    const polygons: Pt[][] = []
    for (const group of groups.values()) {
      if (group.length !== 2) continue // boundary triangle with no partner
      const [t1, t2] = group
      if (t1.color !== wantColor) continue
      const rhomb: Pt[] = [t1.A, t1.B, t2.A, t1.C]
      const inset = gap > 0 ? insetConvex(rhomb, gap / 2) : rhomb
      if (!inset) continue
      const clipped = clipPolygonToBox(inset, width, height)
      if (clipped.length >= 3) polygons.push(clipped)
    }

    return { width, height, polygons, curves: [], ribWidth }
  },
}
