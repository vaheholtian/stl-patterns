// Z^4 cut-and-project, with a strained octagonal acceptance window.
// Pell convergents a/b -> sqrt(2) give periods (a,b,0,-b), (0,b,a,b).
// Both the projection and the window are strained, as in the Penrose generator.
import type { Generator, Pt } from './types'
import { baseTile, bounded, continuousParams, seedParam } from './continuous'

const t = Math.SQRT1_2
const E: Pt[] = [[1, 0], [t, t], [0, 1], [-t, t]]
const F: Pt[] = [[1, 0], [-t, t], [0, -1], [t, t]]
const cross = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
function hull(points: Pt[]): Pt[] {
  const sorted = points.sort((a, b) => a[0] - b[0] || a[1] - b[1]), lower: Pt[] = [], upper: Pt[] = []
  for (const p of sorted) { while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-10) lower.pop(); lower.push(p) }
  for (const p of sorted.slice().reverse()) { while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-10) upper.pop(); upper.push(p) }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}
export const ammannBeenkerGenerator: Generator = {
  id: 'ammannBeenker', name: 'Ammann–Beenker (Pell repeat)', cutoutDefault: true, seamless: () => true,
  description: 'Eightfold square-and-rhombus edge network, made periodic with a Pell-number projection. Higher order gives a denser, less strained repeat.',
  params: [...continuousParams,
    { key: 'order', label: 'Pell order', type: 'int', default: 2, min: 1, max: 3 }, seedParam],
  generate(p, ctx) {
    const tile = baseTile(p), order = Math.round(bounded(p, 'order', 2, 1, 3))
    const [a, b] = [[3, 2], [7, 5], [17, 12]][order - 1]
    const period = a + Math.SQRT2 * b, lx = (a - Math.SQRT2 * b) / period, ly = -lx
    const unit = tile.width / period
    tile.height = tile.width
    const windowPoints: Pt[] = []
    for (let mask = 0; mask < 16; mask++) {
      let x = 0, y = 0
      for (let k = 0; k < 4; k++) { const s = mask & (1 << k) ? 0.5 : -0.5; x += s * (F[k][0] - lx * E[k][0]); y += s * (F[k][1] - ly * E[k][1]) }
      windowPoints.push([x, y])
    }
    const window = hull(windowPoints), radius = Math.max(...window.map(([x, y]) => Math.hypot(x, y))) + 0.01
    const shift: Pt = [(ctx.rand() - 0.5) * 0.5, (ctx.rand() - 0.5) * 0.5]
    const margin = Math.max(2, tile.ribWidth / unit), lo = -margin, hi = period + margin
    const range = Math.ceil(period + margin + radius + 2)
    const accepted = new Map<string, { n: number[]; at: Pt }>()
    for (let n1 = -range; n1 <= range; n1++) for (let n3 = -range; n3 <= range; n3++) {
      const cx = ((1 + lx) * t * (n1 - n3) + shift[0]) / (1 - lx)
      const cy = ((1 - ly) * t * (n1 + n3) - shift[1]) / (1 + ly)
      for (let n0 = Math.ceil(cx - radius / (1 - lx)); n0 <= Math.floor(cx + radius / (1 - lx)); n0++) {
        const x = n0 + t * (n1 - n3)
        if (x < lo || x > hi) continue
        for (let n2 = Math.ceil(cy - radius / (1 + ly)); n2 <= Math.floor(cy + radius / (1 + ly)); n2++) {
          const y = n2 + t * (n1 + n3)
          if (y < lo || y > hi) continue
          const q: Pt = [n0 - t * (n1 - n3) - lx * x - shift[0], -n2 + t * (n1 + n3) - ly * y - shift[1]]
          if (window.some((v, i) => cross(v, window[(i + 1) % window.length], q) < -1e-10)) continue
          const n = [n0, n1, n2, n3]
          accepted.set(n.join(','), { n, at: [x * unit, y * unit] })
        }
      }
    }
    for (const { n, at } of accepted.values()) for (let k = 0; k < 4; k++) {
      const other = n.slice(); other[k]++
      const target = accepted.get(other.join(','))
      if (target) tile.curves.push({ points: [at, target.at], closed: false })
    }
    tile.notes = [`Square repeat ${tile.width.toFixed(1)} mm; edge ${unit.toFixed(2)} mm; Pell ratio ${a}/${b}. Connected edge network, not a single stroke.`]
    return tile
  },
}
