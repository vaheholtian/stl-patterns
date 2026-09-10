// Prepare a region for flattening: make it a topological disk (cut a seam for
// ring-like regions, remove a far-side cap for closed ones), then LSCM.
import type { TriMesh } from './manifold'
import { extractSubMesh, boundaryLoops, type SubMesh } from './submesh'
import { flattenLSCM } from './lscm'
import { FaceAdjacency } from './segmentation'
import { SurfaceIndex } from './bvh'
import { triangleAreaNormal } from './sampling'
import { Parameterization } from './parameterization'
import type { Mitre } from './tileTool'

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
    // a ring that already lies flat (a washer, a box rim, a plate with a hole) comes
    // back with both sides of the seam on top of each other: nothing wraps, so lay
    // the tile out as on a disk. A zero period would otherwise collapse the layout.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (let i = 0; i < res.uv.length; i += 2) { minX = Math.min(minX, res.uv[i]); maxX = Math.max(maxX, res.uv[i]); minY = Math.min(minY, res.uv[i + 1]); maxY = Math.max(maxY, res.uv[i + 1]) }
    const diag = Math.hypot(maxX - minX, maxY - minY) || 1
    if (Math.hypot(period[0], period[1]) < 1e-3 * diag) {
      period = null
      topology = 'disk'
      log.push('the ring lies flat, so the tile is laid out without wrapping')
    }
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

/** A point on the region near its centroid, snapped to the nearest triangle centroid. */
export function regionCentroid(mesh: TriMesh, region: Uint32Array): [number, number, number] {
  const { positions, indices } = mesh
  let x = 0, y = 0, z = 0
  for (const t of region) for (let c = 0; c < 3; c++) { const v = indices[t * 3 + c] * 3; x += positions[v]; y += positions[v + 1]; z += positions[v + 2] }
  const n = region.length * 3 || 1
  x /= n; y /= n; z /= n
  let best: [number, number, number] = [x, y, z], bd = Infinity
  for (const t of region) {
    let cx = 0, cy = 0, cz = 0
    for (let c = 0; c < 3; c++) { const v = indices[t * 3 + c] * 3; cx += positions[v]; cy += positions[v + 1]; cz += positions[v + 2] }
    cx /= 3; cy /= 3; cz /= 3
    const d = (cx - x) ** 2 + (cy - y) ** 2 + (cz - z) ** 2
    if (d < bd) { bd = d; best = [cx, cy, cz] }
  }
  return best
}

/**
 * Split a region into smooth pieces at edges sharper than maxAngleDeg. A region
 * that spans sharp edges (a whole box, several faces added with shift) cannot be
 * flattened as one sheet: LSCM folds it over, and points laid out in the fold map
 * to the wrong face. Each piece is flattened on its own instead.
 */
export function splitSmoothPieces(mesh: TriMesh, region: Uint32Array, maxAngleDeg: number): Uint32Array[] {
  const adj = new FaceAdjacency(mesh)
  const mask = new Uint8Array(adj.nTri)
  for (const t of region) mask[t] = 1
  const done = new Uint8Array(adj.nTri)
  const pieces: Uint32Array[] = []
  for (const t of region) {
    if (done[t]) continue
    const piece = adj.floodFill(t, maxAngleDeg, mask)
    for (const x of piece) done[x] = 1
    pieces.push(piece)
  }
  // largest first so the pieces that matter are logged and previewed first
  pieces.sort((a, b) => b.length - a.length)
  return pieces
}

