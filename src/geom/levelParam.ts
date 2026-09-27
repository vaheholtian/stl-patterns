// "Level rows" parameterization of a ring-shaped wall cut along a seam.
//
// A conformal flattening (LSCM) of a wall that is not developable, the outer
// wall of an oval bowl, comes out bent into an arc like a lampshade pattern:
// straight rows of tiles in that arc are level only near the origin and tilt
// more and more going round, with a kink where the seam closes. Here instead v
// is a function of height alone (the distance up the wall per millimetre of
// height, averaged round the wall), so every row of the tile is level with the
// print bed, and u runs round the wall as a harmonic function from one side of
// the seam to the other, so the two sides coincide after a plain translation.
// The price is that the pattern is squeezed sideways where the wall is narrower,
// as anything wrapped round a tapered wall must be.
import type { SubMesh } from './submesh'

export interface LevelParamResult {
  uv: Float32Array
  /** the seam's translation in uv: (width, 0) */
  period: [number, number]
  /** mm round the wall at the mean perimeter */
  width: number
  /** mm up the wall from its lowest point to its highest, mean round the wall */
  height: number
  iterations: number
}

/** Cotangent Laplacian as symmetric adjacency lists, weights clamped so the maximum principle holds on skinny CAD triangles. */
function cotanWeights(sub: SubMesh): { nbr: Int32Array[]; w: Float64Array[] } {
  const { positions: p, indices: ix } = sub
  const nV = p.length / 3
  const acc: Map<number, number>[] = Array.from({ length: nV }, () => new Map())
  const add = (a: number, b: number, w: number) => {
    acc[a].set(b, (acc[a].get(b) ?? 0) + w)
    acc[b].set(a, (acc[b].get(a) ?? 0) + w)
  }
  for (let t = 0; t < ix.length; t += 3) {
    const v = [ix[t], ix[t + 1], ix[t + 2]]
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3], c = v[(k + 2) % 3]
      // angle at c, opposite edge ab
      const ux = p[a * 3] - p[c * 3], uy = p[a * 3 + 1] - p[c * 3 + 1], uz = p[a * 3 + 2] - p[c * 3 + 2]
      const vx = p[b * 3] - p[c * 3], vy = p[b * 3 + 1] - p[c * 3 + 1], vz = p[b * 3 + 2] - p[c * 3 + 2]
      const dot = ux * vx + uy * vy + uz * vz
      const cross = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
      const cot = cross > 1e-12 ? dot / cross : 0
      add(a, b, 0.5 * Math.max(cot, 0))
    }
  }
  const nbr: Int32Array[] = [], w: Float64Array[] = []
  for (let v = 0; v < nV; v++) {
    const keys = [...acc[v].keys()]
    nbr.push(Int32Array.from(keys))
    // a tiny uniform share keeps every vertex tied to its neighbours even where all cotangents were clamped
    w.push(Float64Array.from(keys.map((k) => acc[v].get(k)! + 1e-4)))
  }
  return { nbr, w }
}

/**
 * Solve L f = 0 with f fixed on `fixed` (value per vertex, NaN = free) by
 * Jacobi-preconditioned conjugate gradients on the free vertices.
 */
function harmonic(lap: { nbr: Int32Array[]; w: Float64Array[] }, fixed: Float64Array, tol = 1e-9): { f: Float64Array; iterations: number } {
  const nV = fixed.length
  const free = new Int32Array(nV).fill(-1)
  const freeList: number[] = []
  for (let v = 0; v < nV; v++) if (Number.isNaN(fixed[v])) { free[v] = freeList.length; freeList.push(v) }
  const n = freeList.length
  const f = Float64Array.from(fixed)
  if (n === 0) return { f, iterations: 0 }
  const diag = new Float64Array(n), b = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const v = freeList[i]
    const nb = lap.nbr[v], ww = lap.w[v]
    let d = 0, rhs = 0
    for (let k = 0; k < nb.length; k++) { d += ww[k]; if (free[nb[k]] < 0) rhs += ww[k] * fixed[nb[k]] }
    diag[i] = d; b[i] = rhs
  }
  const apply = (x: Float64Array, out: Float64Array) => {
    for (let i = 0; i < n; i++) {
      const v = freeList[i]
      const nb = lap.nbr[v], ww = lap.w[v]
      let s = diag[i] * x[i]
      for (let k = 0; k < nb.length; k++) { const j = free[nb[k]]; if (j >= 0) s -= ww[k] * x[j] }
      out[i] = s
    }
  }
  // start from the mean of the fixed values: a decent guess for a harmonic function
  let mean = 0, cnt = 0
  for (let v = 0; v < nV; v++) if (!Number.isNaN(fixed[v])) { mean += fixed[v]; cnt++ }
  const x = new Float64Array(n).fill(cnt ? mean / cnt : 0)
  const r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), q = new Float64Array(n)
  apply(x, r)
  for (let i = 0; i < n; i++) { r[i] = b[i] - r[i]; z[i] = r[i] / diag[i]; p[i] = z[i] }
  let rz = 0
  for (let i = 0; i < n; i++) rz += r[i] * z[i]
  const b2 = Math.max(b.reduce((s, v) => s + v * v, 0), 1e-30)
  let it = 0
  const maxIt = Math.max(500, n * 4)
  for (; it < maxIt; it++) {
    apply(p, q)
    let pq = 0
    for (let i = 0; i < n; i++) pq += p[i] * q[i]
    if (pq <= 0) break
    const alpha = rz / pq
    let r2 = 0
    for (let i = 0; i < n; i++) { x[i] += alpha * p[i]; r[i] -= alpha * q[i]; r2 += r[i] * r[i] }
    if (r2 <= tol * tol * b2) { it++; break }
    let rzNew = 0
    for (let i = 0; i < n; i++) { z[i] = r[i] / diag[i]; rzNew += r[i] * z[i] }
    const beta = rzNew / rz
    rz = rzNew
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i]
  }
  for (let i = 0; i < n; i++) f[freeList[i]] = x[i]
  return { f, iterations: it }
}

