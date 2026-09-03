// Moire generator.
//
// Overlays two families of parallel lines (or, in 'radial' mode, a family
// of parallel lines plus a family of concentric circles) across the tile
// box. The visual "moire" beating comes from the small angle and/or pitch
// mismatch between the two families.
//
// Every line/circle is clipped to the box exactly (not left for a later
// clip step):
//   - straight lines use the standard Liang-Barsky parametric clip against
//     the box rectangle, so each output polyline's endpoints are the exact
//     line/box-edge intersections;
//   - circles are clipped by finding their intersection points with the
//     four box edges analytically, sorting the intersections by angle, and
//     keeping only the circular arcs whose midpoint angle lies inside the
//     box (a circle fully inside the box is kept as a single closed curve;
//     a circle fully outside contributes nothing).
//
// Line family A sits at `angleA` (default 0 degrees) with spacing `pitch`;
// its grid is anchored so one member passes through the box's local origin
// (offset 0 along its own normal), stepping by `pitch` from there. Line
// family B sits at `angleB` (default 12 degrees) with spacing
// `pitch * pitchRatio`, anchored the same way, unless `mode` is 'radial',
// in which case family B is replaced by concentric circles centred on the
// box with the same spacing.
//
// Seamless tiling requires each family's lines to line up with the
// corresponding lines of the neighbouring tile repeat. That only happens
// for the angleA=0 family, and only when `pitch` evenly divides the box
// height (its lines are horizontal, so horizontal translation is already
// seamless and vertical translation needs the spacing to divide the box).
// Family B (any non-zero angle) and the 'radial' circles are NOT seamless
// across tile edges in general.

import type { Generator, GeneratorContext, ParamValue, Pt, TileCurve } from './types'
import { getNum } from './types'

const DEG = Math.PI / 180

/** Liang-Barsky clip of the infinite line {p0 + t*d} against [0,w]x[0,h].
 * Returns the clipped segment's two endpoints, or null if it misses the box. */
function clipLineToBox(p0: Pt, d: Pt, w: number, h: number): [Pt, Pt] | null {
  let t0 = -Infinity
  let t1 = Infinity
  const p = [-d[0], d[0], -d[1], d[1]]
  const q = [p0[0], w - p0[0], p0[1], h - p0[1]]
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-12) {
      if (q[i] < 0) return null // parallel to this boundary and on the outside
      continue
    }
    const r = q[i] / p[i]
    if (p[i] < 0) {
      if (r > t0) t0 = r
    } else {
      if (r < t1) t1 = r
    }
  }
  if (t0 > t1) return null
  return [
    [p0[0] + t0 * d[0], p0[1] + t0 * d[1]],
    [p0[0] + t1 * d[0], p0[1] + t1 * d[1]],
  ]
}

/** Generate one family of parallel lines at angle `angleRad`, spacing
 * `pitch`, anchored through the box's local origin, clipped to the box. */
function lineFamily(angleRad: number, pitch: number, w: number, h: number): TileCurve[] {
  const d: Pt = [Math.cos(angleRad), Math.sin(angleRad)]
  const n: Pt = [-Math.sin(angleRad), Math.cos(angleRad)] // unit normal
  const corners: Pt[] = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ]
  const cVals = corners.map((c) => n[0] * c[0] + n[1] * c[1])
  const minC = Math.min(...cVals)
  const maxC = Math.max(...cVals)
  const mLo = Math.floor(minC / pitch) - 1
  const mHi = Math.ceil(maxC / pitch) + 1
  const curves: TileCurve[] = []
  for (let m = mLo; m <= mHi; m++) {
    const c = m * pitch
    const p0: Pt = [c * n[0], c * n[1]]
    const seg = clipLineToBox(p0, d, w, h)
    if (seg) curves.push({ points: [seg[0], seg[1]], closed: false })
  }
  return curves
}

