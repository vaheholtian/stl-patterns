// A DOM-free SVG path flattener. `svgImport.ts` reaches for getPointAtLength and
// getScreenCTM, which need a document, so it cannot run where generators run --
// inside the preview and geometry workers. This covers the whole path grammar
// (M L H V C S Q T A Z, absolute and relative) so pattern data can be flattened
// there, and so svgImport could eventually shed its DOM dependency too.
import type { Pt } from '../types'

export interface SubPath {
  points: Pt[]
  /** the path closed with Z: the last point joins the first */
  closed: boolean
}

// A number, including a leading sign, a bare leading dot and an exponent.
const NUMBER = /[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?/y
const SEPARATOR = /[\s,]*/y

/**
 * Reads a path's `d` attribute. Arc flags need their own reader: minifiers write
 * `a1 1 0 011 1`, where `011` is two flags and a coordinate, not the number 11.
 */
function scanner(d: string) {
  let i = 0
  const skip = () => { SEPARATOR.lastIndex = i; const m = SEPARATOR.exec(d); if (m) i = SEPARATOR.lastIndex }
  const self = {
    done(): boolean { skip(); return i >= d.length },
    /** the next command letter, or null when a coordinate follows instead (an implicit repeat) */
    command(): string | null {
      skip()
      const c = d[i]
      if (c && ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z'))) { i++; return c }
      return null
    },
    number(): number {
      skip()
      NUMBER.lastIndex = i
      const m = NUMBER.exec(d)
      if (!m) throw new Error(`expected a number at offset ${i} of the path`)
      i = NUMBER.lastIndex
      return Number(m[0])
    },
    flag(): boolean {
      skip()
      const c = d[i]
      if (c !== '0' && c !== '1') return self.number() !== 0  // tolerate a non-minified flag
      i++
      return c === '1'
    },
  }
  return self
}

/** Split a cubic until each piece is flat to `tol`, appending to `out` (p0 is assumed present). */
function flattenCubic(out: Pt[], p0: Pt, c1: Pt, c2: Pt, p3: Pt, tol: number, depth = 0) {
  // the control points' distance from the chord bounds the curve's deviation from it
  const dx = p3[0] - p0[0], dy = p3[1] - p0[1]
  const d1 = Math.abs((c1[0] - p3[0]) * dy - (c1[1] - p3[1]) * dx)
  const d2 = Math.abs((c2[0] - p3[0]) * dy - (c2[1] - p3[1]) * dx)
  // d1 and d2 are those distances times the chord length, so the curve strays at
  // most 3/4 * (d1 + d2) / chord from it; that bound is what `tol` caps.
  const sum = d1 + d2, chordSq = dx * dx + dy * dy
  if (depth >= 18) { out.push(p3); return }
  if (chordSq < 1e-24) {
    // a chord of no length makes the test above vacuous: measure the controls instead
    const s1 = Math.hypot(c1[0] - p0[0], c1[1] - p0[1]), s2 = Math.hypot(c2[0] - p0[0], c2[1] - p0[1])
    if (Math.max(s1, s2) <= tol) { out.push(p3); return }
  } else if (sum * sum <= (16 / 9) * tol * tol * chordSq) { out.push(p3); return }
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const a = mid(p0, c1), b = mid(c1, c2), c = mid(c2, p3)
  const ab = mid(a, b), bc = mid(b, c), abc = mid(ab, bc)
  flattenCubic(out, p0, a, ab, abc, tol, depth + 1)
  flattenCubic(out, abc, bc, c, p3, tol, depth + 1)
}

// Greatest radial error of the standard four-point cubic approximation of a
// 90-degree arc, as a fraction of the radius; it falls roughly as the sixth
// power of the span, which is what SPAN_FOR_TOLERANCE below inverts.
const QUARTER_ARC_ERROR = 2.7e-4

/**
 * An elliptical arc as cubics, via the centre parameterization of SVG F.6.5.
 * Pieces span at most 90 degrees, and less when the radius is large enough that
 * the approximation would otherwise stray further than `tol` from the true arc.
 */
function arcToCubics(p0: Pt, rxIn: number, ryIn: number, xRotDeg: number, largeArc: boolean, sweep: boolean, p: Pt, tol: number): [Pt, Pt, Pt][] {
  if (p0[0] === p[0] && p0[1] === p[1]) return []
  let rx = Math.abs(rxIn), ry = Math.abs(ryIn)
  if (rx === 0 || ry === 0) return [[p0, p, p]]  // degenerate radii: a straight line, per the spec
  const phi = (xRotDeg * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi)
  const dx2 = (p0[0] - p[0]) / 2, dy2 = (p0[1] - p[1]) / 2
  const x1 = cos * dx2 + sin * dy2, y1 = -sin * dx2 + cos * dy2
  // radii too small to span the chord are scaled up until they just reach
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (lambda > 1) { const k = Math.sqrt(lambda); rx *= k; ry *= k }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1
  const coef = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den))
  const cx1 = (coef * rx * y1) / ry, cy1 = (-coef * ry * x1) / rx
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p[0]) / 2
  const cy = sin * cx1 + cos * cy1 + (p0[1] + p[1]) / 2
  const theta = Math.atan2((y1 - cy1) / ry, (x1 - cx1) / rx)
  const end = Math.atan2((-y1 - cy1) / ry, (-x1 - cx1) / rx)
  let delta = (end - theta) % (2 * Math.PI)
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  if (sweep && delta < 0) delta += 2 * Math.PI
  const quarter = Math.PI / 2
  const span = quarter * Math.pow(tol / (Math.max(rx, ry) * QUARTER_ARC_ERROR), 1 / 6)
  const pieces = Math.max(1, Math.ceil(Math.abs(delta) / Math.min(quarter, span || quarter)))
  const step = delta / pieces
  // handle length of the four-point approximation of a `step`-radian unit arc
  const k = (4 / 3) * Math.tan(step / 4)
  const on = (t: number): Pt => {
    const ct = Math.cos(t), st = Math.sin(t)
    return [cx + rx * cos * ct - ry * sin * st, cy + rx * sin * ct + ry * cos * st]
  }
  const tangent = (t: number): Pt => {
    const ct = Math.cos(t), st = Math.sin(t)
    return [-rx * cos * st - ry * sin * ct, -rx * sin * st + ry * cos * ct]
  }
  const out: [Pt, Pt, Pt][] = []
  for (let i = 0; i < pieces; i++) {
    const t0 = theta + i * step, t1 = t0 + step
    const a = on(t0), b = on(t1), ta = tangent(t0), tb = tangent(t1)
    out.push([[a[0] + k * ta[0], a[1] + k * ta[1]], [b[0] - k * tb[0], b[1] - k * tb[1]], b])
  }
  return out
}

