// Least Squares Conformal Maps (Lévy et al. 2002) for a disk-topology submesh.
// Free boundary, two pinned vertices, solved with CGLS on the sparse system.
import type { SubMesh } from './submesh'

export interface LscmOptions {
  /** pinned vertex indices; picked automatically when omitted */
  pins?: [number, number]
  maxIterations?: number
  tolerance?: number
}

export interface LscmResult {
  uv: Float32Array
  iterations: number
  residual: number
}

export function flattenLSCM(sub: SubMesh, opts: LscmOptions = {}): LscmResult {
  const { positions: p, indices: ix } = sub
  const nV = p.length / 3
  const nT = ix.length / 3
  if (nT === 0) throw new Error('empty region')

  // --- pins: the two vertices farthest apart along the longest bounding-box axis
  let pins = opts.pins
  if (!pins) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (let v = 0; v < nV; v++) for (let d = 0; d < 3; d++) { const x = p[v * 3 + d]; if (x < min[d]) min[d] = x; if (x > max[d]) max[d] = x }
    const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
    const axis = ext.indexOf(Math.max(...ext))
    let lo = 0, hi = 0
    for (let v = 0; v < nV; v++) { if (p[v * 3 + axis] < p[lo * 3 + axis]) lo = v; if (p[v * 3 + axis] > p[hi * 3 + axis]) hi = v }
    pins = [lo, hi]
  }
  const [pinA, pinB] = pins
  const pinDist = Math.hypot(p[pinB * 3] - p[pinA * 3], p[pinB * 3 + 1] - p[pinA * 3 + 1], p[pinB * 3 + 2] - p[pinA * 3 + 2]) || 1
  // pinned uv: A -> (0,0), B -> (d,0)
  const pinnedU = new Float64Array(nV), pinnedV = new Float64Array(nV)
  pinnedU[pinB] = pinDist

  // --- unknown numbering: u_v -> col 2*f, v_v -> col 2*f+1 for free vertices
  const col = new Int32Array(nV).fill(-1)
  let nFree = 0
  for (let v = 0; v < nV; v++) if (v !== pinA && v !== pinB) col[v] = nFree++
  const nCols = nFree * 2

  // --- sparse rows: 2 per triangle, up to 6 nonzeros each (3 verts x (u,v))
  const rows = nT * 2
  const rowPtr = new Int32Array(rows + 1)
  const colIdx = new Int32Array(rows * 6)
  const vals = new Float64Array(rows * 6)
  const rhs = new Float64Array(rows)
  let nnz = 0
  const W = new Float64Array(6) // re/im per vertex
  for (let t = 0; t < nT; t++) {
    const a = ix[t * 3], b = ix[t * 3 + 1], c = ix[t * 3 + 2]
    // local 2D frame
    const e1x = p[b * 3] - p[a * 3], e1y = p[b * 3 + 1] - p[a * 3 + 1], e1z = p[b * 3 + 2] - p[a * 3 + 2]
    const e2x = p[c * 3] - p[a * 3], e2y = p[c * 3 + 1] - p[a * 3 + 1], e2z = p[c * 3 + 2] - p[a * 3 + 2]
    const l1 = Math.hypot(e1x, e1y, e1z) || 1e-12
    const xhx = e1x / l1, xhy = e1y / l1, xhz = e1z / l1
    const x3 = e2x * xhx + e2y * xhy + e2z * xhz
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x
    const twiceArea = Math.hypot(cx, cy, cz)
    const y3 = twiceArea / l1
    // points: 1=(0,0) 2=(l1,0) 3=(x3,y3)
    const x1 = 0, y1 = 0, x2 = l1, y2 = 0
    // W1 = (x3-x2) + i(y3-y2); W2 = (x1-x3) + i(y1-y3); W3 = (x2-x1) + i(y2-y1)
    W[0] = x3 - x2; W[1] = y3 - y2
    W[2] = x1 - x3; W[3] = y1 - y3
    W[4] = x2 - x1; W[5] = y2 - y1
    const s = 1 / Math.sqrt(Math.max(twiceArea, 1e-12))
    const verts = [a, b, c]
    // real row: sum(Re W u - Im W v) = 0 ; imag row: sum(Im W u + Re W v) = 0
    for (let part = 0; part < 2; part++) {
      const r = t * 2 + part
      rowPtr[r] = nnz
      let rhsAcc = 0
      for (let j = 0; j < 3; j++) {
        const v = verts[j]
        const re = W[j * 2] * s, im = W[j * 2 + 1] * s
        const cu = part === 0 ? re : im
        const cv = part === 0 ? -im : re
        if (col[v] >= 0) {
          colIdx[nnz] = col[v] * 2; vals[nnz] = cu; nnz++
          colIdx[nnz] = col[v] * 2 + 1; vals[nnz] = cv; nnz++
        } else {
          rhsAcc -= cu * pinnedU[v] + cv * pinnedV[v]
        }
      }
      rhs[r] = rhsAcc
    }
  }
  rowPtr[rows] = nnz

  // --- column scaling (Jacobi preconditioning for CGLS)
  const colScale = new Float64Array(nCols)
  for (let k = 0; k < nnz; k++) colScale[colIdx[k]] += vals[k] * vals[k]
  for (let c = 0; c < nCols; c++) colScale[c] = colScale[c] > 0 ? 1 / Math.sqrt(colScale[c]) : 1
  for (let k = 0; k < nnz; k++) vals[k] *= colScale[colIdx[k]]

  const matVec = (x: Float64Array, out: Float64Array) => {
    for (let r = 0; r < rows; r++) {
      let acc = 0
      for (let k = rowPtr[r]; k < rowPtr[r + 1]; k++) acc += vals[k] * x[colIdx[k]]
      out[r] = acc
    }
  }
  const matTVec = (y: Float64Array, out: Float64Array) => {
    out.fill(0)
    for (let r = 0; r < rows; r++) {
      const yr = y[r]
      if (yr === 0) continue
      for (let k = rowPtr[r]; k < rowPtr[r + 1]; k++) out[colIdx[k]] += vals[k] * yr
    }
  }

  // --- CGLS
  const x = new Float64Array(nCols)
  const r = Float64Array.from(rhs)
  const sVec = new Float64Array(nCols)
  matTVec(r, sVec)
  const pVec = Float64Array.from(sVec)
  const q = new Float64Array(rows)
  let gamma = dot(sVec, sVec)
  const gamma0 = gamma
  const tol = opts.tolerance ?? 1e-10
  const maxIt = opts.maxIterations ?? Math.max(200, nCols * 2)
  let it = 0
  for (; it < maxIt; it++) {
    matVec(pVec, q)
    const qq = dot(q, q)
    if (qq === 0) break
    const alpha = gamma / qq
    for (let i = 0; i < nCols; i++) x[i] += alpha * pVec[i]
    for (let i = 0; i < rows; i++) r[i] -= alpha * q[i]
    matTVec(r, sVec)
    const gammaNew = dot(sVec, sVec)
    if (gammaNew <= tol * tol * gamma0) { it++; break }
    const beta = gammaNew / gamma
    gamma = gammaNew
    for (let i = 0; i < nCols; i++) pVec[i] = sVec[i] + beta * pVec[i]
  }

  // --- assemble uv
  const uv = new Float32Array(nV * 2)
  for (let v = 0; v < nV; v++) {
    if (col[v] >= 0) {
      uv[v * 2] = x[col[v] * 2] * colScale[col[v] * 2]
      uv[v * 2 + 1] = x[col[v] * 2 + 1] * colScale[col[v] * 2 + 1]
    } else {
      uv[v * 2] = pinnedU[v]; uv[v * 2 + 1] = pinnedV[v]
    }
  }
  return { uv, iterations: it, residual: Math.sqrt(dot(r, r)) }
}

function dot(a: Float64Array, b: Float64Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}
