/**
 * k-nearest-neighbour search over a flat xyz point array using a uniform grid.
 * Good enough for a few thousand seeds; not intended for huge point clouds.
 */
export class PointGrid {
  private cell: number
  private min = [Infinity, Infinity, Infinity]
  private buckets = new Map<number, number[]>()
  private n: number
  private pts: Float32Array

  constructor(pts: Float32Array, cellSize?: number) {
    this.pts = pts
    this.n = pts.length / 3
    const max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < this.n; i++) {
      for (let d = 0; d < 3; d++) {
        const v = pts[i * 3 + d]
        if (v < this.min[d]) this.min[d] = v
        if (v > max[d]) max[d] = v
      }
    }
    const span = Math.max(max[0] - this.min[0], max[1] - this.min[1], max[2] - this.min[2], 1e-9)
    if (!cellSize) {
      // points usually lie on a surface, so size cells by the longest extent,
      // not by volume (which collapses for flat regions). ~sqrt(n) cells per axis, capped.
      const perAxis = Math.min(48, Math.max(2, Math.round(Math.sqrt(this.n) / 1.5)))
      cellSize = span / perAxis
    }
    // keep the grid small enough for exact integer keys and bounded ring searches
    if (span / cellSize > 64) cellSize = span / 64
    this.cell = cellSize
    for (let i = 0; i < this.n; i++) {
      const key = this.key(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2])
      let b = this.buckets.get(key)
      if (!b) { b = []; this.buckets.set(key, b) }
      b.push(i)
    }
  }

  private coord(v: number, d: number): number {
    return Math.floor((v - this.min[d]) / this.cell)
  }
  private key(x: number, y: number, z: number): number {
    return this.keyC(this.coord(x, 0), this.coord(y, 1), this.coord(z, 2))
  }
  private keyC(cx: number, cy: number, cz: number): number {
    // pack into an exact integer; coordinates are within [-70, 70] by construction
    return ((cx + 128) * 256 + (cy + 128)) * 256 + (cz + 128)
  }

  /** Indices of the k nearest points to (x,y,z), excluding `exclude`, sorted by distance. */
  nearest(x: number, y: number, z: number, k: number, exclude = -1): { idx: Int32Array; dist: Float64Array } {
    const pts = this.pts
    const cx = this.coord(x, 0), cy = this.coord(y, 1), cz = this.coord(z, 2)
    const bestIdx = new Int32Array(k).fill(-1)
    const bestD = new Float64Array(k).fill(Infinity)
    let ring = 0
    // expand rings until the kth best is closer than the ring's inner boundary
    while (true) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          for (let dz = -ring; dz <= ring; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== ring) continue
            const b = this.buckets.get(this.keyC(cx + dx, cy + dy, cz + dz))
            if (!b) continue
            for (const i of b) {
              if (i === exclude) continue
              const ddx = pts[i * 3] - x, ddy = pts[i * 3 + 1] - y, ddz = pts[i * 3 + 2] - z
              const d = ddx * ddx + ddy * ddy + ddz * ddz
              if (d < bestD[k - 1]) {
                // guard against a point arriving twice (cannot happen with exact keys, cheap insurance)
                let dup = false
                for (let j = 0; j < k; j++) if (bestIdx[j] === i) { dup = true; break }
                if (dup) continue
                // insertion
                let j = k - 1
                while (j > 0 && bestD[j - 1] > d) { bestD[j] = bestD[j - 1]; bestIdx[j] = bestIdx[j - 1]; j-- }
                bestD[j] = d; bestIdx[j] = i
              }
            }
          }
        }
      }
      const innerRadius = ring * this.cell
      if (bestD[k - 1] <= innerRadius * innerRadius) break
      ring++
      if (ring > 66) break // the grid is at most 64 cells across; everything has been visited
    }
    for (let j = 0; j < k; j++) bestD[j] = Math.sqrt(bestD[j])
    return { idx: bestIdx, dist: bestD }
  }
}
