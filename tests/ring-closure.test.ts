// The four outer walls of a box unfold into one strip whose ends meet: the sheet
// is periodic over the box's circumference, so the tile can repeat a whole number
// of times around it and the last edge is as continuous as the other three. When
// the tile cannot repeat around the ring (a generic rotation, seam fitting off)
// the closing edge stays a real edge and the layout says so; it never claims a
// seamless wrap it did not make. The fit follows the geometry: a rectangular
// container, a moved origin and a different root face close just the same.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { triMeshFromManifold, type Manifold } from '../src/geom/manifold.ts'
import { flattenPieces, type FlattenedPiece } from '../src/geom/regionFlatten.ts'
import { layoutTile, toolMitres, type LayoutResult } from '../src/geom/layout.ts'
import { buildSurfaceTool, mitreTool, toolOffsetRange } from '../src/geom/tileTool.ts'
import { generateTile } from '../src/patterns/generate.ts'
import { m, box, select, filled, hit, type Fixture, type V3 } from './physical-fixtures.ts'
import type { Pt } from '../src/patterns/types.ts'

const M = m.Manifold
type Mode = 'cut' | 'recess' | 'emboss'
interface Laid { piece: FlattenedPiece; layout: LayoutResult }

/** A hollow open container w x d x 50 with 1.6 mm walls; region = its four outer walls. */
function container(w: number, d: number, origin: V3): Fixture {
  const body = M.difference(M.cube([w, d, 50]), M.cube([w - 3.2, d - 3.2, 50]).translate([1.6, 1.6, 1.6]))
  const mesh = triMeshFromManifold(body)
  return { body, mesh, origin, region: select(mesh, [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]], (x, y) => x < .001 || y < .001 || x > w - .001 || y > d - .001) }
}

function layoutOn(f: Fixture, generatorId: string, s: { rotationDeg?: number; margin?: number; fitSeam?: boolean; mode?: Mode; scale?: number } = {}) {
  const mode = s.mode ?? 'emboss', range = toolOffsetRange(mode, 0.8, 1.6)
  const { pieces, log } = flattenPieces(f.mesh, f.region, f.origin, 30)
  const g = generateTile(m, { def: { name: generatorId, generatorId, params: {}, invert: false }, lineWidth: 0.42 })
  const laid: Laid[] = pieces.map((piece) => ({ piece, layout: layoutTile(m, piece, g.polygons, g.tile!.width, g.tile!.height, { origin: piece.origin, rotationDeg: s.rotationDeg ?? 0, scale: s.scale ?? 1, margin: s.margin ?? 0, fitSeam: s.fitSeam ?? true, minScale: 0.5, normalRange: range }) }))
  return { pieces, laid, log }
}

function key(p: Float32Array, v: number) { return `${Math.round(p[v * 3] * 1e4)},${Math.round(p[v * 3 + 1] * 1e4)},${Math.round(p[v * 3 + 2] * 1e4)}` }

function inside(polys: Pt[][], x: number, y: number): boolean {
  let r = false
  for (const p of polys) for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r
  }
  return r
}

/**
 * Along every vertical edge shared by two walls, classify points 0.02 mm into each
 * wall in that wall's own laid-out pattern; a joined edge (fold or closure) must
 * agree on both sides except where a feature outline crosses the edge itself.
 */
