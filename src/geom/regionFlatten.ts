// Prepare a region for flattening: make it a topological disk (cut a seam for
// ring-like regions, remove a far-side cap for closed ones), then LSCM.
import type { TriMesh } from './manifold'
import { extractSubMesh, boundaryLoops, type SubMesh } from './submesh'
import { flattenLSCM } from './lscm'

export interface FlattenedRegion {
  positions: Float32Array
  indices: Uint32Array
  normals: Float32Array
  uv: Float32Array
  /** index of the triangle nearest the requested origin (in the flattened mesh) */
  originTriangle: number
  /** average 2D offset between the two sides of the seam, when a seam was cut */
  period: [number, number] | null
  /** 'disk' | 'seam' | 'cap' */
  topology: 'disk' | 'seam' | 'cap'
  /** boundary loops as vertex indices into the flattened mesh */
  loops: number[][]
  /** vertices on the artificial seam (both sides); edges between them are not real boundary */
  seamVertices: number[]
  log: string[]
  /** triangles removed as the far-side cap (source triangle ids), if any */
  removedCap: Uint32Array
}

/** Dijkstra over mesh edges from a set of seed vertices. */
function dijkstra(sub: SubMesh, seeds: number[], stopAt?: Set<number>): { dist: Float64Array; prev: Int32Array; reached: number } {
  const nV = sub.positions.length / 3
  const adj: number[][] = Array.from({ length: nV }, () => [])
  const ix = sub.indices, p = sub.positions
  const addEdge = (a: number, b: number) => { adj[a].push(b); adj[b].push(a) }
  for (let t = 0; t < ix.length; t += 3) { addEdge(ix[t], ix[t + 1]); addEdge(ix[t + 1], ix[t + 2]); addEdge(ix[t + 2], ix[t]) }
  const dist = new Float64Array(nV).fill(Infinity)
  const prev = new Int32Array(nV).fill(-1)
  const done = new Uint8Array(nV)
  // binary heap
  const heap: number[] = [], hd: number[] = []
  const push = (v: number, d: number) => {
    heap.push(v); hd.push(d)
    let i = heap.length - 1
    while (i > 0) { const par = (i - 1) >> 1; if (hd[par] <= hd[i]) break; [heap[par], heap[i]] = [heap[i], heap[par]]; [hd[par], hd[i]] = [hd[i], hd[par]]; i = par }
  }
  const pop = (): number => {
    const v = heap[0]
    const lv = heap.pop()!, ld = hd.pop()!
    if (heap.length) {
      heap[0] = lv; hd[0] = ld
      let i = 0
      while (true) {
        const l = i * 2 + 1, r = l + 1
        let s = i
        if (l < heap.length && hd[l] < hd[s]) s = l
        if (r < heap.length && hd[r] < hd[s]) s = r
        if (s === i) break
        ;[heap[s], heap[i]] = [heap[i], heap[s]]; [hd[s], hd[i]] = [hd[i], hd[s]]; i = s
      }
    }
    return v
  }
  for (const s of seeds) { dist[s] = 0; push(s, 0) }
  let reached = -1
  while (heap.length) {
    const v = pop()
    if (done[v]) continue
    done[v] = 1
    if (stopAt && stopAt.has(v)) { reached = v; break }
    for (const w of adj[v]) {
      if (done[w]) continue
      const d = dist[v] + Math.hypot(p[w * 3] - p[v * 3], p[w * 3 + 1] - p[v * 3 + 1], p[w * 3 + 2] - p[v * 3 + 2])
      if (d < dist[w]) { dist[w] = d; prev[w] = v; push(w, d) }
    }
  }
  return { dist, prev, reached }
}

function nearestVertex(sub: SubMesh, x: number, y: number, z: number): number {
  const p = sub.positions
  let best = 0, bd = Infinity
  for (let v = 0; v < p.length / 3; v++) {
    const d = (p[v * 3] - x) ** 2 + (p[v * 3 + 1] - y) ** 2 + (p[v * 3 + 2] - z) ** 2
    if (d < bd) { bd = d; best = v }
  }
  return best
}

