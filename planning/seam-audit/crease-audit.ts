// Crease audit: does a tiled pattern continue across a sharp edge between two
// faces (adjacent sides of a box, a bent plate)? Lays the tile out exactly as
// TilePanel does (per smooth piece), then compares the feature classification
// of points just either side of the crease, in 2D (layout polygons) and, for a
// subset, in 3D (ray casts against the cut solid).
//   node --import ./tests/register.mjs planning/seam-audit/crease-audit.ts [quick|full|3d] [generatorId]
import Module from 'manifold-3d'
import { writeFileSync } from 'node:fs'
import { triMeshFromManifold, type TriMesh, type Manifold, type ManifoldToplevel } from '../../src/geom/manifold.ts'
import { flattenPieces, isBackSide, type FlattenedPiece } from '../../src/geom/regionFlatten.ts'
import { layoutTile, fittedTileSize, toolMitres, type LayoutResult, type LayoutSettings } from '../../src/geom/layout.ts'
import { Parameterization } from '../../src/geom/parameterization.ts'
import { buildSurfaceTool, mitreTool, toolOffsetRange, type Polygon } from '../../src/geom/tileTool.ts'
import { generateTile } from '../../src/patterns/generate.ts'
import { generators } from '../../src/patterns/index.ts'
import type { Pt } from '../../src/patterns/types.ts'
import { triangleAreaNormal } from '../../src/geom/sampling.ts'

const m = await Module(); m.setup()
const M = m.Manifold

// ---------------------------------------------------------------- bodies
export interface Body { name: string; body: Manifold; mesh: TriMesh; region: Uint32Array; faceNormals: [number, number, number][]; origin: [number, number, number] }

/** Triangles whose normal matches one of `normals` and whose centroid satisfies `where`. */
function selectByNormals(mesh: TriMesh, normals: [number, number, number][], where: (x: number, y: number, z: number) => boolean = () => true, tolDeg = 0.5): Uint32Array {
  const cosMin = Math.cos((tolDeg * Math.PI) / 180)
  const n = new Float64Array(3)
  const out: number[] = []
  const { positions: p, indices: ix } = mesh
  for (let t = 0; t < ix.length / 3; t++) {
    triangleAreaNormal(mesh, t, n)
    if (!normals.some((q) => n[0] * q[0] + n[1] * q[1] + n[2] * q[2] > cosMin)) continue
    let cx = 0, cy = 0, cz = 0
    for (let c = 0; c < 3; c++) { const v = ix[t * 3 + c] * 3; cx += p[v] / 3; cy += p[v + 1] / 3; cz += p[v + 2] / 3 }
    if (where(cx, cy, cz)) out.push(t)
  }
  return Uint32Array.from(out)
}

/** Hollow closed box 80 x 50 x 40 with `wall` mm walls; region = outer top (+z) and front (-y) faces. */
export function hollowBox(wall = 2): Body {
  const outer = M.cube([80, 50, 40], false).translate([-40, -25, 0])
  const inner = M.cube([80 - 2 * wall, 50 - 2 * wall, 40 - 2 * wall], false).translate([-40 + wall, -25 + wall, wall])
  const body = M.difference(outer, inner)
  const mesh = triMeshFromManifold(body)
  const faceNormals: [number, number, number][] = [[0, 0, 1], [0, -1, 0]]
  const outside = (x: number, y: number, z: number) => Math.abs(x) > 40 - 1e-3 || Math.abs(y) > 25 - 1e-3 || z < 1e-3 || z > 40 - 1e-3
  return { name: `box wall ${wall}`, body, mesh, region: selectByNormals(mesh, faceNormals, outside), faceNormals, origin: [10, -10, 40] }
}

/** Same box, region = outer top, front and right (+x): three faces meeting at a corner. */
export function hollowBoxCorner(wall = 2): Body {
  const b = hollowBox(wall)
  const faceNormals: [number, number, number][] = [[0, 0, 1], [0, -1, 0], [1, 0, 0]]
  const outside = (x: number, y: number, z: number) => Math.abs(x) > 40 - 1e-3 || Math.abs(y) > 25 - 1e-3 || z < 1e-3 || z > 40 - 1e-3
  return { ...b, name: `box corner wall ${wall}`, region: selectByNormals(b.mesh, faceNormals, outside), faceNormals }
}

