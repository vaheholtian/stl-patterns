// Sunflower phyllotaxis layout: point i sits at radius c*sqrt(i) and angle
// i*137.508 degrees from the tile centre. Points outside the box's inscribed
// circle are dropped, so the pattern is centred and self-contained but does
// NOT repeat seamlessly across tile edges.

import { Delaunay } from 'd3-delaunay'
import type { Generator, GeneratorContext, ParamValue, Pt } from './types'
import { getNum } from './types'
import { insetConvexPolygon } from './voronoiTile'

const GOLDEN_ANGLE = 137.508 * (Math.PI / 180)

function circlePolygon(cx: number, cy: number, radius: number, segments: number): Pt[] {
  const pts: Pt[] = []
  for (let k = 0; k < segments; k++) {
    const a = (k / segments) * Math.PI * 2
    pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)])
  }
  return pts
}

/** Sutherland-Hodgman clip of `subject` to convex polygon `clip` (either winding order). */
function clipPolygonToConvex(subject: Pt[], clipIn: Pt[]): Pt[] {
  let clip = clipIn
  let area = 0
  for (let i = 0; i < clip.length; i++) {
    const [x0, y0] = clip[i]
    const [x1, y1] = clip[(i + 1) % clip.length]
    area += x0 * y1 - x1 * y0
  }
  if (area < 0) clip = clip.slice().reverse()

  let output = subject
  const m = clip.length
  for (let i = 0; i < m && output.length > 0; i++) {
    const a = clip[i], b = clip[(i + 1) % m]
    const inside = (p: Pt) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-9
    const intersect = (p: Pt, q: Pt): Pt => {
      const a1 = b[1] - a[1], b1 = a[0] - b[0], c1 = a1 * a[0] + b1 * a[1]
      const a2 = q[1] - p[1], b2 = p[0] - q[0], c2 = a2 * p[0] + b2 * p[1]
      const det = a1 * b2 - a2 * b1
      if (Math.abs(det) < 1e-12) return p
      return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det]
    }
    const input = output
    const n = input.length
    const next: Pt[] = []
    for (let j = 0; j < n; j++) {
      const cur = input[j]
      const prev = input[(j - 1 + n) % n]
      const curIn = inside(cur)
      const prevIn = inside(prev)
      if (curIn) {
        if (!prevIn) next.push(intersect(prev, cur))
        next.push(cur)
      } else if (prevIn) {
        next.push(intersect(prev, cur))
      }
    }
    output = next
  }
  return output
}

export const phyllotaxisGenerator: Generator = {
  id: 'phyllotaxis',
  name: 'Phyllotaxis spiral',
  description: 'Sunflower-spiral dot or cell layout, centred on the tile and kept inside its inscribed circle, so repeats are seamless (a grid of medallions).',
  params: [
    { key: 'width', label: 'Width', type: 'number', default: 40, min: 5, max: 300, step: 1, hint: 'tile width, mm' },
    { key: 'height', label: 'Height', type: 'number', default: 40, min: 5, max: 300, step: 1, hint: 'tile height, mm' },
    { key: 'count', label: 'Point count', type: 'int', default: 300, min: 1, max: 2000, step: 1 },
    { key: 'spacing', label: 'Spacing', type: 'number', default: 2.2, min: 0.5, max: 20, step: 0.1, hint: 'radial spacing constant c, mm' },
    { key: 'dotSize', label: 'Dot size', type: 'number', default: 2.2, min: 0.6, max: 20, step: 0.1, hint: 'dot diameter, mm (dots style)' },
    {
      key: 'style', label: 'Style', type: 'select', default: 'dots',
      options: [
        { value: 'dots', label: 'Dots' },
        { value: 'cells', label: 'Cells' },
      ],
    },
    { key: 'ribWidth', label: 'Rib width', type: 'number', default: 1.6, min: 0.2, max: 6, step: 0.1, hint: 'rib width between cells, mm (cells style)' },
    { key: 'grow', label: 'Grow', type: 'number', default: 1, min: 0, max: 4, step: 0.1, hint: 'dot diameter grows as (r/maxRadius)^grow; 0 = constant' },
    { key: 'seed', label: 'Seed', type: 'int', default: 1, min: 0, max: 999999, step: 1, hint: 'rotates the spiral start angle' },
  ],
  generate(params: Record<string, ParamValue>, ctx: GeneratorContext) {
    const width = getNum(params, 'width', 40)
    const height = getNum(params, 'height', 40)
    const count = Math.max(1, Math.round(getNum(params, 'count', 300)))
    const spacing = Math.max(0.01, getNum(params, 'spacing', 2.2))
    const dotSize = Math.max(0.1, getNum(params, 'dotSize', 2.2))
    const style = String(params.style ?? 'dots')
    const ribWidth = getNum(params, 'ribWidth', 1.6)
    const grow = Math.max(0, getNum(params, 'grow', 1))

    const cx = width / 2, cy = height / 2
    const maxRadius = Math.max(1e-6, Math.min(width, height) / 2)
    const rot = ctx.rand() * Math.PI * 2

    const points: { p: Pt; r: number }[] = []
    for (let i = 0; i < count; i++) {
      const r = spacing * Math.sqrt(i)
      if (r > maxRadius) continue
      const theta = i * GOLDEN_ANGLE + rot
      points.push({ p: [cx + r * Math.cos(theta), cy + r * Math.sin(theta)], r })
    }

    const polygons: Pt[][] = []

    if (style === 'cells' && points.length >= 3) {
      const half = ribWidth / 2
      const seeds = points.map((pt) => pt.p)
      const bound = maxRadius * 2 + 10
      const delaunay = Delaunay.from(seeds)
      const voronoi = delaunay.voronoi([cx - bound, cy - bound, cx + bound, cy + bound])
      const clipCircle = circlePolygon(cx, cy, maxRadius, 72)
      for (let i = 0; i < seeds.length; i++) {
        const cell = voronoi.cellPolygon(i)
        if (!cell) continue
        const inset = insetConvexPolygon(cell, half)
        if (!inset) continue
        const clipped = clipPolygonToConvex(inset, clipCircle)
        if (clipped.length >= 3) polygons.push(clipped)
      }
    } else {
      for (const { p, r } of points) {
        const factor = grow <= 0 ? 1 : Math.pow(r / maxRadius, grow)
        const diameter = Math.max(0.05, dotSize * factor)
        polygons.push(circlePolygon(p[0], p[1], diameter / 2, 24))
      }
    }

    return { width, height, polygons, curves: [], ribWidth }
  },
}