export interface FlattenedPiece extends FlattenedRegion {
  /** the layout origin used for this piece (the user's origin when it lies on the piece, else the piece centroid) */
  origin: [number, number, number]
  /** triangles of this piece (source triangle ids) */
  region: Uint32Array
  /** surface area, mm² */
  area: number
  /**
   * Set when this piece is the back side of a wall whose front is a larger piece
   * of the same region: `fraction` of the piece has that front within `distance`
   * mm behind it. A through-cut from the front already perforates this side.
   */
  backing: { fraction: number; distance: number } | null
  /** pieces with the same sheet id were unfolded into one 2D sheet and lay their tiles out in one shared frame */
  sheet: number
  /** point of the sheet's uv space that the layout origin maps to, and the mm-per-uv scale there */
  frame: { u0: number; v0: number; scale: number } | null
  /** vertices on folds shared with another piece of the same sheet; edges between them are not a real boundary */
  foldVertices: number[]
  /** boundary edges of this piece that are folds to another piece of the same sheet */
  foldEdges: [number, number][]
  /**
   * One per straight fold: the plane bisecting the two faces, so neighbouring
   * tools meet at a mitre instead of each cutting on through the other's wall.
   */
  mitres: Mitre[]
  /**
   * Where the sheet wraps round and meets itself at this piece (the last edge of
   * a ring of walls): the two sides coincide after the sheet's `period`. The
   * layout joins it, as a fold with this mitre, only when the tile repeats a
   * whole number of times over that period; otherwise it stays a real edge.
   */
  closure: { edges: [number, number][]; vertices: number[]; mitre: Mitre; length: number } | null
}

function triangleNormal(p: Float32Array, ix: Uint32Array, t: number): [number, number, number] {
  const a = ix[t * 3] * 3, b = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3
  const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2]
  const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2]
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz) || 1
  return [nx / len, ny / len, nz / len]
}

/** Triangle owning each boundary edge, keyed "lo,hi". */
function boundaryTriangles(ix: Uint32Array): Map<string, number> {
  const owner = new Map<string, number>(), count = new Map<string, number>()
  for (let t = 0; t < ix.length / 3; t++) for (let c = 0; c < 3; c++) {
    const a = ix[t * 3 + c], b = ix[t * 3 + ((c + 1) % 3)]
    const k = a < b ? `${a},${b}` : `${b},${a}`
    count.set(k, (count.get(k) ?? 0) + 1)
    owner.set(k, t)
  }
  for (const [k, n] of count) if (n !== 1) owner.delete(k)
  return owner
}

/**
 * The mitre plane of a straight fold between pieces A and B: through the fold
 * line, bisecting the two faces, oriented towards A. Null for a curved fold.
 */
function mitrePlane(A: FlattenedPiece, edgesA: [number, number][], B: FlattenedPiece, edgesB: [number, number][]): (Mitre & { otherFaceNormal: [number, number, number] }) | null {
  const P = A.positions
  const pts: [number, number, number][] = []
  for (const [a, b] of edgesA) for (const v of [a, b]) pts.push([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]])
  if (pts.length < 2) return null
  // the fold line: through the two farthest-apart fold vertices
  let p0 = pts[0], p1 = pts[1], far = -1
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2])
    if (d > far) { far = d; p0 = pts[i]; p1 = pts[j] }
  }
  if (far < 1e-6) return null
  const d: [number, number, number] = [(p1[0] - p0[0]) / far, (p1[1] - p0[1]) / far, (p1[2] - p0[2]) / far]
  for (const q of pts) {
    const w = [q[0] - p0[0], q[1] - p0[1], q[2] - p0[2]]
    const along = w[0] * d[0] + w[1] * d[1] + w[2] * d[2]
    if (Math.hypot(w[0] - along * d[0], w[1] - along * d[1], w[2] - along * d[2]) > 0.05) return null // curved fold
  }
  // average face normal on each side, and a point inside A next to the fold
  const side = (piece: FlattenedPiece, edges: [number, number][]): { n: [number, number, number]; inside: [number, number, number] } => {
    const owner = boundaryTriangles(piece.indices)
    const n: [number, number, number] = [0, 0, 0], inside: [number, number, number] = [0, 0, 0]
    let count = 0
    for (const [a, b] of edges) {
      const t = owner.get(a < b ? `${a},${b}` : `${b},${a}`)
      if (t === undefined) continue
      const tn = triangleNormal(piece.positions, piece.indices, t)
      n[0] += tn[0]; n[1] += tn[1]; n[2] += tn[2]
      for (let c = 0; c < 3; c++) {
        const v = piece.indices[t * 3 + c]
        if (v === a || v === b) continue
        inside[0] += piece.positions[v * 3]; inside[1] += piece.positions[v * 3 + 1]; inside[2] += piece.positions[v * 3 + 2]
        count++
      }
    }
    const len = Math.hypot(n[0], n[1], n[2]) || 1
    return { n: [n[0] / len, n[1] / len, n[2] / len], inside: [inside[0] / (count || 1), inside[1] / (count || 1), inside[2] / (count || 1)] }
  }
  const a = side(A, edgesA), b = side(B, edgesB)
  let n: [number, number, number] = [a.n[0] - b.n[0], a.n[1] - b.n[1], a.n[2] - b.n[2]]
  const len = Math.hypot(n[0], n[1], n[2])
  if (len < 1e-6) return null
  n = [n[0] / len, n[1] / len, n[2] / len]
  const point: [number, number, number] = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2]
  if ((a.inside[0] - point[0]) * n[0] + (a.inside[1] - point[1]) * n[1] + (a.inside[2] - point[2]) * n[2] < 0) n = [-n[0], -n[1], -n[2]]
  return { point, normal: n, direction: d, halfLength: far / 2, faceNormal: a.n, otherFaceNormal: b.n }
}