/**
 * Two 60 x 8 x 50 mm plates whose top faces meet along the z axis at the origin
 * with their normals `angleDeg` apart, mitred at the ridge. Positive = convex
 * ridge (a box corner is 90), negative = concave valley.
 */
export function bentPlate(angleDeg: number): Body {
  const L = 60, T = 8, W = 50
  const half = angleDeg / 2
  // plate A leans right (rotated by -half), plate B leans left (+half); each is trimmed at the mitre plane x = 0
  const a = M.cube([L, T, W], false).translate([0, -T, -W / 2]).rotate([0, 0, -half])
  const b = M.cube([L, T, W], false).translate([-L, -T, -W / 2]).rotate([0, 0, half])
  const right = M.cube([2 * L, 4 * L, 2 * W], false).translate([0, -2 * L, -W])
  const left = M.cube([2 * L, 4 * L, 2 * W], false).translate([-2 * L, -2 * L, -W])
  const body = M.union(M.intersection(a, right), M.intersection(b, left))
  const mesh = triMeshFromManifold(body)
  const h = (half * Math.PI) / 180
  const faceNormals: [number, number, number][] = [[Math.sin(h), Math.cos(h), 0], [-Math.sin(h), Math.cos(h), 0]]
  const origin: [number, number, number] = [20 * Math.cos(h), -20 * Math.sin(h), 5]
  return { name: `plate ${angleDeg}°`, body, mesh, region: selectByNormals(mesh, faceNormals), faceNormals, origin }
}

// ---------------------------------------------------------------- crease samples
export interface CreaseSample { p: [number, number, number]; pa: [number, number, number]; pb: [number, number, number]; ta: number; tb: number; na: [number, number, number]; nb: [number, number, number]; edge: string }

function keyOf(p: Float32Array, v: number) { return `${Math.round(p[v * 3] * 1e4)},${Math.round(p[v * 3 + 1] * 1e4)},${Math.round(p[v * 3 + 2] * 1e4)}` }

/** Points along the crease shared by two pieces, offset `delta` mm into each face. */
export function creaseSamples(A: FlattenedPiece, B: FlattenedPiece, spacing = 0.1, delta = 0.02): CreaseSample[] {
  const keysB = new Map<string, number>()
  for (let v = 0; v < B.positions.length / 3; v++) keysB.set(keyOf(B.positions, v), v)
  const shared = new Map<number, number>() // A vertex -> B vertex
  for (let v = 0; v < A.positions.length / 3; v++) { const w = keysB.get(keyOf(A.positions, v)); if (w !== undefined) shared.set(v, w) }
  if (shared.size < 2) return []
  // boundary edges of A with both ends shared, plus their triangle
  const edgeTri = new Map<string, { t: number; a: number; b: number; c: number }>()
  const count = new Map<string, number>()
  const ix = A.indices
  for (let t = 0; t < ix.length / 3; t++) for (let s = 0; s < 3; s++) {
    const a = ix[t * 3 + s], b = ix[t * 3 + ((s + 1) % 3)], c = ix[t * 3 + ((s + 2) % 3)]
    const k = a < b ? `${a},${b}` : `${b},${a}`
    count.set(k, (count.get(k) ?? 0) + 1)
    edgeTri.set(k, { t, a, b, c })
  }
  // triangles of B by edge
  const triB = new Map<string, { t: number; c: number }>()
  const ixb = B.indices
  for (let t = 0; t < ixb.length / 3; t++) for (let s = 0; s < 3; s++) {
    const a = ixb[t * 3 + s], b = ixb[t * 3 + ((s + 1) % 3)], c = ixb[t * 3 + ((s + 2) % 3)]
    triB.set(a < b ? `${a},${b}` : `${b},${a}`, { t, c })
  }
  const out: CreaseSample[] = []
  const P = A.positions, Q = B.positions
  const pt = (p: Float32Array, v: number): [number, number, number] => [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]]
  const nrm = (p: Float32Array, v: number): [number, number, number] => [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]]
  for (const [k, n] of count) {
    if (n !== 1) continue
    const e = edgeTri.get(k)!
    if (!shared.has(e.a) || !shared.has(e.b)) continue
    const bA = shared.get(e.a)!, bB = shared.get(e.b)!
    const eb = triB.get(bA < bB ? `${bA},${bB}` : `${bB},${bA}`)
    if (!eb) continue
    const pa = pt(P, e.a), pb = pt(P, e.b), pc = pt(P, e.c), qc = pt(Q, eb.c)
    const d = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]
    const len = Math.hypot(d[0], d[1], d[2]); if (len < 1e-9) continue
    d[0] /= len; d[1] /= len; d[2] /= len
    const inward = (c: [number, number, number]): [number, number, number] => {
      const w = [c[0] - pa[0], c[1] - pa[1], c[2] - pa[2]]
      const dot = w[0] * d[0] + w[1] * d[1] + w[2] * d[2]
      const r: [number, number, number] = [w[0] - dot * d[0], w[1] - dot * d[1], w[2] - dot * d[2]]
      const l = Math.hypot(...r) || 1
      return [r[0] / l, r[1] / l, r[2] / l]
    }
    const wa = inward(pc), wb = inward(qc)
    const nsteps = Math.max(1, Math.round(len / spacing))
    for (let i = 0; i < nsteps; i++) {
      const s = (i + 0.5) / nsteps
      const p: [number, number, number] = [pa[0] + d[0] * s * len, pa[1] + d[1] * s * len, pa[2] + d[2] * s * len]
      out.push({
        p,
        pa: [p[0] + wa[0] * delta, p[1] + wa[1] * delta, p[2] + wa[2] * delta],
        pb: [p[0] + wb[0] * delta, p[1] + wb[1] * delta, p[2] + wb[2] * delta],
        ta: e.t, tb: eb.t,
        na: nrm(A.normals, e.c), nb: nrm(B.normals, eb.c),
        edge: k,
      })
    }
  }
  return out
}

