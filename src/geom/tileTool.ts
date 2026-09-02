import type { Manifold, ManifoldToplevel } from './manifold'
import type { Parameterization } from './parameterization'

export type Polygon = [number, number][]

/** Insert points along polygon edges so no edge is longer than maxLen. */
export function subdividePolygon(poly: Polygon, maxLen: number): Polygon {
  const out: Polygon = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const n = Math.max(1, Math.ceil(len / maxLen))
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  return out
}

/**
 * Turn flat polygons (in the parameterization's 2D mm space) into a solid that
 * follows the surface: extrude a slab from zMin to zMax (along the normal),
 * refine so no edge is longer than maxEdge, then warp every vertex onto the surface.
 */
export function buildSurfaceTool(
  m: ManifoldToplevel,
  param: Parameterization,
  polygons: Polygon[],
  zMin: number,
  zMax: number,
  maxEdge = 2.0,
): Manifold {
  // outline edges are subdivided finer than the interior so mapped outlines stay smooth
  const refined = polygons.map((p) => subdividePolygon(p, maxEdge / 2))
  const cs = new m.CrossSection(refined, 'EvenOdd')
  let slab = m.Manifold.extrude(cs, zMax - zMin).translate([0, 0, zMin])
  cs.delete()
  const fine = slab.refineToLength(maxEdge)
  slab.delete()
  slab = fine
  const tmp = new Float32Array(3)
  const warped = slab.warp((v) => {
    param.toSurface(v[0], v[1], v[2], tmp)
    v[0] = tmp[0]; v[1] = tmp[1]; v[2] = tmp[2]
  })
  slab.delete()
  return warped
}
