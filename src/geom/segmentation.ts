import type { TriMesh } from './manifold'
import { triangleAreaNormal } from './sampling'

/** Face adjacency across shared edges for an indexed (welded) mesh. */
export class FaceAdjacency {
  /** for each triangle, up to 3 neighbours (-1 when none) */
  readonly neighbours: Int32Array
  readonly normals: Float32Array
  readonly nTri: number
  private tiltCache: { deg: number; classes: Uint8Array } | null = null

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

  /**
   * Class of every face by its tilt from the +Z (print) axis: 0 faces up (tilt below wallTiltDeg),
   * 1 is a wall, 2 faces down (tilt above 180 - wallTiltDeg). A threshold of 0 or less puts every
   * face in class 1, which disables the split. This is what tells a bowl's floor from its walls
   * when the two blend smoothly and no edge is sharp enough to stop at.
   */
  tiltClasses(wallTiltDeg: number): Uint8Array {
    if (this.tiltCache && this.tiltCache.deg === wallTiltDeg) return this.tiltCache.classes
    const classes = new Uint8Array(this.nTri).fill(1)
    if (wallTiltDeg > 0) {
      const cosUp = Math.cos((Math.min(90, wallTiltDeg) * Math.PI) / 180)
      for (let t = 0; t < this.nTri; t++) {
        const nz = this.normals[t * 3 + 2]
        if (nz > cosUp) classes[t] = 0
        else if (nz < -cosUp) classes[t] = 2
      }
    }
    this.tiltCache = { deg: wallTiltDeg, classes }
    return classes
  }

  /**
   * Flood fill from a seed triangle while the angle between face normals stays under maxAngleDeg.
   * With wallTiltDeg > 0 the fill also refuses to cross from a wall face into an up- or
   * down-facing one (see tiltClasses), so smooth blends between floors and walls still split.
   */
  floodFill(seed: number, maxAngleDeg: number, limit: Uint8Array | null = null, wallTiltDeg = 0): Uint32Array {
    const cosMin = Math.cos((maxAngleDeg * Math.PI) / 180)
    const cls = wallTiltDeg > 0 ? this.tiltClasses(wallTiltDeg) : null
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
        if (cls && cls[nb] !== cls[t]) continue
        const d = n[t * 3] * n[nb * 3] + n[t * 3 + 1] * n[nb * 3 + 1] + n[t * 3 + 2] * n[nb * 3 + 2]
        if (d < cosMin) continue
        visited[nb] = 1
        stack.push(nb)
      }
    }
    return Uint32Array.from(out)
  }

  /** Segment the whole mesh into regions at edges sharper than maxAngleDeg (and at tilt-class changes when wallTiltDeg > 0). Returns a region id per triangle. */
  segmentAll(maxAngleDeg: number, wallTiltDeg = 0): { regionOf: Int32Array; count: number } {
    const regionOf = new Int32Array(this.nTri).fill(-1)
    let count = 0
    for (let t = 0; t < this.nTri; t++) {
      if (regionOf[t] >= 0) continue
      const tris = this.floodFill(t, maxAngleDeg, null, wallTiltDeg)
      for (const x of tris) regionOf[x] = count
      count++
    }
    return { regionOf, count }
  }
}