function insideEvenOdd(polys: Pt[][], x: number, y: number): boolean {
  let inside = false
  for (const p of polys) {
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1]
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

export interface Mismatch { samples: number; mismatched: number; longestRun: number; runs: number; length: number }

/** Compare two boolean sequences sampled at `spacing` mm along the crease; `ignore` marks samples explained by a feature outline. */
function runStats(a: boolean[], b: boolean[], spacing: number, ignore?: boolean[]): Mismatch {
  let mismatched = 0, run = 0, longest = 0, runs = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i] && !ignore?.[i]) { mismatched++; run++; if (run === 1) runs++; longest = Math.max(longest, run) } else run = 0
  }
  return { samples: a.length, mismatched, longestRun: longest * spacing, runs, length: a.length * spacing }
}

export interface Crease2D extends Mismatch { angleDeg: number; phase: [number, number]; lengthRatio: number; raw: Mismatch }

/**
 * 2D continuity of two layouts across their shared crease. A feature outline
 * lying on the crease flips the two sides too; that is not a discontinuity, so a
 * sample is only counted when a piece's own pattern, continued past the fold
 * (its fold polygons), does not flip there either.
 */
export function creaseMismatch2D(A: FlattenedPiece, LA: LayoutResult, B: FlattenedPiece, LB: LayoutResult, spacing = 0.1, delta = 0.02): Crease2D & { explained: boolean[] } {
  const samples = creaseSamples(A, B, spacing, delta)
  const ia: boolean[] = [], ib: boolean[] = [], explained: boolean[] = []
  const allA = [...LA.polygons, ...LA.foldPolygons], allB = [...LB.polygons, ...LB.foldPolygons]
  // only a fold carries the pattern past the crease; a cut edge has nothing to compare against
  // a ring's closing edge the layout joined carries the pattern past the crease as a fold does
  const foldA = new Set([...A.foldEdges, ...(LA.closureJoined && A.closure ? A.closure.edges : [])].map(([a, b]) => (a < b ? `${a},${b}` : `${b},${a}`)))
  for (const s of samples) {
    const ua = LA.param.uvAt3D(s.ta, ...s.pa), ub = LB.param.uvAt3D(s.tb, ...s.pb)
    const ca = LA.param.uvAt3D(s.ta, ...s.p), cb = LB.param.uvAt3D(s.tb, ...s.p)
    const inA = insideEvenOdd(LA.polygons, ua[0], ua[1]), inB = insideEvenOdd(LB.polygons, ub[0], ub[1])
    ia.push(inA); ib.push(inB)
    if (!foldA.has(s.edge)) { explained.push(false); continue }
    // the same offset on the far side of the crease, in each piece's own continued pattern
    const beyondA = insideEvenOdd(allA, 2 * ca[0] - ua[0], 2 * ca[1] - ua[1]), beyondB = insideEvenOdd(allB, 2 * cb[0] - ub[0], 2 * cb[1] - ub[1])
    explained.push((LA.foldPolygons.length > 0 && beyondA !== inA) || (LB.foldPolygons.length > 0 && beyondB !== inB))
  }
  // lattice diagnostics: direction and length of the crease in each placement frame and the offset of one crease point
  let angleDeg = 0, phase: [number, number] = [0, 0], lengthRatio = 1
  if (samples.length > 1) {
    const s0 = samples[0], s1 = samples[samples.length - 1]
    const a0 = LA.param.uvAt3D(s0.ta, ...s0.p), a1 = LA.param.uvAt3D(s1.ta, ...s1.p)
    const b0 = LB.param.uvAt3D(s0.tb, ...s0.p), b1 = LB.param.uvAt3D(s1.tb, ...s1.p)
    const angA = Math.atan2(a1[1] - a0[1], a1[0] - a0[0]), angB = Math.atan2(b1[1] - b0[1], b1[0] - b0[0])
    angleDeg = ((angA - angB) * 180) / Math.PI
    angleDeg = ((angleDeg % 360) + 540) % 360 - 180
    phase = [a0[0] - b0[0], a0[1] - b0[1]]
    lengthRatio = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) / (Math.hypot(b1[0] - b0[0], b1[1] - b0[1]) || 1)
  }
  return { ...runStats(ia, ib, spacing, explained), raw: runStats(ia, ib, spacing), angleDeg, phase, lengthRatio, explained }
}

