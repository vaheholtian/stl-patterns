// Apollonian gasket generator.
//
// Circles are stored as (x, y, r, k) with signed curvature k = 1/r for a
// normal internally-nested circle and k = -1/R for the single outer
// boundary circle (its curvature is negative because every other circle is
// internally tangent to it, i.e. it curves the "wrong way" relative to
// them). The gasket starts from the outer circle plus three mutually
// tangent inner circles (a complete Descartes quadruple), chosen either as
// three equal circles packed symmetrically inside the outer one, or, for
// 'random', two random-radius circles placed by law-of-cosines tangency and
// a third solved with the complex Descartes Circle Theorem.
//
// From there the classic Descartes recursion needs no further square roots:
// given four mutually tangent circles (k0,k1,k2,k3), replacing any one of
// them with the *other* circle tangent to the remaining three is a purely
// algebraic step,
//     k_new  = 2*(sum of the other three curvatures) - k_replaced
//     zeta_new = 2*(sum of the other three k*z) - k_replaced*z_replaced   (z complex)
// (this falls out of Descartes' theorem applied twice to the same triple of
// circles - the two solutions for the fourth curvature always sum to twice
// the sum of the three knowns). Starting from the initial quadruple, each of
// its four members is replaced in turn to seed four recursion branches;
// each new circle then spawns three further branches (replacing each of the
// three circles that is not the one it was just derived from), and so on
// until `depth` is exhausted, a circle's radius drops below minFeature/2,
// or the point budget for rendering is used up.
//
// The outer circle itself is never rendered (it is only the boundary
// constraint the recursion is built against) - only the packed inner
// circles become geometry. This is a single motif centred in a circle of
// radius min(width,height)/2 - 1, not a periodic lattice, so it is NOT
// seamless across tile edges.

import type { Generator, GeneratorContext, ParamValue, Pt, TileCurve } from './types'
import { getNum } from './types'

const POINT_BUDGET = 7800
const CIRCLE_CAP = 4000

interface Circle {
  x: number
  y: number
  r: number
  k: number
}

type C = [number, number]
const cadd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]]
const csub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]]
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
const cscale = (a: C, s: number): C => [a[0] * s, a[1] * s]
const cdivReal = (a: C, s: number): C => [a[0] / s, a[1] / s]

/** Principal complex square root. */
function csqrt(re: number, im: number): C {
  const m = Math.hypot(re, im)
  const rePart = Math.sqrt(Math.max(0, (m + re) / 2))
  let imPart = Math.sqrt(Math.max(0, (m - re) / 2))
  if (im < 0) imPart = -imPart
  return [rePart, imPart]
}

/** Three equal circles, mutually tangent, packed symmetrically inside a
 * circle of radius R. Closed form: for radius r placed at distance R-r from
 * the centre, 120 degrees apart, mutual tangency (chord length 2r) requires
 * (R-r)*sqrt(3) = 2r, giving r = R*(2*sqrt(3) - 3). */
function threeEqualStart(R: number): [Circle, Circle, Circle] {
  const r = R * (2 * Math.sqrt(3) - 3)
  const d = R - r
  const out: Circle[] = []
  for (let i = 0; i < 3; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 3
    out.push({ x: d * Math.cos(ang), y: d * Math.sin(ang), r, k: 1 / r })
  }
  return out as [Circle, Circle, Circle]
}

/** Two random-radius circles placed tangent to the outer circle and to each
 * other (law of cosines on their centre distances), then the third circle
 * closing the quadruple solved with the complex Descartes Circle Theorem. */