function edges(laid: Laid[]) {
  const out: { a: number; b: number; samples: number; mismatched: number; longest: number; joined: boolean }[] = []
  for (let i = 0; i < laid.length; i++) for (let j = i + 1; j < laid.length; j++) {
    const A = laid[i].piece, B = laid[j].piece
    const keysB = new Map<string, number>()
    for (let v = 0; v < B.positions.length / 3; v++) keysB.set(key(B.positions, v), v)
    const shared: [number, number][] = []
    for (let v = 0; v < A.positions.length / 3; v++) { const w = keysB.get(key(A.positions, v)); if (w !== undefined) shared.push([v, w]) }
    if (shared.length < 2) continue
    // the shared vertical edge: its bottom and top
    const pts = shared.map(([v]) => [A.positions[v * 3], A.positions[v * 3 + 1], A.positions[v * 3 + 2]] as V3)
    const lo = pts.reduce((p, q) => (q[2] < p[2] ? q : p)), hi = pts.reduce((p, q) => (q[2] > p[2] ? q : p))
    const joinedA = new Set([...A.foldVertices, ...(laid[i].layout.closureJoined && A.closure ? A.closure.vertices : [])]), joined = shared.every(([v]) => joinedA.has(v))
    const inward = (P: FlattenedPiece): V3 => {
      // direction into the face, perpendicular to the edge: from the edge towards the face centroid
      let cx = 0, cy = 0, n = P.positions.length / 3
      for (let v = 0; v < n; v++) { cx += P.positions[v * 3] / n; cy += P.positions[v * 3 + 1] / n }
      const dx = cx - lo[0], dy = cy - lo[1], l = Math.hypot(dx, dy) || 1
      return [dx / l, dy / l, 0]
    }
    const wa = inward(A), wb = inward(B)
    let mismatched = 0, run = 0, longest = 0, samples = 0
    const triOf = (P: FlattenedPiece, p: V3) => {
      // the triangle of P containing p (any: the faces are planar, so barycentrics from any triangle are fine)
      let best = 0, bd = Infinity
      for (let t = 0; t < P.indices.length / 3; t++) {
        let cx = 0, cy = 0, cz = 0
        for (let c = 0; c < 3; c++) { const v = P.indices[t * 3 + c] * 3; cx += P.positions[v] / 3; cy += P.positions[v + 1] / 3; cz += P.positions[v + 2] / 3 }
        const d = (cx - p[0]) ** 2 + (cy - p[1]) ** 2 + (cz - p[2]) ** 2
        if (d < bd) { bd = d; best = t }
      }
      return best
    }
    for (let z = lo[2] + 0.05; z < hi[2]; z += 0.1) {
      const p: V3 = [lo[0], lo[1], z]
      const pa: V3 = [p[0] + wa[0] * 0.02, p[1] + wa[1] * 0.02, z], pb: V3 = [p[0] + wb[0] * 0.02, p[1] + wb[1] * 0.02, z]
      const la = laid[i].layout, lb = laid[j].layout
      const ua = la.param.uvAt3D(triOf(A, pa), ...pa), ub = lb.param.uvAt3D(triOf(B, pb), ...pb)
      const inA = inside(la.polygons, ua[0], ua[1]), inB = inside(lb.polygons, ub[0], ub[1])
      // an outline on the edge flips one side legitimately: the piece's own pattern continued past the fold flips too
      const ca = la.param.uvAt3D(triOf(A, pa), ...p), all = [...la.polygons, ...la.foldPolygons]
      const explained = la.foldPolygons.length > 0 && inside(all, 2 * ca[0] - ua[0], 2 * ca[1] - ua[1]) !== inA
      samples++
      if (inA !== inB && !explained) { mismatched++; run++; longest = Math.max(longest, run) } else run = 0
    }
    out.push({ a: i, b: j, samples, mismatched, longest: longest * 0.1, joined })
  }
  return out
}

function apply(f: Fixture, laid: Laid[], mode: Mode): Manifold {
  const [zMin, zMax] = toolOffsetRange(mode, 0.8, 1.6)
  const tools = laid.filter((l) => l.layout.polygons.length).map(({ piece, layout }) => mitreTool(m, buildSurfaceTool(m, layout.param, [...layout.polygons, ...layout.foldPolygons], zMin, zMax, 2), toolMitres(piece, layout), zMin, zMax))
  const tool = M.union(tools)
  const out = mode === 'emboss' ? M.union(f.body, tool) : M.difference(f.body, tool)
  tool.delete(); tools.forEach((t) => t.delete())
  return out
}