// ---------------------------------------------------------------- layout like TilePanel
export interface Settings { rotationDeg: number; scale: number; margin: number; fitSeam: boolean; minScale: number; fit: 'repeat' | 'single'; mode: 'cut' | 'recess' | 'emboss'; wallThickness: number; depth: number; detail: number }
export const DEFAULTS: Settings = { rotationDeg: 0, scale: 1, margin: 3, fitSeam: true, minScale: 0.5, fit: 'repeat', mode: 'emboss', wallThickness: 5, depth: 0.8, detail: 2 }

export interface Laid { piece: FlattenedPiece; layout: LayoutResult }

/** Flatten + lay out as TilePanel does. `defOverrides` go into the TileDef. */
export function layoutOnBody(body: Body, generatorId: string, params: Record<string, number | string | boolean>, settings: Settings, origin: [number, number, number], segmentAngle = 30, def: Record<string, unknown> = {}, joinEdges = true): { laid: Laid[]; pieces: FlattenedPiece[]; log: string[]; tileWidth: number; tileHeight: number } {
  const { pieces, log } = flattenPieces(body.mesh, body.region, origin, segmentAngle, joinEdges)
  const tileDef = { name: generatorId, generatorId, params, invert: false, ...def } as Parameters<typeof generateTile>[1]['def']
  const base = { rotationDeg: settings.rotationDeg, scale: settings.scale, margin: settings.margin, fitSeam: settings.fitSeam, minScale: settings.minScale, single: settings.fit === 'single', normalRange: toolOffsetRange(settings.mode, settings.depth, settings.wallThickness) }
  const active = pieces.filter((p) => !isBackSide(p, settings.mode, settings.wallThickness))
  const laid: Laid[] = []
  let tw = 0, th = 0
  const generated = generateTile(m, { def: tileDef, lineWidth: 0.42 })
  // as TilePanel: a single copy is sized to cover the whole sheet
  const sheetSize = new Map<number, { width: number; height: number; period: number | null }>()
  if (base.single) for (const piece of active) {
    const size = fittedTileSize(piece, { ...base, origin: piece.origin })
    const prev = sheetSize.get(piece.sheet)
    sheetSize.set(piece.sheet, prev ? { width: Math.max(prev.width, size.width), height: Math.max(prev.height, size.height), period: prev.period ?? size.period } : size)
  }
  for (const piece of active) {
    const s: LayoutSettings = { ...base, origin: piece.origin }
    let polys = generated.polygons
    if (generated.tile) { tw = generated.tile.width; th = generated.tile.height }
    if (base.single) {
      const size = sheetSize.get(piece.sheet)!
      tw = Math.ceil(size.width); th = Math.ceil(size.height)
      if (size.period) tw = size.period
      const g = generateTile(m, { def: tileDef, lineWidth: 0.42, size: { width: tw, height: th } })
      polys = g.polygons
      if (g.tile) { tw = g.tile.width; th = g.tile.height }
    }
    const layout = layoutTile(m, piece, polys, tw, th, s)
    laid.push({ piece, layout })
  }
  return { laid, pieces, log, tileWidth: tw, tileHeight: th }
}

