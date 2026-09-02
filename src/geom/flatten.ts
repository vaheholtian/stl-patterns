// Flatten a surface region to 2D using xatlas (LSCM charts) via xatlas-three.
import { BufferGeometry, BufferAttribute } from 'three'
import { UVUnwrapper } from 'xatlas-three'
import type { ChartOptions } from 'xatlas-three'
import wasmUrl from 'xatlasjs/dist/xatlas.wasm?url'
import workerUrl from 'xatlasjs/dist/xatlas.js?url'
import type { SubMesh } from './submesh'

let unwrapper: UVUnwrapper | null = null
let loading: Promise<UVUnwrapper> | null = null

async function getUnwrapper(): Promise<UVUnwrapper> {
  if (unwrapper) return unwrapper
  if (!loading) {
    loading = (async () => {
      const u = new UVUnwrapper({ BufferAttribute })
      // The wrapper runs xatlas inside a blob-URL worker, which cannot resolve
      // root-relative paths, so hand it absolute URLs.
      const abs = (p: string) => new URL(p, location.href).href
      await Promise.race([
        u.loadLibrary(() => {}, abs(wasmUrl), abs(workerUrl)),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('xatlas failed to load within 20 s')), 20000)),
      ])
      unwrapper = u
      return u
    })()
  }
  return loading
}

export interface FlattenResult {
  /** submesh re-indexed by xatlas (vertices duplicated along chart seams) */
  sub: SubMesh
  uv: Float32Array
  chartCount: number
}

/** Chart options that push xatlas toward as few charts as possible. */
export const singleChartOptions: ChartOptions = {
  maxCost: 1e6,
  maxIterations: 4,
  normalDeviationWeight: 0,
  normalSeamWeight: 0,
  roundnessWeight: 0,
  straightnessWeight: 0,
  textureSeamWeight: 0,
  maxChartArea: 0,
  maxBoundaryLength: 0,
  fixWinding: false,
  useInputMeshUvs: false,
}

export async function flattenWithXatlas(sub: SubMesh, chartOptions: ChartOptions = singleChartOptions): Promise<FlattenResult> {
  const u = await getUnwrapper()
  u.chartOptions = { ...u.chartOptions, ...chartOptions }
  u.packOptions = { ...u.packOptions, rotateCharts: false, rotateChartsToAxis: false, padding: 0, resolution: 0, texelsPerUnit: 0 }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(sub.positions, 3))
  g.setAttribute('normal', new BufferAttribute(sub.normals, 3))
  g.setIndex(new BufferAttribute(sub.indices, 1))
  const atlas = await u.unwrapGeometry(g, 'uv')
  const out = atlas.geometries[0]
  const pos = out.getAttribute('position') as BufferAttribute
  const uvAttr = out.getAttribute('uv') as BufferAttribute
  const idx = out.getIndex()!
  const positions = new Float32Array(pos.array as ArrayLike<number>)
  const indices = new Uint32Array(idx.array as ArrayLike<number>)
  const uv = new Float32Array(uvAttr.array as ArrayLike<number>)
  // recompute normals for the re-indexed mesh
  const normals = new Float32Array(positions.length)
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    for (const v of [a, b, c]) { normals[v] += nx; normals[v + 1] += ny; normals[v + 2] += nz }
  }
  for (let v = 0; v < normals.length; v += 3) {
    const len = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1
    normals[v] /= len; normals[v + 1] /= len; normals[v + 2] /= len
  }
  // xatlas duplicates vertices at seams; smooth normals across seams by welding positions
  weldNormals(positions, normals)
  const chartCount = countCharts(indices, positions.length / 3)
  const newSub: SubMesh = { positions, indices, normals, sourceTriangles: sub.sourceTriangles }
  return { sub: newSub, uv, chartCount }
}

function weldNormals(positions: Float32Array, normals: Float32Array) {
  const map = new Map<string, number[]>()
  for (let v = 0; v < positions.length / 3; v++) {
    const k = `${positions[v * 3].toFixed(5)},${positions[v * 3 + 1].toFixed(5)},${positions[v * 3 + 2].toFixed(5)}`
    let l = map.get(k)
    if (!l) { l = []; map.set(k, l) }
    l.push(v)
  }
  for (const l of map.values()) {
    if (l.length < 2) continue
    let x = 0, y = 0, z = 0
    for (const v of l) { x += normals[v * 3]; y += normals[v * 3 + 1]; z += normals[v * 3 + 2] }
    const len = Math.hypot(x, y, z) || 1
    for (const v of l) { normals[v * 3] = x / len; normals[v * 3 + 1] = y / len; normals[v * 3 + 2] = z / len }
  }
}

/** Connected components over triangles sharing (re-indexed) vertices = charts. */
function countCharts(indices: Uint32Array, nVert: number): number {
  const parent = new Int32Array(nVert)
  for (let i = 0; i < nVert; i++) parent[i] = i
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a] } return a }
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb }
  for (let t = 0; t < indices.length; t += 3) { union(indices[t], indices[t + 1]); union(indices[t], indices[t + 2]) }
  const roots = new Set<number>()
  for (let t = 0; t < indices.length; t += 3) roots.add(find(indices[t]))
  return roots.size
}
