import { PointGrid } from './knn'
import type { SurfaceIndex } from './bvh'

/**
 * One pass of neighbour-centroid relaxation for points on a surface:
 * each point moves to the mean of its k nearest neighbours blended with itself,
 * then snaps back onto the surface. Cheap stand-in for Lloyd relaxation that
 * evens out cell sizes without computing the diagram.
 */
export function relaxOnSurface(
  pts: Float32Array,
  surface: SurfaceIndex,
  k = 8,
  strength = 0.5,
): Float32Array {
  const n = pts.length / 3
  const grid = new PointGrid(pts)
  const out = new Float32Array(pts.length)
  const tmp = new Float32Array(3)
  for (let i = 0; i < n; i++) {
    const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2]
    const nb = grid.nearest(x, y, z, Math.min(k, n - 1), i)
    let cx = 0, cy = 0, cz = 0, c = 0
    for (let j = 0; j < nb.idx.length; j++) {
      const q = nb.idx[j]
      if (q < 0) break
      cx += pts[q * 3]; cy += pts[q * 3 + 1]; cz += pts[q * 3 + 2]; c++
    }
    if (c === 0) { out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z; continue }
    cx /= c; cy /= c; cz /= c
    // moving toward the neighbour centroid pushes points apart where they are crowded
    const tx = x + (x - cx) * strength
    const ty = y + (y - cy) * strength
    const tz = z + (z - cz) * strength
    surface.closest(tx, ty, tz, tmp)
    out[i * 3] = tmp[0]; out[i * 3 + 1] = tmp[1]; out[i * 3 + 2] = tmp[2]
  }
  return out
}