/** Intersection points of the circle (cx,cy,r) with the box's four edges. */
function circleBoxIntersections(cx: number, cy: number, r: number, w: number, h: number): Pt[] {
  const pts: Pt[] = []
  const push = (x: number, y: number) => {
    if (x >= -1e-9 && x <= w + 1e-9 && y >= -1e-9 && y <= h + 1e-9) pts.push([x, y])
  }
  // Horizontal edges y = 0 and y = h
  for (const Y of [0, h]) {
    const dy = Y - cy
    const disc = r * r - dy * dy
    if (disc >= 0) {
      const dx = Math.sqrt(disc)
      push(cx - dx, Y)
      push(cx + dx, Y)
    }
  }
  // Vertical edges x = 0 and x = w
  for (const X of [0, w]) {
    const dx = X - cx
    const disc = r * r - dx * dx
    if (disc >= 0) {
      const dy = Math.sqrt(disc)
      push(X, cy - dy)
      push(X, cy + dy)
    }
  }
  // De-duplicate near-identical points (corners can be hit by both loops).
  const out: Pt[] = []
  for (const p of pts) {
    if (!out.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6)) out.push(p)
  }
  return out
}

function pointInBox(p: Pt, w: number, h: number): boolean {
  return p[0] >= -1e-6 && p[0] <= w + 1e-6 && p[1] >= -1e-6 && p[1] <= h + 1e-6
}

/** Approximate an arc from angle a0 to a1 (radians, a1 > a0) around (cx,cy)
 * with radius r, segments no longer than ~0.4mm / ~6 degrees. */