/** Signed uv area of a flattening (positive when it matches the 3D winding). */
function signedUvArea(uv: Float32Array, ix: Uint32Array): number {
  let s = 0
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t], b = ix[t + 1], c = ix[t + 2]
    s += (uv[b * 2] - uv[a * 2]) * (uv[c * 2 + 1] - uv[a * 2 + 1]) - (uv[c * 2] - uv[a * 2]) * (uv[b * 2 + 1] - uv[a * 2 + 1])
  }
  return s / 2
}

function positionKey(p: Float32Array, v: number): string {
  return `${Math.round(p[v * 3] * 1e4)},${Math.round(p[v * 3 + 1] * 1e4)},${Math.round(p[v * 3 + 2] * 1e4)}`
}

/** A sharp edge shared by two pieces: its true length, matched vertex pairs (a's vertex, b's vertex) and a's edges along it. */
interface Fold { a: number; b: number; length: number; pairs: [number, number][]; edges: [number, number][] }

/** Shared sharp edges between pieces, matched by vertex position along boundary edges both pieces own. */
function findFolds(pieces: FlattenedPiece[]): Fold[] {
  const keys = pieces.map((piece) => {
    const map = new Map<string, number[]>()
    for (let v = 0; v < piece.positions.length / 3; v++) {
      const k = positionKey(piece.positions, v)
      const list = map.get(k)
      if (list) list.push(v); else map.set(k, [v])
    }
    return map
  })
  const boundary = pieces.map((piece) => {
    const ends = new Map<string, [number, number]>()
    const seen = new Map<string, number>()
    const ix = piece.indices
    for (let t = 0; t < ix.length; t += 3) for (let c = 0; c < 3; c++) {
      const a = ix[t + c], b = ix[t + ((c + 1) % 3)]
      const k = a < b ? `${a},${b}` : `${b},${a}`
      seen.set(k, (seen.get(k) ?? 0) + 1)
      ends.set(k, [a, b])
    }
    const edges: [number, number][] = []
    for (const [k, n] of seen) if (n === 1) edges.push(ends.get(k)!)
    return edges
  })
  const folds: Fold[] = []
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
    // a wrapping seam puts one position at two uv points a period apart; a flat ring's seam does not
    const seamI = new Set(pieces[i].period ? pieces[i].seamVertices : []), seamJ = new Set(pieces[j].period ? pieces[j].seamVertices : [])
    const pairs: [number, number][] = []
    const edges: [number, number][] = []
    let length = 0
    const matched = new Set<number>()
    const P = pieces[i].positions
    for (const [a, b] of boundary[i]) {
      const ja = keys[j].get(positionKey(P, a)), jb = keys[j].get(positionKey(P, b))
      if (!ja || !jb) continue
      edges.push([a, b])
      length += Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2])
      for (const [v, js] of [[a, ja], [b, jb]] as [number, number[]][]) {
        if (matched.has(v) || seamI.has(v)) continue
        matched.add(v)
        for (const w of js) if (!seamJ.has(w)) pairs.push([v, w])
      }
    }
    if (edges.length) folds.push({ a: i, b: j, length, pairs, edges })
  }
  return folds
}