/**
 * Flatten a path's `d` attribute into polylines, in the path's own units.
 * `tolerance` is the greatest allowed deviation from the true curve, same units.
 * A subpath of fewer than two points is dropped.
 */
export function flattenPath(d: string, tolerance = 0.05): SubPath[] {
  const tol = Math.max(1e-9, tolerance)
  const s = scanner(d)
  const paths: SubPath[] = []
  let points: Pt[] = []
  let cur: Pt = [0, 0], start: Pt = [0, 0]
  let lastCubic: Pt | null = null, lastQuad: Pt | null = null
  let cmd = ''
  const endSubPath = (closed: boolean) => {
    if (points.length >= 2) paths.push({ points, closed })
    points = []
  }
  while (!s.done()) {
    const next = s.command()
    if (next) cmd = next
    else if (!cmd) throw new Error('path does not begin with a command')
    else if (cmd === 'M') cmd = 'L'        // an implicit repeat after a moveto is a lineto
    else if (cmd === 'm') cmd = 'l'
    const rel = cmd >= 'a' && cmd <= 'z'
    const at = (x: number, y: number): Pt => (rel ? [cur[0] + x, cur[1] + y] : [x, y])
    const upper = cmd.toUpperCase()
    if (upper === 'Z') {
      if (points.length) { points.push([start[0], start[1]]); endSubPath(true) }
      cur = [start[0], start[1]]
      lastCubic = lastQuad = null
      continue
    }
    let p: Pt
    switch (upper) {
      case 'M': {
        endSubPath(false)
        p = at(s.number(), s.number())
        start = p
        points = [p]
        lastCubic = lastQuad = null
        break
      }
      case 'L': p = at(s.number(), s.number()); points.push(p); lastCubic = lastQuad = null; break
      case 'H': p = rel ? [cur[0] + s.number(), cur[1]] : [s.number(), cur[1]]; points.push(p); lastCubic = lastQuad = null; break
      case 'V': p = rel ? [cur[0], cur[1] + s.number()] : [cur[0], s.number()]; points.push(p); lastCubic = lastQuad = null; break
      case 'C': case 'S': {
        const c1: Pt = upper === 'C' ? at(s.number(), s.number())
          : lastCubic ? [2 * cur[0] - lastCubic[0], 2 * cur[1] - lastCubic[1]] : [cur[0], cur[1]]
        const c2 = at(s.number(), s.number())
        p = at(s.number(), s.number())
        if (!points.length) points.push([cur[0], cur[1]])
        flattenCubic(points, cur, c1, c2, p, tol)
        lastCubic = c2; lastQuad = null
        break
      }
      case 'Q': case 'T': {
        const q: Pt = upper === 'Q' ? at(s.number(), s.number())
          : lastQuad ? [2 * cur[0] - lastQuad[0], 2 * cur[1] - lastQuad[1]] : [cur[0], cur[1]]
        p = at(s.number(), s.number())
        // a quadratic is the cubic whose controls sit two thirds along each leg
        const c1: Pt = [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])]
        const c2: Pt = [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])]
        if (!points.length) points.push([cur[0], cur[1]])
        flattenCubic(points, cur, c1, c2, p, tol)
        lastQuad = q; lastCubic = null
        break
      }
      case 'A': {
        const rx = s.number(), ry = s.number(), rot = s.number()
        const large = s.flag(), sweep = s.flag()
        p = at(s.number(), s.number())
        if (!points.length) points.push([cur[0], cur[1]])
        let from = cur
        for (const [c1, c2, end] of arcToCubics(cur, rx, ry, rot, large, sweep, p, tol)) {
          flattenCubic(points, from, c1, c2, end, tol)
          from = end
        }
        lastCubic = lastQuad = null
        break
      }
      default: throw new Error(`unsupported path command '${cmd}'`)
    }
    cur = p
  }
  endSubPath(false)
  return paths
}

/** Every `d` attribute in an SVG fragment, flattened and concatenated. */
export function flattenPathElements(svg: string, tolerance = 0.05): SubPath[] {
  const out: SubPath[] = []
  for (const m of svg.matchAll(/\bd\s*=\s*(?:'([^']*)'|"([^"]*)")/g)) out.push(...flattenPath(m[1] ?? m[2], tolerance))
  return out
}
