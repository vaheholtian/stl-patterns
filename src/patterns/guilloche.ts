// Guilloche rosette generator.
//
// Draws a family of `count` closed curves in polar form:
//   r(theta) = R0 + A * sin(k*theta + phi_i),   phi_i = i * (2*PI / count)
// centred in the tile box, the classic spirograph/guilloche "rosette" made
// of k-lobed roses layered at evenly spaced phase offsets. A `twist` term
// rotates each curve i rigidly by i*twist radians (added to the angle used
// for (x,y) position, not to the lobe phase), so successive curves in the
// family spiral around one another instead of sitting in exact registration.
//
// `innerRings` adds smaller nested copies of the whole rosette family,
// scaled by radius fraction f (0.6, 0.3 for the default of 2 rings; for a
// general count the fractions are evenly spaced from 0.6 down to 0.3), with
// R0 and A both scaled by f so the nested rosette keeps the same relative
// lobe depth.
//
// R0 and A are clamped so R0+A stays under min(width,height)/2 - ribWidth,
// guaranteeing the whole family (whose outermost point is exactly R0+A)
// fits inside the box with room for the stroke width.
//
// This is a single centred motif per tile, not a repeating lattice, so it
// is NOT seamless across tile edges.

import type { Generator, GeneratorContext, ParamValue, Pt, TileCurve } from './types'
import { getNum } from './types'

const TWO_PI = Math.PI * 2
const STEPS = 360

/** One closed rosette curve, radius R0 + A*sin(k*theta + phi), rigidly
 * rotated by `rot` radians, centred at (cx,cy). */
function rosetteCurve(cx: number, cy: number, R0: number, A: number, k: number, phi: number, rot: number): TileCurve {
  const points: Pt[] = []
  for (let s = 0; s < STEPS; s++) {
    const theta = (TWO_PI * s) / STEPS
    const r = R0 + A * Math.sin(k * theta + phi)
    const posAngle = theta + rot
    points.push([cx + r * Math.cos(posAngle), cy + r * Math.sin(posAngle)])
  }
  return { points, closed: true }
}

export const guillocheGenerator: Generator = {
  id: 'guilloche',
  name: 'Guilloche rosette',
  description: 'Spirograph-style rosette of layered sinusoidal curves, centred in the tile. Not seamless (single motif per tile).',
  params: [
    { key: 'width', label: 'Width', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    { key: 'height', label: 'Height', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    { key: 'count', label: 'Curve count', type: 'int', default: 6, min: 1, max: 24, step: 1 },
    { key: 'radius', label: 'Radius (R0)', type: 'number', default: 15, min: 1, max: 150, step: 0.5 },
    { key: 'amplitude', label: 'Amplitude (A)', type: 'number', default: 4, min: 0, max: 50, step: 0.25 },
    { key: 'lobes', label: 'Lobes (k)', type: 'int', default: 7, min: 1, max: 24, step: 1 },
    { key: 'twist', label: 'Twist', type: 'number', default: 0.15, min: -1, max: 1, step: 0.01, hint: 'radians of rigid rotation added per curve index' },
    { key: 'innerRings', label: 'Inner rings', type: 'int', default: 2, min: 0, max: 6, step: 1 },
    { key: 'ribWidth', label: 'Rib width', type: 'number', default: 1.6, min: 0.4, max: 6, step: 0.1 },
    { key: 'seed', label: 'Seed', type: 'int', default: 1, min: 0, max: 999999, step: 1 },
  ],
  generate(params: Record<string, ParamValue>, _ctx: GeneratorContext) {
    const width = getNum(params, 'width', 40)
    const height = getNum(params, 'height', 40)
    const count = Math.max(1, Math.round(getNum(params, 'count', 6)))
    const k = Math.max(1, Math.round(getNum(params, 'lobes', 7)))
    const twist = getNum(params, 'twist', 0.15)
    const innerRings = Math.max(0, Math.round(getNum(params, 'innerRings', 2)))
    const ribWidth = getNum(params, 'ribWidth', 1.6)

    let R0 = getNum(params, 'radius', 15)
    let A = getNum(params, 'amplitude', 4)
    const maxR = Math.max(0.5, Math.min(width, height) / 2 - ribWidth)
    if (R0 + A > maxR) {
      const scale = maxR / (R0 + A)
      R0 *= scale
      A *= scale
    }

    const cx = width / 2
    const cy = height / 2

    // Radius fractions for the outer rosette (1.0) plus any inner rings,
    // evenly spaced from 0.6 down to 0.3 (matching the default innerRings=2
    // case exactly: [0.6, 0.3]).
    const fractions = [1]
    for (let j = 0; j < innerRings; j++) {
      const f = innerRings === 1 ? 0.6 : 0.6 - (j * 0.3) / (innerRings - 1)
      fractions.push(f)
    }

    const curves: TileCurve[] = []
    for (const f of fractions) {
      for (let i = 0; i < count; i++) {
        const phi = i * (TWO_PI / count)
        curves.push(rosetteCurve(cx, cy, R0 * f, A * f, k, phi, i * twist))
      }
    }

    return { width, height, polygons: [], curves, ribWidth }
  },
}
