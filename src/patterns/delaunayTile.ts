// Seamless periodic Delaunay mesh tile: shares the periodic seeding and
// Lloyd relaxation from voronoiTile.ts, then emits the triangulation edges
// (clipped after stroking) as open polyline curves instead of filled cells.

import { Delaunay } from 'd3-delaunay'
import type { Generator, GeneratorContext, ParamValue, Pt, TileCurve } from './types'
import { gradientParams, getNum } from './types'
import { periodicSeeds } from './voronoiTile'

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
    const n = all.length / 9 // central seeds come first

    // Take every edge that touches a central seed, then lay that one edge set
    // down at all nine offsets. The result is periodic by construction, even
    // where the triangulation of the replicated block is ambiguous (a single
    // seed makes a lattice, whose diagonals the triangulator picks at random).
    const edges = new Map<string, [Pt, Pt]>()
    const addEdge = (i: number, j: number) => {
      if (i >= n && j >= n) return
      const key = i < j ? `${i}_${j}` : `${j}_${i}`
      if (!edges.has(key)) edges.set(key, [all[i], all[j]])
    }
    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2]
      addEdge(a, b)
      addEdge(b, c)
      addEdge(c, a)
    }
    const seen = new Set<string>()
    const curves: TileCurve[] = []
    const keyOf = (p: Pt) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`
    const pad = ribWidth
    for (const [a0, b0] of edges.values()) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const a: Pt = [a0[0] + ox * width, a0[1] + oy * height], b: Pt = [b0[0] + ox * width, b0[1] + oy * height]
      // Clip after stroking; clipping the centreline adds artificial seam caps.
      if (Math.max(a[0], b[0]) < -pad || Math.min(a[0], b[0]) > width + pad ||
          Math.max(a[1], b[1]) < -pad || Math.min(a[1], b[1]) > height + pad) continue
      const ka = keyOf(a), kb = keyOf(b), key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      if (seen.has(key)) continue
      seen.add(key)
      curves.push({ points: [a, b], closed: false })
    }

    return { width, height, polygons: [], curves, ribWidth }
  },
}
