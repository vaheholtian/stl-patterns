// Periodic approximant of the Penrose P3 (rhombus) tiling - a seamless tile.
//
// A real Penrose tiling never repeats, so no rectangle of it can be a
// seamless tile. This generator builds the standard "cut-and-project" Penrose
// tiling from the 5-dimensional integer lattice Z^5 and then applies a small
// linear phason strain so that two chosen lattice vectors become exact
// periods. The rhombi keep their true shapes (edge length `edge`, angles 36
// and 72 degrees); only their arrangement is made periodic. The nearer the
// period vectors are to true Penrose directions (higher Fibonacci order), the
// larger the period and the smaller the strain. This is the same construction
// used for quasicrystal approximants in physics.
//
// Cut-and-project recap. Each lattice point n in Z^5 projects to a physical
// position x(n) = sum n_k * e_k (e_k at 72 degree steps) and a perpendicular
// position y(n) = sum n_k * f_k (f_k at 144 degree steps) plus the sheet
// index s(n) = sum n_k. The point is a tiling vertex when s is 1..4 and y
// lies in the pentagonal window W_s. Two accepted points that differ by a
// unit vector are joined by a rhombus edge; four that form a lattice square
// bound a rhombus.
//
// Periodicity. Choose A = (a0,a1,a2,a2,a1) and B = (0,b1,b2,-b2,-b1) with
// zero coordinate sum; by symmetry x(A) is horizontal and x(B) vertical, so
// the period cell is an axis-aligned rectangle. With a1:a2 and b1:b2 taken
// from consecutive Fibonacci numbers, y(A) and y(B) are small. Replacing the
// window test y in W by (y - L x) in W, where L is the diagonal map sending
// x(A) to y(A) and x(B) to y(B), makes acceptance invariant under A and B.
//
// The tile box is exactly one period cell: width is honoured by adjusting the
// rhombus edge slightly, the height snaps to the nearest achievable period.

import type { Generator, GeneratorContext, ParamValue, Pt, TileCurve } from './types'
import { getNum } from './types'
import { insetConvex } from './penrose'

const EPAR: Pt[] = [0, 1, 2, 3, 4].map((k) => [Math.cos((2 * Math.PI * k) / 5), Math.sin((2 * Math.PI * k) / 5)])
const EPERP: Pt[] = [0, 1, 2, 3, 4].map((k) => [Math.cos((4 * Math.PI * k) / 5), Math.sin((4 * Math.PI * k) / 5)])
const FIB = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144]
const MAX_ORDER = 8
const MAX_RHOMBI = 40000
/** bounding radius of the largest window (W_2, W_3), plus slack */
const WINDOW_RADIUS = 1.9

function cross(a: Pt, b: Pt): number { return a[0] * b[1] - a[1] * b[0] }

/** Andrew monotone chain convex hull, CCW. */
function convexHull(points: Pt[]): Pt[] {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const lower: Pt[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross([lower[lower.length - 1][0] - lower[lower.length - 2][0], lower[lower.length - 1][1] - lower[lower.length - 2][1]], [p[0] - lower[lower.length - 2][0], p[1] - lower[lower.length - 2][1]]) <= 1e-12) lower.pop()
    lower.push(p)
  }
  const upper: Pt[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross([upper[upper.length - 1][0] - upper[upper.length - 2][0], upper[upper.length - 1][1] - upper[upper.length - 2][1]], [p[0] - upper[upper.length - 2][0], p[1] - upper[upper.length - 2][1]]) <= 1e-12) upper.pop()
    upper.push(p)
  }
  lower.pop(); upper.pop()
  return lower.concat(upper)
}

/**
 * Windows W_1..W_4: cross-sections at integer sheet s of the unit cube
 * projected along the strained plane, i.e. the hull of the sums of s
 * distinct strained perpendicular star vectors f_k - L e_k. Using the
 * unstrained windows here leaves gaps proportional to the strain.
 */
function buildWindows(lx: number, ly: number): Pt[][] {
  const f: Pt[] = EPERP.map((v, k) => [v[0] - lx * EPAR[k][0], v[1] - ly * EPAR[k][1]])
  const out: Pt[][] = []
  for (let s = 1; s <= 4; s++) {
    const sums: Pt[] = []
    for (let mask = 0; mask < 32; mask++) {
      let bits = 0
      for (let k = 0; k < 5; k++) if (mask & (1 << k)) bits++
      if (bits !== s) continue
      let x = 0, y = 0
      for (let k = 0; k < 5; k++) if (mask & (1 << k)) { x += f[k][0]; y += f[k][1] }
      sums.push([x, y])
    }
    out.push(convexHull(sums))
  }
  return out
}

