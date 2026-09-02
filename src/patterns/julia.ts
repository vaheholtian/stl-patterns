// Julia / Mandelbrot escape-time fractal generator.
//
// The tile box is rasterised at `resolution` mm per pixel (grid corners,
// capped at 1200x1200 so extreme requests stay tractable). Each corner gets
// a binary 0/1 value from the escape-time test:
//   - 'julia': z0 = the sampled point, c = (cRe, cIm) fixed
//   - 'mandelbrot': z0 = 0, c = the sampled point
// selected by whether the escape iteration counts as "feature":
//   - 'inside': the point never escapes within `iterations`
//   - 'band': the escape iteration falls in [bandFrom, bandTo]
//
// That raw 0/1 raster is then smoothed with a separable box blur (two
// passes of horizontal-then-vertical averaging, each using a prefix-sum
// sliding window so the cost is independent of the blur radius) so the
// eventual contour is a smooth, printable curve rather than a staircase of
// pixel edges. `smooth` is the blur radius in millimetres.
//
// Contours are then traced with marching squares at the 0.5 level, using
// linear interpolation along each crossed grid edge. The raster is padded
// with one extra ring of corners fixed at 0 (background) on all four sides
// before marching squares runs, which guarantees every contour closes into
// a loop even where the feature would otherwise run off the tile edge; the
// resulting loops are then clamped back into [0,width]x[0,height] so any
// such loop hugs the true tile boundary instead of poking past it. Loops
// shorter than 3*minFeature (by perimeter) are dropped as noise below the
// printable feature size. Even-odd fill of the nested loops produces holes
// automatically, so all loops go straight into `polygons`.
//
// This is a single fractal view framed in the tile box, not a periodic
// lattice, so it is NOT seamless across tile edges. Very detailed views
// (fine `resolution`, low `smooth`, deep zoom) can still produce a large
// number of contour points despite the smoothing and the minFeature filter;
// coarsen `resolution` or raise `smooth`/`minFeature` if a tile comes out
// too heavy to print.

import type { Generator, GeneratorContext, ParamValue, Pt } from './types'
import { getNum } from './types'

const MAX_PIXELS = 1200

function escapeIter(zre: number, zim: number, cre: number, cim: number, maxIter: number): number {
  let re = zre, im = zim
  for (let n = 0; n < maxIter; n++) {
    const re2 = re * re, im2 = im * im
    if (re2 + im2 > 4) return n
    im = 2 * re * im + cim
    re = re2 - im2 + cre
  }
  return maxIter
}

/** Box blur along one axis using a prefix-sum sliding window, so cost is
 * O(W*H) regardless of the requested radius (in grid cells). */
function boxBlurAxis(src: Float64Array<ArrayBuffer>, W: number, H: number, radius: number, horizontal: boolean): Float64Array<ArrayBuffer> {
  if (radius <= 0) return src
  const out = new Float64Array(W * H)
  if (horizontal) {
    const prefix = new Float64Array(W + 1)
    for (let y = 0; y < H; y++) {
      const rowOff = y * W
      prefix[0] = 0
      for (let x = 0; x < W; x++) prefix[x + 1] = prefix[x] + src[rowOff + x]
      for (let x = 0; x < W; x++) {
        const lo = Math.max(0, x - radius), hi = Math.min(W - 1, x + radius)
        out[rowOff + x] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1)
      }
    }
  } else {
    const prefix = new Float64Array(H + 1)
    for (let x = 0; x < W; x++) {
      prefix[0] = 0
      for (let y = 0; y < H; y++) prefix[y + 1] = prefix[y] + src[y * W + x]
      for (let y = 0; y < H; y++) {
        const lo = Math.max(0, y - radius), hi = Math.min(H - 1, y + radius)
        out[y * W + x] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1)
      }
    }
  }
  return out
}

type EdgeName = 'bottom' | 'right' | 'top' | 'left'

function interpEdge(name: EdgeName, x0: number, y0: number, x1: number, y1: number, vBL: number, vBR: number, vTR: number, vTL: number, thr: number): Pt {
  switch (name) {
    case 'bottom': { const t = (thr - vBL) / (vBR - vBL); return [x0 + t * (x1 - x0), y0] }
    case 'right': { const t = (thr - vBR) / (vTR - vBR); return [x1, y0 + t * (y1 - y0)] }
    case 'top': { const t = (thr - vTL) / (vTR - vTL); return [x0 + t * (x1 - x0), y1] }
    case 'left': { const t = (thr - vBL) / (vTL - vBL); return [x0, y0 + t * (y1 - y0)] }
  }
}

/** Marching-squares contribution of one cell: 0, 1 or 2 line segments,
 * using the generic "which edges cross the threshold" method (always 0, 2
 * or 4 crossing edges for 4 binary corners), with the two 4-crossing saddle
 * cases disambiguated by comparing the cell's average value to the
 * threshold. */
