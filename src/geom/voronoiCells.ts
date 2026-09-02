import type { Manifold, ManifoldToplevel } from './manifold'
import { PointGrid } from './knn'

export interface VoronoiCellOptions {
  /** neighbours considered per seed; 10-14 is plenty for surface-distributed seeds */
  k?: number
  /** width of the rib left between cells, in mm */
  ribWidth: number
  /** half-size of the starting box around each seed; must exceed the largest cell radius */
  extent: number
}

/**
 * Build one convex tool body per seed: a box around the seed trimmed by the
 * bisector planes to its nearest neighbours, each plane pushed toward the seed
 * by half the rib width. Subtracting all of them from a shell leaves the ribs.
 */
export function buildVoronoiCells(
  m: ManifoldToplevel,
  seeds: Float32Array,
  opts: VoronoiCellOptions,
): Manifold[] {
  const k = opts.k ?? 12
  const n = seeds.length / 3
  const grid = new PointGrid(seeds)
  const half = opts.ribWidth / 2
  const cells: Manifold[] = []
  for (let i = 0; i < n; i++) {
    const sx = seeds[i * 3], sy = seeds[i * 3 + 1], sz = seeds[i * 3 + 2]
    let cell = m.Manifold.cube([opts.extent * 2, opts.extent * 2, opts.extent * 2], true).translate([sx, sy, sz])
    const nb = grid.nearest(sx, sy, sz, Math.min(k, n - 1), i)
    for (let j = 0; j < nb.idx.length; j++) {
      const q = nb.idx[j]
      if (q < 0) break
      const qx = seeds[q * 3], qy = seeds[q * 3 + 1], qz = seeds[q * 3 + 2]
      // normal points from neighbour toward seed
      let nx = sx - qx, ny = sy - qy, nz = sz - qz
      const len = Math.hypot(nx, ny, nz)
      if (len < 1e-9) continue
      nx /= len; ny /= len; nz /= len
      // plane through midpoint, shifted toward the seed by half the rib
      const mx = (sx + qx) / 2 + nx * half
      const my = (sy + qy) / 2 + ny * half
      const mz = (sz + qz) / 2 + nz * half
      const offset = nx * mx + ny * my + nz * mz
      const trimmed = cell.trimByPlane([nx, ny, nz], offset)
      cell.delete()
      cell = trimmed
      if (cell.isEmpty()) break
    }
    if (!cell.isEmpty()) cells.push(cell)
    else cell.delete()
  }
  return cells
}