/** Every crease between laid-out pieces. */
export function allCreases(laid: Laid[], spacing = 0.1) {
  const out: { a: number; b: number; result: ReturnType<typeof creaseMismatch2D> }[] = []
  for (let i = 0; i < laid.length; i++) for (let j = i + 1; j < laid.length; j++) {
    const r = creaseMismatch2D(laid[i].piece, laid[i].layout, laid[j].piece, laid[j].layout, spacing)
    if (r.samples) out.push({ a: i, b: j, result: r })
  }
  return out
}

// ---------------------------------------------------------------- 3D: apply and ray test
export function applyLaid(body: Body, laid: Laid[], settings: Settings): Manifold {
  let zMin: number, zMax: number
  if (settings.mode === 'cut') { zMin = -(settings.wallThickness + 1); zMax = 1 }
  else if (settings.mode === 'recess') { zMin = -settings.depth; zMax = 1 }
  else { zMin = -0.2; zMax = settings.depth }
  const tools: Manifold[] = []
  for (const { piece, layout } of laid) {
    if (!layout.polygons.length) continue
    const param = new Parameterization({ ...layout.param.sub, sourceTriangles: new Uint32Array(0) }, layout.param.uv)
    const polygons: Polygon[] = [...layout.polygons, ...layout.foldPolygons].map((p) => p.map(([x, y]) => [x, y] as [number, number]))
    tools.push(mitreTool(m, buildSurfaceTool(m, param, polygons, zMin, zMax, settings.detail), toolMitres(piece, layout), zMin, zMax))
  }
  const tool = tools.length === 1 ? tools[0] : M.union(tools)
  const out = settings.mode === 'emboss' ? M.union(body.body, tool) : M.difference(body.body, tool)
  if (out.status() !== 'NoError') throw new Error(`boolean failed: ${out.status()}`)
  return out
}

/** Along the crease, is the surface at its original level on both sides? Outlines on the crease are discounted as in 2D. */
export function creaseMismatch3D(solid: Manifold, la: Laid, lb: Laid, settings: Settings, spacing = 0.1, delta = 0.05): Mismatch {
  const A = la.piece, B = lb.piece
  const samples = creaseSamples(A, B, spacing, delta)
  const explained = creaseMismatch2D(A, la.layout, B, lb.layout, spacing, delta).explained
  const reach = settings.mode === 'cut' ? settings.wallThickness + 1 : settings.depth + 0.5
  const start = settings.mode === 'emboss' ? settings.depth + 0.5 : 0.5
  const level = (p: [number, number, number], n: [number, number, number]): boolean => {
    const o: [number, number, number] = [p[0] + n[0] * start, p[1] + n[1] * start, p[2] + n[2] * start]
    const e: [number, number, number] = [p[0] - n[0] * reach, p[1] - n[1] * reach, p[2] - n[2] * reach]
    const hits = solid.rayCast(o, e)
    if (!hits.length) return false
    const q = hits[0].position // hit distances are parametric; measure the first hit from the ray origin
    return Math.abs(Math.hypot(q[0] - o[0], q[1] - o[1], q[2] - o[2]) - start) < 0.02 // first hit is the original surface
  }
  const ia = samples.map((s) => level(s.pa, s.na)), ib = samples.map((s) => level(s.pb, s.nb))
  const levelA = ia.filter(Boolean).length, levelB = ib.filter(Boolean).length
  return { ...runStats(ia, ib, spacing, explained), levelA, levelB } as Mismatch & { levelA: number; levelB: number }
}

