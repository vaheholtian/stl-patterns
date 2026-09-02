// Seamless periodic Voronoi tile: seeds are relaxed on a 3x3 periodic
// replication of the tile box, then each central cell is inset by half the
// rib width and clipped back to the box. What remains between the inset
// cells (not drawn here) reads as the connected rib network.

import { Delaunay } from 'd3-delaunay'
import type { Generator, GeneratorContext, ParamValue, Pt } from './types'
import { gradientParams, getNum, samplePoints } from './types'

export interface PeriodicSeeds {
  /** relaxed seed positions inside [0,width) x [0,height) */
  central: Pt[]
  /** central seeds replicated into the 3x3 neighbourhood, central copies first */
  all: Pt[]
  width: number
  height: number
}

/** Offsets (in box units) for the 3x3 periodic replication, central tile first. */
const REPLICATION_OFFSETS: Pt[] = [
  [0, 0],
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
]

function replicate(central: Pt[], width: number, height: number): Pt[] {
  const all: Pt[] = []
  for (const [ox, oy] of REPLICATION_OFFSETS) {
    for (const [x, y] of central) all.push([x + ox * width, y + oy * height])
  }
  return all
}

/** Strip a closing duplicate point (d3-delaunay polygons repeat the first point last). */
function openRing(poly: Pt[]): Pt[] {
  if (poly.length > 1) {
    const a = poly[0], b = poly[poly.length - 1]
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) return poly.slice(0, -1)
  }
  return poly
}

function polygonCentroid(poly: Pt[]): Pt | null {
  const pts = openRing(poly)
  const n = pts.length
  if (n < 3) return null
  let area = 0, cx = 0, cy = 0
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % n]
    const cross = x0 * y1 - x1 * y0
    area += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  }
  area *= 0.5
  if (Math.abs(area) < 1e-9) return null
  cx /= 6 * area
  cy /= 6 * area
  return [cx, cy]
}

/**
 * Sample seeds, replicate them into the 3x3 periodic neighbourhood, and
 * relax with `relax` Lloyd iterations. Returns the relaxed central seeds
 * plus their periodic replicas.
 */
export function periodicSeeds(params: Record<string, ParamValue>, ctx: GeneratorContext): PeriodicSeeds {
  const width = getNum(params, 'width', 40)
  const height = getNum(params, 'height', 40)
  const cellSize = Math.max(0.5, getNum(params, 'cellSize', 8))
  const relax = Math.max(0, Math.round(getNum(params, 'relax', 2)))
  const count = Math.max(1, Math.round((width * height) / (cellSize * cellSize * 0.866)))

  let central = samplePoints(params, count, width, height, ctx.rand)

  for (let iter = 0; iter < relax; iter++) {
    const all = replicate(central, width, height)
    const delaunay = Delaunay.from(all)
    const voronoi = delaunay.voronoi([-width, -height, 2 * width, 2 * height])
    const next: Pt[] = central.slice()
    for (let i = 0; i < central.length; i++) {
      const poly = voronoi.cellPolygon(i)
      if (!poly) continue
      const c = polygonCentroid(poly)
      if (!c) continue
      // wrap the relaxed centroid back into the box so replication stays periodic
      const x = ((c[0] % width) + width) % width
      const y = ((c[1] % height) + height) % height
      next[i] = [x, y]
    }
    central = next
  }

  return { central, all: replicate(central, width, height), width, height }
}

/**
 * Inset a convex polygon inward by `dist`, offsetting each edge along its
 * inward normal and intersecting consecutive offset edges. Returns null if
 * the polygon degenerates (too small, or the inset collapses/flips it).
 */
