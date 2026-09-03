// Hilbert curve generator.
//
// A Hilbert curve of order `n` visits every cell of a 2^n x 2^n grid exactly
// once via a single continuous path, using the standard recursive rule:
// each order's curve is built from four copies of the order-1 curve
// (rotated/reflected into the four quadrants) joined end to end. We generate
// it iteratively with the classic bit-twiddling "d2xy" mapping from a
// distance-along-curve index to (x,y) grid coordinates, which is equivalent
// but avoids recursion.
//
// The grid spacing equals width / 2^order, and the curve is inset by half a
// spacing so it stays clear of the box edges. A Hilbert curve starts in the
// bottom-left cell and ends in the bottom-right cell, on the same row, so
// the two ends are extended straight out to the left and right box edges:
// horizontal repeats then join into one continuous rib, and nothing crosses
// the top or bottom edges. The tile is seamless.
//
// When `rounded` is on, each interior 90-degree turn of the polyline is
// replaced by a short circular-arc fillet of radius 0.3 * spacing so the
// milled/printed rib has no sharp inner corner.

import type { Generator, GeneratorContext, ParamValue, Pt } from './types'
import { getNum } from './types'

/** Map a distance `d` along the order-`n` Hilbert curve to integer grid
 * coordinates (x,y) in [0, 2^n). Standard "d2xy" algorithm. */
function d2xy(order: number, d: number): Pt {
  let rx = 0
  let ry = 0
  let t = d
  let x = 0
  let y = 0
  for (let s = 1; s < 1 << order; s *= 2) {
    rx = 1 & (t / 2)
    ry = 1 & (t ^ rx)
    // rotate
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x
        y = s - 1 - y
      }
      const tmp = x
      x = y
      y = tmp
    }
    x += s * rx
    y += s * ry
    t = Math.floor(t / 4)
  }
  return [x, y]
}

/** Insert a circular fillet of radius `r` at the corner `p1` formed by the
 * segment p0->p1->p2, replacing the corner with a short arc tangent to both
 * legs. Segments shorter than 2r are left un-filleted (grid unit segments
 * here are all equal length, so this only guards tiny/degenerate cases). */
function filletCorner(p0: Pt, p1: Pt, p2: Pt, r: number): Pt[] {
  const v1: Pt = [p1[0] - p0[0], p1[1] - p0[1]]
  const v2: Pt = [p2[0] - p1[0], p2[1] - p1[1]]
  const len1 = Math.hypot(v1[0], v1[1])
  const len2 = Math.hypot(v2[0], v2[1])
  if (len1 < 1e-9 || len2 < 1e-9) return [p1]
  const u1: Pt = [v1[0] / len1, v1[1] / len1]
  const u2: Pt = [v2[0] / len2, v2[1] / len2]
  // Straight segments (no turn): nothing to fillet.
  const cross = u1[0] * u2[1] - u1[1] * u2[0]
  if (Math.abs(cross) < 1e-9) return [p1]
  const rr = Math.min(r, len1 / 2, len2 / 2)
  // Tangent points on each leg, offset back from the corner by rr (since
  // the turn is always ~90 degrees for a Hilbert curve, tangent distance
  // along each leg from the corner is rr).
  const a: Pt = [p1[0] - u1[0] * rr, p1[1] - u1[1] * rr]
  const b: Pt = [p1[0] + u2[0] * rr, p1[1] + u2[1] * rr]
  // Arc centre: offset from corner along the internal angle bisector.
  const turnSign = cross > 0 ? 1 : -1
  // Normal to u1 pointing toward the centre (rotate u1 by -90*turnSign)
  const n1: Pt = turnSign > 0 ? [u1[1], -u1[0]] : [-u1[1], u1[0]]
  const centre: Pt = [a[0] + n1[0] * rr, a[1] + n1[1] * rr]
  const a0 = Math.atan2(a[1] - centre[1], a[0] - centre[0])
  let a1 = Math.atan2(b[1] - centre[1], b[0] - centre[0])
  // Choose the short way around matching the turn direction.
  let sweep = a1 - a0
  while (sweep > Math.PI) sweep -= 2 * Math.PI
  while (sweep < -Math.PI) sweep += 2 * Math.PI
  a1 = a0 + sweep
  const segs = 4
  const arc: Pt[] = []
  for (let i = 0; i <= segs; i++) {
    const ang = a0 + (sweep * i) / segs
    arc.push([centre[0] + rr * Math.cos(ang), centre[1] + rr * Math.sin(ang)])
  }
  return [a, ...arc.slice(1, -1), b]
}

export const hilbertGenerator: Generator = {
  id: 'hilbert',
  name: 'Hilbert curve',
  description: 'Space-filling Hilbert curve as a single continuous rib; its ends run out to the left and right edges so horizontal repeats join into one seamless line.',
  params: [
    { key: 'width', label: 'Width', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    { key: 'height', label: 'Height', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    { key: 'order', label: 'Order', type: 'int', default: 4, min: 1, max: 7, step: 1 },
    { key: 'rounded', label: 'Rounded corners', type: 'boolean', default: true },
    { key: 'ribWidth', label: 'Rib width', type: 'number', default: 1.6, min: 0.4, max: 6, step: 0.1 },
    { key: 'seed', label: 'Seed', type: 'int', default: 1, min: 0, max: 999999, step: 1 },
  ],
  generate(params: Record<string, ParamValue>, _ctx: GeneratorContext) {
    const width = getNum(params, 'width', 40)
    const height = getNum(params, 'height', 40)
    const order = Math.max(1, Math.min(7, Math.round(getNum(params, 'order', 4))))
    const rounded = Boolean(params.rounded ?? true)
    const ribWidth = getNum(params, 'ribWidth', 1.6)

    const n = 1 << order // grid cells per side
    const spacing = width / n
    // Half-spacing inset from the box edges, plus (for a non-square box)
    // any leftover vertical space split evenly to keep the curve centred.
    const offX = spacing / 2
    const offY = spacing / 2 + (height - n * spacing) / 2

    const count = n * n
    const grid: Pt[] = new Array(count + 2)
    for (let d = 0; d < count; d++) {
      const [gx, gy] = d2xy(order, d)
      grid[d + 1] = [offX + gx * spacing, offY + gy * spacing]
    }
    // run the ends out to the box edges (d2xy starts at cell (0,0) and ends at (n-1,0))
    grid[0] = [0, grid[1][1]]
    grid[count + 1] = [width, grid[count][1]]

    let points: Pt[]
    if (!rounded) {
      points = grid
    } else {
      const r = 0.3 * spacing
      points = [grid[0]]
      for (let i = 1; i < grid.length - 1; i++) {
        const filleted = filletCorner(grid[i - 1], grid[i], grid[i + 1], r)
        points.push(...filleted)
      }
      points.push(grid[grid.length - 1])
    }

    return {
      width,
      height,
      polygons: [],
      curves: [{ points, closed: false }],
      ribWidth,
    }
  },
}
