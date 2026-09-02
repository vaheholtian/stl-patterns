// Seamless periodic Delaunay mesh tile: shares the periodic seeding and
// Lloyd relaxation from voronoiTile.ts, then emits the triangulation edges
// (clipped to the tile box) as open polyline curves instead of filled cells.

import { Delaunay } from 'd3-delaunay'
import type { Generator, GeneratorContext, ParamValue, Pt, TileCurve } from './types'
import { gradientParams, getNum } from './types'
import { periodicSeeds } from './voronoiTile'

/** Liang-Barsky clip of segment a-b to [0,width] x [0,height]. Returns null if fully outside. */
function clipSegmentToBox(a: Pt, b: Pt, width: number, height: number): [Pt, Pt] | null {
  let t0 = 0, t1 = 1
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const checks: [number, number][] = [
    [-dx, a[0]],
    [dx, width - a[0]],
    [-dy, a[1]],
    [dy, height - a[1]],
  ]
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null
      continue
    }
    const r = q / p
    if (p < 0) {
      if (r > t1) return null
      if (r > t0) t0 = r
    } else {
      if (r < t0) return null
      if (r < t1) t1 = r
    }
  }
  if (t0 > t1) return null
  const p0: Pt = [a[0] + t0 * dx, a[1] + t0 * dy]
  const p1: Pt = [a[0] + t1 * dx, a[1] + t1 * dy]
  if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 1e-9) return null
  return [p0, p1]
}

export const delaunayTileGenerator: Generator = {
  id: 'delaunayTile',
  name: 'Delaunay mesh',
  description: 'Seamless periodic Delaunay triangulation, drawn as grooved edges.',
  params: [
    { key: 'width', label: 'Width', type: 'number', default: 40, min: 5, max: 300, step: 1, hint: 'tile width, mm' },
    { key: 'height', label: 'Height', type: 'number', default: 40, min: 5, max: 300, step: 1, hint: 'tile height, mm' },
    { key: 'cellSize', label: 'Cell size', type: 'number', default: 8, min: 2, max: 60, step: 0.5, hint: 'mean seed spacing, mm' },
    { key: 'relax', label: 'Relax iterations', type: 'int', default: 2, min: 0, max: 8, step: 1, hint: 'Lloyd relaxation passes' },
    { key: 'ribWidth', label: 'Rib width', type: 'number', default: 1.6, min: 0.4, max: 6, step: 0.1, hint: 'groove stroke width, mm' },
    { key: 'seed', label: 'Seed', type: 'int', default: 1, min: 0, max: 999999, step: 1 },
    ...gradientParams,
  ],
  generate(params: Record<string, ParamValue>, ctx: GeneratorContext) {
    const { all, width, height } = periodicSeeds(params, ctx)
    const ribWidth = getNum(params, 'ribWidth', 1.6)

    const delaunay = Delaunay.from(all)
    const { triangles } = delaunay

    const seen = new Set<string>()
    const curves: TileCurve[] = []
    const addEdge = (i: number, j: number) => {
      const key = i < j ? `${i}_${j}` : `${j}_${i}`
      if (seen.has(key)) return
      seen.add(key)
      const clipped = clipSegmentToBox(all[i], all[j], width, height)
      if (clipped) curves.push({ points: clipped, closed: false })
    }

    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2]
      addEdge(a, b)
      addEdge(b, c)
      addEdge(c, a)
    }

    return { width, height, polygons: [], curves, ribWidth }
  },
}