export function insetConvexPolygon(input: Pt[], dist: number): Pt[] | null {
  const pts = openRing(input)
  const n = pts.length
  if (n < 3) return null
  if (dist <= 0) return pts.slice()

  let area = 0
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % n]
    area += x0 * y1 - x1 * y0
  }
  area *= 0.5
  if (Math.abs(area) < 1e-9) return null
  const sign = area > 0 ? 1 : -1

  const lines: { p: Pt; d: Pt }[] = []
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    let dx = b[0] - a[0], dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    if (len < 1e-9) return null
    dx /= len; dy /= len
    // inward normal: rotate the edge direction by -90deg for CCW polygons, +90deg for CW
    const nx = sign > 0 ? -dy : dy
    const ny = sign > 0 ? dx : -dx
    lines.push({ p: [a[0] + nx * dist, a[1] + ny * dist], d: [dx, dy] })
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
    const dx = l1.p[0] - l0.p[0], dy = l1.p[1] - l0.p[1]
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

/** Sutherland-Hodgman clip of a (possibly non-convex-after-inset) polygon to [0,w]x[0,h]. */
export function clipPolygonToBox(poly: Pt[], width: number, height: number): Pt[] {
  let pts = poly
  pts = clipEdge(pts, (p) => p[0] >= 0, (a, b) => {
    const t = (0 - a[0]) / (b[0] - a[0])
    return [0, a[1] + t * (b[1] - a[1])]
  })
  pts = clipEdge(pts, (p) => p[0] <= width, (a, b) => {
    const t = (width - a[0]) / (b[0] - a[0])
    return [width, a[1] + t * (b[1] - a[1])]
  })
  pts = clipEdge(pts, (p) => p[1] >= 0, (a, b) => {
    const t = (0 - a[1]) / (b[1] - a[1])
    return [a[0] + t * (b[0] - a[0]), 0]
  })
  pts = clipEdge(pts, (p) => p[1] <= height, (a, b) => {
    const t = (height - a[1]) / (b[1] - a[1])
    return [a[0] + t * (b[0] - a[0]), height]
  })
  return pts
}

export const voronoiTileGenerator: Generator = {
  id: 'voronoiTile',
  name: 'Voronoi cells',
  description: 'Seamless periodic Voronoi cells with a relaxed, evenly spaced layout.',
  params: [
    { key: 'width', label: 'Width', type: 'number', default: 40, min: 5, max: 300, step: 1, hint: 'tile width, mm' },
    { key: 'height', label: 'Height', type: 'number', default: 40, min: 5, max: 300, step: 1, hint: 'tile height, mm' },
    { key: 'cellSize', label: 'Cell size', type: 'number', default: 8, min: 2, max: 60, step: 0.5, hint: 'mean seed spacing, mm' },
    { key: 'relax', label: 'Relax iterations', type: 'int', default: 2, min: 0, max: 8, step: 1, hint: 'Lloyd relaxation passes' },
    { key: 'ribWidth', label: 'Rib width', type: 'number', default: 1.6, min: 0.4, max: 6, step: 0.1, hint: 'width of the rib left between cells, mm' },
    { key: 'seed', label: 'Seed', type: 'int', default: 1, min: 0, max: 999999, step: 1 },
    ...gradientParams,
  ],
  generate(params: Record<string, ParamValue>, ctx: GeneratorContext) {
    const { all, width, height } = periodicSeeds(params, ctx)
    const ribWidth = getNum(params, 'ribWidth', 1.6)
    const half = ribWidth / 2

    const delaunay = Delaunay.from(all)
    const voronoi = delaunay.voronoi([-width, -height, 2 * width, 2 * height])

    // Every replica's cell is clipped to the box, so the part of a central cell
    // that crosses one edge reappears on the opposite edge through its replica.
    const polygons: Pt[][] = []
    for (let i = 0; i < all.length; i++) {
      const cell = voronoi.cellPolygon(i)
      if (!cell) continue
      const inset = insetConvexPolygon(cell, half)
      if (!inset) continue
      const clipped = clipPolygonToBox(inset, width, height)
      if (clipped.length >= 3) polygons.push(clipped)
    }

    return { width, height, polygons, curves: [], ribWidth }
  },
}
