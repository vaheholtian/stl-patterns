import { BufferGeometry, BufferAttribute, Vector3, Ray, DoubleSide } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import type { TriMesh } from './manifold'

/** Closest-point queries against a triangle mesh. */
export class SurfaceIndex {
  private bvh: MeshBVH
  private geom: BufferGeometry
  private tmpP = new Vector3()
  private tmpTarget = { point: new Vector3(), distance: 0, faceIndex: 0 }
  private tmpRay = new Ray()
  /** BVH face id -> caller's triangle id (the BVH permutes its index buffer) */
  private faceMap: Uint32Array

  constructor(tri: TriMesh) {
    this.geom = new BufferGeometry()
    this.geom.setAttribute('position', new BufferAttribute(tri.positions, 3))
    // MeshBVH sorts the index buffer in place while building; work on a copy so
    // the caller's triangle ids stay valid
    this.geom.setIndex(new BufferAttribute(tri.indices.slice(), 1))
    this.bvh = new MeshBVH(this.geom)
    const sorted = this.geom.getIndex()!.array as Uint32Array
    const nTri = tri.indices.length / 3
    const byKey = new Map<string, number>()
    for (let t = 0; t < nTri; t++) byKey.set(`${tri.indices[t * 3]},${tri.indices[t * 3 + 1]},${tri.indices[t * 3 + 2]}`, t)
    this.faceMap = new Uint32Array(nTri)
    for (let t = 0; t < nTri; t++) this.faceMap[t] = byKey.get(`${sorted[t * 3]},${sorted[t * 3 + 1]},${sorted[t * 3 + 2]}`) ?? t
  }

  /** Snap a point to the surface; writes xyz into out and returns the face index. */
  closest(x: number, y: number, z: number, out: Float32Array | Float64Array, outOffset = 0): number {
    this.tmpP.set(x, y, z)
    const hit = this.bvh.closestPointToPoint(this.tmpP, this.tmpTarget)
    if (!hit) return -1
    out[outOffset] = hit.point.x
    out[outOffset + 1] = hit.point.y
    out[outOffset + 2] = hit.point.z
    return hit.faceIndex == null ? -1 : this.faceMap[hit.faceIndex]
  }

  /** First triangle hit by a ray, within maxDist; returns { faceIndex, distance } or null. */
  raycastFirst(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): { faceIndex: number; distance: number } | null {
    this.tmpRay.origin.set(ox, oy, oz)
    this.tmpRay.direction.set(dx, dy, dz).normalize()
    const hit = this.bvh.raycastFirst(this.tmpRay, DoubleSide, 0, maxDist)
    if (!hit || hit.faceIndex == null) return null
    return { faceIndex: this.faceMap[hit.faceIndex], distance: hit.distance }
  }

  dispose() {
    this.geom.dispose()
  }
}
