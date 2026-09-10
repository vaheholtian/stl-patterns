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

/** True when every vertex normal of the piece points the same way (a planar face). */
export function isPlanar(param: Parameterization, maxAngleDeg = 0.5): boolean {
  const n = param.sub.normals
  if (n.length < 6) return true
  const cosMin = Math.cos((maxAngleDeg * Math.PI) / 180)
  for (let v = 3; v < n.length; v += 3) {
    if (n[0] * n[v] + n[1] * n[v + 1] + n[2] * n[v + 2] < cosMin) return false
  }
  return true
}

/**
 * Turn flat polygons (in the parameterization's 2D mm space) into a solid that
 * follows the surface: extrude a slab from zMin to zMax (along the normal),
 * refine so no edge is longer than maxEdge, then warp every vertex onto the surface.
 * A planar piece maps affinely, so it is warped without refinement: refining a
 * flat face only multiplies triangles and slows the boolean.
 */
export function buildSurfaceTool(
  m: ManifoldToplevel,
  param: Parameterization,
  polygons: Polygon[],
  zMin: number,
  zMax: number,
  maxEdge = 2.0,
): Manifold {
  const planar = isPlanar(param)
  // outline edges are subdivided finer than the interior so mapped outlines stay smooth
  const refined = planar ? polygons : polygons.map((p) => subdividePolygon(p, maxEdge / 2))
  const cs = new m.CrossSection(refined, 'EvenOdd')
  let slab = m.Manifold.extrude(cs, zMax - zMin).translate([0, 0, zMin])
  cs.delete()
  if (!planar) {
    const fine = slab.refineToLength(maxEdge)
    slab.delete()
    slab = fine
  }
  const tmp = new Float32Array(3)
  const warped = slab.warp((v) => {
    param.toSurface(v[0], v[1], v[2], tmp)
    v[0] = tmp[0]; v[1] = tmp[1]; v[2] = tmp[2]
  })
  slab.delete()
  return warped
}

/**
 * A straight fold's mitre: the plane through the fold line (`point`, `direction`,
 * extending `halfLength` each way) bisecting the two faces, with `normal`
 * pointing to the side of the piece that owns it, and `faceNormal` the
 * owning piece's surface normal at the fold.
 */
export interface Mitre { point: [number, number, number]; normal: [number, number, number]; direction: [number, number, number]; halfLength: number; faceNormal: [number, number, number] }

/**
 * The tool's extent along the surface normal for an operation, mm: a cut goes
 * a millimetre past the wall's far side and starts a millimetre above the
 * surface, a recess reaches `depth` in, an emboss `depth` out (and a little in
 * so it fuses with the surface). One definition for the layout, the worker and
 * every test, so the pattern is continued past a fold exactly as far as this
 * tool needs.
 */
export function toolOffsetRange(mode: 'cut' | 'recess' | 'emboss', depth: number, wallThickness: number): [number, number] {
  return mode === 'cut' ? [-(wallThickness + 1), 1] : mode === 'recess' ? [-depth, 1] : [-0.2, depth]
}

/**
 * How far (mm, in the face's own plane) a tool spanning offsets [zMin, zMax]
 * along the face normal must continue past the fold so that it reaches the
 * mitre plane. The mitre crosses the offset `z` at `u = z * k` past the fold,
 * where k comes from the plane's normal: for a convex bend of θ between the
 * face normals that is tan(θ/2) at the outside (an emboss), nothing on the
 * inside; for a concave valley the reverse (a cut must go past the fold to
 * clear the far side). Infinity when the faces fold back on themselves.
 */
export function mitreReach(mitre: Mitre, zMin: number, zMax: number): number {
  const { normal: m, direction: d, faceNormal: n } = mitre
  // in-face direction perpendicular to the fold, pointing away from the piece (past the fold)
  let ex = d[1] * n[2] - d[2] * n[1], ey = d[2] * n[0] - d[0] * n[2], ez = d[0] * n[1] - d[1] * n[0]
  const len = Math.hypot(ex, ey, ez) || 1
  ex /= len; ey /= len; ez /= len
  let me = m[0] * ex + m[1] * ey + m[2] * ez
  if (me > 0) me = -me // m points to the piece's inside, e away from it
  const mn = m[0] * n[0] + m[1] * n[1] + m[2] * n[2]
  if (-me < 1e-3) return Infinity
  const k = mn / -me
  return Math.max(0, zMax * k, zMin * k)
}

/** The bend between the two faces of a mitre, degrees (0 flat, 90 a box edge, near 180 a knife edge). */
export function mitreBendDeg(mitre: Mitre): number {
  const { normal: m, faceNormal: n } = mitre
  const mn = Math.min(1, Math.abs(m[0] * n[0] + m[1] * n[1] + m[2] * n[2]))
  return (2 * Math.asin(mn) * 180) / Math.PI
}

/**
 * Trim a piece's tool at its mitres, so it meets the neighbouring piece's tool
 * at the fold instead of cutting on through that piece's wall. Only the zone
 * behind each plane along its own fold is removed, as far as a tool spanning
 * [zMin, zMax] can extend there: a ring-shaped piece (a box rim) comes back
 * round to the far side of the same plane, where a global half-space cut would
 * wrongly delete it. Each trim leaves `overlap` mm beyond the plane: two tools
 * ending on exactly the same plane leave zero-volume flaps in the boolean result.
 */
export function mitreTool(m: ManifoldToplevel, tool: Manifold, mitres: Mitre[], zMin: number, zMax: number, overlap = 0.01): Manifold {
  for (const mitre of mitres) {
    const { point, normal: n, direction: d, halfLength } = mitre
    // the tool continues past the fold by its reach and off the face by its offsets
    const reach = mitreReach(mitre, zMin, zMax)
    const r = (Number.isFinite(reach) ? reach : 0) + Math.max(-zMin, zMax, 0) + 1
    // in-plane perpendicular to the fold
    const u = [n[1] * d[2] - n[2] * d[1], n[2] * d[0] - n[0] * d[2], n[0] * d[1] - n[1] * d[0]]
    const corners: [number, number, number][] = []
    for (const sd of [-1, 1]) for (const su of [-1, 1]) for (const sn of [0, 1]) {
      // the zone ends with the fold: past its end the neighbour is not there to take over
      const along = sd * (halfLength + 0.05), across = su * r, behind = -overlap - sn * r
      corners.push([
        point[0] + d[0] * along + u[0] * across + n[0] * behind,
        point[1] + d[1] * along + u[1] * across + n[1] * behind,
        point[2] + d[2] * along + u[2] * across + n[2] * behind,
      ])
    }
    const zone = m.Manifold.hull(corners)
    const trimmed = m.Manifold.difference(tool, zone)
    tool.delete(); zone.delete()
    tool = trimmed
  }
  return tool
}
