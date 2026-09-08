import type { Pt } from './types'

/** Convex erosion by all inward-offset half-planes. Handles disappearing edges,
 * either winding and a repeated closing vertex; collapsed regions stay empty. */
export function insetConvexPolygon(input: Pt[], distance: number): Pt[] | null {
  if (!Number.isFinite(distance) || input.length < 3 || input.some(p => !p.every(Number.isFinite))) return null
  const origin = input[0]
  const area = (p: Pt[]) => p.reduce((sum, a, i) => {
    const b = p[(i + 1) % p.length]
    return sum + (a[0] - origin[0]) * (b[1] - origin[1]) - (b[0] - origin[0]) * (a[1] - origin[1])
  }, 0) / 2
  const extent = Math.max(1, ...input.map(p => Math.hypot(p[0] - origin[0], p[1] - origin[1])))
  const eps = extent * 1e-10
  const clean = (points: Pt[]) => {
    const out: Pt[] = []
    for (const p of points) if (!out.length || Math.hypot(p[0] - out.at(-1)![0], p[1] - out.at(-1)![1]) > eps) out.push(p)
    if (out.length > 1 && Math.hypot(out[0][0] - out.at(-1)![0], out[0][1] - out.at(-1)![1]) <= eps) out.pop()
    return out
  }
  const polygon = clean(input), signed = area(polygon)
  if (polygon.length < 3 || Math.abs(signed) <= eps * extent) return null
  if (distance <= 0) return polygon.slice()
  const sign = Math.sign(signed)
  let out = polygon.slice()
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length]
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy)
    const nx = -sign * dy / length, ny = sign * dx / length
    const side = (p: Pt) => (p[0] - a[0]) * nx + (p[1] - a[1]) * ny - distance
    const clipped: Pt[] = []
    for (let j = 0; j < out.length; j++) {
      const p = out[j], q = out[(j + 1) % out.length], vp = side(p), vq = side(q)
      if (vp >= 0) clipped.push(p)
      if ((vp >= 0) !== (vq >= 0)) {
        const t = vp / (vp - vq)
        clipped.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])])
      }
    }
    out = clean(clipped)
    if (out.length < 3) return null
  }
  return Math.abs(area(out)) > eps * extent ? out : null
}
