/// <reference lib="webworker" />
// Geometry worker: all manifold operations run here so the UI never freezes.
import { getManifold, manifoldFromTriMesh, triMeshFromManifold, type Manifold, type ManifoldToplevel } from '../geom/manifold'
import type { Request, Response, VoronoiParams, TileParams, OpResult } from './protocol'
import { extractSubMesh } from '../geom/submesh'
import { sampleSurface, regionArea } from '../geom/sampling'
import { seededRandom } from '../geom/random'
import { SurfaceIndex } from '../geom/bvh'
import { relaxOnSurface } from '../geom/relax'
import { buildVoronoiCells } from '../geom/voronoiCells'
import { buildRegionSlab, buildEdgeMarginTool } from '../geom/slab'
import { Parameterization } from '../geom/parameterization'
import { buildSurfaceTool, type Polygon } from '../geom/tileTool'
import { flattenRegion } from '../geom/regionFlatten'
import type { TriMesh } from '../geom/manifold'

const ctx = self as unknown as DedicatedWorkerGlobalScope

function post(msg: Response, transfer: Transferable[] = []) {
  ctx.postMessage(msg, transfer)
}

ctx.onmessage = async (ev: MessageEvent<Request>) => {
  const req = ev.data
  const progress = (s: string) => post({ id: req.id, progress: s })
  try {
    const m = await getManifold()
    if (req.type === 'check') {
      const man = manifoldFromTriMesh(m, req.mesh)
      const res = { id: req.id, ok: true as const, type: 'check' as const, manifold: true, status: man.status(), volume: man.volume(), area: man.surfaceArea() }
      man.delete()
      post(res)
    } else if (req.type === 'voronoi') {
      const result = runVoronoi(m, req.mesh, req.region, req.params, progress)
      post({ id: req.id, ok: true, type: 'voronoi', result }, [result.mesh.positions.buffer, result.mesh.indices.buffer])
    } else if (req.type === 'tile') {
      const result = runTile(m, req.mesh, req.params, progress)
      post({ id: req.id, ok: true, type: 'tile', result }, [result.mesh.positions.buffer, result.mesh.indices.buffer])
    } else if (req.type === 'flatten') {
      progress('flattening region')
      const result = flattenRegion(req.mesh, req.region, req.origin)
      post({ id: req.id, ok: true, type: 'flatten', result }, [result.positions.buffer, result.indices.buffer, result.normals.buffer, result.uv.buffer])
    }
  } catch (e) {
    post({ id: req.id, ok: false, error: (e as Error).message ?? String(e) })
  }
}

/** Drop small disconnected pieces; always keep the largest. */
function dropIslands(m: ManifoldToplevel, man: Manifold, minVolume: number, log: string[]): { kept: Manifold; removed: number } {
  const parts = man.decompose()
  if (parts.length <= 1) { for (const p of parts) p.delete(); return { kept: man, removed: 0 } }
  let largest = parts[0], largestVol = -1
  for (const p of parts) { const v = p.volume(); if (v > largestVol) { largestVol = v; largest = p } }
  const keep: Manifold[] = []
  let removed = 0
  for (const p of parts) {
    if (p === largest || p.volume() >= minVolume) keep.push(p)
    else { removed++; p.delete() }
  }
  log.push(`${parts.length} pieces after the operation; removed ${removed} island(s) under ${minVolume} mm³`)
  man.delete()
  if (keep.length === 1) return { kept: keep[0], removed }
  // pieces are disjoint (they came out of decompose), so compose is safe
  const out = m.Manifold.compose(keep)
  for (const p of keep) p.delete()
  return { kept: out, removed }
}

function applyMode(m: ManifoldToplevel, body: Manifold, tool: Manifold, mode: 'cut' | 'recess' | 'emboss'): Manifold {
  return mode === 'emboss' ? m.Manifold.union(body, tool) : m.Manifold.difference(body, tool)
}

