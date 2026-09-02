import type { Manifold, ManifoldToplevel } from './manifold'
import type { SubMesh } from './submesh'

/** Boundary edges of a submesh as directed (a, b) pairs, region on the left. */
export function boundaryEdges(sub: SubMesh): [number, number][] {
  const { indices: ix, positions: p } = sub
  const nV = p.length / 3
  const nT = ix.length / 3
  const edgeUse = new Map<number, number>()
  const key = (a: number, b: number) => (a < b ? a * nV + b : b * nV + a)
  for (let t = 0; t < nT; t++) {
    for (let s = 0; s < 3; s++) {
      const a = ix[t * 3 + s], b = ix[t * 3 + ((s + 1) % 3)]
      edgeUse.set(key(a, b), (edgeUse.get(key(a, b)) ?? 0) + 1)
    }
  }
  const out: [number, number][] = []
  for (let t = 0; t < nT; t++) {
    for (let s = 0; s < 3; s++) {
      const a = ix[t * 3 + s], b = ix[t * 3 + ((s + 1) % 3)]
      if (edgeUse.get(key(a, b)) === 1) out.push([a, b])
    }
  }
  return out
}

/**
 * A solid covering a band of the given width along the region boundary,
 * spanning the same normal range as the slab. Subtracting it from the slab
 * keeps a margin of untouched surface along every region edge.
 */
export function buildEdgeMarginTool(m: ManifoldToplevel, sub: SubMesh, margin: number, inner: number, outer: number): Manifold | null {
  const edges = boundaryEdges(sub)
  if (!edges.length || margin <= 0) return null
  const { positions: p, normals: n } = sub
  const boxes: Manifold[] = []
  const thick = outer - inner + 2 * margin
  for (const [a, b] of edges) {
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2]
    const bx = p[b * 3], by = p[b * 3 + 1], bz = p[b * 3 + 2]
    let dx = bx - ax, dy = by - ay, dz = bz - az
    const len = Math.hypot(dx, dy, dz)
    if (len < 1e-6) continue
    dx /= len; dy /= len; dz /= len
    // average normal of the two endpoints
    let nx = n[a * 3] + n[b * 3], ny = n[a * 3 + 1] + n[b * 3 + 1], nz = n[a * 3 + 2] + n[b * 3 + 2]
    const nl = Math.hypot(nx, ny, nz) || 1
    nx /= nl; ny /= nl; nz /= nl
    // tangent across the edge
    const tx = dy * nz - dz * ny, ty = dz * nx - dx * nz, tz = dx * ny - dy * nx
    const cx = (ax + bx) / 2 + nx * ((outer + inner) / 2), cy = (ay + by) / 2 + ny * ((outer + inner) / 2), cz = (az + bz) / 2 + nz * ((outer + inner) / 2)
    // column-major 4x4: columns d, t, n, translation
    const box = m.Manifold.cube([len + 2 * margin, 2 * margin, thick], true).transform([
      dx, dy, dz, 0,
      tx, ty, tz, 0,
      nx, ny, nz, 0,
      cx, cy, cz, 1,
    ])
    boxes.push(box)
  }
  if (!boxes.length) return null
  const u = m.Manifold.union(boxes)
  for (const b of boxes) b.delete()
  return u
}

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
