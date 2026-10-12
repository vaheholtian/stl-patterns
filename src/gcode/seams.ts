// Move wall seams to the inside of a part, in sliced G-code (Bambu Studio / Orca).
//
// A pattern cut through a wall turns each layer into many small islands (the slats
// between holes), and each island is printed as its own closed wall loop with its own
// seam. The slicer's "back" seam puts that seam toward +Y, which is the inside face of
// a slat on the front of a cylinder and the outside face on the back. This rewrites
// every such loop to start and end in the middle of its inner face, the side facing
// the centre of the layer's walls, and redoes the travel into the loop and the wipe
// out of it. Extrusion, speeds and line widths are carried over segment by segment.
//
// Loops that go round the centre (a plain ring of wall) and open paths (single-line
// walls) are left alone: a ring has no inner face to move to, an open path no seam.

export interface SeamOptions {
  /** wall features whose loops are moved (Bambu/Orca feature names) */
  features?: string[]
}

export interface SeamPoint {
  x: number
  y: number
  /** 0 = on the loop's innermost point, 1 = on its outermost */
  depth: number
}

export interface LayerSeams {
  layer: number
  z: number
  seams: SeamPoint[]
  /** island outlines, for drawing: flat [x0, y0, x1, y1, ...] per loop */
  loops: number[][]
  center: [number, number]
}

export interface SeamReport {
  layers: LayerSeams[]
  /** closed island loops whose seam sits on the inner face / outer face / a side */
  inside: number
  outside: number
  side: number
  /** loops round the centre and open single-line paths, which have no inner face to move to */
  untouched: number
}

export interface SeamResult {
  gcode: string
  moved: number
  alreadyInside: number
  /** loops that looked movable but were left as sliced, by reason */
  skipped: Record<string, number>
}

const DEFAULT_FEATURES = ['Outer wall', 'Inner wall']
/** a loop is closed when it ends this close to where it started (the slicer's seam gap is far smaller) */
const CLOSED_GAP = 0.5
/** a start this close to the chosen point counts as already there */
const ALREADY_THERE = 0.3

// ---------------------------------------------------------------- parsing

const WORD = /([XYZEIJFR])(-?\d*\.?\d+)/g
const MOVE = /^G[0-3](?:\s|$)/

interface Words { X?: number; Y?: number; Z?: number; E?: number; I?: number; J?: number; F?: number; R?: number }

function words(line: string): Words {
  const semi = line.indexOf(';')
  const code = semi < 0 ? line : line.slice(0, semi)
  const w: Record<string, number> = {}
  for (const m of code.matchAll(WORD)) w[m[1]] = parseFloat(m[2])
  return w
}

/** G-code number the way Bambu writes it: trimmed zeros, no leading zero */
export function fmt(v: number, digits = 3): string {
  let s = v.toFixed(digits)
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '')
  if (s.startsWith('0.')) s = s.slice(1)
  else if (s.startsWith('-0.')) s = '-' + s.slice(2)
  if (s === '' || s === '-' || s === '-0') s = '0'
  return s
}

const isFeature = (l: string) => l.startsWith('; FEATURE:') || l.startsWith(';TYPE:')
const featureName = (l: string) => l.slice(l.indexOf(':') + 1).trim()

interface Scan {
  lines: string[]
  /** tool position before each line */
  px: Float64Array
  py: Float64Array
  /** feedrate line and line-width comment in force before each line */
  fBefore: (string | null)[]
  wBefore: (string | null)[]
  layer: Int32Array
  z: Float64Array
  /** wall feature in force at each line, or null */
  feature: (string | null)[]
  /** layer:object key for the centre fit */
  group: string[]
  relativeE: boolean
}

