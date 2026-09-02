import type { Manifold, ManifoldToplevel } from './manifold'
import type { SubMesh } from './submesh'

/**
 * A closed solid that hugs a surface region: the region offset along vertex
 * normals to `outer` (positive = outside) and to `inner` (negative = inside),
 * with the boundary stitched. Used to confine pattern tools to the region and
 * to a depth range.
 */
export function buildRegionSlab(m: ManifoldToplevel, sub: SubMesh, inner: number, outer: number): Manifold {
  const { positions: p, normals: n, indices: ix } = sub
  const nV = p.length / 3
  const nT = ix.length / 3
  const positions = new Float32Array(nV * 6)
  for (let v = 0; v < nV; v++) {
    for (let d = 0; d < 3; d++) {
      positions[v * 3 + d] = p[v * 3 + d] + n[v * 3 + d] * outer          // top copy
      positions[(nV + v) * 3 + d] = p[v * 3 + d] + n[v * 3 + d] * inner   // bottom copy
    }
  }
  // boundary edges with their triangle orientation
  const edgeUse = new Map<number, number>()
  const key = (a: number, b: number) => (a < b ? a * nV + b : b * nV + a)
  for (let t = 0; t < nT; t++) {
    for (let s = 0; s < 3; s++) {
      const a = ix[t * 3 + s], b = ix[t * 3 + ((s + 1) % 3)]
      const k = key(a, b)
      edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1)
    }
  }
  const sideTris: number[] = []
  for (let t = 0; t < nT; t++) {
    for (let s = 0; s < 3; s++) {
      const a = ix[t * 3 + s], b = ix[t * 3 + ((s + 1) % 3)]
      if (edgeUse.get(key(a, b)) !== 1) continue
      // directed edge a->b has the region on its left; outward side quad:
      const ta = a, tb = b, ba = nV + a, bb = nV + b
      sideTris.push(ta, ba, bb, ta, bb, tb)
    }
  }
  const indices = new Uint32Array(nT * 6 + sideTris.length)
  for (let t = 0; t < nT; t++) {
    indices[t * 3] = ix[t * 3]; indices[t * 3 + 1] = ix[t * 3 + 1]; indices[t * 3 + 2] = ix[t * 3 + 2]
    // bottom reversed
    indices[(nT + t) * 3] = nV + ix[t * 3]; indices[(nT + t) * 3 + 1] = nV + ix[t * 3 + 2]; indices[(nT + t) * 3 + 2] = nV + ix[t * 3 + 1]
  }
  indices.set(sideTris, nT * 6)
  const mesh = new m.Mesh({ numProp: 3, vertProperties: positions, triVerts: indices })
  mesh.merge()
  const man = new m.Manifold(mesh)
  const status = man.status()
  if (status !== 'NoError') {
    man.delete()
    throw new Error(`Region slab is not a valid solid (${status}). Try a smaller depth or a cleaner region.`)
  }
  return man
}
