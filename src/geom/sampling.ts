import type { TriMesh } from './manifold'

export interface SurfaceSamples {
  /** xyz interleaved */
  points: Float32Array
  /** face normal at each sample, xyz interleaved */
  normals: Float32Array
  /** triangle index each sample came from */
  faces: Uint32Array
}

/** Area of triangle i and its unit normal, written into out (nx, ny, nz). */
export function triangleAreaNormal(tri: TriMesh, i: number, out: Float64Array): number {
  const { positions: p, indices: ix } = tri
  const a = ix[i * 3] * 3, b = ix[i * 3 + 1] * 3, c = ix[i * 3 + 2] * 3
  const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2]
  const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2]
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz)
  if (len > 0) { out[0] = nx / len; out[1] = ny / len; out[2] = nz / len }
  else { out[0] = 0; out[1] = 0; out[2] = 1 }
  return len / 2
}

/** Total area of the given triangles (or all triangles when region is null). */
export function regionArea(tri: TriMesh, region: Uint32Array | null): number {
  const tmp = new Float64Array(3)
  let area = 0
  const n = region ? region.length : tri.indices.length / 3
  for (let j = 0; j < n; j++) area += triangleAreaNormal(tri, region ? region[j] : j, tmp)
  return area
}

/**
 * Area-weighted random points on the surface of a triangle mesh, restricted to
 * the given triangle indices (or the whole mesh when region is null).
 */
export function sampleSurface(
  tri: TriMesh,
  region: Uint32Array | null,
  count: number,
  rand: () => number,
): SurfaceSamples {
  const nTri = region ? region.length : tri.indices.length / 3
  const cum = new Float64Array(nTri)
  const normals = new Float32Array(nTri * 3)
  const tmp = new Float64Array(3)
  let acc = 0
  for (let j = 0; j < nTri; j++) {
    const t = region ? region[j] : j
    acc += triangleAreaNormal(tri, t, tmp)
    cum[j] = acc
    normals[j * 3] = tmp[0]; normals[j * 3 + 1] = tmp[1]; normals[j * 3 + 2] = tmp[2]
  }
  const points = new Float32Array(count * 3)
  const outNormals = new Float32Array(count * 3)
  const faces = new Uint32Array(count)
  const { positions: p, indices: ix } = tri
  for (let s = 0; s < count; s++) {
    // binary search the cumulative area
    const r = rand() * acc
    let lo = 0, hi = nTri - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cum[mid] < r) lo = mid + 1; else hi = mid
    }
    const t = region ? region[lo] : lo
    // uniform barycentric
    let u = rand(), v = rand()
    if (u + v > 1) { u = 1 - u; v = 1 - v }
    const w = 1 - u - v
    const a = ix[t * 3] * 3, b = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3
    points[s * 3] = w * p[a] + u * p[b] + v * p[c]
    points[s * 3 + 1] = w * p[a + 1] + u * p[b + 1] + v * p[c + 1]
    points[s * 3 + 2] = w * p[a + 2] + u * p[b + 2] + v * p[c + 2]
    outNormals[s * 3] = normals[lo * 3]
    outNormals[s * 3 + 1] = normals[lo * 3 + 1]
    outNormals[s * 3 + 2] = normals[lo * 3 + 2]
    faces[s] = t
  }
  return { points, normals: outNormals, faces }
}