function scan(gcode: string, features: Set<string>): Scan {
  const lines = gcode.split('\n')
  const n = lines.length
  const px = new Float64Array(n), py = new Float64Array(n), z = new Float64Array(n)
  const layer = new Int32Array(n)
  const fBefore: (string | null)[] = new Array(n)
  const wBefore: (string | null)[] = new Array(n)
  const feature: (string | null)[] = new Array(n)
  const group: string[] = new Array(n)
  let x = 0, y = 0, cz = 0, L = 0, F: string | null = null, W: string | null = null
  let feat: string | null = null, obj = '', relXY = false, relativeE = false
  for (let i = 0; i < n; i++) {
    const l = lines[i]
    px[i] = x; py[i] = y; fBefore[i] = F; wBefore[i] = W
    if (l.startsWith('; CHANGE_LAYER') || l.startsWith(';LAYER_CHANGE')) L++
    else if (isFeature(l)) { const f = featureName(l); feat = features.has(f) ? f : null }
    else if (l.startsWith('; OBJECT_ID:')) obj = l.slice(12).trim()
    else if (l.startsWith('; LINE_WIDTH') || l.startsWith(';WIDTH:')) W = l
    else if (l.startsWith('G90') && !l.startsWith('G90.')) relXY = false
    else if (l.startsWith('G91') && !l.startsWith('G91.')) relXY = true
    else if (l.startsWith('M83')) relativeE = true
    else if (l.startsWith('M82')) relativeE = false
    else if (MOVE.test(l)) {
      const w = words(l)
      if (w.F !== undefined) F = 'G1 F' + fmt(w.F)
      if (relXY) { x += w.X ?? 0; y += w.Y ?? 0; cz += w.Z ?? 0 }
      else { x = w.X ?? x; y = w.Y ?? y; cz = w.Z ?? cz }
    }
    layer[i] = L; z[i] = cz; feature[i] = feat; group[i] = L + ':' + obj
  }
  return { lines, px, py, fBefore, wBefore, layer, z, feature, group, relativeE }
}

function isExtrudingXY(l: string): boolean {
  if (!MOVE.test(l)) return false
  const w = words(l)
  return (w.X !== undefined || w.Y !== undefined) && (w.E ?? 0) > 0
}

// ---------------------------------------------------------------- geometry

interface Seg {
  g: 1 | 2 | 3
  a: [number, number]
  b: [number, number]
  e: number
  /** arc centre and radius */
  c?: [number, number]
  r?: number
  F: string
  W: string | null
  /** lines (fan, progress, comments) printed just before this segment */
  extras: string[]
}

const dist = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1])

function sweep(s: Seg): number {
  const [cx, cy] = s.c!
  let d = Math.atan2(s.b[1] - cy, s.b[0] - cx) - Math.atan2(s.a[1] - cy, s.a[0] - cx)
  if (s.g === 2) { while (d >= 0) d -= 2 * Math.PI } else { while (d <= 0) d += 2 * Math.PI }
  return d
}

function segLength(s: Seg): number {
  return s.g === 1 ? dist(s.a, s.b) : Math.abs(sweep(s)) * s.r!
}

function pointAt(s: Seg, t: number): [number, number] {
  if (s.g === 1) return [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t]
  const [cx, cy] = s.c!
  const a = Math.atan2(s.a[1] - cy, s.a[0] - cx) + sweep(s) * t
  return [cx + s.r! * Math.cos(a), cy + s.r! * Math.sin(a)]
}

function split(s: Seg, t: number): [Seg, Seg] {
  const p = pointAt(s, t)
  return [{ ...s, b: p, e: s.e * t }, { ...s, a: p, e: s.e * (1 - t), extras: [] }]
}

/** wrap an angle difference into (-pi, pi] */
const wrap = (d: number) => d - 2 * Math.PI * Math.round(d / (2 * Math.PI))