function processCell(x0: number, y0: number, x1: number, y1: number, vBL: number, vBR: number, vTR: number, vTL: number, thr: number, segments: [Pt, Pt][]) {
  const inBL = vBL >= thr, inBR = vBR >= thr, inTR = vTR >= thr, inTL = vTL >= thr
  const crossings: EdgeName[] = []
  if (inBL !== inBR) crossings.push('bottom')
  if (inBR !== inTR) crossings.push('right')
  if (inTR !== inTL) crossings.push('top')
  if (inTL !== inBL) crossings.push('left')
  if (crossings.length === 0) return
  const pt = (n: EdgeName) => interpEdge(n, x0, y0, x1, y1, vBL, vBR, vTR, vTL, thr)
  if (crossings.length === 2) {
    segments.push([pt(crossings[0]), pt(crossings[1])])
    return
  }
  // Saddle: bl,tr share one state and br,tl share the other. Disambiguate
  // with the cell average against the threshold.
  const avg = (vBL + vBR + vTR + vTL) / 4
  const connected = avg >= thr
  if (inBL) {
    if (connected) { segments.push([pt('bottom'), pt('right')]); segments.push([pt('top'), pt('left')]) }
    else { segments.push([pt('bottom'), pt('left')]); segments.push([pt('right'), pt('top')]) }
  } else {
    if (connected) { segments.push([pt('bottom'), pt('left')]); segments.push([pt('right'), pt('top')]) }
    else { segments.push([pt('bottom'), pt('right')]); segments.push([pt('top'), pt('left')]) }
  }
}