function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number): Pt[] {
  const sweep = a1 - a0
  const byAngle = sweep / (6 * DEG)
  const byLength = (sweep * r) / 0.4
  const segs = Math.max(1, Math.ceil(Math.max(byAngle, byLength)))
  const pts: Pt[] = []
  for (let i = 0; i <= segs; i++) {
    const a = a0 + (sweep * i) / segs
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

/**
 * Snap a line family so it repeats exactly on the w x h box. A family with
 * unit normal n and pitch p is invariant under the box translations when
 * n.(w,0) and n.(0,h) are whole multiples of p, i.e. n = p*(a/w, b/h) for
 * integers a, b. Round the ideal (a, b) and rebuild angle and pitch from them.
 */
function snapFamily(angleRad: number, pitch: number, w: number, h: number): { angle: number; pitch: number } {
  const n: Pt = [-Math.sin(angleRad), Math.cos(angleRad)]
  let a = Math.round((w * n[0]) / pitch)
  let b = Math.round((h * n[1]) / pitch)
  if (a === 0 && b === 0) { if (Math.abs(w * n[0]) > Math.abs(h * n[1])) a = Math.sign(n[0]) || 1; else b = Math.sign(n[1]) || 1 }
  if (b < 0 || (b === 0 && a < 0)) { a = -a; b = -b }
  const nx = a / w, ny = b / h
  const p = 1 / Math.hypot(nx, ny)
  // n = p*(nx, ny) = (-sin, cos)
  return { angle: Math.atan2(-nx * p, ny * p), pitch: p }
}

/** One family of concentric circles around the box centre, spaced by
 * `pitch`, each clipped exactly to the box (or kept inside `maxRadius`). */
function radialFamily(pitch: number, w: number, h: number, maxRadius = Infinity): TileCurve[] {
  const cx = w / 2
  const cy = h / 2
  const cornerDist = Math.max(
    Math.hypot(cx, cy),
    Math.hypot(w - cx, cy),
    Math.hypot(cx, h - cy),
    Math.hypot(w - cx, h - cy),
  )
  const curves: TileCurve[] = []
  const maxM = Math.ceil(Math.min(cornerDist, maxRadius) / pitch)
  for (let m = 1; m <= maxM; m++) {
    const r = m * pitch
    if (r > maxRadius) break
    const inter = circleBoxIntersections(cx, cy, r, w, h)
    if (inter.length === 0) {
      // Either fully inside the box, or fully outside it.
      const testInside = pointInBox([cx + r, cy], w, h)
      if (testInside) curves.push({ points: arcPoints(cx, cy, r, 0, 2 * Math.PI), closed: true })
      continue
    }
    const angles = inter
      .map((p) => Math.atan2(p[1] - cy, p[0] - cx))
      .sort((a, b) => a - b)
    for (let i = 0; i < angles.length; i++) {
      const a0 = angles[i]
      const a1 = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI
      const mid = (a0 + a1) / 2
      const midPt: Pt = [cx + r * Math.cos(mid), cy + r * Math.sin(mid)]
      if (pointInBox(midPt, w, h)) {
        curves.push({ points: arcPoints(cx, cy, r, a0, a1), closed: false })
      }
    }
  }
  return curves
}

export const moireGenerator: Generator = {
  id: 'moire',
  name: 'Moire lines',
  description: 'Two overlaid line grids (or lines + concentric circles). With Seamless on, each line set is snapped to the nearest angle and pitch that repeat exactly on the box, and circles stay inside it, so the tile is seamless.',
  params: [
    { key: 'width', label: 'Width', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    { key: 'height', label: 'Height', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    { key: 'pitch', label: 'Pitch (set A)', type: 'number', default: 2.5, min: 0.3, max: 30, step: 0.1 },
    { key: 'angleA', label: 'Angle A', type: 'number', default: 0, min: -90, max: 90, step: 1, hint: 'degrees' },
    { key: 'angleB', label: 'Angle B', type: 'number', default: 12, min: -90, max: 90, step: 1, hint: 'degrees' },
    { key: 'pitchRatio', label: 'Pitch ratio (set B)', type: 'number', default: 1.05, min: 0.5, max: 2, step: 0.01 },
    {
      key: 'mode', label: 'Mode', type: 'select', default: 'lines',
      options: [
        { value: 'lines', label: 'Two line sets' },
        { value: 'radial', label: 'Lines + concentric circles' },
      ],
    },
    { key: 'ribWidth', label: 'Rib width', type: 'number', default: 1.6, min: 0.4, max: 6, step: 0.1 },
    { key: 'seamless', label: 'Seamless', type: 'boolean', default: true, hint: 'snap angles and pitches so every line set repeats exactly on the box' },
    { key: 'seed', label: 'Seed', type: 'int', default: 1, min: 0, max: 999999, step: 1 },
  ],
  generate(params: Record<string, ParamValue>, _ctx: GeneratorContext) {
    const width = getNum(params, 'width', 40)
    const height = getNum(params, 'height', 40)
    const pitch = Math.max(0.05, getNum(params, 'pitch', 2.5))
    const angleA = getNum(params, 'angleA', 0) * DEG
    const angleB = getNum(params, 'angleB', 12) * DEG
    const pitchRatio = Math.max(0.01, getNum(params, 'pitchRatio', 1.05))
    const mode = String(params.mode ?? 'lines')
    const ribWidth = getNum(params, 'ribWidth', 1.6)
    const seamless = Boolean(params.seamless ?? true)
    const notes: string[] = []

    const family = (angle: number, p: number, label: string): TileCurve[] => {
      if (!seamless) return lineFamily(angle, p, width, height)
      const s = snapFamily(angle, p, width, height)
      if (Math.abs(s.angle - angle) > 1e-6 || Math.abs(s.pitch - p) > 1e-6) notes.push(`${label} snapped to ${(s.angle / DEG).toFixed(1)} deg, pitch ${s.pitch.toFixed(2)} mm`)
      return lineFamily(s.angle, s.pitch, width, height)
    }
    const curves: TileCurve[] = []
    curves.push(...family(angleA, pitch, 'set A'))
    const pitchB = pitch * pitchRatio
    if (mode === 'radial') {
      curves.push(...radialFamily(pitchB, width, height, seamless ? Math.min(width, height) / 2 - ribWidth / 2 : Infinity))
    } else {
      curves.push(...family(angleB, pitchB, 'set B'))
    }

    return { width, height, polygons: [], curves, ribWidth, notes }
  },
}