/** Kasa least-squares circle centre */
export function fitCenter(pts: number[]): [number, number] | null {
  const n = pts.length / 2
  if (n < 3) return null
  let sx = 0, sy = 0
  for (let i = 0; i < pts.length; i += 2) { sx += pts[i]; sy += pts[i + 1] }
  sx /= n; sy /= n
  let suu = 0, suv = 0, svv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0
  for (let i = 0; i < pts.length; i += 2) {
    const u = pts[i] - sx, v = pts[i + 1] - sy
    suu += u * u; svv += v * v; suv += u * v
    suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u
  }
  const det = suu * svv - suv * suv
  if (Math.abs(det) < 1e-12) return [sx, sy]
  const b1 = 0.5 * (suuu + suvv), b2 = 0.5 * (svvv + svuu)
  return [sx + (b1 * svv - b2 * suv) / det, sy + (suu * b2 - suv * b1) / det]
}

/** turning of the loop round c, in radians: about +-2pi when it goes round c, about 0 when not */
function winding(segs: Seg[], c: [number, number]): number {
  let w = 0
  for (const s of segs) {
    const n = s.g === 1 ? 1 : Math.max(2, Math.ceil(Math.abs(sweep(s)) / 0.2))
    let prev = s.a
    for (let k = 1; k <= n; k++) {
      const p = pointAt(s, k / n)
      w += wrap(Math.atan2(p[1] - c[1], p[0] - c[0]) - Math.atan2(prev[1] - c[1], prev[0] - c[0]))
      prev = p
    }
  }
  return w
}

/**
 * Where a loop's seam belongs: on the ray from the centre through the middle of the
 * loop's angular span, at the crossing nearest the centre. Returns segment index and
 * fraction along it.
 */
function innerPoint(ring: Seg[], c: [number, number]): { si: number; t: number; p: [number, number] } | null {
  // unwrapped polar angle along the loop, so a C-shaped island gets its true span
  const samples: { si: number; t: number; ang: number }[] = []
  let acc = Math.atan2(ring[0].a[1] - c[1], ring[0].a[0] - c[0]), prevRaw = acc
  ring.forEach((s, si) => {
    const n = s.g === 1 ? 4 : Math.max(4, Math.ceil(Math.abs(sweep(s)) / 0.05))
    for (let k = 0; k <= n; k++) {
      const t = k / n, p = pointAt(s, t)
      const raw = Math.atan2(p[1] - c[1], p[0] - c[0])
      acc += wrap(raw - prevRaw); prevRaw = raw
      samples.push({ si, t, ang: acc })
    }
  })
  let lo = Infinity, hi = -Infinity
  for (const s of samples) { lo = Math.min(lo, s.ang); hi = Math.max(hi, s.ang) }
  const theta = (lo + hi) / 2
  let best: { si: number; t: number; p: [number, number]; r: number } | null = null
  for (let k = 1; k < samples.length; k++) {
    const s0 = samples[k - 1], s1 = samples[k]
    if (s0.si !== s1.si) continue
    const d0 = s0.ang - theta, d1 = s1.ang - theta
    if (d0 === d1 || (d0 > 0 && d1 > 0) || (d0 < 0 && d1 < 0)) continue
    const t = s0.t + (s1.t - s0.t) * (-d0) / (d1 - d0)
    const p = pointAt(ring[s0.si], t)
    const r = dist(p, c)
    if (!best || r < best.r) best = { si: s0.si, t, p, r }
  }
  return best
}

// ---------------------------------------------------------------- loop extraction

interface Loop {
  /** first and last line of the loop body (extrusion moves and what sits between them) */
  from: number
  to: number
  segs: Seg[]
  start: [number, number]
  end: [number, number]
  /** acceleration set inside the body, hoisted to the front when the loop is rotated */
  accel: string | null
  /** the body holds something we do not know how to carry along */
  unsafe: string | null
}

const DECO = /^(; LINE_WIDTH|;WIDTH:|; Slow Down|M106|M107|M73 |M204|G1 F[\d.]+\s*$)/

