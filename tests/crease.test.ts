// A tiled pattern must continue across a sharp edge between two faces (adjacent
// sides of a box, a bent plate): the faces are unfolded into one sheet with one
// layout frame, and the per-face tools are mitred at the fold so the cut, recess
// or emboss agrees on both sides of the edge in the finished solid.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import Module from 'manifold-3d'
import { triMeshFromManifold, type TriMesh, type Manifold } from '../src/geom/manifold.ts'
import { flattenPieces, isBackSide, type FlattenedPiece } from '../src/geom/regionFlatten.ts'
import { layoutTile, toolMitres, type LayoutResult } from '../src/geom/layout.ts'
import { Parameterization } from '../src/geom/parameterization.ts'
import { buildSurfaceTool, mitreTool, toolOffsetRange, type Polygon } from '../src/geom/tileTool.ts'
import { generateTile } from '../src/patterns/generate.ts'
import { triangleAreaNormal } from '../src/geom/sampling.ts'
import type { Pt } from '../src/patterns/types.ts'

const m = await Module(); m.setup()
const M = m.Manifold
type V3 = [number, number, number]

interface Body { body: Manifold; mesh: TriMesh; region: Uint32Array; origin: V3 }

function select(mesh: TriMesh, normals: V3[], where: (x: number, y: number, z: number) => boolean = () => true): Uint32Array {
  const cosMin = Math.cos((0.5 * Math.PI) / 180), n = new Float64Array(3), out: number[] = []
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

/** Hollow 80 x 50 x 40 box with 2 mm walls; region = the outer faces with the given normals. */
function box(normals: V3[]): Body {
  const body = M.difference(M.cube([80, 50, 40], false).translate([-40, -25, 0]), M.cube([76, 46, 36], false).translate([-38, -23, 2]))
  const mesh = triMeshFromManifold(body)
  const outside = (x: number, y: number, z: number) => Math.abs(x) > 39.99 || Math.abs(y) > 24.99 || z < 0.01 || z > 39.99
  return { body, mesh, region: select(mesh, normals, outside), origin: [10, -10, 40] }
}

/** Two 60 x 8 x 50 plates meeting along z with normals `angleDeg` apart (negative = valley), mitred at the ridge (each starts past the bisector and is clipped there, so a valley is solid underneath). */
function plate(angleDeg: number): Body {
  const L = 60, T = 8, W = 50, half = angleDeg / 2
  const a = M.cube([L + T, T, W], false).translate([-T, -T, -W / 2]).rotate([0, 0, -half])
  const b = M.cube([L + T, T, W], false).translate([-L, -T, -W / 2]).rotate([0, 0, half])
  const right = M.cube([2 * L, 4 * L, 2 * W], false).translate([0, -2 * L, -W]), left = M.cube([2 * L, 4 * L, 2 * W], false).translate([-2 * L, -2 * L, -W])
  const body = M.union(M.intersection(a, right), M.intersection(b, left))
  const mesh = triMeshFromManifold(body)
  const h = (half * Math.PI) / 180
  const normals: V3[] = [[Math.sin(h), Math.cos(h), 0], [-Math.sin(h), Math.cos(h), 0]]
  // only the two top faces: the plates' end faces can share a normal with the other top
  const region = select(mesh, normals, (x, y) => Math.hypot(x, y) < L - 1)
  return { body, mesh, region, origin: [20 * Math.cos(h), -20 * Math.sin(h), 5] }
}

/** Solid cylinder r = 20, h = 40; region = the side and the top. */
function cylinderWithLid(): Body {
  const body = M.cylinder(40, 20, 20, 64)
  const mesh = triMeshFromManifold(body)
  const region: number[] = []
  const n = new Float64Array(3)
  for (let t = 0; t < mesh.indices.length / 3; t++) { triangleAreaNormal(mesh, t, n); if (n[2] > -0.5) region.push(t) }
  return { body, mesh, region: Uint32Array.from(region), origin: [20, 0, 20] }
}

interface Settings { rotationDeg?: number; scale?: number; margin?: number; mode?: 'cut' | 'recess' | 'emboss'; wallThickness?: number; depth?: number }
interface Laid { piece: FlattenedPiece; layout: LayoutResult }

/** Flatten and lay out as TilePanel does. */
function layoutOn(b: Body, generatorId: string, s: Settings = {}, joinEdges = true): { laid: Laid[]; pieces: FlattenedPiece[]; log: string[] } {
  const mode = s.mode ?? 'emboss', wallThickness = s.wallThickness ?? 2, depth = s.depth ?? 0.8
  const { pieces, log } = flattenPieces(b.mesh, b.region, b.origin, 30, joinEdges)
  const generated = generateTile(m, { def: { name: generatorId, generatorId, params: {}, invert: false }, lineWidth: 0.42 })
  const laid: Laid[] = []
  for (const piece of pieces) {
    if (isBackSide(piece, mode, wallThickness)) continue
    const settings = { origin: piece.origin, rotationDeg: s.rotationDeg ?? 0, scale: s.scale ?? 1, margin: s.margin ?? 0, fitSeam: true, minScale: 0.5, normalRange: toolOffsetRange(mode, depth, wallThickness) }
    laid.push({ piece, layout: layoutTile(m, piece, generated.polygons, generated.tile!.width, generated.tile!.height, settings) })
  }
  return { laid, pieces, log }
}

function key(p: Float32Array, v: number) { return `${Math.round(p[v * 3] * 1e4)},${Math.round(p[v * 3 + 1] * 1e4)},${Math.round(p[v * 3 + 2] * 1e4)}` }

interface Sample { p: V3; pa: V3; pb: V3; ta: number; tb: number; na: V3; nb: V3; edge: string }

/** Points along the crease shared by A and B, offset `delta` mm into each face. */
function creaseSamples(A: FlattenedPiece, B: FlattenedPiece, spacing: number, delta: number): Sample[] {
  const keysB = new Map<string, number>()
  for (let v = 0; v < B.positions.length / 3; v++) keysB.set(key(B.positions, v), v)
  const shared = new Map<number, number>()
  for (let v = 0; v < A.positions.length / 3; v++) { const w = keysB.get(key(A.positions, v)); if (w !== undefined) shared.set(v, w) }
  const edgeOf = (ix: Uint32Array) => {
    const owner = new Map<string, { t: number; a: number; b: number; c: number }>(), count = new Map<string, number>()
    for (let t = 0; t < ix.length / 3; t++) for (let s = 0; s < 3; s++) {
      const a = ix[t * 3 + s], b = ix[t * 3 + ((s + 1) % 3)], c = ix[t * 3 + ((s + 2) % 3)], k = a < b ? `${a},${b}` : `${b},${a}`
      count.set(k, (count.get(k) ?? 0) + 1); owner.set(k, { t, a, b, c })
    }
    return { owner, count }
  }
  const ea = edgeOf(A.indices), eb = edgeOf(B.indices)
  const pt = (p: Float32Array, v: number): V3 => [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]]
  const out: Sample[] = []
  for (const [k, n] of ea.count) {
    if (n !== 1) continue
    const e = ea.owner.get(k)!
    if (!shared.has(e.a) || !shared.has(e.b)) continue
    const ba = shared.get(e.a)!, bb = shared.get(e.b)!
    const f = eb.owner.get(ba < bb ? `${ba},${bb}` : `${bb},${ba}`)
    if (!f) continue
    const pa = pt(A.positions, e.a), pb = pt(A.positions, e.b)
    const d = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], len = Math.hypot(...d)
    d[0] /= len; d[1] /= len; d[2] /= len
    const inward = (c: V3): V3 => {
      const w = [c[0] - pa[0], c[1] - pa[1], c[2] - pa[2]], dot = w[0] * d[0] + w[1] * d[1] + w[2] * d[2]
      const r: V3 = [w[0] - dot * d[0], w[1] - dot * d[1], w[2] - dot * d[2]], l = Math.hypot(...r) || 1
      return [r[0] / l, r[1] / l, r[2] / l]
    }
    const wa = inward(pt(A.positions, e.c)), wb = inward(pt(B.positions, f.c))
    const steps = Math.max(1, Math.round(len / spacing))
    for (let i = 0; i < steps; i++) {
      const s = (i + 0.5) / steps, p: V3 = [pa[0] + d[0] * s * len, pa[1] + d[1] * s * len, pa[2] + d[2] * s * len]
      out.push({ p, pa: [p[0] + wa[0] * delta, p[1] + wa[1] * delta, p[2] + wa[2] * delta], pb: [p[0] + wb[0] * delta, p[1] + wb[1] * delta, p[2] + wb[2] * delta], ta: e.t, tb: f.t, na: pt(A.normals, e.c), nb: pt(B.normals, f.c), edge: k })
    }
  }
  return out
}