function nearestTriangle(sub: SubMesh, x: number, y: number, z: number): number {
  const { positions: p, indices: ix } = sub
  let best = 0, bd = Infinity
  for (let t = 0; t < ix.length / 3; t++) {
    let cx = 0, cy = 0, cz = 0
    for (let c = 0; c < 3; c++) { const v = ix[t * 3 + c] * 3; cx += p[v]; cy += p[v + 1]; cz += p[v + 2] }
    const d = (cx / 3 - x) ** 2 + (cy / 3 - y) ** 2 + (cz / 3 - z) ** 2
    if (d < bd) { bd = d; best = t }
  }
  return best
}

/**
 * Split the submesh along a vertex path (v0..vk, endpoints on boundaries),
 * duplicating interior vertices so the two sides no longer share them.
 * Returns the new submesh and the pairs (original, duplicate).
 */
function cutSeam(sub: SubMesh, path: number[]): { sub: SubMesh; pairs: [number, number][] } {
  const { positions: p, normals: n, indices: ix } = sub
  const nV = p.length / 3
  const nT = ix.length / 3
  const inPath = new Int32Array(nV).fill(-1)
  path.forEach((v, i) => (inPath[v] = i))
  const pathEdge = new Set<string>()
  for (let i = 0; i + 1 < path.length; i++) pathEdge.add(path[i] < path[i + 1] ? `${path[i]},${path[i + 1]}` : `${path[i + 1]},${path[i]}`)
  // incident triangles per path vertex
  const incident: number[][] = path.map(() => [])
  for (let t = 0; t < nT; t++) for (let c = 0; c < 3; c++) { const k = inPath[ix[t * 3 + c]]; if (k >= 0) incident[k].push(t) }
  // left triangle of directed edge a->b: the one containing a then b in CCW order
  const leftTri = (a: number, b: number): number => {
    for (let t = 0; t < nT; t++) {
      for (let c = 0; c < 3; c++) if (ix[t * 3 + c] === a && ix[t * 3 + ((c + 1) % 3)] === b) return t
    }
    return -1
  }
  const newPos: number[] = Array.from(p), newNrm: number[] = Array.from(n)
  const newIx = new Uint32Array(ix)
  const pairs: [number, number][] = []
  for (let i = 0; i < path.length; i++) {
    const v = path[i]
    const tris = incident[i]
    // adjacency among incident triangles across edges through v, excluding path edges
    const edgeOf = (t: number): [number, number] => {
      const others: number[] = []
      for (let c = 0; c < 3; c++) { const w = ix[t * 3 + c]; if (w !== v) others.push(w) }
      return [others[0], others[1]]
    }
    const byEdge = new Map<string, number[]>()
    for (const t of tris) {
      for (const w of edgeOf(t)) {
        const k = v < w ? `${v},${w}` : `${w},${v}`
        if (pathEdge.has(k)) continue
        if (!byEdge.has(k)) byEdge.set(k, [])
        byEdge.get(k)!.push(t)
      }
    }
    // components
    const comp = new Map<number, number>()
    let cid = 0
    for (const t0 of tris) {
      if (comp.has(t0)) continue
      const stack = [t0]
      comp.set(t0, cid)
      while (stack.length) {
        const t = stack.pop()!
        for (const w of edgeOf(t)) {
          const k = v < w ? `${v},${w}` : `${w},${v}`
          for (const u of byEdge.get(k) ?? []) if (!comp.has(u)) { comp.set(u, cid); stack.push(u) }
        }
      }
      cid++
    }
    if (cid < 2) continue // nothing to split here (should not happen for a proper path)
    // side to duplicate: the one containing the left triangle of the outgoing (or incoming) path edge
    const ref = i + 1 < path.length ? leftTri(v, path[i + 1]) : leftTri(path[i - 1], v)
    const side = ref >= 0 ? comp.get(ref) ?? 0 : 0
    const dup = newPos.length / 3
    newPos.push(p[v * 3], p[v * 3 + 1], p[v * 3 + 2])
    newNrm.push(n[v * 3], n[v * 3 + 1], n[v * 3 + 2])
    for (const t of tris) {
      if (comp.get(t) !== side) continue
      for (let c = 0; c < 3; c++) if (newIx[t * 3 + c] === v) newIx[t * 3 + c] = dup
    }
    pairs.push([v, dup])
  }
  return {
    sub: { positions: Float32Array.from(newPos), normals: Float32Array.from(newNrm), indices: newIx, sourceTriangles: sub.sourceTriangles },
    pairs,
  }
}

