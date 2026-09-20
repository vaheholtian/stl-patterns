/**
 * The cut, and the view of it, shared by every sweep in this folder.
 *
 * `render-cut.ts` (library designs) and `render-native.ts` (this project's own
 * generators) both need the identical cut, or their numbers cannot be compared with
 * each other or with `sweep-cut.ts`. They also both need the identical camera, or
 * the gallery's cards stop being a like-for-like grid. So both live here once.
 *
 * Two ways of laying a pattern on the same box, which is the only thing that
 * differs between the gallery's two cut modes:
 *
 *   wrap   the four outer walls flatten as one unfolded sheet, so the pattern runs
 *          continuously round the corners and one solid margin follows the rim.
 *          This is what sweep-cut.ts measures.
 *
 *   faces  each wall flattens on its own, so the pattern starts again on every face
 *          and each gets its own margin all the way round. The two margins meet at
 *          a corner, which is why that mode leaves a solid post there.
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import { m, box } from '../../tests/physical-fixtures.ts'
import { flattenPieces, type FlattenedPiece } from '../../src/geom/regionFlatten.ts'
import { layoutTile, toolMitres } from '../../src/geom/layout.ts'
import { buildSurfaceTool, mitreTool, toolOffsetRange, type Polygon } from '../../src/geom/tileTool.ts'
import { thinConnectionParts, countMaterial, type ProbePiece } from '../../src/geom/thinConnection.ts'
import { triMeshFromManifold, type Manifold, type TriMesh } from '../../src/geom/manifold.ts'
import { render, type Part, type V3 } from './raster.ts'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

export const LINE_WIDTH = 0.42, MIN_VOLUME = 5, WALL = 1.6

/**
 * The solid edge, in millimetres. 3 mm is what the ring cut has always used, and
 * the per-face mode keeps it rather than picking a second number, so that the only
 * thing separating the two modes is whether the pattern wraps. It is about seven
 * extrusion lines at a 0.42 mm nozzle, and where two faces meet their margins add
 * up, so a per-face box carries roughly a 6 mm solid post at each vertical corner
 * -- which is the mode's whole point: every panel is framed and the box is a rigid
 * cage rather than one wrapped skin.
 */
export const MARGIN = 3

export const [zMin, zMax] = toolOffsetRange('cut', WALL, WALL)

export const OUT = new URL('../../exports/cut-renders-2026-09-19/', import.meta.url)

/** three quarters from above: two patterned walls and the open top */
const CENTRE: V3 = [25, 25, 25]
/** aimed a little below the middle, so the box sits high in the frame */
const AIM: V3 = [25, 25, 21]
const DIR: V3 = [0.80, -0.98, 0.60]
const DIST = 178
const len = Math.hypot(DIR[0], DIR[1], DIR[2])
const EYE: V3 = [CENTRE[0] + DIR[0] / len * DIST, CENTRE[1] + DIR[1] / len * DIST, CENTRE[2] + DIR[2] / len * DIST]
const FULL = { width: 880, height: 740, ss: 3 }

/** a light warm filament, which shows a shaded facet better than white */
export const FILAMENT: V3 = [0.845, 0.820, 0.775]
/** used only when the cut falls apart, so the loose pieces can be told apart */
export const PIECES: V3[] = [
  [0.286, 0.545, 0.804], [0.902, 0.494, 0.208], [0.361, 0.706, 0.443], [0.851, 0.353, 0.435],
  [0.616, 0.451, 0.792], [0.898, 0.741, 0.231], [0.290, 0.702, 0.718], [0.859, 0.451, 0.682],
  [0.510, 0.588, 0.286], [0.988, 0.635, 0.400],
]

export const fixture = box(true)
/** the flattening depends only on the mode, never on the pattern, so do it once each */
const LAYOUTS: Record<string, FlattenedPiece[]> = {
  wrap: flattenPieces(fixture.mesh, fixture.region, fixture.origin, 30, true).pieces,
  faces: flattenPieces(fixture.mesh, fixture.region, fixture.origin, 30, false).pieces,
}

export type Mode = 'wrap' | 'faces'
export interface Cut { parts: number; thin: number; volume: number; meshes: TriMesh[] }

/** how many separate pieces each mode lays the pattern on */
export const pieceCount = (mode: Mode) => LAYOUTS[mode].length

export function cutBox(polygons: [number, number][][], tw: number, th: number, mode: Mode = 'wrap'): Cut | null {
  const laid = LAYOUTS[mode]
    .map(piece => ({ piece, layout: layoutTile(m, piece, polygons, tw, th, { origin: piece.origin, scale: 1, rotationDeg: 0, margin: MARGIN, fitSeam: true, minScale: .5, normalRange: [zMin, zMax] }) }))
    .filter(l => l.layout.polygons.length)
  if (!laid.length) return null
  const probe: ProbePiece[] = laid.map(l => ({ param: l.layout.param, polygons: [...l.layout.polygons, ...l.layout.foldPolygons] as Polygon[], mitres: toolMitres(l.piece, l.layout) }))
  const tools = probe.map(p => mitreTool(m, buildSurfaceTool(m, p.param, p.polygons, zMin, zMax, 2), p.mitres, zMin, zMax))
  const tool = m.Manifold.union(tools)
  const cutRaw = fixture.body.subtract(tool)
  const solid = cutRaw.simplify(.005)
  const decomposed: Manifold[] = solid.decompose()
  const parts = countMaterial(decomposed, MIN_VOLUME)
  const volume = solid.volume()
  let thin = parts
  try { thin = Math.max(parts, thinConnectionParts(m, fixture.body, probe, LINE_WIDTH, zMin, zMax, 2, MIN_VOLUME)) } catch { /* advisory */ }
  // biggest first, so the colours in a broken render are stable and readable
  const meshes = decomposed.map(p => ({ p, v: p.volume() })).sort((a, b) => b.v - a.v).map(x => triMeshFromManifold(x.p))
  decomposed.forEach(p => p.delete()); solid.delete(); if (cutRaw !== solid) cutRaw.delete()
  tool.delete(); tools.forEach(t => t.delete())
  return { parts, thin, volume: +volume.toFixed(1), meshes }
}

mkdirSync(new URL('img/', OUT), { recursive: true })

export async function shoot(parts: Part[], stem: string) {
  const { rgb, width, height } = render(parts, { ...FULL, cam: { eye: EYE, target: AIM, fovDeg: 26 }, floorZ: 0 })
  const img = sharp(Buffer.from(rgb), { raw: { width, height, channels: 3 } })
  await img.clone().png({ compressionLevel: 9 }).toFile(fileURLToPath(new URL(`img/${stem}.png`, OUT)))
  await img.clone().resize(360).webp({ quality: 82 }).toFile(fileURLToPath(new URL(`img/${stem}-t.webp`, OUT)))
}

/** the plain render, plus a coloured one wherever the cut falls apart */
export async function shootCut(c: Cut, stem: string) {
  await shoot(c.meshes.map(mesh => ({ mesh, rgb: FILAMENT })), stem)
  if (c.parts > 1) await shoot(c.meshes.map((mesh, j) => ({ mesh, rgb: PIECES[j % PIECES.length] })), `${stem}-parts`)
}

export { m }
