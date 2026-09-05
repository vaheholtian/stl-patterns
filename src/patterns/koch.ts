// Koch fractal generator.
//
// All three styles subdivide a straight segment with the standard Koch
// rule: split it into three equal thirds and replace the middle third with
// the two sides of an equilateral triangle built on it (a "bump"). Applying
// the rule recursively to every resulting segment produces the Koch curve.
// A `sign` parameter picks which side of travel the bump points to:
//
//   - 'snowflake': the base shape is an equilateral triangle inscribed in
//     the box, apex up, centred, traversed apex -> bottom-left ->
//     bottom-right -> apex (a CCW polygon in this y-up coordinate system).
//     Each edge is Koch-subdivided with bumps pointing outward, growing a
//     closed snowflake polygon (the feature).
//   - 'antisnowflake': the same base triangle, but bumps point inward,
//     carving the points away instead of growing them.
//   - 'curve-band': a single open Koch curve is drawn straight across the
//     box from the left edge to the right edge (from (0,y) to (width,y)),
//     repeated at evenly spaced rows every `bandPitch` mm. Because Koch
//     subdivision never moves the two original endpoints, every row curve
//     starts and ends at exactly the same height y on the box's left and
//     right edges, so neighbouring tile repeats always meet at those points
//     - seamless horizontally. (Not claimed seamless vertically.)
//
// `depth` sets the requested recursion depth, but `minFeature` caps it
// automatically: subdivision of a segment stops as soon as the next level's
// sub-segments (parent length / 3) would be smaller than `minFeature`,
// regardless of how much of `depth` is left.

import type { Generator, GeneratorContext, ParamValue, Pt, TileCurve } from './types'
import { getNum } from './types'

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

/** Points from p0 to p1 (inclusive of both ends) following the Koch rule to
 * the given recursion depth, capped by `minFeature`. `sign` is +1 or -1 and
 * picks which side of the direction of travel the bumps point to. */
function kochPoints(p0: Pt, p1: Pt, depthRemaining: number, minFeature: number, sign: number): Pt[] {
  if (depthRemaining <= 0) return [p0, p1]
  const segLen = dist(p0, p1)
  if (segLen / 3 < minFeature) return [p0, p1]

  const dx = (p1[0] - p0[0]) / 3
  const dy = (p1[1] - p0[1]) / 3
  const pA: Pt = p0
  const pB: Pt = [p0[0] + dx, p0[1] + dy]
  const pD: Pt = [p0[0] + 2 * dx, p0[1] + 2 * dy]
  const pE: Pt = p1

  const ang = sign * (Math.PI / 3) // 60 degrees, signed
  const cos = Math.cos(ang)
  const sin = Math.sin(ang)
  const vx = pD[0] - pB[0]
  const vy = pD[1] - pB[1]
  const pC: Pt = [pB[0] + vx * cos - vy * sin, pB[1] + vx * sin + vy * cos]

  const s1 = kochPoints(pA, pB, depthRemaining - 1, minFeature, sign)
  const s2 = kochPoints(pB, pC, depthRemaining - 1, minFeature, sign)
  const s3 = kochPoints(pC, pD, depthRemaining - 1, minFeature, sign)
  const s4 = kochPoints(pD, pE, depthRemaining - 1, minFeature, sign)
  return [...s1.slice(0, -1), ...s2.slice(0, -1), ...s3.slice(0, -1), ...s4]
}

export const kochGenerator: Generator = {
  id: 'koch',
  name: 'Koch fractal',
  description: 'Koch snowflake or antisnowflake medallions, or a band of Koch curves that joins horizontally. Closed motifs retain visible repeat outlines.',
  seamless: () => true,
  params: [
    { key: 'width', label: 'Width', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    { key: 'height', label: 'Height', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    {
      key: 'style', label: 'Style', type: 'select', default: 'snowflake',
      options: [
        { value: 'snowflake', label: 'Snowflake' },
        { value: 'antisnowflake', label: 'Antisnowflake' },
        { value: 'curve-band', label: 'Curve band (seamless horizontally)' },
      ],
    },
    { key: 'depth', label: 'Depth', type: 'int', default: 3, min: 0, max: 5, step: 1, hint: 'requested recursion depth; minFeature may stop earlier' },
    { key: 'minFeature', label: 'Min feature', type: 'number', default: 1.0, min: 0.1, max: 10, step: 0.1, hint: 'smallest detail; deeper recursion is skipped below this' },
    { key: 'bandPitch', label: 'Band pitch', type: 'number', default: 12, min: 2, max: 100, step: 0.5, hint: 'vertical spacing between curve-band rows, mm' },
    { key: 'ribWidth', label: 'Rib width', type: 'number', default: 1.6, min: 0.4, max: 6, step: 0.1 },
    { key: 'seed', label: 'Seed', type: 'int', default: 1, min: 0, max: 999999, step: 1 },
  ],
  generate(params: Record<string, ParamValue>, ctx: GeneratorContext) {
    const width = getNum(params, 'width', 40)
    const height = getNum(params, 'height', 40)
    const style = String(params.style ?? 'snowflake')
    const depth = Math.max(0, Math.min(5, Math.round(getNum(params, 'depth', 3))))
    const minFeature = Math.max(0.01, getNum(params, 'minFeature', 1.0))
    const ribWidth = getNum(params, 'ribWidth', 1.6)

    if (style === 'curve-band') {
      const bandPitch = Math.max(0.5, getNum(params, 'bandPitch', 12))
      const curves: TileCurve[] = []
      for (let y = bandPitch / 2; y < height; y += bandPitch) {
        const sign = ctx.rand() < 0.5 ? 1 : -1
        const points = kochPoints([0, y], [width, y], depth, minFeature, sign)
        curves.push({ points, closed: false })
      }
      return { width, height, polygons: [], curves, ribWidth }
    }

    // Closed snowflake / antisnowflake: equilateral triangle inscribed in
    // the box, apex up, centred, with a margin so outward bumps (snowflake)
    // stay clear of the box edges. CCW order (apex, bottom-left,
    // bottom-right) so sign=-1 bumps outward and sign=+1 bumps inward.
    const margin = style === 'antisnowflake' ? 0.9 : 0.75
    const sByWidth = width
    const sByHeight = height / (Math.sqrt(3) / 2)
    const s = Math.min(sByWidth, sByHeight) * margin
    const cx = width / 2
    const cy = height / 2
    const baseY = cy - (s * Math.sqrt(3)) / 6
    const apex: Pt = [cx, baseY + (s * Math.sqrt(3)) / 2]
    const baseLeft: Pt = [cx - s / 2, baseY]
    const baseRight: Pt = [cx + s / 2, baseY]
    const sign = style === 'antisnowflake' ? 1 : -1

    const e1 = kochPoints(apex, baseLeft, depth, minFeature, sign)
    const e2 = kochPoints(baseLeft, baseRight, depth, minFeature, sign)
    const e3 = kochPoints(baseRight, apex, depth, minFeature, sign)
    const poly: Pt[] = [...e1.slice(0, -1), ...e2.slice(0, -1), ...e3.slice(0, -1)]

    return { width, height, polygons: [poly], curves: [], ribWidth }
  },
}
