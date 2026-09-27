/**
 * Which material a through-cut leaves loose, from the tile alone.
 *
 * ringParts() answers "how many pieces" by rasterising a ring of wall. That is
 * the reference figure on every card, but it says nothing about *which* material
 * falls out, and a raster cannot be drawn or subtracted. This is the same model
 * in vector form: every cut shape grown by one nozzle line so a neck under two
 * lines wide closes up, the remaining material split into connected components,
 * and those components joined across the tile's seams, where opposite edges are
 * literally the same polygons translated.
 *
 * Two questions come out of that graph:
 *  - the piece count on the ring ringParts() measures (four repeats around and
 *    up, wrapped around, solid margins above and below), so the live figure
 *    agrees with the reference table;
 *  - which components are loose on a wall of any size: a component is held when
 *    its class of copies has a cycle that climbs (a net translation with a
 *    vertical part), because only such a network reaches the margins from
 *    every row. Islands have no cycle; a band that runs around the ring has a
 *    horizontal one only. Both come off the plate on their own.
 */
import type { CrossSection, ManifoldToplevel } from 'manifold-3d'
import type { Pt, Tile } from './types'
import { crossSectionToPolygons, polygonsArea, tileToCrossSection } from './pipeline'

export interface LooseOptions {
  /** connections narrower than two of these cannot be printed and hold nothing, mm */
  lineWidth?: number
  /** copies around the ring and up it */
  repeats?: number
  /** pieces smaller than this at a 50 mm repeat are crumbs, not parts, mm² */
  minArea?: number
}

export interface PieceReport {
  /** printable pieces the ring falls into; 1 means whole, 0 means the tile cuts nothing */
  pieces: number
  /** loose material in tile coordinates, in the grown model (one nozzle line inside its true outline) */
  loose: Pt[][]
  /** loose pieces per repeat, crumbs aside */
  loosePieces: number
  /** loose bits per repeat too small to count as parts, under `minArea` at a 50 mm repeat */
  crumbs: number
  /** mm² of loose material per repeat, grown model */
  looseArea: number
  /** mm² of all material per repeat, grown model */
  materialArea: number
}

const EPS = 1e-4

/** Runs of a component's boundary that lie on one side of the tile box. */
function sideIntervals(loops: Pt[][], axis: 0 | 1, at: number): [number, number][] {
  const out: [number, number][] = []
  const other = axis === 0 ? 1 : 0
  for (const loop of loops) for (let i = 0; i < loop.length; i++) {
    const p = loop[i], q = loop[(i + 1) % loop.length]
    if (Math.abs(p[axis] - at) < EPS && Math.abs(q[axis] - at) < EPS) {
      const a = p[other], b = q[other]
      if (Math.abs(a - b) > EPS) out.push([Math.min(a, b), Math.max(a, b)])
    }
  }
  return out
}

function overlaps(a: [number, number][], b: [number, number][]): boolean {
  for (const [a0, a1] of a) for (const [b0, b1] of b) if (Math.min(a1, b1) - Math.max(a0, b0) > EPS) return true
  return false
}

/** Feature polygons grown by one nozzle line in the tile's own repeat, cropped to the tile. */
function grownFeature(m: ManifoldToplevel, own: <T extends { delete(): void }>(c: T) => T, polygons: Pt[][], w: number, h: number, lineWidth: number): CrossSection {
  const copies: CrossSection[] = []
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
    copies.push(own(own(new m.CrossSection(polygons, 'EvenOdd')).translate([dx * w, dy * h])))
  const fat = own(own(m.CrossSection.union(copies)).offset(lineWidth, 'Round', 2, 16))
  return own(m.CrossSection.intersection(fat, own(m.CrossSection.square([w, h], false))))
}

/**
 * Count the pieces a ring of wall falls into and pick out the loose material.
 * `polygons` are the cut shapes in tile coordinates, as the pipeline returns them.
 */