/** Similarity transform (rotation, uniform scale, translation; no reflection) taking `src` onto `dst` in the least-squares sense. */
function fitSimilarity(src: [number, number][], dst: [number, number][]): { s: number; cos: number; sin: number; tx: number; ty: number } | null {
  const n = src.length
  if (n < 2) return null
  let sx = 0, sy = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1] }
  sx /= n; sy /= n; dx /= n; dy /= n
  let a = 0, b = 0, norm = 0
  for (let i = 0; i < n; i++) {
    const x = src[i][0] - sx, y = src[i][1] - sy, u = dst[i][0] - dx, v = dst[i][1] - dy
    a += x * u + y * v
    b += x * v - y * u
    norm += x * x + y * y
  }
  if (norm < 1e-18) return null
  const s = Math.hypot(a, b) / norm
  if (!(s > 0)) return null
  const cos = a / (s * norm), sin = b / (s * norm)
  return { s, cos, sin, tx: dx - s * (cos * sx - sin * sy), ty: dy - s * (sin * sx + cos * sy) }
}

/**
 * Unfold pieces that meet along sharp edges into shared sheets, like the net of
 * a box: a child's uv is moved by a similarity transform so its side of the
 * fold lands where the parent has it. A fold is only joined when the shared
 * edge flattens the same way in both pieces (two planar faces always do; a
 * cylinder wall and its flat lid never do). Longest folds are joined first,
 * starting from the piece under the layout origin, so a closed corner keeps
 * its two longest edges continuous and cuts the third.
 */
