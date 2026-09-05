// Hankin rays on the regular 4.8.8 (square/octagon) tiling.
// Pair forward intersections greedily by total length (Kaplan 2005, §3).
import type { Generator, Pt, TileCurve } from './types'
import { baseTile, bounded, continuousParams } from './continuous'

const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0]
export function hankinMotif(poly: Pt[], angle: number): TileCurve[] {
  const rays: { at: Pt; dir: Pt }[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const dx = (b[0] - a[0]) / len, dy = (b[1] - a[1]) / len
    for (const sign of [1, -1]) rays.push({ at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dir: [sign * dx * Math.cos(angle) - dy * Math.sin(angle), sign * dy * Math.cos(angle) + dx * Math.sin(angle)] })
  }
  const candidates: { a: number; b: number; cost: number; at: Pt }[] = []
  for (let i = 0; i < rays.length; i++) for (let j = i + 1; j < rays.length; j++) {
    if (Math.floor(i / 2) === Math.floor(j / 2)) continue
    const a = rays[i], b = rays[j], d: Pt = [b.at[0] - a.at[0], b.at[1] - a.at[1]], det = cross(a.dir, b.dir)
    if (Math.abs(det) < 1e-9) {
      if (Math.abs(cross(d, a.dir)) < 1e-8 && d[0] * a.dir[0] + d[1] * a.dir[1] > 0 && a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1] < 0) candidates.push({ a: i, b: j, cost: Math.hypot(...d), at: [(a.at[0] + b.at[0]) / 2, (a.at[1] + b.at[1]) / 2] })
      continue
    }
    const t = cross(d, b.dir) / det, u = cross(d, a.dir) / det
    if (t <= 1e-8 || u <= 1e-8) continue
    const at: Pt = [a.at[0] + t * a.dir[0], a.at[1] + t * a.dir[1]]
    if (poly.some((v, k) => { const w = poly[(k + 1) % poly.length]; return cross([w[0] - v[0], w[1] - v[1]], [at[0] - v[0], at[1] - v[1]]) < -1e-8 })) continue
    candidates.push({ a: i, b: j, cost: t + u, at })
  }
  candidates.sort((a, b) => a.cost - b.cost || a.a - b.a || a.b - b.b)
  const used = new Set<number>(), curves: TileCurve[] = []
  for (const c of candidates) if (!used.has(c.a) && !used.has(c.b)) {
    used.add(c.a); used.add(c.b); curves.push({ points: [rays[c.a].at, c.at, rays[c.b].at], closed: false })
  }
  if (used.size !== rays.length) throw new Error('Contact angle leaves unmatched rays; try another angle')
  return curves
}
export const hankinGenerator: Generator = {
  id: 'hankin', name: 'Islamic star strapwork', cutoutDefault: true, seamless: () => true,
  description: 'Periodic eight-point star strapwork on squares and octagons. Contact angle changes the motif; crossings remain fused for cutouts.',
  params: [...continuousParams,
    { key: 'columns', label: 'Columns', type: 'int', default: 2, min: 1, max: 8 },
    { key: 'rows', label: 'Rows', type: 'int', default: 2, min: 1, max: 8 },
    { key: 'angle', label: 'Contact angle (°)', type: 'number', default: 60, min: 25, max: 75, step: 1 }],
  generate(p) {
    const tile = baseTile(p), cols = Math.round(bounded(p, 'columns', 2, 1, 8)), rows = Math.round(bounded(p, 'rows', 2, 1, 8))
    const angle = bounded(p, 'angle', 60, 25, 75) * Math.PI / 180, pitch = tile.width / cols
    tile.height = pitch * rows
    const q = (Math.SQRT2 - 1) / 2
    const oct: Pt[] = [[-q, -0.5], [q, -0.5], [0.5, -q], [0.5, q], [q, 0.5], [-q, 0.5], [-0.5, q], [-0.5, -q]]
    const d = 0.5 - q, square: Pt[] = [[0, -d], [d, 0], [0, d], [-d, 0]]
    const motifs = [hankinMotif(oct, angle), hankinMotif(square, angle)]
    for (let y = -1; y <= rows; y++) for (let x = -1; x <= cols; x++) for (let k = 0; k < 2; k++) {
      for (const c of motifs[k]) tile.curves.push({ closed: false, points: c.points.map(([px, py]) => [(px + x + (k ? 1 : 0.5)) * pitch, (py + y + (k ? 1 : 0.5)) * pitch]) })
    }
    tile.notes = [`Height set to ${tile.height.toFixed(1)} mm to preserve regular polygons and whole repeats. Multiple strands; use bridges to connect any separate components.`]
    return tile
  },
}