/** Area-weighted mean of |grad f| over the surface (1/mm), for a per-vertex f. */
function meanGradient(sub: SubMesh, f: Float64Array): number {
  const { positions: p, indices: ix } = sub
  let num = 0, den = 0
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t], b = ix[t + 1], c = ix[t + 2]
    const e1x = p[b * 3] - p[a * 3], e1y = p[b * 3 + 1] - p[a * 3 + 1], e1z = p[b * 3 + 2] - p[a * 3 + 2]
    const e2x = p[c * 3] - p[a * 3], e2y = p[c * 3 + 1] - p[a * 3 + 1], e2z = p[c * 3 + 2] - p[a * 3 + 2]
    const g11 = e1x * e1x + e1y * e1y + e1z * e1z, g12 = e1x * e2x + e1y * e2y + e1z * e2z, g22 = e2x * e2x + e2y * e2y + e2z * e2z
    const det = g11 * g22 - g12 * g12
    if (det < 1e-18) continue
    const f1 = f[b] - f[a], f2 = f[c] - f[a]
    const al = (g22 * f1 - g12 * f2) / det, be = (g11 * f2 - g12 * f1) / det
    const g2 = al * al * g11 + 2 * al * be * g12 + be * be * g22
    const area = Math.sqrt(det) / 2
    num += Math.sqrt(Math.max(g2, 0)) * area
    den += area
  }
  return den > 0 ? num / den : 0
}

/**
 * Distance up the wall as a function of height: the surface climbs 1/sin(tilt)
 * mm per mm of height, averaged over the vertices in each of `bins` height
 * bands (area is not weighted: the tessellation is dense where the wall bends,
 * which is where the factor matters). Returns v per vertex in mm, 0 at the
 * lowest vertex.
 */
function heightAlongWall(sub: SubMesh, bins = 48): { v: Float64Array; height: number } {
  const { positions: p, normals: n } = sub
  const nV = p.length / 3
  let zLo = Infinity, zHi = -Infinity
  for (let i = 0; i < nV; i++) { const z = p[i * 3 + 2]; zLo = Math.min(zLo, z); zHi = Math.max(zHi, z) }
  const span = zHi - zLo
  const v = new Float64Array(nV)
  if (!(span > 1e-9)) return { v, height: 0 }
  const sum = new Float64Array(bins), cnt = new Float64Array(bins)
  for (let i = 0; i < nV; i++) {
    const k = Math.min(bins - 1, Math.floor(((p[i * 3 + 2] - zLo) / span) * bins))
    const nz = n[i * 3 + 2]
    // clamp at ~15° from level: a nearly flat band would otherwise climb without bound
    const factor = 1 / Math.max(Math.sqrt(Math.max(1 - nz * nz, 0)), 0.25)
    sum[k] += factor; cnt[k]++
  }
  const factor = new Float64Array(bins)
  let last = 1
  for (let k = 0; k < bins; k++) { if (cnt[k] > 0) last = sum[k] / cnt[k]; factor[k] = last }
  // cumulative distance at the bin edges
  const edge = new Float64Array(bins + 1)
  const dz = span / bins
  for (let k = 0; k < bins; k++) edge[k + 1] = edge[k] + factor[k] * dz
  for (let i = 0; i < nV; i++) {
    const s = ((p[i * 3 + 2] - zLo) / span) * bins
    const k = Math.min(bins - 1, Math.floor(s))
    v[i] = edge[k] + (s - k) * factor[k] * dz
  }
  return { v, height: edge[bins] }
}

/**
 * Parameterize a wall band cut along a seam. `cut` is the result of cutSeam,
 * whose duplicates are listed in `pairs` as [original, duplicate].
 */
export function flattenLevel(cut: SubMesh, pairs: [number, number][]): LevelParamResult {
  const nV = cut.positions.length / 3
  if (!pairs.length) throw new Error('level rows need a seam')
  // u: harmonic on the cut ring, 0 on one side of the seam, 1 on the other
  const fixedU = new Float64Array(nV).fill(NaN)
  for (const [a, b] of pairs) { fixedU[a] = 0; fixedU[b] = 1 }
  const solU = harmonic(cotanWeights(cut), fixedU)
  // v: distance up the wall, a function of height alone, so every row is level
  const { v, height } = heightAlongWall(cut)
  if (!(height > 0)) throw new Error('the wall has no height to keep rows level on')
  // mm per unit of u: an isometry would have |grad u| = 1/width everywhere
  const width = 1 / (meanGradient(cut, solU.f) || 1)
  // orient the sheet with the surface (outward normal towards the viewer) by flipping u if needed
  const { indices: ix } = cut
  let signed = 0
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t], b = ix[t + 1], c = ix[t + 2]
    signed += (solU.f[b] - solU.f[a]) * (v[c] - v[a]) - (solU.f[c] - solU.f[a]) * (v[b] - v[a])
  }
  const flip = signed < 0
  const uv = new Float32Array(nV * 2)
  for (let i = 0; i < nV; i++) {
    uv[i * 2] = (flip ? 1 - solU.f[i] : solU.f[i]) * width
    uv[i * 2 + 1] = v[i]
  }
  // the seam sides are exactly one width apart; report the period along +x so the
  // layout keeps u to the right and up up, whichever side of the seam got u = 0
  return { uv, period: [width, 0], width, height, iterations: solU.iterations }
}