function unfoldSheets(pieces: FlattenedPiece[], root: number, log: string[]): void {
  // consistent orientation first: a mirrored uv cannot be aligned by a rotation
  for (const piece of pieces) {
    if (signedUvArea(piece.uv, piece.indices) >= 0) continue
    for (let i = 0; i < piece.uv.length; i += 2) piece.uv[i] = -piece.uv[i]
    if (piece.period) piece.period = [-piece.period[0], piece.period[1]]
  }
  pieces.forEach((piece, i) => { piece.sheet = i; piece.foldVertices = []; piece.foldEdges = []; piece.mitres = []; piece.closure = null })
  const folds = findFolds(pieces)
  const placed = new Uint8Array(pieces.length)
  let nPlaced = 0
  const rejected: string[] = []
  const place = (i: number) => { placed[i] = 1; nPlaced++ }
  // the unfolding tree: which piece each was unfolded from, along which fold
  const parentOf = new Int32Array(pieces.length).fill(-1)
  const parentFold: (Fold | null)[] = pieces.map(() => null)
  place(root)
  let joined = 0
  while (nPlaced < pieces.length) {
    // the longest fold between a placed piece and one still loose
    let best: Fold | null = null
    for (const f of folds) if (placed[f.a] !== placed[f.b] && (!best || f.length > best.length)) best = f
    if (!best) {
      // nothing joins what is placed: the largest loose piece starts its own sheet
      let next = -1
      for (let i = 0; i < pieces.length; i++) if (!placed[i] && (next < 0 || pieces[i].area > pieces[next].area)) next = i
      place(next)
      continue
    }
    folds.splice(folds.indexOf(best), 1) // settled either way
    const parent = placed[best.a] ? best.a : best.b, child = parent === best.a ? best.b : best.a
    const P = pieces[parent], C = pieces[child]
    const src: [number, number][] = [], dst: [number, number][] = []
    const toParent = new Map<number, number>() // a's vertex -> parent's vertex
    for (const [va, vb] of best.pairs) {
      const vp = parent === best.a ? va : vb, vc = parent === best.a ? vb : va
      dst.push([P.uv[vp * 2], P.uv[vp * 2 + 1]])
      src.push([C.uv[vc * 2], C.uv[vc * 2 + 1]])
      toParent.set(va, vp)
    }
    const fit = fitSimilarity(src, dst)
    // residual in mm: the parent's uv along the fold is scaled by the fold's true length over its uv length
    let uvLength = 0
    for (const [a, b] of best.edges) {
      const pa = toParent.get(a), pb = toParent.get(b)
      if (pa === undefined || pb === undefined) continue
      uvLength += Math.hypot(P.uv[pa * 2] - P.uv[pb * 2], P.uv[pa * 2 + 1] - P.uv[pb * 2 + 1])
    }
    const mmPerUv = uvLength > 0 ? best.length / uvLength : 1
    let worst = 0
    if (fit) for (let i = 0; i < src.length; i++) {
      const [x, y] = src[i]
      const u = fit.s * (fit.cos * x - fit.sin * y) + fit.tx, v = fit.s * (fit.sin * x + fit.cos * y) + fit.ty
      worst = Math.max(worst, Math.hypot(u - dst[i][0], v - dst[i][1]) * mmPerUv)
    }
    const tolerance = Math.max(0.05, Math.min(0.5, best.length * 0.01))
    if (!fit || worst > tolerance || fit.s < 0.5 || fit.s > 2) {
      rejected.push(`${best.length.toFixed(0)} mm edge (${fit ? `sides differ by ${worst.toFixed(2)} mm` : 'too few shared points'})`)
      continue
    }
    for (let i = 0; i < C.uv.length; i += 2) {
      const x = C.uv[i], y = C.uv[i + 1]
      C.uv[i] = fit.s * (fit.cos * x - fit.sin * y) + fit.tx
      C.uv[i + 1] = fit.s * (fit.sin * x + fit.cos * y) + fit.ty
    }
    if (C.period) C.period = [fit.s * (fit.cos * C.period[0] - fit.sin * C.period[1]), fit.s * (fit.sin * C.period[0] + fit.cos * C.period[1])]
    C.sheet = P.sheet
    const A = pieces[best.a], B = pieces[best.b]
    const toB = new Map<number, number>()
    for (const [va, vb] of best.pairs) { A.foldVertices.push(va); B.foldVertices.push(vb); toB.set(va, vb) }
    const edgesB: [number, number][] = []
    for (const [a, b] of best.edges) {
      A.foldEdges.push([a, b])
      const ba = toB.get(a), bb = toB.get(b)
      if (ba !== undefined && bb !== undefined) { edgesB.push([ba, bb]); B.foldEdges.push([ba, bb]) }
    }
    const mitre = mitrePlane(A, best.edges, B, edgesB)
    if (mitre) {
      const { otherFaceNormal, ...own } = mitre
      A.mitres.push(own)
      B.mitres.push({ ...own, normal: [-own.normal[0], -own.normal[1], -own.normal[2]], faceNormal: otherFaceNormal })
    }
    parentOf[child] = parent
    parentFold[child] = best
    place(child)
    joined++
  }
  if (joined) {
    const sheets = new Set(pieces.map((p) => p.sheet)).size
    log.push(`${joined} sharp edge(s) unfolded flat so the pattern continues across them: ${pieces.length} pieces form ${sheets} sheet(s)`)
  }
  if (rejected.length) log.push(`not unfolded, the edge does not flatten the same way on both sides: ${rejected.join(', ')}`)
  closeRings(pieces, folds, parentOf, parentFold, log)
}

/** 3D direction of a fold, from its longest edge on piece A. */
function foldDirection(pieces: FlattenedPiece[], f: Fold): [number, number, number] {
  const P = pieces[f.a].positions
  let best: [number, number, number] = [0, 0, 0], len = -1
  for (const [a, b] of f.edges) {
    const d: [number, number, number] = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]]
    const l = Math.hypot(...d)
    if (l > len) { len = l; best = [d[0] / l, d[1] / l, d[2] / l] }
  }
  return best
}

/**
 * A fold left over between two pieces of one sheet is where the sheet wraps
 * round and meets itself: the last edge of a ring of walls. When its two sides
 * coincide after a plain translation, that translation is the sheet's period
 * and the tile can repeat a whole number of times around it, exactly as around
 * a cylinder; the fold is recorded as the sheet's closure for the layout to
 * join. A fold whose sides only meet after a turn (the third edge of a cube
 * corner, the last side of a tapered box) cannot close flat and stays cut, and
 * so does a fold to a ring-shaped piece (a box rim): its two sides do line up
 * by a translation, but the loop would run across the piece's hole. One
 * closure per sheet: a whole shell has several rings of different lengths, and
 * one period can only fit one of them.
 */