export function flattenRegion(mesh: TriMesh, region: Uint32Array, origin: [number, number, number]): FlattenedRegion {
  const log: string[] = []
  let sub = extractSubMesh(mesh, region)
  let loops = boundaryLoops(sub)
  let removedCap = new Uint32Array(0)
  let topology: FlattenedRegion['topology'] = 'disk'
  let period: [number, number] | null = null

  if (loops.length === 0) {
    // closed surface: remove a small cap at the point farthest from the origin
    const o = nearestVertex(sub, origin[0], origin[1], origin[2])
    const { dist } = dijkstra(sub, [o])
    let far = 0
    for (let v = 0; v < dist.length; v++) if (dist[v] > dist[far] && isFinite(dist[v])) far = v
    const capRadius = dist[far] * 0.06
    const { dist: dFar } = dijkstra(sub, [far])
    const keep: number[] = []
    const removed: number[] = []
    for (let t = 0; t < sub.indices.length / 3; t++) {
      const a = sub.indices[t * 3], b = sub.indices[t * 3 + 1], c = sub.indices[t * 3 + 2]
      if (Math.min(dFar[a], dFar[b], dFar[c]) < capRadius) removed.push(sub.sourceTriangles[t])
      else keep.push(sub.sourceTriangles[t])
    }
    removedCap = Uint32Array.from(removed)
    sub = extractSubMesh(mesh, Uint32Array.from(keep))
    loops = boundaryLoops(sub)
    topology = 'cap'
    log.push(`closed region: removed a ${capRadius.toFixed(1)} mm cap on the far side (${removed.length} triangles)`)
  }

  let pairs: [number, number][] = []
  if (loops.length >= 2) {
    // ring-like: cut a seam between the two longest loops, starting from the
    // boundary point farthest from the origin so the seam lands on the far side
    loops.sort((a, b) => b.length - a.length)
    const A = loops[0], B = loops[1]
    const o = nearestVertex(sub, origin[0], origin[1], origin[2])
    const { dist: fromOrigin } = dijkstra(sub, [o])
    let start = A[0]
    for (const v of A) if (fromOrigin[v] > fromOrigin[start] && isFinite(fromOrigin[v])) start = v
    const { prev, reached } = dijkstra(sub, [start], new Set(B))
    if (reached >= 0) {
      const path: number[] = []
      for (let v = reached; v !== -1; v = prev[v]) path.push(v)
      path.reverse()
      const cut = cutSeam(sub, path)
      sub = cut.sub
      pairs = cut.pairs
      topology = 'seam'
      log.push(`ring-shaped region: cut a seam of ${path.length} vertices so the tile can wrap`)
    } else {
      log.push('could not find a seam between boundary loops; flattening as-is')
    }
  }

  const res = flattenLSCM(sub)
  log.push(`flattened ${sub.indices.length / 3} triangles (${res.iterations} iterations)`)
  if (pairs.length) {
    let px = 0, py = 0
    for (const [a, b] of pairs) { px += res.uv[b * 2] - res.uv[a * 2]; py += res.uv[b * 2 + 1] - res.uv[a * 2 + 1] }
    period = [px / pairs.length, py / pairs.length]
  }
  const originTriangle = nearestTriangle(sub, origin[0], origin[1], origin[2])
  return {
    positions: sub.positions,
    indices: sub.indices,
    normals: sub.normals,
    uv: res.uv,
    originTriangle,
    period,
    topology,
    loops: boundaryLoops(sub),
    seamVertices: pairs.flatMap(([a, b]) => [a, b]),
    log,
    removedCap,
  }
}