function inConvex(poly: Pt[], x: number, y: number): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false
  }
  return true
}

function proj(n: number[], basis: Pt[]): Pt {
  let x = 0, y = 0
  for (let k = 0; k < 5; k++) { x += n[k] * basis[k][0]; y += n[k] * basis[k][1] }
  return [x, y]
}

interface Period { vec: number[]; length: number; strain: number }

/** Horizontal period of Fibonacci order m (1-based). */
function periodA(m: number): Period {
  const a1 = FIB[m - 1], a2 = -FIB[m + 1]
  const vec = [-2 * a1 - 2 * a2, a1, a2, a2, a1]
  const x = proj(vec, EPAR), y = proj(vec, EPERP)
  return { vec, length: x[0], strain: y[0] / x[0] }
}

/** Vertical period of Fibonacci order m (1-based). */
function periodB(m: number): Period {
  const b1 = FIB[m], b2 = FIB[m - 1]
  const vec = [0, b1, b2, -b2, -b1]
  const x = proj(vec, EPAR), y = proj(vec, EPERP)
  return { vec, length: x[1], strain: y[1] / x[1] }
}

function bestOrder(target: number, f: (m: number) => Period, minOrder: number): number {
  let best = minOrder, bd = Infinity
  for (let m = minOrder; m <= MAX_ORDER; m++) {
    const d = Math.abs(Math.log(f(m).length / target))
    if (d < bd) { bd = d; best = m }
  }
  return best
}

const KEY_OFF = 512, KEY_BASE = 1024
function keyOf(n0: number, n1: number, n2: number, n3: number, n4: number): number {
  return ((((n0 + KEY_OFF) * KEY_BASE + (n1 + KEY_OFF)) * KEY_BASE + (n2 + KEY_OFF)) * KEY_BASE + (n3 + KEY_OFF)) * KEY_BASE + (n4 + KEY_OFF)
}

interface Rhombus { pts: Pt[]; thin: boolean }

/**
 * Enumerate the accepted vertices in the box [-margin, W+margin] x [-margin, H+margin]
 * (edge units) and assemble the rhombi.
 */
