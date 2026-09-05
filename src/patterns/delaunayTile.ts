// Seamless periodic Delaunay mesh tile: shares the periodic seeding and
// Lloyd relaxation from voronoiTile.ts, then emits the triangulation edges
// (clipped after stroking) as open polyline curves instead of filled cells.

import { Delaunay } from 'd3-delaunay'
import type { Generator, GeneratorContext, ParamValue, TileCurve } from './types'
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

    const seen = new Set<string>()
    const curves: TileCurve[] = []
    const addEdge = (i: number, j: number) => {
      const key = i < j ? `${i}_${j}` : `${j}_${i}`
      if (seen.has(key)) return
      seen.add(key)
      // Clip after stroking; clipping the centreline adds artificial seam caps.
      const a = all[i], b = all[j], pad = ribWidth
      if (Math.max(a[0], b[0]) < -pad || Math.min(a[0], b[0]) > width + pad ||
          Math.max(a[1], b[1]) < -pad || Math.min(a[1], b[1]) > height + pad) return
      curves.push({ points: [a, b], closed: false })
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