function closeRings(pieces: FlattenedPiece[], folds: Fold[], parentOf: Int32Array, parentFold: (Fold | null)[], log: string[]): void {
  const candidates: { fold: Fold; period: [number, number]; edgesB: [number, number][] }[] = []
  const cut: string[] = []
  // the loop a closing fold makes with the unfolding tree: the pieces and folds from a up to the
  // common ancestor and back down to b
  const loop = (a: number, b: number): { pieces: number[]; folds: Fold[] } => {
    const up = (i: number) => { const path = [i]; while (parentOf[path[path.length - 1]] >= 0) path.push(parentOf[path[path.length - 1]]); return path }
    const pa = up(a), pb = up(b), lca = pa.find((x) => pb.includes(x))!
    const ia = pa.indexOf(lca), ib = pb.indexOf(lca)
    return { pieces: [...pa.slice(0, ia + 1), ...pb.slice(0, ib)], folds: [...pa.slice(0, ia), ...pb.slice(0, ib)].map((i) => parentFold[i]!) }
  }
  for (const f of folds) {
    const A = pieces[f.a], B = pieces[f.b]
    if (A.sheet !== B.sheet || f.pairs.length < 2) continue
    // the ring must be a straight band: every fold around it parallel to the closing one, and no
    // piece on the way ring-shaped itself (a rim needed a seam cut to flatten: the loop would run
    // across its hole)
    const ring = loop(f.a, f.b)
    if (ring.pieces.some((i) => pieces[i].seamVertices.length)) { cut.push(`${f.length.toFixed(0)} mm edge (the loop runs through a ring-shaped piece with a hole)`); continue }
    const d0 = foldDirection(pieces, f)
    const skew = ring.folds.map((g) => foldDirection(pieces, g)).map((d) => (Math.acos(Math.min(1, Math.abs(d[0] * d0[0] + d[1] * d0[1] + d[2] * d0[2]))) * 180) / Math.PI)
    if (skew.some((s) => s > 1)) { cut.push(`${f.length.toFixed(0)} mm edge (the loop's edges are not parallel, so it is not a straight band: ${Math.max(...skew).toFixed(0)}° apart)`); continue }
    // the translation taking B's side of the fold onto A's, and how far it leaves each pair apart
    let tx = 0, ty = 0
    for (const [va, vb] of f.pairs) { tx += A.uv[va * 2] - B.uv[vb * 2]; ty += A.uv[va * 2 + 1] - B.uv[vb * 2 + 1] }
    tx /= f.pairs.length; ty /= f.pairs.length
    let uvLength = 0
    for (const [a, b] of f.edges) uvLength += Math.hypot(A.uv[a * 2] - A.uv[b * 2], A.uv[a * 2 + 1] - A.uv[b * 2 + 1])
    const mmPerUv = uvLength > 0 ? f.length / uvLength : 1
    let worst = 0
    for (const [va, vb] of f.pairs) worst = Math.max(worst, Math.hypot(A.uv[va * 2] - B.uv[vb * 2] - tx, A.uv[va * 2 + 1] - B.uv[vb * 2 + 1] - ty) * mmPerUv)
    if (worst > Math.max(0.05, Math.min(0.5, f.length * 0.01))) {
      const fit = fitSimilarity(f.pairs.map(([, vb]) => [B.uv[vb * 2], B.uv[vb * 2 + 1]]), f.pairs.map(([va]) => [A.uv[va * 2], A.uv[va * 2 + 1]]))
      const turn = fit ? Math.abs((Math.atan2(fit.sin, fit.cos) * 180) / Math.PI) : 0
      cut.push(`${f.length.toFixed(0)} mm edge (the faces turn by ${turn.toFixed(0)}° there, so the sheet cannot wrap round flat)`)
      continue
    }
    const toB = new Map(f.pairs)
    const edgesB: [number, number][] = []
    for (const [a, b] of f.edges) { const ba = toB.get(a), bb = toB.get(b); if (ba !== undefined && bb !== undefined) edgesB.push([ba, bb]) }
    candidates.push({ fold: f, period: [tx, ty], edgesB })
  }
  candidates.sort((x, y) => y.fold.length - x.fold.length)
  const closed = new Set<number>()
  for (const { fold: f, period, edgesB } of candidates) {
    const A = pieces[f.a], B = pieces[f.b]
    if (closed.has(A.sheet)) { cut.push(`${f.length.toFixed(0)} mm edge (a second ring on the same sheet)`); continue }
    if (pieces.some((p) => p.sheet === A.sheet && p.period)) { cut.push(`${f.length.toFixed(0)} mm edge (the sheet already wraps another way)`); continue }
    const mitre = mitrePlane(A, f.edges, B, edgesB)
    if (!mitre) { cut.push(`${f.length.toFixed(0)} mm edge (not straight)`); continue }
    const { otherFaceNormal, ...own } = mitre
    A.closure = { edges: f.edges, vertices: f.pairs.map(([va]) => va), mitre: own, length: f.length }
    B.closure = { edges: edgesB, vertices: f.pairs.map(([, vb]) => vb), mitre: { ...own, normal: [-own.normal[0], -own.normal[1], -own.normal[2]], faceNormal: otherFaceNormal }, length: f.length }
    for (const p of pieces) if (p.sheet === A.sheet) p.period = [period[0], period[1]]
    closed.add(A.sheet)
    // the period in millimetres: the sheet's uv scale at the fold
    let uvLength = 0
    for (const [a, b] of f.edges) uvLength += Math.hypot(A.uv[a * 2] - A.uv[b * 2], A.uv[a * 2 + 1] - A.uv[b * 2 + 1])
    const mm = Math.hypot(period[0], period[1]) * (uvLength > 0 ? f.length / uvLength : 1)
    log.push(`the sheet wraps round to meet itself along a ${f.length.toFixed(0)} mm edge: the tile can repeat around its ${mm.toFixed(0)} mm circumference`)
  }
  if (cut.length) log.push(`edge(s) left cut where the sheet meets itself: ${cut.join(', ')}`)
}