function randomStart(R: number, rand: () => number): [Circle, Circle, Circle] {
  const k0 = -1 / R
  const z0: C = [0, 0]
  for (let attempt = 0; attempt < 30; attempt++) {
    const r1 = R * (0.22 + rand() * 0.33)
    const r2 = R * (0.22 + rand() * 0.33)
    const d1 = R - r1, d2 = R - r2
    const cosDt = (d1 * d1 + d2 * d2 - (r1 + r2) * (r1 + r2)) / (2 * d1 * d2)
    if (cosDt < -1 || cosDt > 1) continue
    const theta1 = rand() * 2 * Math.PI
    const dtheta = Math.acos(cosDt) * (rand() < 0.5 ? 1 : -1)
    const theta2 = theta1 + dtheta
    const z1: C = [d1 * Math.cos(theta1), d1 * Math.sin(theta1)]
    const z2: C = [d2 * Math.cos(theta2), d2 * Math.sin(theta2)]
    const k1 = 1 / r1, k2 = 1 / r2

    const ksum = k0 + k1 + k2
    const kdisc = Math.max(0, k0 * k1 + k1 * k2 + k2 * k0)
    const ksq = 2 * Math.sqrt(kdisc)
    const zeta0 = cscale(z0, k0), zeta1 = cscale(z1, k1), zeta2 = cscale(z2, k2)
    const zsum = cadd(cadd(zeta0, zeta1), zeta2)
    const zdisc = cadd(cadd(cmul(zeta0, zeta1), cmul(zeta1, zeta2)), cmul(zeta2, zeta0))
    const [sre, sim] = csqrt(zdisc[0], zdisc[1])
    const zsq: C = [2 * sre, 2 * sim]

    const branches: { k: number; z: C }[] = [
      { k: ksum + ksq, z: cadd(zsum, zsq) },
      { k: ksum - ksq, z: csub(zsum, zsq) },
    ]
    for (const br of branches) {
      if (Math.abs(br.k) < 1e-9) continue
      const k3 = br.k
      const z3 = cdivReal(br.z, k3)
      if (k3 <= 0) continue
      const r3 = 1 / k3
      const dist = Math.hypot(z3[0], z3[1])
      if (dist + r3 <= R + 1e-6 && r3 > 1e-6) {
        return [
          { x: z1[0], y: z1[1], r: r1, k: k1 },
          { x: z2[0], y: z2[1], r: r2, k: k2 },
          { x: z3[0], y: z3[1], r: r3, k: k3 },
        ]
      }
    }
  }
  return threeEqualStart(R)
}

/** Algebraic (sqrt-free) Descartes step: given the three circles to keep
 * and the fourth circle they are replacing, return the other circle
 * tangent to all three `keep` circles. */
function otherCircle(keep: [Circle, Circle, Circle], replaced: Circle): Circle {
  const k = 2 * (keep[0].k + keep[1].k + keep[2].k) - replaced.k
  if (!Number.isFinite(k) || Math.abs(k) < 1e-9) return { x: 0, y: 0, r: 0, k: Infinity }
  const wx = 2 * (keep[0].k * keep[0].x + keep[1].k * keep[1].x + keep[2].k * keep[2].x) - replaced.k * replaced.x
  const wy = 2 * (keep[0].k * keep[0].y + keep[1].k * keep[1].y + keep[2].k * keep[2].y) - replaced.k * replaced.y
  const x = wx / k, y = wy / k
  const r = 1 / Math.abs(k)
  return { x, y, r, k }
}

function recurse(
  triple: [Circle, Circle, Circle],
  exclude: Circle,
  depth: number,
  minFeature: number,
  budget: { n: number },
  out: Circle[],
) {
  if (depth <= 0 || budget.n <= 0) return
  const newC = otherCircle(triple, exclude)
  if (!Number.isFinite(newC.r) || newC.k <= 0 || newC.r < minFeature / 2) return
  out.push(newC)
  budget.n--
  for (let i = 0; i < 3; i++) {
    const nextTriple: [Circle, Circle, Circle] = [triple[0], triple[1], triple[2]]
    const removed = nextTriple[i]
    nextTriple[i] = newC
    recurse(nextTriple, removed, depth - 1, minFeature, budget, out)
  }
}