function inside(polys: Pt[][], x: number, y: number): boolean {
  let r = false
  for (const p of polys) for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r
  }
  return r
}

interface Runs { fraction: number; longest: number }
function runs(a: boolean[], b: boolean[], spacing: number, ignore: boolean[]): Runs {
  let mismatched = 0, run = 0, longest = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i] && !ignore[i]) { mismatched++; run++; longest = Math.max(longest, run) } else run = 0
  }
  return { fraction: mismatched / Math.max(1, a.length), longest: longest * spacing }
}

/**
 * Feature classification either side of the crease, in the 2D layouts. A feature
 * outline lying on the crease flips the two sides without any discontinuity, so
 * samples where a piece's own pattern (continued past the fold) flips are ignored.
 */
function crease2D(a: Laid, b: Laid, spacing = 0.1, delta = 0.02) {
  const samples = creaseSamples(a.piece, b.piece, spacing, delta)
  const ia: boolean[] = [], ib: boolean[] = [], explained: boolean[] = []
  const allA = [...a.layout.polygons, ...a.layout.foldPolygons], allB = [...b.layout.polygons, ...b.layout.foldPolygons]
  // only a fold carries the pattern past the crease; a cut edge has nothing to compare against
  const folds = new Set(a.piece.foldEdges.map(([x, y]) => (x < y ? `${x},${y}` : `${y},${x}`)))
  for (const s of samples) {
    const ua = a.layout.param.uvAt3D(s.ta, ...s.pa), ub = b.layout.param.uvAt3D(s.tb, ...s.pb)
    const ca = a.layout.param.uvAt3D(s.ta, ...s.p), cb = b.layout.param.uvAt3D(s.tb, ...s.p)
    const inA = inside(a.layout.polygons, ua[0], ua[1]), inB = inside(b.layout.polygons, ub[0], ub[1])
    ia.push(inA); ib.push(inB)
    if (!folds.has(s.edge)) { explained.push(false); continue }
    explained.push((allA.length > a.layout.polygons.length && inside(allA, 2 * ca[0] - ua[0], 2 * ca[1] - ua[1]) !== inA) || (allB.length > b.layout.polygons.length && inside(allB, 2 * cb[0] - ub[0], 2 * cb[1] - ub[1]) !== inB))
  }
  const s0 = samples[0], s1 = samples[samples.length - 1]
  const a0 = a.layout.param.uvAt3D(s0.ta, ...s0.p), a1 = a.layout.param.uvAt3D(s1.ta, ...s1.p)
  const b0 = b.layout.param.uvAt3D(s0.tb, ...s0.p), b1 = b.layout.param.uvAt3D(s1.tb, ...s1.p)
  const frameOffset = Math.hypot(a0[0] - b0[0], a0[1] - b0[1]) + Math.hypot(a1[0] - b1[0], a1[1] - b1[1])
  return { samples: samples.length, ...runs(ia, ib, spacing, explained), raw: runs(ia, ib, spacing, samples.map(() => false)), frameOffset, explained }
}