/**
 * In through-cut mode, a piece mostly backed by a larger opposite face within the
 * cut's reach is that face's back side: the cut from the front already goes
 * through it, and cutting it again with its own layout would chop the wall up.
 */
export function isBackSide(piece: Pick<FlattenedPiece, 'backing'>, mode: 'cut' | 'recess' | 'emboss', wallThickness: number): boolean {
  return mode === 'cut' && !!piece.backing && piece.backing.fraction > 0.5 && piece.backing.distance <= wallThickness + 1
}

/**
 * For each piece, find whether a larger piece of the region lies behind it
 * (through the material) facing the other way, and how far. Rays are cast from
 * area-weighted triangle centroids along the inward normal.
 */
function findBacking(mesh: TriMesh, parts: Uint32Array[], maxDist: number): ({ fraction: number; distance: number } | null)[] {
  if (parts.length < 2) return parts.map(() => null)
  const pieceOf = new Int32Array(mesh.indices.length / 3).fill(-1)
  parts.forEach((part, i) => { for (const t of part) pieceOf[t] = i })
  const index = new SurfaceIndex(mesh)
  const n = new Float64Array(3), nh = new Float64Array(3)
  const partArea = parts.map((part) => { let a = 0; for (const t of part) a += triangleAreaNormal(mesh, t, n); return a })
  const out: ({ fraction: number; distance: number } | null)[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    // area-weighted pick of up to 200 triangles
    const areas = new Float64Array(part.length)
    const total = partArea[i]
    for (let j = 0; j < part.length; j++) areas[j] = triangleAreaNormal(mesh, part[j], n)
    const samples = Math.min(200, part.length)
    let backed = 0, tested = 0
    const dists: number[] = []
    for (let s = 0; s < samples; s++) {
      // stratified cumulative-area pick
      let target = ((s + 0.5) / samples) * total, j = 0
      while (j < part.length - 1 && target > areas[j]) { target -= areas[j]; j++ }
      const t = part[j]
      triangleAreaNormal(mesh, t, n)
      const { positions: p, indices: ix } = mesh
      let cx = 0, cy = 0, cz = 0
      for (let c = 0; c < 3; c++) { const v = ix[t * 3 + c] * 3; cx += p[v]; cy += p[v + 1]; cz += p[v + 2] }
      cx /= 3; cy /= 3; cz /= 3
      const eps = 1e-3
      const hit = index.raycastFirst(cx - n[0] * eps, cy - n[1] * eps, cz - n[2] * eps, -n[0], -n[1], -n[2], maxDist)
      tested++
      if (!hit || hit.faceIndex < 0) continue
      const other = pieceOf[hit.faceIndex]
      if (other < 0 || other === i || partArea[other] <= total) continue // only a larger front counts
      triangleAreaNormal(mesh, hit.faceIndex, nh)
      if (n[0] * nh[0] + n[1] * nh[1] + n[2] * nh[2] > -0.7) continue
      backed++
      dists.push(hit.distance + eps)
    }
    if (!tested || !backed) { out.push(null); continue }
    dists.sort((a, b) => a - b)
    out.push({ fraction: backed / tested, distance: dists[Math.floor(dists.length / 2)] })
  }
  index.dispose()
  return out
}

