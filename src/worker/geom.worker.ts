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
import { buildSurfaceTool, isPlanar, mitreTool, toolOffsetRange, type Polygon } from '../geom/tileTool'
import { flattenRegion, flattenPieces } from '../geom/regionFlatten'
import type { TriMesh } from '../geom/manifold'

const ctx = self as unknown as DedicatedWorkerGlobalScope

function post(msg: Response, transfer: Transferable[] = []) {
  ctx.postMessage(msg, transfer)
}

ctx.onmessage = async (ev: MessageEvent<Request>) => {
  const req = ev.data
  const progress = (s: string, fraction?: number) => post({ id: req.id, progress: s, fraction })
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
    } else if (req.type === 'flattenPieces') {
      progress('flattening region')
      const { pieces, log } = flattenPieces(req.mesh, req.region, req.origin, req.maxAngleDeg, req.joinEdges ?? true)
      post({ id: req.id, ok: true, type: 'flattenPieces', pieces, log }, pieces.flatMap((p) => [p.positions.buffer, p.indices.buffer, p.normals.buffer, p.uv.buffer]))
    }
  } catch (e) {
    post({ id: req.id, ok: false, error: (e as Error).message ?? String(e) })
  }
}

/**
 * Drop small disconnected pieces; always keep the largest. Reports the separate
 * parts of material that remain: a closed cavity decomposes as its own
 * (negative-volume) shell and is not a loose part, so only positive volumes
 * count. More than one part means the pattern has cut the body into pieces
 * that would print separately; that is said plainly rather than hidden.
 */
function dropIslands(m: ManifoldToplevel, man: Manifold, minVolume: number, log: string[]): { kept: Manifold; removed: number; parts: number; removedVolume: number } {
  const parts = man.decompose()
  if (parts.length <= 1) { for (const p of parts) p.delete(); return { kept: man, removed: 0, parts: 1, removedVolume: 0 } }
  let largest = parts[0], largestVol = -1
  for (const p of parts) { const v = p.volume(); if (v > largestVol) { largestVol = v; largest = p } }
  const keep: Manifold[] = []
  let removed = 0, removedVolume = 0, material = 0
  for (const p of parts) {
    const v = p.volume()
    if (p === largest || v >= minVolume) { keep.push(p); if (v > 0) material++ }
    else { removed++; removedVolume += Math.max(0, v); p.delete() }
  }
  log.push(`removed ${removed} island(s) under ${minVolume} mm³ (${removedVolume.toFixed(1)} mm³)`)
  if (material > 1) log.push(`the result is ${material} separate parts of material: the pattern has cut the body into pieces (try inverting the pattern, connecting its material, a larger scale or a wider margin)`)
  else log.push('the result is one connected part')
  man.delete()
  if (keep.length === 1) return { kept: keep[0], removed, parts: material, removedVolume }
  // pieces are disjoint (they came out of decompose), so compose is safe
  const out = m.Manifold.compose(keep)
  for (const p of keep) p.delete()
  return { kept: out, removed, parts: material, removedVolume }
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
  const raw = applyMode(m, body, tool, params.mode)
  body.delete(); tool.delete()
  const status = raw.status()
  if (status !== 'NoError') throw new Error(`Boolean failed: ${status}`)
  const out = raw.simplify(0.005)
  raw.delete()

  progress('checking islands')
  const { kept, removed, parts } = dropIslands(m, out, params.minIslandVolume, log)
  const result = triMeshFromManifold(kept)
  kept.delete()
  log.push(`${result.indices.length / 3} triangles in ${((performance.now() - t0) / 1000).toFixed(1)} s`)
  return { mesh: result, islandsRemoved: removed, parts, log, ms: performance.now() - t0 }
}

function runTile(m: ManifoldToplevel, mesh: TriMesh, params: TileParams, progress: (s: string, fraction?: number) => void): OpResult {
  const t0 = performance.now()
  const log: string[] = []
  const body = manifoldFromTriMesh(m, mesh)
  const [zMin, zMax] = toolOffsetRange(params.mode, params.depth, params.wallThickness)
  // one tool per smooth piece, each warped through its own flattening
  const tools: Manifold[] = []
  let nPoly = 0, completed = 0, allPlanar = true
  const total = params.pieces.length + (params.pieces.length > 1 ? 1 : 0) + 3
  params.pieces.forEach((piece, i) => {
    if (!piece.polygons.length) return
    progress(`Preparing cut shapes ${i + 1}/${params.pieces.length}`, completed / total)
    const sub = { positions: piece.positions, indices: piece.indices, normals: piece.normals, sourceTriangles: new Uint32Array(0) }
    const param = new Parameterization(sub, piece.uv)
    allPlanar &&= isPlanar(param)
    const polygons: Polygon[] = [...piece.polygons, ...(piece.foldPolygons ?? [])].map((f) => {
      const poly: Polygon = []
      for (let k = 0; k < f.length; k += 2) poly.push([f[k], f[k + 1]])
      return poly
    })
    nPoly += piece.polygons.length
    // meet the neighbouring piece's tool at the fold's mitre plane
    tools.push(mitreTool(m, buildSurfaceTool(m, param, polygons, zMin, zMax, params.detail ?? 2.0), piece.mitres ?? [], zMin, zMax))
    completed++
  })
  log.push(params.pieces.length > 1 ? `${nPoly} polygons over ${params.pieces.length} pieces` : `${nPoly} polygons`)
  if (!tools.length) throw new Error('nothing to apply: no pattern shapes on the region')
  let tool: Manifold
  if (tools.length === 1) tool = tools[0]
  else {
    progress('Joining cut shapes', completed / total)
    tool = m.Manifold.union(tools)
    for (const t of tools) t.delete()
    completed++
  }
  progress(params.mode === 'emboss' ? 'Adding the pattern' : 'Cutting the pattern', completed / total)
  const raw = applyMode(m, body, tool, params.mode)
  body.delete(); tool.delete()
  const status = raw.status()
  if (status !== 'NoError') throw new Error(`Boolean failed: ${status}`)
  // Curved wrap seams can have coincident edges from both sides of the cut.
  // Collapsing those edges can introduce thin walls through real openings.
  const out = allPlanar ? raw.simplify(0.005) : raw
  if (out !== raw) raw.delete()
  completed++
  progress('Checking connected parts', completed / total)
  const { kept, removed, parts } = dropIslands(m, out, params.minIslandVolume, log)
  completed++
  progress('Preparing the result', completed / total)
  const result = triMeshFromManifold(kept)
  kept.delete()
  log.push(`${result.indices.length / 3} triangles in ${((performance.now() - t0) / 1000).toFixed(1)} s`)
  progress('Pattern applied', 1)
  return { mesh: result, islandsRemoved: removed, parts, log, ms: performance.now() - t0 }
}