function runVoronoi(m: ManifoldToplevel, mesh: TriMesh, region: Uint32Array, params: VoronoiParams, progress: (s: string) => void): OpResult {
  const t0 = performance.now()
  const log: string[] = []
  const body = manifoldFromTriMesh(m, mesh)
  const sub = extractSubMesh(mesh, region)
  const area = regionArea(mesh, region)
  const spacing = Math.max(params.cellSize, 0.5)
  const count = Math.max(4, Math.round(area / (spacing * spacing * 0.866)))
  const rib = Math.max(params.ribWidth, params.minRib)
  if (rib !== params.ribWidth) log.push(`rib width raised to ${rib.toFixed(2)} mm (printability floor)`)
  log.push(`region ${area.toFixed(0)} mm², ${count} cells at ~${spacing} mm`)

  progress('scattering seeds')
  const rand = seededRandom(params.seed)
  let seeds = sampleSurface(mesh, region, count, rand).points
  const surface = new SurfaceIndex({ positions: sub.positions, indices: sub.indices })
  for (let i = 0; i < params.relaxPasses; i++) seeds = relaxOnSurface(seeds, surface, 8, 0.5)
  surface.dispose()

  progress('building cells')
  const cells = buildVoronoiCells(m, seeds, { k: params.neighbours, ribWidth: rib, extent: spacing * 3 })
  const cellsUnion = m.Manifold.compose(cells)
  for (const c of cells) c.delete()

  progress('confining to region')
  // depth range along the normal, per mode
  let inner: number, outer: number
  if (params.mode === 'cut') { inner = -(params.depth + 1); outer = 1 }
  else if (params.mode === 'recess') { inner = -params.depth; outer = 1 }
  else { inner = -0.2; outer = params.depth }
  let slab = buildRegionSlab(m, sub, inner, outer)
  const marginTool = buildEdgeMarginTool(m, sub, params.edgeMargin, inner, outer)
  if (marginTool) {
    const trimmed = m.Manifold.difference(slab, marginTool)
    slab.delete(); marginTool.delete()
    slab = trimmed
  }
  const tool = params.feature === 'ribs' ? m.Manifold.difference(slab, cellsUnion) : m.Manifold.intersection(slab, cellsUnion)
  slab.delete(); cellsUnion.delete()

  progress(params.mode === 'emboss' ? 'adding' : 'cutting')
  const out = applyMode(m, body, tool, params.mode)
  body.delete(); tool.delete()
  const status = out.status()
  if (status !== 'NoError') throw new Error(`Boolean failed: ${status}`)

  progress('checking islands')
  const { kept, removed } = dropIslands(m, out, params.minIslandVolume, log)
  const result = triMeshFromManifold(kept)
  kept.delete()
  log.push(`${result.indices.length / 3} triangles in ${((performance.now() - t0) / 1000).toFixed(1)} s`)
  return { mesh: result, islandsRemoved: removed, log, ms: performance.now() - t0 }
}

function runTile(m: ManifoldToplevel, mesh: TriMesh, params: TileParams, progress: (s: string) => void): OpResult {
  const t0 = performance.now()
  const log: string[] = []
  const body = manifoldFromTriMesh(m, mesh)
  const sub = { positions: params.positions, indices: params.indices, normals: params.normals, sourceTriangles: new Uint32Array(0) }
  const param = new Parameterization(sub, params.uv)
  const polygons: Polygon[] = params.polygons.map((f) => {
    const poly: Polygon = []
    for (let i = 0; i < f.length; i += 2) poly.push([f[i], f[i + 1]])
    return poly
  })
  log.push(`${polygons.length} polygons`)
  let zMin: number, zMax: number
  if (params.mode === 'cut') { zMin = -(params.wallThickness + 1); zMax = 1 }
  else if (params.mode === 'recess') { zMin = -params.depth; zMax = 1 }
  else { zMin = -0.2; zMax = params.depth }
  progress('building tool')
  const tool = buildSurfaceTool(m, param, polygons, zMin, zMax, 1.0)
  progress(params.mode === 'emboss' ? 'adding' : 'cutting')
  const out = applyMode(m, body, tool, params.mode)
  body.delete(); tool.delete()
  const status = out.status()
  if (status !== 'NoError') throw new Error(`Boolean failed: ${status}`)
  progress('checking islands')
  const { kept, removed } = dropIslands(m, out, params.minIslandVolume, log)
  const result = triMeshFromManifold(kept)
  kept.delete()
  log.push(`${result.indices.length / 3} triangles in ${((performance.now() - t0) / 1000).toFixed(1)} s`)
  return { mesh: result, islandsRemoved: removed, log, ms: performance.now() - t0 }
}