export const apollonianGenerator: Generator = {
  id: 'apollonian',
  name: 'Apollonian gasket',
  description: 'Circles packed recursively inside a bounding circle. A centred medallion with visible outlines when repeated, not an all-over surface pattern.',
  seamless: () => true, // contained motif has matching empty edges, not an all-over field
  params: [
    { key: 'width', label: 'Width', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    { key: 'height', label: 'Height', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    {
      key: 'start', label: 'Starting circles', type: 'select', default: 'three-equal',
      options: [
        { value: 'three-equal', label: 'Three equal circles' },
        { value: 'random', label: 'Random circles' },
      ],
    },
    { key: 'depth', label: 'Recursion depth', type: 'int', default: 6, min: 1, max: 10, step: 1 },
    {
      key: 'style', label: 'Style', type: 'select', default: 'discs',
      options: [
        { value: 'discs', label: 'Discs (filled)' },
        { value: 'rings', label: 'Rings (outline)' },
      ],
    },
    { key: 'gap', label: 'Disc gap', type: 'number', default: 0.6, min: 0, max: 3, step: 0.05, hint: 'used by the discs style' },
    { key: 'ribWidth', label: 'Rib width', type: 'number', default: 1, min: 0.2, max: 4, step: 0.1, hint: 'used by the rings style' },
    { key: 'minFeature', label: 'Min feature', type: 'number', default: 1, min: 0.2, max: 5, step: 0.1 },
    { key: 'seed', label: 'Seed', type: 'int', default: 1, min: 0, max: 999999, step: 1, hint: 'only used by the random starting circles' },
  ],
  generate(params: Record<string, ParamValue>, ctx: GeneratorContext) {
    const width = getNum(params, 'width', 40)
    const height = getNum(params, 'height', 40)
    const start = String(params.start ?? 'three-equal')
    const depth = Math.max(1, Math.round(getNum(params, 'depth', 6)))
    const style = String(params.style ?? 'discs')
    const gap = getNum(params, 'gap', 0.6)
    const ribWidth = getNum(params, 'ribWidth', 1)
    const minFeature = Math.max(0.05, getNum(params, 'minFeature', 1))

    const cx = width / 2, cy = height / 2
    const R = Math.max(0.5, Math.min(width, height) / 2 - 1)

    const outer: Circle = { x: 0, y: 0, r: R, k: -1 / R }
    const [c1, c2, c3] = start === 'random' ? randomStart(R, ctx.rand) : threeEqualStart(R)

    const circles: Circle[] = [c1, c2, c3]
    const budget = { n: CIRCLE_CAP }
    recurse([c1, c2, c3], outer, depth, minFeature, budget, circles)
    recurse([outer, c2, c3], c1, depth, minFeature, budget, circles)
    recurse([outer, c1, c3], c2, depth, minFeature, budget, circles)
    recurse([outer, c1, c2], c3, depth, minFeature, budget, circles)

    const polygons: Pt[][] = []
    const curves: TileCurve[] = []
    let used = 0

    if (style === 'discs') {
      for (const c of circles) {
        if (used >= POINT_BUDGET) break
        const rd = c.r - gap
        if (rd <= 0.05) continue
        const segs = Math.max(32, Math.min(48, Math.round((2 * Math.PI * rd) / 0.5)))
        const poly: Pt[] = []
        for (let i = 0; i < segs; i++) {
          const a = (2 * Math.PI * i) / segs
          poly.push([cx + c.x + rd * Math.cos(a), cy + c.y + rd * Math.sin(a)])
        }
        polygons.push(poly)
        used += poly.length
      }
    } else {
      for (const c of circles) {
        if (used >= POINT_BUDGET) break
        const byAngle = 60
        const byLength = (2 * Math.PI * c.r) / 0.4
        const segs = Math.max(24, Math.min(120, Math.round(Math.max(byAngle, byLength))))
        const pts: Pt[] = []
        for (let i = 0; i < segs; i++) {
          const a = (2 * Math.PI * i) / segs
          pts.push([cx + c.x + c.r * Math.cos(a), cy + c.y + c.r * Math.sin(a)])
        }
        curves.push({ points: pts, closed: true })
        used += pts.length
      }
    }

    return { width, height, polygons, curves, ribWidth }
  },
}