/** Flatten every smooth piece of a region. Pieces that cannot be flattened are skipped with a log line. */
export function flattenPieces(mesh: TriMesh, region: Uint32Array, origin: [number, number, number], maxAngleDeg: number, joinEdges = true): { pieces: FlattenedPiece[]; log: string[] } {
  const parts = splitSmoothPieces(mesh, region, maxAngleDeg)
  const log: string[] = []
  // the piece the origin lies on: the one holding the triangle nearest the origin
  const all = extractSubMesh(mesh, region)
  const originTri = all.sourceTriangles[nearestTriangle(all, origin[0], origin[1], origin[2])]
  const pieces: FlattenedPiece[] = []
  if (parts.length > 1) log.push(`region spans ${parts.length} smooth pieces (edges sharper than ${maxAngleDeg}°); each is flattened on its own`)
  const backing = findBacking(mesh, parts, 50)
  parts.forEach((part, i) => {
    const own = part.includes(originTri) ? origin : regionCentroid(mesh, part)
    try {
      const flat = flattenRegion(mesh, part, own)
      if (parts.length === 1) log.push(...flat.log)
      let area = 0
      const tmp = new Float64Array(3)
      for (const t of part) area += triangleAreaNormal(mesh, t, tmp)
      pieces.push({ ...flat, origin: own, region: part, area, backing: backing[i], sheet: pieces.length, frame: null, foldVertices: [], foldEdges: [], mitres: [], closure: null })
    } catch (e) {
      log.push(`piece of ${part.length} triangles skipped: ${(e as Error).message}`)
    }
  })
  if (parts.length > 1) {
    const caps = pieces.filter((p) => p.topology === 'cap').length, seams = pieces.filter((p) => p.topology === 'seam').length
    log.push(`${pieces.length} pieces flattened${caps ? `, ${caps} closed (far-side cap left solid)` : ''}${seams ? `, ${seams} ring-shaped (tile wraps)` : ''}`)
  }
  let rootIndex = pieces.findIndex((p) => p.region.includes(originTri))
  if (rootIndex < 0) rootIndex = pieces.reduce((best, p, i) => (p.area > pieces[best].area ? i : best), 0)
  if (joinEdges && pieces.length > 1) unfoldSheets(pieces, rootIndex, log)
  // one layout frame per sheet: its origin (the user's, when their piece is on the sheet,
  // else the centre of the sheet's largest piece) expressed in the sheet's shared uv space
  for (const sheet of new Set(pieces.map((p) => p.sheet))) {
    const members = pieces.filter((p) => p.sheet === sheet)
    const lead = members.includes(pieces[rootIndex]) ? pieces[rootIndex] : members.reduce((a, b) => (b.area > a.area ? b : a))
    const param = new Parameterization({ positions: lead.positions, indices: lead.indices, normals: lead.normals, sourceTriangles: new Uint32Array(0) }, new Float32Array(lead.uv))
    const t = lead.originTriangle
    const [u0, v0] = param.uvAt3D(t, lead.origin[0], lead.origin[1], lead.origin[2])
    const frame = { u0, v0, scale: param.scale[t] || 1 }
    for (const p of members) { p.frame = frame; p.origin = lead.origin }
  }
  return { pieces, log }
}
