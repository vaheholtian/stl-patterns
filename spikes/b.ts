// Spike B: flatten a hemisphere with xatlas, recenter on a point, warp a tile
// of circles onto it, cut. Throwaway.
import { getManifold, triMeshFromManifold } from '../src/geom/manifold'
import { extractSubMesh, boundaryLoops } from '../src/geom/submesh'
import { flattenWithXatlas } from '../src/geom/flatten'
import { flattenLSCM } from '../src/geom/lscm'
import { Parameterization } from '../src/geom/parameterization'
import { buildSurfaceTool, type Polygon } from '../src/geom/tileTool'
import { writeBinaryStl } from '../src/io/stl'
import { downloadBlob } from '../src/io/download'
import { previewTriMesh } from './preview'

const logEl = document.getElementById('log') as HTMLPreElement
const runBtn = document.getElementById('run') as HTMLButtonElement
const dlBtn = document.getElementById('download') as HTMLButtonElement
const canvas = document.getElementById('view') as HTMLCanvasElement
const uvCanvas = document.getElementById('uv') as HTMLCanvasElement
const lines: string[] = []
function log(s: string) { lines.push(s); logEl.textContent = lines.join('\n'); console.log('[spikeB] ' + s) }

const params = new URLSearchParams(location.search)
const PITCH = Number(params.get('pitch') ?? 8)
const HOLE = Number(params.get('hole') ?? 4)
const R = 30, WALL = 1.6
let stlBuffer: ArrayBuffer | null = null

function drawUv(param: Parameterization, polys: Polygon[]) {
  const ctx = uvCanvas.getContext('2d')!
  const b = param.bounds()
  const W = uvCanvas.width, H = uvCanvas.height
  const s = Math.min(W / (b.maxX - b.minX), H / (b.maxY - b.minY)) * 0.95
  const ox = W / 2 - ((b.minX + b.maxX) / 2) * s, oy = H / 2 + ((b.minY + b.maxY) / 2) * s
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = '#345'; ctx.lineWidth = 1
  const { indices: ix } = param.sub, uv = param.uv
  ctx.beginPath()
  for (let t = 0; t < ix.length; t += 3) {
    for (let c = 0; c < 3; c++) {
      const v = ix[t + c], w = ix[t + ((c + 1) % 3)]
      ctx.moveTo(ox + uv[v * 2] * s, oy - uv[v * 2 + 1] * s)
      ctx.lineTo(ox + uv[w * 2] * s, oy - uv[w * 2 + 1] * s)
    }
  }
  ctx.stroke()
  ctx.strokeStyle = '#f80'; ctx.lineWidth = 1.5
  for (const p of polys) {
    ctx.beginPath()
    p.forEach(([x, y], i) => (i ? ctx.lineTo(ox + x * s, oy - y * s) : ctx.moveTo(ox + x * s, oy - y * s)))
    ctx.closePath(); ctx.stroke()
  }
  ctx.fillStyle = '#0f0'; ctx.beginPath(); ctx.arc(ox, oy, 4, 0, Math.PI * 2); ctx.fill()
}