test('the four walls of the box close as one periodic sheet: all four edges continuous at 0, 90, 180 and 270 degrees', () => {
  const f = box(true)
  try {
    for (const generatorId of ['honeycomb', 'voronoiTile', 'lusona', 'greekKey']) for (const rotationDeg of [0, 90, 180, 270]) {
      const { pieces, laid, log } = layoutOn(f, generatorId, { rotationDeg })
      const what = `${generatorId} ${rotationDeg}°`
      assert.equal(pieces.length, 4)
      assert.equal(new Set(pieces.map((p) => p.sheet)).size, 1, log.join('\n'))
      assert.ok(log.some((l) => l.includes('wraps round to meet itself') && l.includes('200 mm circumference')), `${what}: ${log.join('\n')}`)
      assert.equal(pieces.filter((p) => p.closure).length, 2, 'the closure is recorded on both walls it joins')
      for (const p of pieces) assert.ok(p.period && Math.abs(Math.hypot(p.period[0], p.period[1]) * (p.frame!.scale) - 200) < 0.05, `${what}: every wall carries the 200 mm period`)
      for (const l of laid) {
        assert.equal(l.layout.closureJoined, !!l.piece.closure, `${what}: closure not joined: ${l.layout.log.join(' | ')}`)
        assert.equal(l.layout.repeatsAround, rotationDeg % 180 === 0 ? Math.round(200 / (l.layout.tileWidth / l.layout.stretch)) : Math.round(200 / (l.layout.tileHeight / l.layout.stretchY)))
        if (l.piece.closure) assert.ok(l.layout.log.some((s) => s.includes('meets itself')), l.layout.log.join(' | '))
      }
      // every wall is stretched the same way, so the repeat lattice is one lattice for the whole ring
      assert.equal(new Set(laid.map((l) => `${l.layout.stretch.toFixed(9)},${l.layout.stretchY.toFixed(9)}`)).size, 1)
      const e = edges(laid)
      assert.equal(e.length, 4, `${what}: four shared edges`)
      for (const x of e) {
        assert.ok(x.joined, `${what}: edge ${x.a}-${x.b} is not joined`)
        assert.ok(x.samples >= 490 && x.longest <= 0.3, `${what}: edge ${x.a}-${x.b}: ${x.mismatched}/${x.samples} mismatched, longest ${x.longest} mm`)
      }
    }
  } finally { f.body.delete() }
})

test('at a rotation the tile cannot repeat around, or with seam fitting off, the closing edge stays a cut and the layout says so', () => {
  const f = box(true)
  try {
    for (const s of [{ rotationDeg: 37 }, { rotationDeg: 0, fitSeam: false }]) {
      const { laid, log } = layoutOn(f, 'honeycomb', { ...s, margin: 2.5 })
      assert.ok(log.some((l) => l.includes('wraps round to meet itself')), 'the geometry still closes')
      for (const l of laid) {
        assert.equal(l.layout.closureJoined, false)
        if (l.piece.closure) assert.ok(l.layout.log.some((x) => x.includes('closing edge is left as a cut')), l.layout.log.join(' | '))
        assert.equal(toolMitres(l.piece, l.layout).length, l.piece.mitres.length, 'no mitre at an unjoined closure')
      }
      // the three tree folds are still joined; the closure carries its margin band on both sides
      const e = edges(laid)
      assert.equal(e.filter((x) => x.joined).length, 3)
      const closure = laid.filter((l) => l.piece.closure)
      assert.equal(closure.length, 2)
      const tmp = new Float32Array(3)
      for (const { piece, layout } of closure) {
        // no pattern within 2.5 mm of the closing edge: measure in 3D along the wall
        const v = piece.closure!.vertices[0], ex = piece.positions[v * 3], ey = piece.positions[v * 3 + 1]
        let nearest = Infinity
        for (const poly of layout.polygons) for (const [x, y] of poly) { layout.param.toSurface(x, y, 0, tmp); nearest = Math.min(nearest, Math.hypot(tmp[0] - ex, tmp[1] - ey)) }
        assert.ok(nearest >= 2.5 - 0.05, `pattern comes within ${nearest.toFixed(2)} mm of the unjoined closing edge`)
      }
    }
  } finally { f.body.delete() }
})

