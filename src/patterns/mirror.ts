// Kaleidoscope: reflect a tile into a 2 x 2 arrangement (original, mirrored
// in x, mirrored in y, mirrored in both). Every line that reaches a box edge
// meets its own reflection there, so the doubled tile repeats seamlessly
// whatever the source pattern was. The price is a visible mirror symmetry.
import type { Pt, Tile, TileCurve } from './types'

export function mirrorPolygons(polys: Pt[][], w: number, h: number): Pt[][] {
  const out: Pt[][] = []
  for (const p of polys) {
    out.push(p)
    out.push(p.map(([x, y]) => [2 * w - x, y] as Pt).reverse())
    out.push(p.map(([x, y]) => [x, 2 * h - y] as Pt).reverse())
    out.push(p.map(([x, y]) => [2 * w - x, 2 * h - y] as Pt))
  }
  return out
}

function mirrorCurves(curves: TileCurve[], w: number, h: number): TileCurve[] {
  const out: TileCurve[] = []
  for (const c of curves) {
    out.push(c)
    out.push({ closed: c.closed, points: c.points.map(([x, y]) => [2 * w - x, y] as Pt) })
    out.push({ closed: c.closed, points: c.points.map(([x, y]) => [x, 2 * h - y] as Pt) })
    out.push({ closed: c.closed, points: c.points.map(([x, y]) => [2 * w - x, 2 * h - y] as Pt) })
  }
  return out
}

/** Double the tile in both directions by reflection. */
export function mirrorTile(t: Tile): Tile {
  const { width: w, height: h } = t
  return {
    ...t,
    width: 2 * w,
    height: 2 * h,
    polygons: mirrorPolygons(t.polygons, w, h),
    curves: mirrorCurves(t.curves, w, h),
    notes: [...(t.notes ?? []), 'The repeat contains four reflected copies of the source motif.'],
  }
}
