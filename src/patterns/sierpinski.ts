// Sierpinski fractal generator.
//
// Two classic Sierpinski fractals, both built by repeatedly removing the
// "middle" of a shape and recursing into the remaining pieces. The removed
// pieces are the feature: they become the tile's polygons (holes/recesses),
// while the kept material is implicit (nothing drawn there).
//
//   - 'carpet': the box itself is the level-0 square. Each cell is split
//     into a 3x3 grid (independently in x and y, so a non-square box still
//     works) and the centre cell is removed; the 8 remaining cells recurse.
//     Because the removed square at every level sits strictly inside the
//     middle third of its parent cell (never touching that cell's own
//     edges), no removed square, at any recursion depth, ever touches the
//     outer box boundary. The box edges therefore stay full material and
//     the tiling is seamless across tile edges.
//   - 'triangle': the "big triangle" is inscribed in the box apex-up (apex
//     at top-centre, base corners at the bottom two corners of the box).
//     Each triangle's medial triangle (formed by its three edge midpoints)
//     is removed and the three corner triangles recurse. The medial
//     triangle of any triangle is always similar to it at exactly half
//     scale, so recursion depth maps directly to feature size. This style
//     is a single centred motif and is NOT seamless across tile edges.
//
// In both styles the removed polygons are disjoint by construction (each
// recursion only ever removes from the interior of a piece that has not
// itself been removed), so polygons are never nested.
//
// `depth` sets the requested recursion depth, but `minFeature` caps it
// automatically per branch: recursion stops as soon as the *next* level's
// removed feature would be smaller than `minFeature`, regardless of how
// much of `depth` is left. This keeps point counts sane even at the
// maximum depth on a small tile.

import type { Generator, GeneratorContext, ParamValue, Pt } from './types'
import { getNum } from './types'

const MAX_CARPET_SQUARES = 20000

function rectPoly(x: number, y: number, w: number, h: number): Pt[] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]
}

/** Recursively remove the centre cell of a 3x3 split of [x0,y0,w,h], then
 * recurse into the 8 remaining cells. Stops when either the requested depth
 * is exhausted or the next removed square would be smaller than
 * `minFeature`. */
function carpet(x0: number, y0: number, w: number, h: number, depthRemaining: number, minFeature: number, polygons: Pt[][]): void {
  if (depthRemaining <= 0 || polygons.length >= MAX_CARPET_SQUARES) return
  const cw = w / 3
  const ch = h / 3
  if (cw < minFeature || ch < minFeature) return
  polygons.push(rectPoly(x0 + cw, y0 + ch, cw, ch))
  for (let iy = 0; iy < 3; iy++) {
    for (let ix = 0; ix < 3; ix++) {
      if (ix === 1 && iy === 1) continue // the cell we just removed
      carpet(x0 + ix * cw, y0 + iy * ch, cw, ch, depthRemaining - 1, minFeature, polygons)
    }
  }
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function mid(a: Pt, b: Pt): Pt {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

/** Recursively remove the medial (inverted) triangle of A,B,C, then recurse
 * into the 3 corner triangles. The medial triangle is always exactly
 * half-scale, so `dist(A,B)/2` is both the size of the triangle about to be
 * removed and the feature-size test against `minFeature`. */
function sierpTriangle(A: Pt, B: Pt, C: Pt, depthRemaining: number, minFeature: number, polygons: Pt[][]): void {
  if (depthRemaining <= 0) return
  const removedSize = dist(A, B) / 2
  if (removedSize < minFeature) return
  const mAB = mid(A, B)
  const mBC = mid(B, C)
  const mAC = mid(A, C)
  polygons.push([mAB, mBC, mAC])
  sierpTriangle(A, mAB, mAC, depthRemaining - 1, minFeature, polygons)
  sierpTriangle(mAB, B, mBC, depthRemaining - 1, minFeature, polygons)
  sierpTriangle(mAC, mBC, C, depthRemaining - 1, minFeature, polygons)
}

export const sierpinskiGenerator: Generator = {
  id: 'sierpinski',
  name: 'Sierpinski fractal',
  description: 'Sierpinski carpet or triangle motifs. Repeated carpets retain square borders; triangles remain separate motifs. Not an all-over surface pattern.',
  seamless: () => true,
  params: [
    { key: 'width', label: 'Width', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    { key: 'height', label: 'Height', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    {
      key: 'style', label: 'Style', type: 'select', default: 'carpet',
      options: [
        { value: 'carpet', label: 'Carpet (seamless)' },
        { value: 'triangle', label: 'Triangle' },
      ],
    },
    { key: 'depth', label: 'Depth', type: 'int', default: 3, min: 0, max: 6, step: 1, hint: 'requested recursion depth; minFeature may stop earlier' },
    { key: 'minFeature', label: 'Min feature', type: 'number', default: 1.0, min: 0.1, max: 10, step: 0.1, hint: 'smallest detail; deeper recursion is skipped below this' },
    { key: 'seed', label: 'Seed', type: 'int', default: 1, min: 0, max: 999999, step: 1 },
  ],
  generate(params: Record<string, ParamValue>, _ctx: GeneratorContext) {
    const width = getNum(params, 'width', 40)
    const height = getNum(params, 'height', 40)
    const style = String(params.style ?? 'carpet')
    const depth = Math.max(0, Math.min(6, Math.round(getNum(params, 'depth', 3))))
    const minFeature = Math.max(0.01, getNum(params, 'minFeature', 1.0))

    const polygons: Pt[][] = []
    if (style === 'triangle') {
      const apex: Pt = [width / 2, height]
      const baseLeft: Pt = [0, 0]
      const baseRight: Pt = [width, 0]
      sierpTriangle(apex, baseLeft, baseRight, depth, minFeature, polygons)
    } else {
      carpet(0, 0, width, height, depth, minFeature, polygons)
    }

    return { width, height, polygons, curves: [], ribWidth: 1.6 }
  },
}