async function run() {
  lines.length = 0; runBtn.disabled = true; dlBtn.disabled = true
  const t0 = performance.now()
  const m = await getManifold()
  // hemisphere shell: sphere shell with z < 0 removed
  const outer = m.Manifold.sphere(R, 96), inner = m.Manifold.sphere(R - WALL, 96)
  const shell = m.Manifold.difference(outer, inner).trimByPlane([0, 0, 1], 0)
  outer.delete(); inner.delete()
  const shellTri = triMeshFromManifold(shell)
  log(`hemisphere shell: ${shellTri.indices.length / 3} tris`)

  // region = outer surface triangles (centroid radius ~ R)
  const region: number[] = []
  for (let t = 0; t < shellTri.indices.length / 3; t++) {
    let cx = 0, cy = 0, cz = 0
    for (let c = 0; c < 3; c++) { const v = shellTri.indices[t * 3 + c] * 3; cx += shellTri.positions[v]; cy += shellTri.positions[v + 1]; cz += shellTri.positions[v + 2] }
    cx /= 3; cy /= 3; cz /= 3
    if (Math.abs(Math.hypot(cx, cy, cz) - R) < 0.2 && cz > 0.05) region.push(t)
  }
  const sub0 = extractSubMesh(shellTri, Uint32Array.from(region))
  log(`region: ${region.length} tris, ${sub0.positions.length / 3} verts, boundary loops=${boundaryLoops(sub0).length}`)

  const t1 = performance.now()
  let param: Parameterization
  if (params.get('method') === 'xatlas') {
    const flat = await flattenWithXatlas(sub0)
    log(`xatlas: ${flat.chartCount} chart(s), ${flat.sub.indices.length / 3} tris in ${(performance.now() - t1).toFixed(0)} ms`)
    param = new Parameterization(flat.sub, flat.uv)
  } else {
    const res = flattenLSCM(sub0)
    log(`lscm: ${res.iterations} iterations, residual ${res.residual.toExponential(2)} in ${(performance.now() - t1).toFixed(0)} ms`)
    param = new Parameterization(sub0, res.uv)
  }

  // origin: north pole. find its triangle by nearest centroid in 3D
  const { positions: p, indices: ix } = param.sub
  let bestT = 0, bestD = Infinity
  for (let t = 0; t < ix.length / 3; t++) {
    let cx = 0, cy = 0, cz = 0
    for (let c = 0; c < 3; c++) { const v = ix[t * 3 + c] * 3; cx += p[v]; cy += p[v + 1]; cz += p[v + 2] }
    const d = (cx / 3) ** 2 + (cy / 3) ** 2 + (cz / 3 - R) ** 2
    if (d < bestD) { bestD = d; bestT = t }
  }
  const a = ix[bestT * 3] * 3
  param.recenter(bestT, p[a], p[a + 1], p[a + 2], 0, 1)
  const b = param.bounds()
  let sMin = Infinity, sMax = 0
  for (const s of param.scale) if (s > 0) { sMin = Math.min(sMin, s); sMax = Math.max(sMax, s) }
  log(`recentered: bounds x[${b.minX.toFixed(1)},${b.maxX.toFixed(1)}] y[${b.minY.toFixed(1)},${b.maxY.toFixed(1)}] mm; scale range ${sMin.toFixed(2)}..${sMax.toFixed(2)} (1 = true size)`)

  // tile of circles across the bounds
  const polys: Polygon[] = []
  const seg = 24
  for (let y = Math.floor(b.minY / PITCH) * PITCH; y <= b.maxY; y += PITCH) {
    for (let x = Math.floor(b.minX / PITCH) * PITCH; x <= b.maxX; x += PITCH) {
      if (!param.locate(x, y)) continue // skip circles centred outside the region
      const poly: Polygon = []
      for (let i = 0; i < seg; i++) poly.push([x + (HOLE / 2) * Math.cos((i / seg) * Math.PI * 2), y + (HOLE / 2) * Math.sin((i / seg) * Math.PI * 2)])
      polys.push(poly)
    }
  }
  drawUv(param, polys)
  log(`tile: ${polys.length} circles`)

  const t2 = performance.now()
  const tool = buildSurfaceTool(m, param, polys, -WALL - 2, 2, 1.0)
  log(`tool: ${tool.numTri()} tris, status=${tool.status()} in ${(performance.now() - t2).toFixed(0)} ms`)
  const t3 = performance.now()
  const cut = m.Manifold.difference(shell, tool)
  const parts = cut.decompose()
  log(`cut: ${cut.numTri()} tris, ${parts.length} component(s), status=${cut.status()} in ${(performance.now() - t3).toFixed(0)} ms`)
  const tri = triMeshFromManifold(cut)
  stlBuffer = writeBinaryStl(tri, 'spikeB')
  previewTriMesh(canvas, tri)
  log(`total ${(performance.now() - t0).toFixed(0)} ms`)
  runBtn.disabled = false; dlBtn.disabled = false
}

runBtn.onclick = () => run().catch((e) => { log('ERROR ' + (e as Error).message); console.error(e) })
dlBtn.onclick = () => stlBuffer && downloadBlob(stlBuffer, 'spikeB.stl')
if (params.get('auto') === '1') run().catch((e) => { log('ERROR ' + (e as Error).message); console.error(e) })
