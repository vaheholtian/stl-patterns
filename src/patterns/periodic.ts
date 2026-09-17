import type { ManifoldToplevel } from 'manifold-3d'
import type { Pt, Tile } from './types'
import { tileToCrossSection } from './pipeline'

export interface Periodicity { x: boolean; y: boolean }

/**
 * The spans where the tile's material meets one box edge, merged and sorted.
 * Clipping to the box leaves an edge lying exactly on the boundary wherever
 * material crosses it, so these are read off directly rather than sampled: a
 * thin strip inside the edge would compare a widening profile against a
 * narrowing one wherever a feature meets the boundary at an angle.
 */
function edgeSpans(polys: Pt[][], axis: 0 | 1, edge: number, tol = 1e-6): number[][] {
  const list: number[][] = []
  for (const poly of polys) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    if (Math.abs(a[axis] - edge) < tol && Math.abs(b[axis] - edge) < tol) {
      const lo = Math.min(a[1 - axis], b[1 - axis]), hi = Math.max(a[1 - axis], b[1 - axis])
      if (hi - lo > 1e-5) list.push([lo, hi])
    }
  }
  list.sort((p, q) => p[0] - q[0])
  const merged: number[][] = []
  for (const span of list) {
    const last = merged[merged.length - 1]
    if (last && span[0] - last[1] < 1e-5) last[1] = Math.max(last[1], span[1])
    else merged.push(span)
  }
  return merged
}

function spansMatch(a: number[][], b: number[][], tol: number): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i][0] - b[i][0]) > tol || Math.abs(a[i][1] - b[i][1]) > tol) return false
  return true
}

/**
 * Do the tile's opposite box edges carry the same profile? Two copies side by
 * side join without a seam exactly when the material crossing the left edge
 * matches the material crossing the right edge, and likewise top to bottom.
 *
 * Measured from the artwork as drawn, with no cleanup and no periodic
 * stitching: the stitching's whole job is to make opposite edges identical, so
 * running this on its output would only ever confirm that it ran. A tile whose
 * design never reaches an edge matches trivially, which is the right answer —
 * nothing crosses that seam.
 */
export function tilePeriodicity(m: ManifoldToplevel, tile: Tile, tol = 0.02): Periodicity {
  const cs = tileToCrossSection(m, tile, { minFeature: 0, periodic: false, clipToBox: true })
  try {
    const polys = cs.toPolygons() as Pt[][]
    return {
      x: spansMatch(edgeSpans(polys, 0, 0), edgeSpans(polys, 0, tile.width), tol),
      y: spansMatch(edgeSpans(polys, 1, 0), edgeSpans(polys, 1, tile.height), tol),
    }
  } finally { cs.delete() }
}