export function analyzePieces(m: ManifoldToplevel, polygons: Pt[][], w: number, h: number, opts: LooseOptions = {}): PieceReport {
  const { lineWidth = 0.42, repeats = 4, minArea = 2 } = opts
  const empty: PieceReport = { pieces: 0, loose: [], loosePieces: 0, crumbs: 0, looseArea: 0, materialArea: 0 }
  if (!polygons.length) return empty
  const owned: { delete(): void }[] = []
  const own = <T extends { delete(): void }>(c: T) => (owned.push(c), c)
  try {
    const grown = grownFeature(m, own, polygons, w, h, lineWidth)
    if (grown.isEmpty()) return empty
    const material = own(m.CrossSection.difference(own(m.CrossSection.square([w, h], false)), grown))
    const comps = material.decompose(); owned.push(...comps)
    const loops = comps.map((c) => crossSectionToPolygons(c))
    const areas = loops.map(polygonsArea)
    const n = loops.length
    const left = loops.map((l) => sideIntervals(l, 0, 0)), right = loops.map((l) => sideIntervals(l, 0, w))
    const bottom = loops.map((l) => sideIntervals(l, 1, 0)), top = loops.map((l) => sideIntervals(l, 1, h))

    // Seam contacts: the copy of j translated by t touches i.
    const edges: { i: number; j: number; t: Pt }[] = []
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (right[i].length && left[j].length && overlaps(right[i], left[j])) edges.push({ i, j, t: [1, 0] })
      if (top[i].length && bottom[j].length && overlaps(top[i], bottom[j])) edges.push({ i, j, t: [0, 1] })
    }

    // Classes of copies: weighted union-find, each node's position relative to its root in repeats.
    // off[i] is i's position relative to parent[i]; a root sits at [0, 0].
    const parent = loops.map((_, i) => i), off: Pt[] = loops.map(() => [0, 0]), held = loops.map(() => false)
    const find = (i: number): number => {
      if (parent[i] === i) return i
      const p = parent[i], r = find(p)
      off[i] = [off[i][0] + off[p][0], off[i][1] + off[p][1]]
      parent[i] = r
      return r
    }
    for (const { i, j, t } of edges) {
      const ri = find(i), rj = find(j), pi = off[i], pj = off[j]
      const cycle: Pt = [pi[0] + t[0] - pj[0], pi[1] + t[1] - pj[1]]
      if (ri === rj) { if (cycle[1] !== 0) held[ri] = true; continue }
      parent[rj] = ri; off[rj] = cycle
      held[ri] = held[ri] || held[rj]
    }

    // The ring: `repeats` columns wrapped around, `repeats` rows, a solid margin above and below.
    const R = repeats, BOTTOM = n * R * R, TOP = BOTTOM + 1
    const ring = new Int32Array(TOP + 1).map((_, i) => i)
    const rf = (i: number): number => { while (ring[i] !== i) { ring[i] = ring[ring[i]]; i = ring[i] } return i }
    const ru = (a: number, b: number) => { const x = rf(a), y = rf(b); if (x !== y) ring[x] = y }
    const node = (i: number, c: number, r: number) => (r * R + ((c % R) + R) % R) * n + i
    for (const { i, j, t } of edges) for (let r = 0; r < R; r++) for (let c = 0; c < R; c++) {
      const r2 = r + t[1]
      if (r2 < 0 || r2 >= R) continue
      ru(node(i, c, r), node(j, c + t[0], r2))
    }
    for (let i = 0; i < n; i++) for (let c = 0; c < R; c++) {
      if (bottom[i].length) ru(node(i, c, 0), BOTTOM)
      if (top[i].length) ru(node(i, c, R - 1), TOP)
    }
    const pieceArea = new Map<number, number>()
    for (let r = 0; r < R; r++) for (let c = 0; c < R; c++) for (let i = 0; i < n; i++) {
      const root = rf(node(i, c, r)); pieceArea.set(root, (pieceArea.get(root) ?? 0) + areas[i])
    }
    for (const margin of [BOTTOM, TOP]) { const root = rf(margin); pieceArea.set(root, (pieceArea.get(root) ?? 0) + Infinity) }
    const crumb = minArea * (w / 50) ** 2
    let parts = 0
    for (const a of pieceArea.values()) if (a >= crumb) parts++
    const pieces = parts || pieceArea.size

    const loose: Pt[][] = []
    const classArea = new Map<number, number>()
    let looseArea = 0, materialArea = 0
    for (let i = 0; i < n; i++) {
      materialArea += areas[i]
      const r = find(i)
      if (held[r]) continue
      classArea.set(r, (classArea.get(r) ?? 0) + areas[i]); looseArea += areas[i]; loose.push(...loops[i])
    }
    let loosePieces = 0, crumbs = 0
    for (const a of classArea.values()) { if (a >= crumb) loosePieces++; else crumbs++ }
    return { pieces, loose, loosePieces, crumbs, looseArea, materialArea }
  } finally { for (const c of owned) c.delete() }
}