function creases(laid: Laid[], spacing = 0.1) {
  const out: { a: number; b: number; r: ReturnType<typeof crease2D> }[] = []
  for (let i = 0; i < laid.length; i++) for (let j = i + 1; j < laid.length; j++) {
    if (!creaseSamples(laid[i].piece, laid[j].piece, spacing, 0.02).length) continue
    out.push({ a: i, b: j, r: crease2D(laid[i], laid[j], spacing) })
  }
  return out
}

/** Apply the laid-out pattern to the body as the geometry worker does. */
function apply(b: Body, laid: Laid[], mode: 'cut' | 'recess' | 'emboss', wallThickness: number, depth: number): Manifold {
  const [zMin, zMax] = toolOffsetRange(mode, depth, wallThickness)
  const tools = laid.filter((l) => l.layout.polygons.length).map(({ piece, layout }) => {
    const param = new Parameterization({ ...layout.param.sub, sourceTriangles: new Uint32Array(0) }, layout.param.uv)
    const polygons: Polygon[] = [...layout.polygons, ...layout.foldPolygons].map((p) => p.map(([x, y]) => [x, y] as [number, number]))
    return mitreTool(m, buildSurfaceTool(m, param, polygons, zMin, zMax, 2), toolMitres(piece, layout), zMin, zMax)
  })
  const tool = M.union(tools)
  return mode === 'emboss' ? M.union(b.body, tool) : M.difference(b.body, tool)
}

