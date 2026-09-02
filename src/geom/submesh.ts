import type { TriMesh } from './manifold'

export interface SubMesh {
  /** merged vertex positions, xyz */
  positions: Float32Array
  /** triangle indices into positions */
  indices: Uint32Array
  /** area-weighted smooth vertex normals, xyz */
  normals: Float32Array
  /** original triangle index for each sub triangle */
  sourceTriangles: Uint32Array
}

/**
 * Extract the given triangles as their own indexed mesh with coincident
 * vertices merged, plus smooth vertex normals. Region = null takes the whole mesh.
 */
export function extractSubMesh(tri: TriMesh, region: Uint32Array | null, weldTolerance = 1e-5): SubMesh {
  const nTri = region ? region.length : tri.indices.length / 3
  const keyOf = (x: number, y: number, z: number) =>
    `${Math.round(x / weldTolerance)},${Math.round(y / weldTolerance)},${Math.round(z / weldTolerance)}`
  const map = new Map<string, number>()
  const pos: number[] = []
  const idx = new Uint32Array(nTri * 3)
  const src = new Uint32Array(nTri)
  const { positions: p, indices: ix } = tri
  for (let j = 0; j < nTri; j++) {
    const t = region ? region[j] : j
    src[j] = t
    for (let c = 0; c < 3; c++) {
      const v = ix[t * 3 + c] * 3
      const x = p[v], y = p[v + 1], z = p[v + 2]
      const key = keyOf(x, y, z)
      let id = map.get(key)
      if (id === undefined) {
        id = pos.length / 3
        map.set(key, id)
        pos.push(x, y, z)
      }
      idx[j * 3 + c] = id
    }
  }
  const positions = new Float32Array(pos)
  const normals = new Float32Array(positions.length)
  for (let j = 0; j < nTri; j++) {
    const a = idx[j * 3] * 3, b = idx[j * 3 + 1] * 3, c = idx[j * 3 + 2] * 3
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx // length = 2*area
    for (const v of [a, b, c]) { normals[v] += nx; normals[v + 1] += ny; normals[v + 2] += nz }
  }
  for (let v = 0; v < normals.length; v += 3) {
    const len = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1
    normals[v] /= len; normals[v + 1] /= len; normals[v + 2] /= len
  }
  return { positions, indices: idx, normals, sourceTriangles: src }
}

/** Count boundary edge loops of a submesh (0 = closed, 1 = disk-like, 2 = annulus, ...). */
export function boundaryLoops(sub: SubMesh): number[][] {
  const edgeCount = new Map<string, number>()
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`)
  const ix = sub.indices
  for (let t = 0; t < ix.length; t += 3) {
    for (let c = 0; c < 3; c++) {
      const k = key(ix[t + c], ix[t + ((c + 1) % 3)])
      edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1)
    }
  }
  // boundary edges appear once; build adjacency and walk loops
  const adj = new Map<number, number[]>()
  for (const [k, c] of edgeCount) {
    if (c !== 1) continue
    const [a, b] = k.split(',').map(Number)
    if (!adj.has(a)) adj.set(a, [])
    if (!adj.has(b)) adj.set(b, [])
    adj.get(a)!.push(b)
    adj.get(b)!.push(a)
  }
  const seen = new Set<number>()
  const loops: number[][] = []
  for (const start of adj.keys()) {
    if (seen.has(start)) continue
    const loop: number[] = []
    let prev = -1, cur = start
    while (cur !== -1 && !seen.has(cur)) {
      seen.add(cur)
      loop.push(cur)
      const nbrs = adj.get(cur)!
      const next = nbrs.find((n) => n !== prev && !seen.has(n))
      prev = cur
      cur = next ?? -1
    }
    loops.push(loop)
  }
  return loops
}