test('the ring closes by geometry: a rectangular container, another origin wall and a different root face', () => {
  for (const [w, d, origin] of [[50, 30, [50, 15, 25]], [50, 30, [10, 30, 40]], [80, 80, [0, 40, 20]]] as [number, number, V3][]) {
    const f = container(w, d, origin)
    try {
      const { pieces, laid, log } = layoutOn(f, 'honeycomb', {})
      const circumference = 2 * (w + d)
      assert.ok(log.some((l) => l.includes(`${circumference} mm circumference`)), log.join('\n'))
      for (const l of laid) assert.equal(l.layout.closureJoined, !!l.piece.closure, l.layout.log.join(' | '))
      assert.equal(laid.filter((l) => l.layout.closureJoined).length, 2)
      assert.ok(pieces.some((p) => p.region.length && p.origin.every((v, i) => Math.abs(v - origin[i]) < 1e-6)), 'the origin wall drives the frame')
      for (const x of edges(laid)) assert.ok(x.joined && x.longest <= 0.3, `${w}x${d} from ${origin}: edge ${x.a}-${x.b}: longest ${x.longest} mm`)
    } finally { f.body.delete() }
  }
})

test('three faces at a cube corner do not close: the third edge turns by 90° and stays cut, with a reason', () => {
  const f = box()
  const three = { ...f, region: select(f.mesh, [[1, 0, 0], [0, -1, 0], [0, 0, -1]], (x, y, z) => y < .001 || x > 49.999 || z < .001) }
  try {
    const { pieces, laid, log } = layoutOn(three, 'honeycomb', {})
    assert.equal(pieces.length, 3)
    assert.ok(log.some((l) => l.includes('left cut where the sheet meets itself') && l.includes('not parallel') && l.includes('90°')), log.join('\n'))
    assert.ok(pieces.every((p) => !p.closure && !p.period))
    for (const l of laid) assert.equal(l.layout.closureJoined, false)
  } finally { f.body.delete() }
})

test('the finished ring solid is one part with the requested relief on all four edges, and the closing edge agrees in 3D', () => {
  const f = box(true)
  try {
    for (const mode of ['emboss', 'recess', 'cut'] as Mode[]) {
      // filled diagnostic tile: every vertical edge of the box is a full mitred corner
      const { solid, laid, log } = filled(f, { mode, margin: 2.5, depth: 0.8, scale: 0.6 })
      try {
        assert.equal(solid.status(), 'NoError', log.join('\n'))
        assert.equal(laid.filter((l) => l.layout.closureJoined).length, 2, laid.map((l) => l.layout.log.join(' | ')).join('\n'))
        const d = 0.8
        for (const [cx, cy, sx, sy] of [[50, 0, 1, -1], [50, 50, 1, 1], [0, 50, -1, 1], [0, 0, -1, -1]] as [number, number, number, number][]) {
          const p = hit(solid, [cx + sx * 5, cy + sy * 5, 25], [cx - sx * 5, cy - sy * 5, 25])
          const what = `${mode} corner (${cx},${cy})`
          if (mode === 'emboss') assert.ok(p && Math.hypot(p[0] - (cx + sx * d), p[1] - (cy + sy * d)) <= 0.02, `${what}: ${p}`)
          else if (mode === 'recess') assert.ok(p && Math.hypot(p[0] - (cx - sx * d), p[1] - (cy - sy * d)) <= 0.02, `${what}: ${p}`)
          else assert.ok(!p || Math.hypot(p[0] - cx, p[1] - cy) > 2.5, `${what}: material left at ${p}`)
        }
        // a filled through-cut removes the whole wall between the two margin bands: rim and base part company
        const parts = solid.decompose().filter((x) => x.volume() > 0.01)
        assert.equal(parts.length, mode === 'cut' ? 2 : 1, `${mode}: ${parts.length} parts`)
      } finally { solid.delete() }
      // a real pattern: the closing edge of the finished solid agrees on both sides as well as the tree folds do
      const { laid: real } = layoutOn(f, 'honeycomb', { mode })
      const s = apply(f, real, mode)
      try {
        assert.equal(s.status(), 'NoError')
        assert.equal(s.decompose().filter((x) => x.volume() > 0.01).length, 1, `${mode}: the ring is one part`)
        const changed = Math.abs(s.volume() - f.body.volume())
        assert.ok(changed > 100, `${mode}: only ${changed.toFixed(1)} mm³ changed`)
      } finally { s.delete() }
    }
  } finally { f.body.delete() }
})