function stitchLoops(segments: [Pt, Pt][]): Pt[][] {
  const keyOf = (p: Pt) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`
  const pointList: Pt[] = []
  const keyToIndex = new Map<string, number>()
  const idx = (p: Pt): number => {
    const k = keyOf(p)
    let i = keyToIndex.get(k)
    if (i === undefined) { i = pointList.length; pointList.push(p); keyToIndex.set(k, i) }
    return i
  }
  const adj: number[][] = []
  for (const [a, b] of segments) {
    const ia = idx(a), ib = idx(b)
    ;(adj[ia] ??= []).push(ib)
    ;(adj[ib] ??= []).push(ia)
  }
  const visited = new Set<number>()
  const loops: Pt[][] = []
  for (let start = 0; start < pointList.length; start++) {
    if (visited.has(start)) continue
    const startAdj = adj[start]
    if (!startAdj || startAdj.length === 0) continue
    const loop: Pt[] = []
    let prev = -1
    let cur = start
    let guard = 0
    do {
      loop.push(pointList[cur])
      visited.add(cur)
      const neighbors = adj[cur] ?? []
      let next = neighbors.find((n) => n !== prev)
      if (next === undefined) next = neighbors[0]
      prev = cur
      cur = next
      guard++
    } while (cur !== start && cur !== undefined && guard < pointList.length + 5)
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}

function clampAndDedupe(loop: Pt[], width: number, height: number): Pt[] {
  const out: Pt[] = []
  for (const p of loop) {
    const cp: Pt = [Math.min(width, Math.max(0, p[0])), Math.min(height, Math.max(0, p[1]))]
    const last = out[out.length - 1]
    if (!last || Math.hypot(cp[0] - last[0], cp[1] - last[1]) > 1e-6) out.push(cp)
  }
  if (out.length > 1) {
    const first = out[0], last = out[out.length - 1]
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-6) out.pop()
  }
  return out
}

function perimeter(loop: Pt[]): number {
  let p = 0
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length]
    p += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return p
}

export const juliaGenerator: Generator = {
  id: 'julia',
  name: 'Julia / Mandelbrot fractal',
  description: 'Escape-time Julia or Mandelbrot set, smoothed and traced into filled polygons with marching squares. Single framed view; not seamless.',
  params: [
    { key: 'width', label: 'Width', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    { key: 'height', label: 'Height', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    {
      key: 'kind', label: 'Kind', type: 'select', default: 'julia',
      options: [
        { value: 'julia', label: 'Julia set' },
        { value: 'mandelbrot', label: 'Mandelbrot set' },
      ],
    },
    { key: 'cRe', label: 'c (real)', type: 'number', default: -0.8, min: -2, max: 2, step: 0.001, hint: 'Julia constant, unused for Mandelbrot' },
    { key: 'cIm', label: 'c (imag)', type: 'number', default: 0.156, min: -2, max: 2, step: 0.001, hint: 'Julia constant, unused for Mandelbrot' },
    { key: 'centerRe', label: 'View centre (real)', type: 'number', default: 0, min: -2, max: 2, step: 0.001 },
    { key: 'centerIm', label: 'View centre (imag)', type: 'number', default: 0, min: -2, max: 2, step: 0.001 },
    { key: 'zoom', label: 'Zoom', type: 'number', default: 1, min: 0.1, max: 1000, step: 0.1 },
    { key: 'iterations', label: 'Iterations', type: 'int', default: 60, min: 5, max: 500, step: 1 },
    {
      key: 'mode', label: 'Mode', type: 'select', default: 'inside',
      options: [
        { value: 'inside', label: 'Inside (never escapes)' },
        { value: 'band', label: 'Escape-iteration band' },
      ],
    },
    { key: 'bandFrom', label: 'Band from', type: 'int', default: 8, min: 0, max: 500, step: 1, hint: 'used by band mode' },
    { key: 'bandTo', label: 'Band to', type: 'int', default: 14, min: 0, max: 500, step: 1, hint: 'used by band mode' },
    { key: 'smooth', label: 'Smoothing radius', type: 'number', default: 0.4, min: 0, max: 3, step: 0.05, hint: 'mm, box blur before thresholding' },
    { key: 'resolution', label: 'Resolution', type: 'number', default: 0.2, min: 0.08, max: 2, step: 0.01, hint: 'mm per raster pixel' },
    { key: 'minFeature', label: 'Min feature', type: 'number', default: 1, min: 0.2, max: 5, step: 0.1 },
    { key: 'seed', label: 'Seed', type: 'int', default: 1, min: 0, max: 999999, step: 1, hint: 'unused: the raster is fully deterministic' },
  ],
  generate(params: Record<string, ParamValue>, _ctx: GeneratorContext) {
    const width = getNum(params, 'width', 40)
    const height = getNum(params, 'height', 40)
    const kind = String(params.kind ?? 'julia')
    const cRe = getNum(params, 'cRe', -0.8)
    const cIm = getNum(params, 'cIm', 0.156)
    const centerRe = getNum(params, 'centerRe', 0)
    const centerIm = getNum(params, 'centerIm', 0)
    const zoom = Math.max(0.001, getNum(params, 'zoom', 1))
    const iterations = Math.max(1, Math.round(getNum(params, 'iterations', 60)))
    const mode = String(params.mode ?? 'inside')
    const bandFrom = Math.max(0, Math.round(getNum(params, 'bandFrom', 8)))
    const bandTo = Math.max(bandFrom, Math.round(getNum(params, 'bandTo', 14)))
    const smooth = Math.max(0, getNum(params, 'smooth', 0.4))
    const minFeature = Math.max(0.05, getNum(params, 'minFeature', 1))

    let resolution = Math.max(0.08, getNum(params, 'resolution', 0.2))
    let cols = Math.max(1, Math.ceil(width / resolution))
    let rows = Math.max(1, Math.ceil(height / resolution))
    if (cols > MAX_PIXELS || rows > MAX_PIXELS) {
      resolution = Math.max(resolution, width / MAX_PIXELS, height / MAX_PIXELS)
      cols = Math.max(1, Math.ceil(width / resolution))
      rows = Math.max(1, Math.ceil(height / resolution))
    }
    const dx = width / cols, dy = height / rows

    const halfW = 1.6 / zoom
    const halfH = halfW * (height / width)

    const W = cols + 1, H = rows + 1
    let field = new Float64Array(W * H)
    for (let j = 0; j < H; j++) {
      const py = j * dy
      const im0 = centerIm + (py / height - 0.5) * 2 * halfH
      for (let i = 0; i < W; i++) {
        const px = i * dx
        const re0 = centerRe + (px / width - 0.5) * 2 * halfW
        const iter = kind === 'mandelbrot'
          ? escapeIter(0, 0, re0, im0, iterations)
          : escapeIter(re0, im0, cRe, cIm, iterations)
        const isFeature = mode === 'band' ? (iter >= bandFrom && iter <= bandTo) : iter >= iterations
        field[j * W + i] = isFeature ? 1 : 0
      }
    }

    const radiusPix = Math.max(0, Math.round(smooth / Math.min(dx, dy)))
    for (let pass = 0; pass < 2; pass++) {
      field = boxBlurAxis(field, W, H, radiusPix, true)
      field = boxBlurAxis(field, W, H, radiusPix, false)
    }

    // Pad with a 1-cell ring of background (0) on all sides so every
    // contour closes into a loop, even if the true feature runs off the
    // tile edge.
    const PW = W + 2, PH = H + 2
    const padded = new Float64Array(PW * PH)
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) padded[(j + 1) * PW + (i + 1)] = field[j * W + i]
    }
    const posX = (ip: number) => (ip - 1) * dx
    const posY = (jp: number) => (jp - 1) * dy

    const thr = 0.5
    const segments: [Pt, Pt][] = []
    for (let jp = 0; jp < PH - 1; jp++) {
      const y0 = posY(jp), y1 = posY(jp + 1)
      for (let ip = 0; ip < PW - 1; ip++) {
        const x0 = posX(ip), x1 = posX(ip + 1)
        const vBL = padded[jp * PW + ip]
        const vBR = padded[jp * PW + ip + 1]
        const vTR = padded[(jp + 1) * PW + ip + 1]
        const vTL = padded[(jp + 1) * PW + ip]
        processCell(x0, y0, x1, y1, vBL, vBR, vTR, vTL, thr, segments)
      }
    }

    const rawLoops = stitchLoops(segments)
    const minPerimeter = 3 * minFeature
    const polygons: Pt[][] = []
    for (const raw of rawLoops) {
      const loop = clampAndDedupe(raw, width, height)
      if (loop.length < 3) continue
      if (perimeter(loop) < minPerimeter) continue
      polygons.push(loop)
    }

    return { width, height, polygons, curves: [], ribWidth: 1 }
  },
}