// ---------------------------------------------------------------- driver
const fmt = (r: Mismatch & { angleDeg?: number; phase?: [number, number]; raw?: Mismatch; lengthRatio?: number }) =>
  `${((r.mismatched / Math.max(1, r.samples)) * 100).toFixed(1)}% of ${r.length.toFixed(0)} mm mismatched, longest ${r.longestRun.toFixed(2)} mm in ${r.runs} runs` +
  (r.raw ? ` (${((r.raw.mismatched / Math.max(1, r.raw.samples)) * 100).toFixed(1)}% before discounting outlines on the crease)` : '') +
  (r.angleDeg !== undefined ? `; crease turns ${r.angleDeg.toFixed(1)}° between frames, offset (${r.phase![0].toFixed(2)}, ${r.phase![1].toFixed(2)}), length ratio ${r.lengthRatio!.toFixed(4)}` : '')

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!)) {
  const mode = process.argv[2] ?? 'quick'
  const only = process.argv[3]
  const joinEdges = !process.argv.includes('--no-join')
  const results: Record<string, unknown>[] = []
  const rec = (r: Record<string, unknown>) => { results.push(r); console.log((r.label as string).padEnd(64), r.note ?? r.error ?? r.text) }
  const bodies = mode === '3d' ? [hollowBox(2), bentPlate(45), bentPlate(135), bentPlate(-90)] : [hollowBox(2), hollowBoxCorner(2), bentPlate(20), bentPlate(45), bentPlate(90), bentPlate(135), bentPlate(-90)]
  const gens = only ? generators.filter((g) => g.id === only) : mode === 'full' ? generators : generators.filter((g) => ['honeycomb', 'squareGrid', 'voronoiTile', 'celtic', 'truchet', 'hilbert'].includes(g.id))
  const settingsList: Partial<Settings>[] = mode === 'full'
    ? [{ margin: 0 }, { margin: 0, rotationDeg: 37 }, { margin: 0, scale: 0.6 }, { margin: 3 }, { margin: 0, fit: 'single' }]
    : [{ margin: 0 }, { margin: 0, rotationDeg: 37 }, { margin: 3 }]
  for (const body of bodies) {
    const origin = body.origin
    for (const g of gens) for (const s of settingsList) {
      const settings = { ...DEFAULTS, ...s }
      const label = `${body.name} | ${g.id} | ${JSON.stringify(s)}`
      try {
        const t0 = performance.now()
        const { laid, pieces, log } = layoutOnBody(body, g.id, {}, settings, origin, 30, {}, joinEdges)
        const creases = allCreases(laid)
        const ms = performance.now() - t0
        if (!creases.length) {
          const l = laid[0].layout
          rec({ label, pieces: pieces.length, note: `single piece: local size ${(l.scaleMin * 100).toFixed(1)}% to ${(l.scaleMax * 100).toFixed(1)}%` })
          continue
        }
        const sheets = new Set(pieces.map((p) => p.sheet)).size
        for (const c of creases) rec({ label, pieces: pieces.length, sheets, sameSheet: laid[c.a].piece.sheet === laid[c.b].piece.sheet, ...c.result, explained: undefined, ms: Math.round(ms), log, text: `${laid[c.a].piece.sheet === laid[c.b].piece.sheet ? 'joined' : 'cut   '} ${fmt(c.result)}` })
        if (mode === '3d') {
          for (const md of ['cut', 'recess', 'emboss'] as const) {
            const st = { ...settings, mode: md, wallThickness: 2 }
            const { laid: l2 } = layoutOnBody(body, g.id, {}, st, origin, 30, {}, joinEdges)
            const solid = applyLaid(body, l2, st)
            const r = creaseMismatch3D(solid, l2[0], l2[1], st)
            const rr = r as typeof r & { levelA: number; levelB: number }
            rec({ label: `${label} 3d ${md}`, ...r, status: solid.status(), parts: solid.decompose().length, text: `${fmt(r)}; at surface level: ${rr.levelA}/${rr.levelB} of ${r.samples}` })
            solid.delete()
          }
        }
      } catch (e) { rec({ label, error: (e as Error).message }) }
    }
  }
  writeFileSync(new URL(`./crease-audit-${mode}${joinEdges ? '' : '-nojoin'}.json`, import.meta.url), JSON.stringify(results, null, 1))
}