function buildTiling(W: number, H: number, lx: number, ly: number, t: Pt, margin: number): { rhombi: Rhombus[]; vertices: number } {
  const lo = -margin, hiX = W + margin, hiY = H + margin
  const corners: Pt[] = [[lo, lo], [hiX, lo], [lo, hiY], [hiX, hiY]]
  const xmax = Math.max(Math.hypot(hiX, hiY), Math.hypot(lo, lo))
  const ymax = WINDOW_RADIUS + Math.hypot(t[0], t[1]) + (Math.abs(lx) + Math.abs(ly)) * xmax + 0.5
  const range: [number, number][] = []
  for (let k = 0; k < 5; k++) {
    let mn = Infinity, mx = -Infinity
    for (const c of corners) { const d = c[0] * EPAR[k][0] + c[1] * EPAR[k][1]; mn = Math.min(mn, d); mx = Math.max(mx, d) }
    range.push([Math.floor(0.4 * (mn - ymax)), Math.ceil(0.4 * (mx + ymax) + 0.8)])
  }
  const windows = buildWindows(lx, ly)
  const accepted = new Map<number, number>() // key -> vertex index
  const vx: number[] = [], vy: number[] = []
  const vn: number[][] = []
  const d3: Pt = [EPAR[3][0] - EPAR[4][0], EPAR[3][1] - EPAR[4][1]]
  const dp3: Pt = [EPERP[3][0] - EPERP[4][0], EPERP[3][1] - EPERP[4][1]]
  // D = dp3 - L d3 : change of the strained perpendicular coordinate per unit n3
  const D: Pt = [dp3[0] - lx * d3[0], dp3[1] - ly * d3[1]]
  const DD = D[0] * D[0] + D[1] * D[1]
  for (let n0 = range[0][0]; n0 <= range[0][1]; n0++) {
    for (let n1 = range[1][0]; n1 <= range[1][1]; n1++) {
      for (let n2 = range[2][0]; n2 <= range[2][1]; n2++) {
        const px = n0 * EPAR[0][0] + n1 * EPAR[1][0] + n2 * EPAR[2][0]
        const py = n0 * EPAR[0][1] + n1 * EPAR[1][1] + n2 * EPAR[2][1]
        const qx = n0 * EPERP[0][0] + n1 * EPERP[1][0] + n2 * EPERP[2][0]
        const qy = n0 * EPERP[0][1] + n1 * EPERP[1][1] + n2 * EPERP[2][1]
        for (let s = 1; s <= 4; s++) {
          const T = s - n0 - n1 - n2
          // x = P + T e4 + n3 d3 ; y = Q + T f4 + n3 dp3 ; strained y' = y - L x
          const bx = px + T * EPAR[4][0], by = py + T * EPAR[4][1]
          const cx = qx + T * EPERP[4][0] - lx * bx - t[0]
          const cy = qy + T * EPERP[4][1] - ly * by - t[1]
          // |C + n3 D|^2 <= R^2
          const bq = 2 * (cx * D[0] + cy * D[1])
          const cq = cx * cx + cy * cy - WINDOW_RADIUS * WINDOW_RADIUS
          const disc = bq * bq - 4 * DD * cq
          if (disc < 0) continue
          const sq = Math.sqrt(disc)
          const r0 = Math.ceil((-bq - sq) / (2 * DD)), r1 = Math.floor((-bq + sq) / (2 * DD))
          for (let n3 = r0; n3 <= r1; n3++) {
            const n4 = T - n3
            const x = bx + n3 * d3[0], y = by + n3 * d3[1]
            if (x < lo || x > hiX || y < lo || y > hiY) continue
            const wx = cx + n3 * D[0], wy = cy + n3 * D[1]
            if (!inConvex(windows[s - 1], wx, wy)) continue
            accepted.set(keyOf(n0, n1, n2, n3, n4), vx.length)
            vx.push(x); vy.push(y); vn.push([n0, n1, n2, n3, n4])
          }
        }
      }
    }
  }
  // rhombi: lattice squares with all four corners accepted
  const rhombi: Rhombus[] = []
  const shifted = (n: number[], j: number, k: number): number => {
    const m = n.slice(); m[j]++; if (k >= 0) m[k]++
    return keyOf(m[0], m[1], m[2], m[3], m[4])
  }
  for (let i = 0; i < vn.length; i++) {
    const n = vn[i]
    for (let j = 0; j < 5; j++) {
      const ij = accepted.get(shifted(n, j, -1))
      if (ij === undefined) continue
      for (let k = j + 1; k < 5; k++) {
        const ik = accepted.get(shifted(n, k, -1))
        if (ik === undefined) continue
        const ijk = accepted.get(shifted(n, j, k))
        if (ijk === undefined) continue
        let pts: Pt[] = [[vx[i], vy[i]], [vx[ij], vy[ij]], [vx[ijk], vy[ijk]], [vx[ik], vy[ik]]]
        if (cross(EPAR[j], EPAR[k]) < 0) pts = [pts[0], pts[3], pts[2], pts[1]]
        const diff = (k - j) % 5
        rhombi.push({ pts, thin: diff === 2 || diff === 3 })
        if (rhombi.length > MAX_RHOMBI) return { rhombi, vertices: vn.length }
      }
    }
  }
  return { rhombi, vertices: vn.length }
}

function polygonArea(p: Pt[]): number {
  let s = 0
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; s += p[i][0] * q[1] - q[0] * p[i][1] }
  return s / 2
}

function pointKey(p: Pt): string { return `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}` }