/** Is the surface at its original level either side of the crease, by ray casts into the solid? */
function crease3D(solid: Manifold, a: Laid, b: Laid, mode: 'cut' | 'recess' | 'emboss', wallThickness: number, depth: number, spacing = 0.1) {
  const delta = 0.05
  const samples = creaseSamples(a.piece, b.piece, spacing, delta)
  const reach = mode === 'cut' ? wallThickness + 1 : depth + 0.5, start = mode === 'emboss' ? depth + 0.5 : 0.5
  const level = (p: V3, n: V3) => {
    const o: V3 = [p[0] + n[0] * start, p[1] + n[1] * start, p[2] + n[2] * start]
    const hits = solid.rayCast(o, [p[0] - n[0] * reach, p[1] - n[1] * reach, p[2] - n[2] * reach])
    if (!hits.length) return false
    const q = hits[0].position
    return Math.abs(Math.hypot(q[0] - o[0], q[1] - o[1], q[2] - o[2]) - start) < 0.02
  }
  const explained = crease2D(a, b, spacing, delta).explained
  return runs(samples.map((s) => level(s.pa, s.na)), samples.map((s) => level(s.pb, s.nb)), spacing, explained)
}

const GENERATORS = ['squareGrid', 'honeycomb', 'voronoiTile', 'celtic', 'hilbert']

test('two faces of a box share one layout frame and the pattern continues across their edge', () => {
  const b = box([[0, 0, 1], [0, -1, 0]])
  let worstUnjoined = 0
  for (const generatorId of GENERATORS) for (const rotationDeg of [0, 37]) {
    const { laid, pieces, log } = layoutOn(b, generatorId, { rotationDeg })
    assert.equal(pieces.length, 2)
    assert.equal(new Set(pieces.map((p) => p.sheet)).size, 1, log.join('\n'))
    assert.ok(log.some((l) => l.includes('1 sharp edge(s) unfolded')), log.join('\n'))
    const [c] = creases(laid)
    assert.ok(c && c.r.samples >= 700, 'the 80 mm crease is sampled')
    assert.ok(c.r.frameOffset < 1e-3, `${generatorId} ${rotationDeg}°: frames differ by ${c.r.frameOffset}`)
    assert.ok(c.r.longest <= 0.3, `${generatorId} ${rotationDeg}°: ${(c.r.fraction * 100).toFixed(1)}% mismatched, longest ${c.r.longest} mm`)
    // the same layouts without unfolding: each face on its own frame, a visible break
    const separate = layoutOn(b, generatorId, { rotationDeg }, false)
    const [d] = creases(separate.laid)
    assert.equal(new Set(separate.pieces.map((p) => p.sheet)).size, 2)
    worstUnjoined = Math.max(worstUnjoined, d.r.raw.fraction)
  }
  assert.ok(worstUnjoined > 0.2, `the measure must see the old break (worst ${worstUnjoined})`)
})

test('bent plates unfold at 45°, 135° and into a concave valley, at any tile rotation or scale', () => {
  for (const angle of [45, 135, -90]) for (const generatorId of ['squareGrid', 'voronoiTile', 'celtic']) for (const s of [{ rotationDeg: 37 }, { scale: 0.6 }, { margin: 3 }]) {
    const { laid, pieces, log } = layoutOn(plate(angle), generatorId, s)
    assert.equal(pieces.length, 2, log.join('\n'))
    assert.equal(new Set(pieces.map((p) => p.sheet)).size, 1, log.join('\n'))
    const [c] = creases(laid)
    assert.ok(c.r.frameOffset < 1e-3, `${angle}° ${generatorId}: frames differ by ${c.r.frameOffset}`)
    assert.ok(c.r.longest <= 0.3, `${angle}° ${generatorId} ${JSON.stringify(s)}: longest break ${c.r.longest} mm`)
    // a margin band stays along the real edges only, never along the fold
    if (s.margin) for (const l of laid) assert.ok(l.layout.polygons.length > 0)
  }
})