/** Read the extrusion path starting at line i; returns null when line i does not start one. */
function readPath(sc: Scan, i: number): Loop | null {
  const { lines } = sc
  let j = i, last = i
  const body: number[] = []
  while (j < lines.length) {
    const l = lines[j]
    if (isExtrudingXY(l)) { body.push(j); last = j }
    else if (!DECO.test(l)) break
    j++
  }
  const segs: Seg[] = []
  let F = sc.fBefore[i], W = sc.wBefore[i], extras: string[] = [], accel: string | null = null
  let unsafe: string | null = null
  for (let k = i; k <= last; k++) {
    const l = lines[k]
    if (!isExtrudingXY(l)) {
      if (l.startsWith('; LINE_WIDTH') || l.startsWith(';WIDTH:')) W = l
      else if (l.startsWith('G1 F')) F = l.trim()
      else if (l.startsWith('M204')) { if (accel && accel !== l) unsafe = 'acceleration'; accel = l }
      else extras.push(l)
      continue
    }
    const w = words(l)
    const a: [number, number] = [sc.px[k], sc.py[k]]
    const b: [number, number] = [w.X ?? a[0], w.Y ?? a[1]]
    const g = +l[1] as 0 | 1 | 2 | 3
    if (g === 0) unsafe = 'G0 extrusion'
    if (!F) unsafe = 'no feedrate'
    const s: Seg = { g: g === 0 ? 1 : g, a, b, e: w.E!, F: F ?? '', W, extras }
    if (w.F !== undefined) { F = 'G1 F' + fmt(w.F); unsafe = unsafe ?? 'feedrate on a move' }
    if (w.Z !== undefined) unsafe = 'z move'
    extras = []
    if (g === 2 || g === 3) {
      if (w.I === undefined && w.J === undefined) unsafe = 'R-form arc'
      s.c = [a[0] + (w.I ?? 0), a[1] + (w.J ?? 0)]
      s.r = dist(a, s.c)
    }
    segs.push(s)
  }
  const endLine = lines[last]
  const we = words(endLine)
  return {
    from: i, to: last, segs,
    start: [sc.px[i], sc.py[i]],
    end: [we.X ?? sc.px[last], we.Y ?? sc.py[last]],
    accel, unsafe,
  }
}

/** Every wall path, grouped with the centre of its layer's walls. */
function collect(sc: Scan) {
  const paths: Loop[] = []
  const pts = new Map<string, number[]>()
  for (let i = 0; i < sc.lines.length; i++) {
    if (!sc.feature[i] || !isExtrudingXY(sc.lines[i])) continue
    const p = readPath(sc, i)!
    paths.push(p)
    let arr = pts.get(sc.group[i])
    if (!arr) pts.set(sc.group[i], arr = [])
    for (const s of p.segs) arr.push(s.b[0], s.b[1])
    i = p.to
  }
  const centers = new Map<string, [number, number]>()
  for (const [k, v] of pts) { const c = fitCenter(v); if (c) centers.set(k, c) }
  return { paths, centers }
}

type Kind = { kind: 'island'; center: [number, number] } | { kind: 'other' }

function classify(sc: Scan, p: Loop, centers: Map<string, [number, number]>): Kind {
  const c = centers.get(sc.group[p.from])
  if (!c || p.segs.length < 3 || dist(p.start, p.end) > CLOSED_GAP) return { kind: 'other' }
  const ring = [...p.segs, closing(p)]
  if (Math.abs(winding(ring, c)) > Math.PI) return { kind: 'other' }
  return { kind: 'island', center: c }
}

function closing(p: Loop): Seg {
  const last = p.segs[p.segs.length - 1]
  const gap = dist(p.end, p.start)
  const rate = last.e / Math.max(segLength(last), 1e-6)
  return { g: 1, a: p.end, b: p.start, e: rate * gap, F: last.F, W: last.W, extras: [] }
}

// ---------------------------------------------------------------- report

