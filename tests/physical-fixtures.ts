// Fixtures and helpers for physical (millimetre) checks of a tiled pattern's
// finished solid: the 50 mm container from the box audit, bent plates, and a
// uniformly filled diagnostic tile that isolates tool geometry from pattern phase.
import Module from 'manifold-3d'
import { readFileSync } from 'node:fs'
import { parseStl } from '../src/io/stl.ts'
import { manifoldFromTriMesh, triMeshFromManifold } from '../src/geom/manifold.ts'
import { triangleAreaNormal } from '../src/geom/sampling.ts'
import { flattenPieces, type FlattenedPiece } from '../src/geom/regionFlatten.ts'
import { layoutTile, toolMitres, type LayoutResult } from '../src/geom/layout.ts'
import { buildSurfaceTool, mitreTool, toolOffsetRange } from '../src/geom/tileTool.ts'
import type { Manifold, TriMesh } from '../src/geom/manifold.ts'
export const m = await Module(); m.setup()
export type V3 = [number, number, number]
export type Mode = 'cut' | 'emboss' | 'recess'
export interface Fixture { body: Manifold; mesh: TriMesh; region: Uint32Array; origin: V3 }

/** Triangles whose normal matches one of `normals` (within half a degree) and whose centroid satisfies `where`. */
export function select(mesh: TriMesh, normals: V3[], where: (x: number, y: number, z: number) => boolean = () => true) {
  const out: number[] = [], n = new Float64Array(3)
  for (let t = 0; t < mesh.indices.length / 3; t++) {
    triangleAreaNormal(mesh, t, n)
    if (!normals.some(q => q.reduce((sum, v, i) => sum + v * n[i], 0) > .99996)) continue
    const p: V3 = [0, 0, 0]
    for (let c = 0; c < 3; c++) for (let d = 0; d < 3; d++) p[d] += mesh.positions[mesh.indices[t * 3 + c] * 3 + d] / 3
    if (where(...p)) out.push(t)
  }
  return Uint32Array.from(out)
}

/**
 * The audit's exact 50 mm container (1.6 mm shell, read from fixtures/box-50.stl,
 * not regenerated): the outer front (-y) and right (+x) walls, or all four outer
 * walls as a ring. Origin as in the audit.
 */
export function box(ring = false): Fixture {
  const bytes = readFileSync(new URL('../fixtures/box-50.stl', import.meta.url))
  const body = manifoldFromTriMesh(m, parseStl(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)))
  const mesh = triMeshFromManifold(body)
  return { body, mesh, origin: [37, 0, 23], region: select(mesh, ring ? [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]] : [[1, 0, 0], [0, -1, 0]], (x, y) => x < .001 || y < .001 || x > 49.999 || y > 49.999) }
}

/**
 * Two 50 x thickness x 50 plates meeting along z at the origin with their top
 * normals `angle` degrees apart (positive: a convex ridge, the outside faces
 * up; negative: a concave valley), mitred at the ridge. Region = both top faces.
 */
export function plate(angle: number, thickness = 1.6): Fixture {
  const M = m.Manifold, half = angle / 2, h = half * Math.PI / 180
  // each plate starts 5 mm before the ridge and is clipped at the bisector plane x = 0, so the
  // two meet in a mitre whether the fold is a ridge or a valley (a plate starting at the ridge
  // leaves a V-shaped gap under a valley: the plates would only touch along the top line)
  const a = M.cube([55, thickness, 50]).translate([-5, -thickness, 0]).rotate([0, 0, -half])
  const b = M.cube([55, thickness, 50]).translate([-50, -thickness, 0]).rotate([0, 0, half])
  const right = M.cube([100, 200, 100]).translate([0, -100, -25]), left = right.translate([-100, 0, 0])
  const body = M.union(a.intersect(right), b.intersect(left)), mesh = triMeshFromManifold(body)
  a.delete(); b.delete(); right.delete(); left.delete()
  return { body, mesh, origin: [20 * Math.cos(h), -20 * Math.sin(h), 23], region: select(mesh, [[Math.sin(h), Math.cos(h), 0], [-Math.sin(h), Math.cos(h), 0]], (x, y) => Math.hypot(x, y) < 49) }
}

export interface Settings { scale?: number; rotationDeg?: number; margin?: number; depth?: number; mode?: Mode; wallThickness?: number; tile?: number; joinEdges?: boolean }
export interface Laid { piece: FlattenedPiece; layout: LayoutResult }

/**
 * Apply a uniformly filled square tile (every point patterned) exactly as the
 * app does: flatten, lay out with the tool's offset range, build and mitre one
 * tool per piece, union, add or subtract. The result is the offset envelope of
 * the selected faces (minus the margin), so its dimensions are known analytically.
 */
export function filled(f: Fixture, settings: Settings = {}): { laid: Laid[]; solid: Manifold; pieces: FlattenedPiece[]; log: string[] } {
  const mode = settings.mode ?? 'emboss', depth = settings.depth ?? .8, wall = settings.wallThickness ?? 1.6, size = settings.tile ?? 20
  const [zMin, zMax] = toolOffsetRange(mode, depth, wall)
  const { pieces, log } = flattenPieces(f.mesh, f.region, f.origin, 30, settings.joinEdges ?? true)
  const laid = pieces.map(piece => ({ piece, layout: layoutTile(m, piece, [[[0, 0], [size, 0], [size, size], [0, size]]], size, size, { origin: piece.origin, scale: settings.scale ?? 1, rotationDeg: settings.rotationDeg ?? 0, margin: settings.margin ?? 2.5, fitSeam: true, minScale: 0, normalRange: [zMin, zMax] }) }))
  const tools = laid.filter(l => l.layout.polygons.length).map(l => mitreTool(m, buildSurfaceTool(m, l.layout.param, [...l.layout.polygons, ...l.layout.foldPolygons], zMin, zMax, 2), toolMitres(l.piece, l.layout), zMin, zMax))
  const tool = m.Manifold.union(tools), solid = mode === 'emboss' ? f.body.add(tool) : f.body.subtract(tool)
  tool.delete(); tools.forEach(t => t.delete())
  return { laid, solid, pieces, log }
}

/** First surface hit walking from `from` to `to`, or null. */
export function hit(solid: Manifold, from: V3, to: V3): V3 | null {
  const h = solid.rayCast(from, to)[0]
  return h ? [h.position[0], h.position[1], h.position[2]] : null
}

/** Distance from `from` to the first surface hit along the ray, or Infinity. */
export function depthAlong(solid: Manifold, from: V3, to: V3): number {
  const p = hit(solid, from, to)
  return p ? Math.hypot(p[0] - from[0], p[1] - from[1], p[2] - from[2]) : Infinity
}
