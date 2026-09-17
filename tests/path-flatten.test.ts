// The DOM-free path flattener, checked against shapes whose area is known in
// closed form. Tolerances allow for two inherent approximation effects and
// nothing more: a polyline inscribed in a curve under-reports its area, and the
// four-point cubic approximation of an arc bulges slightly outside it. A real
// error in the parameterization is orders of magnitude larger than either --
// getting the arc's rotation wrong, for instance, was off by a factor of six.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { flattenPath } from '../src/patterns/svg/pathFlatten.ts'
import type { Pt } from '../src/patterns/types.ts'

const CURVE_TOL = 3e-4   // relative, covers the chord deficit and the cubic bulge
const TOL = 0.001        // flattening tolerance, in the path's own units

function area(points: Pt[]): number {
  let s = 0
  for (let i = 0; i < points.length; i++) { const q = points[(i + 1) % points.length]; s += points[i][0] * q[1] - q[0] * points[i][1] }
  return Math.abs(s / 2)
}
const areaOf = (d: string) => flattenPath(d, TOL).reduce((t, s) => t + area(s.points), 0)
const close = (d: string, expect: number, what: string, rel = CURVE_TOL) =>
  assert.ok(Math.abs(areaOf(d) - expect) <= expect * rel, `${what}: area ${areaOf(d)}, expected ${expect}`)

test('straight-line commands, absolute and relative', () => {
  close('M0 0 H10 V10 H0 Z', 100, 'H/V square', 1e-12)
  close('m0 0h10v10h-10z', 100, 'relative h/v square', 1e-12)
  close('M0 0 L10 0 L10 10 L0 10 Z', 100, 'L square', 1e-12)
  // a coordinate pair with no command repeats the previous one; after M that is L
  close('M0 0 10 0 10 10 0 10 Z', 100, 'implicit lineto after moveto', 1e-12)
  close('M0 0 L1e1 0 L1e1 1e1 L0 1e1 Z', 100, 'exponent notation', 1e-12)
})

test('elliptical arcs match the ellipse they describe', () => {
  close('M 10 0 A 10 10 0 1 0 -10 0 A 10 10 0 1 0 10 0 Z', Math.PI * 100, 'circle from two half arcs')
  close('M-10 0 A 10 10 0 0 0 10 0 Z', Math.PI * 50, 'semicircle')
  close('M20 0 A20 5 0 1 0 -20 0 A20 5 0 1 0 20 0 Z', Math.PI * 100, 'ellipse 20 x 5')
  // rotating an ellipse cannot change its area
  const phi = (37 * Math.PI) / 180, rx = 20, ry = 5
  const pt = (t: number) => [rx * Math.cos(t) * Math.cos(phi) - ry * Math.sin(t) * Math.sin(phi), rx * Math.cos(t) * Math.sin(phi) + ry * Math.sin(t) * Math.cos(phi)]
  const a0 = pt(0), a1 = pt(Math.PI)
  close(`M${a0[0]} ${a0[1]} A20 5 37 1 1 ${a1[0]} ${a1[1]} A20 5 37 1 1 ${a0[0]} ${a0[1]} Z`, Math.PI * 100, 'the same ellipse rotated 37 degrees')
})

test('arc flags survive minification', () => {
  // `a10 10 0 11-20 0` is two flags and a coordinate pair, not the number 11
  close('M10 0a10 10 0 11-20 0a10 10 0 11 20 0z', Math.PI * 100, 'circle with flags jammed against the coordinates')
})

test('an arc stays within the requested tolerance of the true curve', () => {
  for (const r of [1, 10, 200]) {
    const pts = flattenPath(`M${r} 0 A${r} ${r} 0 0 1 0 ${r}`, TOL)[0].points
    const worst = Math.max(...pts.map(([x, y]) => Math.abs(Math.hypot(x, y) - r)))
    assert.ok(worst <= TOL, `radius ${r}: strayed ${worst.toExponential(2)} from the arc, over the ${TOL} tolerance`)
  }
})

test('degenerate arcs fall back to a straight line, as the spec requires', () => {
  const pts = flattenPath('M0 0 A0 0 0 0 1 10 0', TOL)[0].points
  assert.deepEqual(pts[pts.length - 1], [10, 0])
  assert.ok(pts.every(([, y]) => y === 0), 'a zero-radius arc must not bow')
})

test('smooth-curve commands reflect the previous control point', () => {
  const k = 0.5522847498307936 * 10
  close(`M10 0 C10 ${k} ${k} 10 0 10 C${-k} 10 -10 ${k} -10 0 C-10 ${-k} ${-k} -10 0 -10 C${k} -10 10 ${-k} 10 0 Z`, Math.PI * 100, 'circle from four cubics')
  close(`M10 0 C10 ${k} ${k} 10 0 10 S-10 ${k} -10 0 S${-k} -10 0 -10 S10 ${-k} 10 0 Z`, Math.PI * 100, 'the same circle continued with S')
  // area under a parabolic arch closed to its chord is 2/3 of base x height
  close('M0 0 Q 5 15 10 0 Z', (2 / 3) * 10 * 7.5, 'quadratic arch')
  // T mirrors Q's control point, so the second arch bends the other way
  const pts = flattenPath('M0 0 Q 5 15 10 0 T 20 0', TOL)[0].points
  assert.ok(Math.abs(Math.max(...pts.map(p => p[1])) - 7.5) < 1e-3, 'first arch peaks at +7.5')
  assert.ok(Math.abs(Math.min(...pts.map(p => p[1])) + 7.5) < 1e-3, 'T reflects it to -7.5')
})

test('subpaths are split and their closedness recorded', () => {
  const subs = flattenPath('M0 0 L10 0 L10 10 Z M20 20 L30 20', TOL)
  assert.equal(subs.length, 2)
  assert.deepEqual(subs.map(s => s.closed), [true, false])
  // Z returns the pen to the subpath's start, so the next relative move is from there
  const back = flattenPath('M5 5 h10 v10 z m0 20 h10', TOL)
  assert.deepEqual(back[1].points[0], [5, 25])
})

test('a malformed path is reported rather than silently truncated', () => {
  assert.throws(() => flattenPath('10 20 L30 40', TOL), /begin with a command/)
  assert.throws(() => flattenPath('M0 0 X5 5', TOL), /unsupported path command/)
  assert.throws(() => flattenPath('M0 0 L5', TOL), /expected a number/)
})