/** Where the seams of a sliced file sit now, layer by layer. */
export function analyzeSeams(gcode: string, opts: SeamOptions = {}): SeamReport {
  const sc = scan(gcode, new Set(opts.features ?? DEFAULT_FEATURES))
  const { paths, centers } = collect(sc)
  const byLayer = new Map<number, LayerSeams>()
  const report: SeamReport = { layers: [], inside: 0, outside: 0, side: 0, untouched: 0 }
  for (const p of paths) {
    const k = classify(sc, p, centers)
    if (k.kind !== 'island') { report.untouched++; continue }
    const c = k.center
    let rmin = Infinity, rmax = -Infinity
    const outline: number[] = [p.start[0], p.start[1]]
    for (const s of p.segs) {
      const n = s.g === 1 ? 1 : Math.max(2, Math.ceil(segLength(s) / 0.5))
      for (let q = 0; q <= n; q++) {
        const pt = pointAt(s, q / n)
        const r = dist(pt, c)
        rmin = Math.min(rmin, r); rmax = Math.max(rmax, r)
        if (q > 0) outline.push(pt[0], pt[1])
      }
    }
    const depth = rmax - rmin < 1e-6 ? 0 : (dist(p.start, c) - rmin) / (rmax - rmin)
    if (depth < 0.25) report.inside++
    else if (depth > 0.75) report.outside++
    else report.side++
    const L = sc.layer[p.from]
    let ls = byLayer.get(L)
    if (!ls) byLayer.set(L, ls = { layer: L, z: sc.z[p.from], seams: [], loops: [], center: c })
    ls.seams.push({ x: p.start[0], y: p.start[1], depth })
    ls.loops.push(outline)
  }
  report.layers = [...byLayer.values()].sort((a, b) => a.layer - b.layer)
  return report
}

// ---------------------------------------------------------------- rewrite

