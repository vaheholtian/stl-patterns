import type { TriMesh } from './manifold'
import { triangleAreaNormal } from './sampling'

/** Face adjacency across shared edges for an indexed (welded) mesh. */
export class FaceAdjacency {
  /** for each triangle, up to 3 neighbours (-1 when none) */
  readonly neighbours: Int32Array
  readonly normals: Float32Array
  readonly nTri: number

  constructor(tri: TriMesh) {
    this.nTri = tri.indices.length / 3
    this.neighbours = new Int32Array(this.nTri * 3).fill(-1)
    this.normals = new Float32Array(this.nTri * 3)
    const tmp = new Float64Array(3)
    for (let t = 0; t < this.nTri; t++) {
      triangleAreaNormal(tri, t, tmp)
      this.normals[t * 3] = tmp[0]; this.normals[t * 3 + 1] = tmp[1]; this.normals[t * 3 + 2] = tmp[2]
    }
    const edgeMap = new Map<number, number>() // edge key -> (tri*3+side)
    const ix = tri.indices
    const nV = tri.positions.length / 3
    const key = (a: number, b: number) => (a < b ? a * nV + b : b * nV + a)
    for (let t = 0; t < this.nTri; t++) {
      for (let s = 0; s < 3; s++) {
        const a = ix[t * 3 + s], b = ix[t * 3 + ((s + 1) % 3)]
        const k = key(a, b)
        const other = edgeMap.get(k)
        if (other === undefined) {
          edgeMap.set(k, t * 3 + s)
        } else {
          const ot = Math.floor(other / 3), os = other % 3
          this.neighbours[t * 3 + s] = ot
          this.neighbours[ot * 3 + os] = t
          edgeMap.delete(k)
        }
      }
    }
  }

  /** Flood fill from a seed triangle while the angle between face normals stays under maxAngleDeg. */
  floodFill(seed: number, maxAngleDeg: number, limit: Uint8Array | null = null): Uint32Array {
    const cosMin = Math.cos((maxAngleDeg * Math.PI) / 180)
    const visited = new Uint8Array(this.nTri)
    const out: number[] = []
    const stack = [seed]
    visited[seed] = 1
    const n = this.normals
    while (stack.length) {
      const t = stack.pop()!
      out.push(t)
      for (let s = 0; s < 3; s++) {
        const nb = this.neighbours[t * 3 + s]
        if (nb < 0 || visited[nb]) continue
        if (limit && !limit[nb]) continue
        const d = n[t * 3] * n[nb * 3] + n[t * 3 + 1] * n[nb * 3 + 1] + n[t * 3 + 2] * n[nb * 3 + 2]
        if (d < cosMin) continue
        visited[nb] = 1
        stack.push(nb)
      }
    }
    return Uint32Array.from(out)
  }

  /** Segment the whole mesh into regions at edges sharper than maxAngleDeg. Returns a region id per triangle. */
  segmentAll(maxAngleDeg: number): { regionOf: Int32Array; count: number } {
    const regionOf = new Int32Array(this.nTri).fill(-1)
    let count = 0
    for (let t = 0; t < this.nTri; t++) {
      if (regionOf[t] >= 0) continue
      const tris = this.floodFill(t, maxAngleDeg)
      for (const x of tris) regionOf[x] = count
      count++
    }
    return { regionOf, count }
  }
}