test('the margin band stays along the rim of every wall of a ring, whether the wall has one fold or two', () => {
  // the four outer walls of a 50 mm container: three folds joined, one edge cut
  const body = M.difference(M.cube([50, 50, 50], false), M.cube([46.8, 46.8, 50], false).translate([1.6, 1.6, 1.6]))
  const mesh = triMeshFromManifold(body)
  const region = select(mesh, [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]], (x, y) => Math.abs(x - 25) > 24.99 || Math.abs(y - 25) > 24.99)
  const b: Body = { body, mesh, region, origin: [25, 0, 25] }
  const { laid, pieces, log } = layoutOn(b, 'voronoiTile', { margin: 2.5 })
  assert.equal(pieces.length, 4)
  assert.equal(new Set(pieces.map((p) => p.sheet)).size, 1, log.join('\n'))
  assert.deepEqual(pieces.map((p) => p.foldEdges.length).sort(), [1, 1, 2, 2])
  const tmp = new Float32Array(3)
  for (const { piece, layout } of laid) {
    assert.ok(layout.polygons.length > 20)
    let zMin = Infinity, zMax = -Infinity
    for (const poly of layout.polygons) for (const [x, y] of poly) { layout.param.toSurface(x, y, 0, tmp); zMin = Math.min(zMin, tmp[2]); zMax = Math.max(zMax, tmp[2]) }
    assert.ok(zMin >= 2.5 - 0.05 && zMax <= 47.5 + 0.05, `wall with ${piece.foldEdges.length} fold(s): pattern spans z ${zMin.toFixed(2)} to ${zMax.toFixed(2)}, the 2.5 mm band is missing`)
  }
})

test('a ridge gentler than the segment angle is one exact sheet already', () => {
  const { laid, pieces } = layoutOn(plate(20), 'honeycomb')
  assert.equal(pieces.length, 1)
  assert.ok(Math.abs(laid[0].layout.scaleMin - 1) < 1e-3 && Math.abs(laid[0].layout.scaleMax - 1) < 1e-3, 'developable surface flattens without stretch')
})

test('a box corner keeps its two longest edges continuous and cuts the shortest', () => {
  const { laid, pieces, log } = layoutOn(box([[0, 0, 1], [0, -1, 0], [1, 0, 0]]), 'honeycomb')
  assert.equal(pieces.length, 3)
  assert.equal(new Set(pieces.map((p) => p.sheet)).size, 1, log.join('\n'))
  const all = creases(laid).sort((x, y) => y.r.samples - x.r.samples)
  assert.equal(all.length, 3)
  // 80 mm and 50 mm folds joined, the 40 mm edge cut
  assert.ok(all[0].r.longest <= 0.3 && all[1].r.longest <= 0.3, all.map((c) => `${c.r.samples / 10} mm: ${c.r.longest}`).join(', '))
  assert.ok(all[2].r.samples === 400 && all[2].r.raw.fraction > 0.1, 'the third edge of a corner cannot be flat too')
})

test('a cylinder wall and its flat lid do not flatten the same way, so they stay separate sheets', () => {
  const { pieces, log } = layoutOn(cylinderWithLid(), 'honeycomb')
  assert.equal(pieces.length, 2, log.join('\n'))
  assert.equal(new Set(pieces.map((p) => p.sheet)).size, 2, log.join('\n'))
  assert.ok(log.some((l) => l.includes('not unfolded')), log.join('\n'))
  assert.ok(pieces.some((p) => p.topology === 'seam' && p.period), 'the wall still wraps')
  assert.ok(pieces.every((p) => p.foldEdges.length === 0 && p.mitres.length === 0))
})

test('mitred tools: cut, recess and emboss across a box edge leave one solid that agrees on both sides', () => {
  const b = box([[0, 0, 1], [0, -1, 0]])
  // hole patterns: cutting a rib pattern such as Celtic through a wall severs it into its cells by design
  for (const mode of ['cut', 'recess', 'emboss'] as const) for (const generatorId of ['voronoiTile', 'honeycomb']) {
    const wallThickness = 2, depth = 0.8
    const { laid, pieces } = layoutOn(b, generatorId, { mode, wallThickness, depth })
    assert.equal(pieces.length, 2)
    for (const l of laid) { assert.equal(l.piece.mitres.length, 1); assert.ok(l.layout.foldPolygons.length > 0, 'the pattern continues past the fold for the tool') }
    const solid = apply(b, laid, mode, wallThickness, depth)
    assert.equal(solid.status(), 'NoError')
    // material shells only: the closed box's cavity decomposes as its own (negative-volume) shell
    const parts = solid.decompose().filter((p) => p.volume() > 0.01)
    assert.equal(parts.length, 1, `${mode} ${generatorId}: ${parts.length} parts`)
    const changed = Math.abs(solid.volume() - b.body.volume())
    assert.ok(changed > 100, `${mode} ${generatorId}: only ${changed.toFixed(1)} mm³ changed`)
    const r = crease3D(solid, laid[0], laid[1], mode, wallThickness, depth)
    assert.ok(r.longest <= 1, `${mode} ${generatorId}: ${(r.fraction * 100).toFixed(1)}% of the edge disagrees, longest ${r.longest} mm`)
    solid.delete()
  }
})