/** Even-odd point-in-polygon over a set of loops. */
function inside(loops: Pt[][], [x, y]: Pt): boolean {
  let odd = false
  for (const loop of loops) for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i], [xj, yj] = loop[j]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) odd = !odd
  }
  return odd
}

/** A vertex of the loops that is not on the tile box, where it would sit on two boundaries at once. */
function probePoint(loops: Pt[][], w: number, h: number): Pt | null {
  for (const loop of loops) for (const p of loop) {
    if (p[0] > EPS && p[0] < w - EPS && p[1] > EPS && p[1] < h - EPS) return p
  }
  return null
}

/**
 * Cut the loose material away and return the new cut shapes.
 *
 * The grown model shrinks every material component one line inward, so each
 * grown component sits inside exactly one component of the true material. A true
 * component whose grown contents are all loose comes out whole, outline and all,
 * so nothing has to be offset back. A true component that also carries held
 * material only hangs on through necks under two lines wide: there the loose
 * pieces come out at their true size, and the thin residue that touched them
 * with them. Material too thin to survive the growth at all is unprintable and
 * comes out too. The result goes back through the periodic clean-up so the
 * seams still match.
 */
export function removeLoose(m: ManifoldToplevel, tile: Tile, polygons: Pt[][], loose: Pt[][], opts: { lineWidth: number; periodic: boolean }): Pt[][] {
  if (!loose.length) return polygons
  const { lineWidth, periodic } = opts
  const w = tile.width, h = tile.height
  const owned: { delete(): void }[] = []
  const own = <T extends { delete(): void }>(c: T) => (owned.push(c), c)
  try {
    const box = own(m.CrossSection.square([w, h], false))
    const feature = own(new m.CrossSection(polygons, 'EvenOdd'))
    const trueParts = own(m.CrossSection.difference(box, feature)).decompose(); owned.push(...trueParts)
    const trueLoops = trueParts.map((c) => crossSectionToPolygons(c))
    // which true component holds each grown component, loose or held
    const grown = grownFeature(m, own, polygons, w, h, lineWidth)
    const grownMaterial = own(m.CrossSection.difference(box, grown))
    const looseCs = own(new m.CrossSection(loose, 'EvenOdd'))
    const heldParts = own(m.CrossSection.difference(grownMaterial, looseCs)).decompose(); owned.push(...heldParts)
    const looseParts = looseCs.decompose(); owned.push(...looseParts)
    const hasLoose = trueLoops.map(() => false), hasHeld = trueLoops.map(() => false)
    const looseIn: CrossSection[][] = trueLoops.map(() => [])
    const locate = (cs: CrossSection): number => {
      const p = probePoint(crossSectionToPolygons(cs), w, h)
      if (!p) return -1
      return trueLoops.findIndex((loops) => inside(loops, p))
    }
    for (const part of heldParts) { const k = locate(part); if (k >= 0) hasHeld[k] = true }
    for (const part of looseParts) { const k = locate(part); if (k >= 0) { hasLoose[k] = true; looseIn[k].push(part) } }

    const cut: CrossSection[] = [feature]
    for (let k = 0; k < trueParts.length; k++) {
      if (!hasHeld[k]) { cut.push(trueParts[k]); continue }   // all loose, or too thin to print at all
      if (!hasLoose[k]) continue
      // hangs on through a neck: the loose pieces at true size, plus thin residue touching them
      const removed = own(own(m.CrossSection.union(looseIn[k])).offset(lineWidth + 1e-6, 'Round', 2, 16))
      const rest = own(m.CrossSection.difference(trueParts[k], removed))
      const opened = own(own(rest.offset(-(lineWidth + 1e-6), 'Round', 2, 16)).offset(lineWidth, 'Round', 2, 16))
      const thinParts = own(m.CrossSection.difference(rest, opened)).decompose(); owned.push(...thinParts)
      const reach = own(removed.offset(2 * EPS, 'Round', 2, 8))
      cut.push(removed)
      for (const part of thinParts) if (!own(m.CrossSection.intersection(part, reach)).isEmpty()) cut.push(part)
    }
    const merged = own(m.CrossSection.union(cut))
    const synthetic: Tile = { width: w, height: h, ribWidth: tile.ribWidth, polygons: crossSectionToPolygons(merged), curves: [] }
    const cs = own(tileToCrossSection(m, synthetic, { invert: false, minFeature: lineWidth * 2, periodic }))
    return crossSectionToPolygons(cs)
  } finally { for (const c of owned) c.delete() }
}