/** Rotate every island loop so its seam sits in the middle of its inner face. */
export function moveSeamsInside(gcode: string, opts: SeamOptions = {}): SeamResult {
  const sc = scan(gcode, new Set(opts.features ?? DEFAULT_FEATURES))
  if (!sc.relativeE) throw new Error('This G-code uses absolute extrusion (M82); only relative extrusion (M83, the Bambu default) is supported.')
  const { paths, centers } = collect(sc)
  const { lines } = sc
  const byStart = new Map<number, Loop>()
  for (const p of paths) byStart.set(p.from, p)

  const out: string[] = []
  const result: SeamResult = { gcode: '', moved: 0, alreadyInside: 0, skipped: {} }
  const skip = (why: string) => { result.skipped[why] = (result.skipped[why] ?? 0) + 1 }
  let lastTravel = -1   // index in out[] of the last XY move without extrusion

  for (let i = 0; i < lines.length; i++) {
    const p = byStart.get(i)
    const pass = () => { for (let k = p!.from; k <= p!.to; k++) out.push(lines[k]); i = p!.to }
    if (!p) {
      const l = lines[i]
      if (MOVE.test(l)) {
        const w = words(l)
        if ((w.X !== undefined || w.Y !== undefined) && !(w.E! > 0)) lastTravel = out.length
      }
      out.push(l)
      continue
    }
    const k = classify(sc, p, centers)
    if (k.kind !== 'island') { pass(); continue }
    if (p.unsafe) { skip(p.unsafe); pass(); continue }
    const c = k.center
    const gap = dist(p.start, p.end)
    const ring = gap > 1e-4 ? [...p.segs, closing(p)] : [...p.segs]
    const hit = innerPoint(ring, c)
    if (!hit) { skip('no inner face'); pass(); continue }
    if (dist(hit.p, p.start) < ALREADY_THERE) { result.alreadyInside++; pass(); continue }

    // the travel into the loop has to land on the new start
    const tw = lastTravel >= 0 ? words(out[lastTravel]) : {}
    if (lastTravel < 0 || Math.abs((tw.X ?? NaN) - p.start[0]) > 1e-3 || Math.abs((tw.Y ?? NaN) - p.start[1]) > 1e-3) {
      skip('travel not found'); pass(); continue
    }

    // rotate the ring to start at the inner point, then take the seam gap back off the end
    let seq: Seg[]
    if (hit.t < 1e-3) seq = [...ring.slice(hit.si), ...ring.slice(0, hit.si)]
    else if (hit.t > 1 - 1e-3) seq = [...ring.slice(hit.si + 1), ...ring.slice(0, hit.si + 1)]
    else {
      const [s1, s2] = split(ring[hit.si], hit.t)
      seq = [s2, ...ring.slice(hit.si + 1), ...ring.slice(0, hit.si), s1]
    }
    let remain = gap
    while (remain > 1e-6 && seq.length > 1) {
      const s = seq[seq.length - 1], len = segLength(s)
      if (len <= remain + 1e-6) { seq.pop(); remain -= len }
      else { seq[seq.length - 1] = split(s, (len - remain) / len)[0]; remain = 0 }
    }
    const newStart = seq[0].a, newEnd = seq[seq.length - 1].b

    out[lastTravel] = out[lastTravel]
      .replace(/X-?\d*\.?\d+/, 'X' + fmt(newStart[0]))
      .replace(/Y-?\d*\.?\d+/, 'Y' + fmt(newStart[1]))

    if (p.accel) out.push(p.accel)
    let curF: string | null = null, curW: string | null = null
    for (const s of seq) {
      out.push(...s.extras)
      if (segLength(s) < 0.002) continue
      if (s.W && s.W !== curW) { out.push(s.W); curW = s.W }
      if (s.F !== curF) { out.push(s.F); curF = s.F }
      const xy = `X${fmt(s.b[0])} Y${fmt(s.b[1])}`
      out.push(s.g === 1
        ? `G1 ${xy} E${fmt(s.e, 5)}`
        : `G${s.g} ${xy} I${fmt(s.c![0] - s.a[0])} J${fmt(s.c![1] - s.a[1])} E${fmt(s.e, 5)}`)
    }
    // the wipe inherits the feedrate the loop ended on
    const lastF = p.segs[p.segs.length - 1].F
    if (lastF !== curF) out.push(lastF)

    // the wipe: same length and retraction, now running from the new end back along the new loop
    let w0 = p.to + 1
    while (w0 < lines.length && !lines[w0].startsWith('; WIPE_START') && !MOVE.test(lines[w0])) w0++
    let next = p.to
    if (w0 < lines.length && lines[w0].startsWith('; WIPE_START')) {
      let w1 = w0
      while (w1 < lines.length && !lines[w1].startsWith('; WIPE_END')) w1++
      let wlen = 0, we = 0
      for (let q = p.to + 1; q <= w0; q++) out.push(lines[q])
      for (let q = w0 + 1; q < w1; q++) {
        const l = lines[q]
        if (!MOVE.test(l)) { out.push(l); continue }
        const w = words(l)
        if (w.X !== undefined || w.Y !== undefined) {
          wlen += Math.hypot((w.X ?? sc.px[q]) - sc.px[q], (w.Y ?? sc.py[q]) - sc.py[q])
          we += w.E ?? 0
        } else if (w.E === undefined) out.push(l)   // a feedrate change
      }
      const path: [number, number][] = [newStart]
      for (const s of seq) {
        const n = s.g === 1 ? 1 : Math.max(1, Math.ceil(segLength(s) / 0.5))
        for (let q = 1; q <= n; q++) path.push(pointAt(s, q / n))
      }
      let cur = newEnd, left = wlen
      const moves: [[number, number], number][] = []
      for (let pt of path) {
        let d = dist(cur, pt)
        if (d < 1e-6) continue
        if (d >= left) { pt = [cur[0] + (pt[0] - cur[0]) * left / d, cur[1] + (pt[1] - cur[1]) * left / d]; d = left }
        moves.push([pt, d]); cur = pt; left -= d
        if (left <= 1e-6) break
      }
      const total = moves.reduce((s, m) => s + m[1], 0) || 1
      for (const [pt, d] of moves) out.push(`G1 X${fmt(pt[0])} Y${fmt(pt[1])} E${fmt(we * d / total, 5)}`)
      next = w1 - 1
    }
    result.moved++
    i = next
  }
  result.gcode = out.join('\n')
  return result
}