export const penroseApproximantGenerator: Generator = {
  id: 'penroseApproximant',
  name: 'Penrose tiling (seamless)',
  description: 'Seamless periodic approximant of the Penrose P3 rhombus tiling: true rhombi in a repeating arrangement (cut-and-project with a Fibonacci phason strain). Width is honoured, height snaps to the nearest period.',
  params: [
    { key: 'width', label: 'Width', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    { key: 'height', label: 'Height', type: 'number', default: 40, min: 5, max: 300, step: 1, hint: 'snaps to the nearest achievable period' },
    {
      key: 'style', label: 'Style', type: 'select', default: 'edges',
      options: [
        { value: 'edges', label: 'Rhombus edges' },
        { value: 'thin', label: 'Thin rhombi only' },
        { value: 'thick', label: 'Thick rhombi only' },
        { value: 'all', label: 'All rhombi (inset)' },
      ],
    },
    { key: 'edge', label: 'Rhombus edge (mm)', type: 'number', default: 5, min: 1, max: 60, step: 0.5, hint: 'adjusted slightly so a whole period fits the width' },
    { key: 'minOrder', label: 'Min order', type: 'int', default: 2, min: 1, max: 6, step: 1, hint: 'lowest Fibonacci order allowed; higher = closer to true Penrose but longer periods (smaller rhombi for a given width)' },
    { key: 'gap', label: 'Gap', type: 'number', default: 1.0, min: 0, max: 5, step: 0.1, hint: 'inset applied to filled rhombi, mm' },
    { key: 'ribWidth', label: 'Rib width', type: 'number', default: 1.6, min: 0.4, max: 6, step: 0.1 },
    { key: 'seed', label: 'Seed', type: 'int', default: 1, min: 0, max: 999999, step: 1, hint: 'shifts the window: a different patch of the tiling' },
  ],
  generate(params: Record<string, ParamValue>, ctx: GeneratorContext) {
    const width = Math.max(1, getNum(params, 'width', 40))
    const heightReq = Math.max(1, getNum(params, 'height', 40))
    const style = String(params.style ?? 'edges')
    let edge = Math.max(0.3, getNum(params, 'edge', 5))
    const minOrder = Math.max(1, Math.min(6, Math.round(getNum(params, 'minOrder', 2))))
    const gap = Math.max(0, getNum(params, 'gap', 1))
    const ribWidth = getNum(params, 'ribWidth', 1.6)
    const notes: string[] = []

    // keep the rhombus count printable and the enumeration fast
    const minEdge = Math.sqrt((width * heightReq) / (MAX_RHOMBI * 0.8))
    if (edge < minEdge) { edge = minEdge; notes.push(`edge raised to ${edge.toFixed(2)} mm to keep the tile under ${MAX_RHOMBI} rhombi`) }

    const mA = bestOrder(width / edge, periodA, minOrder)
    const A = periodA(mA)
    const unit = width / A.length // mm per edge unit: honour the width exactly
    const mB = bestOrder(heightReq / unit, periodB, minOrder)
    const B = periodB(mB)
    const W = A.length, H = B.length
    const height = H * unit
    // window offset from the seed (any generic offset gives a valid patch)
    const t: Pt = [(ctx.rand() - 0.5) * 0.6, (ctx.rand() - 0.5) * 0.6]

    const { rhombi, vertices } = buildTiling(W, H, A.strain, B.strain, t, 2.2)
    if (rhombi.length > MAX_RHOMBI) notes.push('rhombus budget exceeded; the tile is incomplete')
    notes.push(`period ${W.toFixed(2)} x ${H.toFixed(2)} edges (orders ${mA}/${mB}), edge ${unit.toFixed(2)} mm, strain ${(100 * Math.abs(A.strain)).toFixed(1)}% / ${(100 * Math.abs(B.strain)).toFixed(1)}%, ${vertices} vertices`)

    // self-check: the rhombi whose centroid lies in one period cell must tile it
    // exactly (the cell is shifted a little because many centroids sit exactly
    // on the symmetry axes y = 0 and x = 0)
    let cellArea = 0
    const sx = 0.1234, sy = 0.0567
    for (const r of rhombi) {
      const cx = (r.pts[0][0] + r.pts[1][0] + r.pts[2][0] + r.pts[3][0]) / 4
      const cy = (r.pts[0][1] + r.pts[1][1] + r.pts[2][1] + r.pts[3][1]) / 4
      if (cx >= sx && cx < W + sx && cy >= sy && cy < H + sy) cellArea += Math.abs(polygonArea(r.pts))
    }
    const areaErr = Math.abs(cellArea - W * H) / (W * H)
    if (areaErr > 1e-3) notes.push(`self-check failed: tiles cover ${(100 * cellArea / (W * H)).toFixed(2)}% of the period cell (raise Min order)`)

    const scale = (p: Pt): Pt => [p[0] * unit, p[1] * unit]
    if (style === 'edges') {
      const seen = new Set<string>()
      const curves: TileCurve[] = []
      const pad = ribWidth
      for (const r of rhombi) {
        for (let i = 0; i < 4; i++) {
          const a = scale(r.pts[i]), b = scale(r.pts[(i + 1) % 4])
          const ka = pointKey(a), kb = pointKey(b)
          const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
          if (seen.has(key)) continue
          seen.add(key)
          if (Math.max(a[0], b[0]) < -pad || Math.min(a[0], b[0]) > width + pad || Math.max(a[1], b[1]) < -pad || Math.min(a[1], b[1]) > height + pad) continue
          curves.push({ points: [a, b], closed: false })
        }
      }
      return { width, height, polygons: [], curves, ribWidth, notes }
    }

    const polygons: Pt[][] = []
    for (const r of rhombi) {
      if (style === 'thin' && !r.thin) continue
      if (style === 'thick' && r.thin) continue
      const poly = r.pts.map(scale)
      const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1])
      if (Math.max(...xs) < 0 || Math.min(...xs) > width || Math.max(...ys) < 0 || Math.min(...ys) > height) continue
      const inset = gap > 0 ? insetConvex(poly, gap / 2) : poly
      if (inset) polygons.push(inset)
    }
    return { width, height, polygons, curves: [], ribWidth, notes }
  },
}
