import type { SubMesh } from './submesh'

/**
 * A flattening of a surface region: every submesh vertex has a 2D coordinate.
 * After recentering, 2D coordinates are in millimetres at the origin and the
 * origin lies at (0,0) with the chosen tangent direction along +x.
 */
export class Parameterization {
  readonly sub: SubMesh
  /** uv per vertex, xy interleaved (mutable through recenter) */
  uv: Float32Array
  /** mm per uv-unit for each triangle (isotropic approximation) */
  scale: Float32Array
  private grid!: { minX: number; minY: number; cell: number; nx: number; ny: number; cells: Int32Array[] }

  constructor(sub: SubMesh, uv: Float32Array) {
    this.sub = sub
    this.uv = uv
    this.scale = new Float32Array(sub.indices.length / 3)
    this.fixOrientation()
    this.computeScale()
    this.buildGrid()
  }

  private triAreas(t: number): { a3: number; a2: number } {
    const { positions: p, indices: ix } = this.sub
    const uv = this.uv
    const a = ix[t * 3], b = ix[t * 3 + 1], c = ix[t * 3 + 2]
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2]
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2]
    const a3 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
    const a2 = ((uv[b * 2] - uv[a * 2]) * (uv[c * 2 + 1] - uv[a * 2 + 1]) - (uv[c * 2] - uv[a * 2]) * (uv[b * 2 + 1] - uv[a * 2 + 1])) / 2
    return { a3, a2 }
  }

  /** Make the 2D orientation match the 3D winding so tiles are not mirrored. */
  private fixOrientation() {
    let signed = 0
    const nTri = this.sub.indices.length / 3
    for (let t = 0; t < nTri; t++) signed += this.triAreas(t).a2
    if (signed < 0) {
      for (let i = 0; i < this.uv.length; i += 2) this.uv[i] = -this.uv[i]
    }
  }

  private computeScale() {
    const nTri = this.sub.indices.length / 3
    for (let t = 0; t < nTri; t++) {
      const { a3, a2 } = this.triAreas(t)
      this.scale[t] = a2 > 1e-12 ? Math.sqrt(a3 / a2) : 0
    }
  }

  bounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (let i = 0; i < this.uv.length; i += 2) {
      const x = this.uv[i], y = this.uv[i + 1]
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
    return { minX, minY, maxX, maxY }
  }

  private buildGrid() {
    const nTri = this.sub.indices.length / 3
    const b = this.bounds()
    const w = Math.max(b.maxX - b.minX, 1e-9), h = Math.max(b.maxY - b.minY, 1e-9)
    const n = Math.max(8, Math.ceil(Math.sqrt(nTri)))
    const cell = Math.max(w, h) / n
    const nx = Math.ceil(w / cell) + 1, ny = Math.ceil(h / cell) + 1
    const lists: number[][] = Array.from({ length: nx * ny }, () => [])
    const ix = this.sub.indices, uv = this.uv
    for (let t = 0; t < nTri; t++) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (let c = 0; c < 3; c++) {
        const v = ix[t * 3 + c]
        const x = uv[v * 2], y = uv[v * 2 + 1]
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      }
      const cx0 = Math.floor((x0 - b.minX) / cell), cx1 = Math.floor((x1 - b.minX) / cell)
      const cy0 = Math.floor((y0 - b.minY) / cell), cy1 = Math.floor((y1 - b.minY) / cell)
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) lists[cy * nx + cx].push(t)
    }
    this.grid = { minX: b.minX, minY: b.minY, cell, nx, ny, cells: lists.map((l) => Int32Array.from(l)) }
  }

  /** Triangle containing 2D point and its barycentrics; null if outside the region. */
  locate(x: number, y: number, eps = 1e-6): { t: number; w0: number; w1: number; w2: number } | null {
    const g = this.grid
    const cx = Math.floor((x - g.minX) / g.cell), cy = Math.floor((y - g.minY) / g.cell)
    const tryCell = (cxx: number, cyy: number) => {
      if (cxx < 0 || cyy < 0 || cxx >= g.nx || cyy >= g.ny) return null
      const list = g.cells[cyy * g.nx + cxx]
      const ix = this.sub.indices, uv = this.uv
      for (let i = 0; i < list.length; i++) {
        const t = list[i]
        const a = ix[t * 3], b = ix[t * 3 + 1], c = ix[t * 3 + 2]
        const ax = uv[a * 2], ay = uv[a * 2 + 1], bx = uv[b * 2], by = uv[b * 2 + 1], cxq = uv[c * 2], cyq = uv[c * 2 + 1]
        const det = (bx - ax) * (cyq - ay) - (cxq - ax) * (by - ay)
        if (Math.abs(det) < 1e-18) continue
        const w1 = ((x - ax) * (cyq - ay) - (cxq - ax) * (y - ay)) / det
        const w2 = ((bx - ax) * (y - ay) - (x - ax) * (by - ay)) / det
        const w0 = 1 - w1 - w2
        if (w0 >= -eps && w1 >= -eps && w2 >= -eps) return { t, w0, w1, w2 }
      }
      return null
    }
    const hit = tryCell(cx, cy)
    if (hit) return hit
    // tolerate points just across a cell boundary
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const h = tryCell(cx + dx, cy + dy)
      if (h) return h
    }
    return null
  }

  /** Nearest triangle by 2D vertex distance, for points outside the region. */
  nearest(x: number, y: number): { t: number; w0: number; w1: number; w2: number } {
    // brute force: fine for fallback use only
    const ix = this.sub.indices, uv = this.uv
    let best = 0, bestD = Infinity
    for (let t = 0; t < ix.length / 3; t++) {
      for (let c = 0; c < 3; c++) {
        const v = ix[t * 3 + c]
        const d = (uv[v * 2] - x) ** 2 + (uv[v * 2 + 1] - y) ** 2
        if (d < bestD) { bestD = d; best = t }
      }
    }
    // clamp to the closest vertex of that triangle
    const a = ix[best * 3], b = ix[best * 3 + 1], c = ix[best * 3 + 2]
    const ds = [a, b, c].map((v) => (uv[v * 2] - x) ** 2 + (uv[v * 2 + 1] - y) ** 2)
    const m = ds.indexOf(Math.min(...ds))
    return { t: best, w0: m === 0 ? 1 : 0, w1: m === 1 ? 1 : 0, w2: m === 2 ? 1 : 0 }
  }

  /** Map a 2D point plus normal offset to 3D. Writes xyz into out. */
  toSurface(x: number, y: number, offset: number, out: Float32Array | number[], o = 0): boolean {
    let loc = this.locate(x, y)
    const inside = loc !== null
    if (!loc) loc = this.nearest(x, y)
    const { positions: p, normals: nrm, indices: ix } = this.sub
    const a = ix[loc.t * 3], b = ix[loc.t * 3 + 1], c = ix[loc.t * 3 + 2]
    for (let d = 0; d < 3; d++) {
      const pos = loc.w0 * p[a * 3 + d] + loc.w1 * p[b * 3 + d] + loc.w2 * p[c * 3 + d]
      const n = loc.w0 * nrm[a * 3 + d] + loc.w1 * nrm[b * 3 + d] + loc.w2 * nrm[c * 3 + d]
      out[o + d] = pos + n * offset
    }
    return inside
  }

  /** uv of a 3D point known to lie on triangle t (barycentric via 3D). */
  uvAt3D(t: number, x: number, y: number, z: number): [number, number] {
    const { positions: p, indices: ix } = this.sub
    const a = ix[t * 3], b = ix[t * 3 + 1], c = ix[t * 3 + 2]
    const v0x = p[b * 3] - p[a * 3], v0y = p[b * 3 + 1] - p[a * 3 + 1], v0z = p[b * 3 + 2] - p[a * 3 + 2]
    const v1x = p[c * 3] - p[a * 3], v1y = p[c * 3 + 1] - p[a * 3 + 1], v1z = p[c * 3 + 2] - p[a * 3 + 2]
    const v2x = x - p[a * 3], v2y = y - p[a * 3 + 1], v2z = z - p[a * 3 + 2]
    const d00 = v0x * v0x + v0y * v0y + v0z * v0z, d01 = v0x * v1x + v0y * v1y + v0z * v1z
    const d11 = v1x * v1x + v1y * v1y + v1z * v1z, d20 = v2x * v0x + v2y * v0y + v2z * v0z
    const d21 = v2x * v1x + v2y * v1y + v2z * v1z
    const den = d00 * d11 - d01 * d01 || 1e-18
    const w1 = (d11 * d20 - d01 * d21) / den, w2 = (d00 * d21 - d01 * d20) / den, w0 = 1 - w1 - w2
    const uv = this.uv
    return [w0 * uv[a * 2] + w1 * uv[b * 2] + w2 * uv[c * 2], w0 * uv[a * 2 + 1] + w1 * uv[b * 2 + 1] + w2 * uv[c * 2 + 1]]
  }

  /**
   * Recenter so that the given 3D point on triangle t maps to (0,0) with unit
   * scale there, rotated so that 2D direction `dirUv` points along +x, then
   * rotated by `rotationDeg` and scaled by `zoom`.
   */
  /** accumulated linear part of all recenter calls (row-major 2x2) */
  linear: [number, number, number, number] = [1, 0, 0, 1]

  recenter(t: number, x: number, y: number, z: number, rotationDeg = 0, zoom = 1) {
    const [u0, v0] = this.uvAt3D(t, x, y, z)
    const s = this.scale[t] || 1
    const rot = (rotationDeg * Math.PI) / 180
    const cs = Math.cos(rot), sn = Math.sin(rot)
    for (let i = 0; i < this.uv.length; i += 2) {
      const dx = (this.uv[i] - u0) * s, dy = (this.uv[i + 1] - v0) * s
      this.uv[i] = (dx * cs - dy * sn) / zoom
      this.uv[i + 1] = (dx * sn + dy * cs) / zoom
    }
    // M_new = (1/zoom) * R * s ; accumulate M = M_new * M
    const a = (cs * s) / zoom, b = (-sn * s) / zoom, c = (sn * s) / zoom, d = (cs * s) / zoom
    const [p, q, r, w] = this.linear
    this.linear = [a * p + b * r, a * q + b * w, c * p + d * r, c * q + d * w]
    this.computeScale()
    this.buildGrid()
  }

  /** Apply the accumulated linear transform to a direction vector. */
  transformVector(v: [number, number]): [number, number] {
    const [a, b, c, d] = this.linear
    return [a * v[0] + b * v[1], c * v[0] + d * v[1]]
  }

  /** Boundary of the region in 2D as polygons (one per boundary loop), CCW. */
  boundaryPolygons(loops: number[][]): [number, number][][] {
    return loops.map((loop) => loop.map((v) => [this.uv[v * 2], this.uv[v * 2 + 1]] as [number, number]))
  }
}
