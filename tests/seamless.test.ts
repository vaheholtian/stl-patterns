import { intervals, mismatch } from './seam-helpers.ts'
// Seam audit across settings: every generator that reports itself seamless
// must produce a tile whose cut feature has identical profiles on opposite box
// edges, after the full pipeline, for its default settings at several tile
// sizes and seeds, for both cut polarities, and with each parameter pushed to
// its limits one at a time. Generators that are not seamless must become so
// once mirrored. The raw generator output must also be periodic-complete: laying
// it at all nine offsets adds nothing inside the box (no content beyond one
// edge that fails to reappear inside the opposite edge, no strokes missing
// near an edge for lack of padding).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import Module from 'manifold-3d'
import type { CrossSection } from 'manifold-3d'
import { generators, defaultParams, isSeamless } from '../src/patterns/index.ts'
import { mirrorTile } from '../src/patterns/mirror.ts'
import { seededRandom } from '../src/geom/random.ts'
import { strokePolyline, tileToCrossSection } from '../src/patterns/pipeline.ts'
import type { Generator, ParamValue, Pt, Tile } from '../src/patterns/types.ts'

const m = await Module(); m.setup()
type Params = Record<string, ParamValue>

function assertEdgesMatch(cs: CrossSection, w: number, h: number, label: string) {
  const polys = cs.toPolygons() as Pt[][]
  for (const axis of [0, 1]) {
    const diff = mismatch(intervals(polys, axis, 0), intervals(polys, axis, axis ? h : w))
    assert.ok(diff.max <= .02, `${label}: axis ${axis}: ${JSON.stringify(diff)}`)
  }
}

/** The generator's output as drawn, uncropped and unsimplified (simplification is not translation invariant). */
function rawFeature(tile: Tile): CrossSection {
  const parts: CrossSection[] = []
  if (tile.polygons.length) parts.push(new m.CrossSection(tile.polygons, 'EvenOdd'))
  const loops: Pt[][] = []
  for (const c of tile.curves) loops.push(...strokePolyline(c.points, c.closed, tile.ribWidth))
  if (loops.length) parts.push(new m.CrossSection(loops, 'NonZero'))
  const raw = parts.length === 1 ? parts[0] : m.CrossSection.union(parts)
  if (parts.length > 1) for (const p of parts) p.delete()
  return raw
}

/** Returns true when the drawn content stays clear of every box edge by more than the
 * pipeline can grow it, so no seam check can find anything: nothing beyond the box, and
 * the periodic pipeline cannot put material on an edge. */
function assertPeriodicComplete(tile: Tile, label: string): boolean {
  const raw = rawFeature(tile)
  const b = raw.bounds()
  const margin = Math.min(b.min[0], b.min[1], tile.width - b.max[0], tile.height - b.max[1])
  if (margin >= 0) { raw.delete(); return margin > 1 } // nothing beyond the box
  const box = m.CrossSection.square([tile.width, tile.height], false)
  const plain = m.CrossSection.intersection(raw, box)
  const copies: CrossSection[] = []
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) copies.push(raw.translate([x * tile.width, y * tile.height]))
  const union = m.CrossSection.union(copies)
  const cropped = m.CrossSection.intersection(union, box)
  const diff = m.CrossSection.difference(cropped, plain)
  const extra = diff.area()
  for (const c of [raw, box, plain, ...copies, union, cropped, diff]) c.delete()
  assert.ok(extra < 0.05, `${label}: ${extra.toFixed(3)} mm² of periodic content is missing from the tile`)
  return false
}

function locked(g: Generator): Params {
  const p = defaultParams(g)
  for (const q of g.params) if (q.seamlessValue !== undefined) p[q.key] = q.seamlessValue
  return p
}

function build(g: Generator, params: Params, seed: number): Tile {
  const raw = g.generate({ ...params, seed }, { rand: seededRandom(seed) })
  for (const q of [...raw.polygons.flat(), ...raw.curves.flatMap((c) => c.points)]) assert.ok(Number.isFinite(q[0]) && Number.isFinite(q[1]), 'finite coordinates')
  return isSeamless(g, { ...params, seed }) ? raw : mirrorTile(raw)
}

function check(g: Generator, params: Params, seed: number, label: string, polarities: boolean[] = [Boolean(g.cutoutDefault)]) {
  const tile = build(g, params, seed)
  if (isSeamless(g, { ...params, seed }) && assertPeriodicComplete(tile, label)) return // a contained motif: edges stay empty
  for (const invert of polarities) {
    const cs = tileToCrossSection(m, tile, { periodic: true, invert, minFeature: 0.84 })
    try { assertEdgesMatch(cs, tile.width, tile.height, `${label} invert=${invert}`) } finally { cs.delete() }
  }
}

const SIZES: Pt[] = [[40, 40], [23, 37], [100, 45], [7, 61]]

// The pattern library is 330 third-party drawings rather than one generator's
// output, and a few of them genuinely do not satisfy the properties asserted
// here. It is measured design by design in pattern-library.test.ts instead,
// with the shortfalls pinned by name, so this sweep stays strict for the
// generators it was written for.
for (const g of generators.filter((g) => g.id !== 'library')) {
  const base = locked(g)
  test(`${g.name}: default settings repeat across both edges at several sizes and seeds`, () => {
    for (const [width, height] of SIZES) check(g, { ...base, width, height }, 1, `${g.id} ${width}x${height} seed 1`, [false, true])
    check(g, { ...base, width: 40, height: 40 }, 7, `${g.id} 40x40 seed 7`, [false, true])
  })
  test(`${g.name}: every parameter at its limits keeps the seam`, () => {
    for (const p of g.params) {
      if (['width', 'height', 'seed'].includes(p.key) || p.seamlessValue !== undefined) continue
      const values: ParamValue[] = p.type === 'select' ? (p.options ?? []).map((o) => o.value)
        : p.type === 'boolean' ? [true, false]
        : [p.min ?? 0, p.max ?? 100, ((p.min ?? 0) + (p.max ?? 100)) / 2].map((v) => p.type === 'int' ? Math.round(v) : v)
      for (const v of values) {
        if (v === p.default) continue
        check(g, { ...base, [p.key]: v, width: 40, height: 40 }, 7, `${g.id} ${p.key}=${v} 40x40`)
      }
    }
  })
}
