import { BufferGeometry, BufferAttribute, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import type { TriMesh } from './manifold'

/** Closest-point queries against a triangle mesh. */
export class SurfaceIndex {
  private bvh: MeshBVH
  private geom: BufferGeometry
  private tmpP = new Vector3()
  private tmpTarget = { point: new Vector3(), distance: 0, faceIndex: 0 }

  constructor(tri: TriMesh) {
    this.geom = new BufferGeometry()
    this.geom.setAttribute('position', new BufferAttribute(tri.positions, 3))
    this.geom.setIndex(new BufferAttribute(tri.indices, 1))
    this.bvh = new MeshBVH(this.geom)
  }

  /** Snap a point to the surface; writes xyz into out and returns the face index. */
  closest(x: number, y: number, z: number, out: Float32Array | Float64Array, outOffset = 0): number {
    this.tmpP.set(x, y, z)
    const hit = this.bvh.closestPointToPoint(this.tmpP, this.tmpTarget)
    if (!hit) return -1
    out[outOffset] = hit.point.x
    out[outOffset + 1] = hit.point.y
    out[outOffset + 2] = hit.point.z
    return hit.faceIndex
  }

  dispose() {
    this.geom.dispose()
  }
}
