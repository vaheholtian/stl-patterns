import type { GeneratorParam, ParamValue, Pt, Tile, TileCurve } from './types'
import { getNum } from './types'

export const continuousParams: GeneratorParam[] = [
  { key: 'width', label: 'Width (mm)', type: 'number', default: 60, min: 5, max: 300, step: 1 },
  { key: 'height', label: 'Height (mm)', type: 'number', default: 60, min: 5, max: 300, step: 1 },
  { key: 'ribWidth', label: 'Rib width (mm)', type: 'number', default: 1.6, min: 0.4, max: 6, step: 0.1 },
]
export const seedParam: GeneratorParam = { key: 'seed', label: 'Seed', type: 'int', default: 1, min: 0, max: 999999 }
export function bounded(p: Record<string, ParamValue>, key: string, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, getNum(p, key, fallback)))
}
export function baseTile(p: Record<string, ParamValue>): Tile {
  return { width: bounded(p, 'width', 60, 5, 600), height: bounded(p, 'height', 60, 5, 600),
    ribWidth: bounded(p, 'ribWidth', 1.6, 0.1, 20), polygons: [], curves: [] }
}
/** Fit a path without cropping it: clipping a continuous curve can create islands. */
export function fitPath(points: Pt[], tile: Tile): Pt[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  const pad = Math.min(Math.min(tile.width, tile.height) * 0.2, Math.max(tile.ribWidth, 1))
  const s = Math.min((tile.width - 2 * pad) / Math.max(x1 - x0, 1e-9), (tile.height - 2 * pad) / Math.max(y1 - y0, 1e-9))
  return points.map(([x, y]) => [(x - (x0 + x1) / 2) * s + tile.width / 2, (y - (y0 + y1) / 2) * s + tile.height / 2])
}
/** Quadratic corner rounding retains straight-through crossing positions. */
export function roundPath(points: Pt[], closed: boolean, amount: number): TileCurve {
  if (!amount) return { points, closed }
  const out: Pt[] = []
  for (let i = 0; i < points.length; i++) {
    const b = points[i]
    if (!closed && (i === 0 || i === points.length - 1)) { out.push(b); continue }
    const a = points[(i + points.length - 1) % points.length], c = points[(i + 1) % points.length]
    const u: Pt = [b[0] + (a[0] - b[0]) * amount, b[1] + (a[1] - b[1]) * amount]
    const v: Pt = [b[0] + (c[0] - b[0]) * amount, b[1] + (c[1] - b[1]) * amount]
    for (let j = 0; j <= 6; j++) {
      const t = j / 6, s = 1 - t
      out.push([s * s * u[0] + 2 * s * t * b[0] + t * t * v[0], s * s * u[1] + 2 * s * t * b[1] + t * t * v[1]])
    }
  }
  return { points: out, closed }
}
