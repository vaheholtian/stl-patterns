// Import an SVG document into the Tile model (src/patterns/types.ts).
//
// Approach: parse the SVG text, attach the root <svg> to a hidden (but
// laid-out) off-screen container so the browser's geometry APIs
// (getScreenCTM, getPointAtLength, getComputedStyle, getBBox) work, walk
// every shape element, resolve its effective transform relative to the SVG
// root, flatten its geometry to polylines in the root's viewBox coordinate
// system, then convert to millimetres and flip Y (SVG is Y-down, our tiles
// are Y-up with the origin at the bottom-left).
//
// Coordinate math: `rootSvg.getScreenCTM()` maps points in the SVG's own
// user space (i.e. the viewBox coordinate system that children are drawn
// in) to screen pixels, viewBox scaling included. Composing
// `rootCTM.inverse().multiply(el.getScreenCTM())` therefore maps a point in
// `el`'s local coordinate space directly into the root's viewBox space,
// regardless of how deeply `el` is nested or how it's placed on the page.
// This is the standard "SVG local point to root user space" trick and is
// what this module relies on instead of manually composing `transform`
// attributes.
//
// Fill-rule note: every filled subpath extracted here is combined into
// `tile.polygons`/`subtract` and re-filled downstream using the even-odd
// rule (see types.ts). A `nonzero`-fill path with several overlapping
// subpaths can therefore render slightly differently than in the source
// SVG; we add a warning when we can't be sure it matches.

import type { Pt, Tile } from '../types'
import { lengthToMm } from './svgUnits'

export interface SvgImportOptions {
  /** target tile width in mm; the SVG is scaled uniformly to this width
   * (height follows). If omitted, use the SVG's own size: viewBox units
   * treated as mm, or width/height attributes with units converted (mm,
   * cm, in, pt, px at 96 dpi). */
  widthMm?: number
  /** flatten tolerance in mm along curves, default 0.15 */
  tolerance?: number
  /** treat white fills as material (subtract them) — default true */
  whiteIsMaterial?: boolean
}

export interface SvgImportResult {
  /** polygons = every dark filled region, in mm, y pointing UP, origin at
   * the bottom-left of the SVG's viewBox */
  tile: Tile
  /** polygons of white/light filled shapes to subtract (the caller performs
   * the boolean), same coordinates as tile.polygons */
  subtract: Pt[][]
  warnings: string[]
  sourceWidthMm: number
  sourceHeightMm: number
}

// ---------------------------------------------------------------------
// Path data tokenizing: turn a `d` attribute string into a list of
// subpaths, each a list of *absolute* segments using only M/L/C/Q/A/Z (S
// and T are resolved to explicit C/Q here, since their reflection control
// point depends on the previous command in the *original*, unsplit path —
// resolving them up front means each subpath can be rebuilt as a
// standalone <path> and sampled independently without losing that
// context).
// ---------------------------------------------------------------------

type SegCmd = 'M' | 'L' | 'C' | 'Q' | 'A' | 'Z'
interface Seg {
  cmd: SegCmd
  args: number[]
}

const NUM_RE = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g

function matchNumbers(s: string): number[] {
  const out: number[] = []
  let m: RegExpExecArray | null
  NUM_RE.lastIndex = 0
  while ((m = NUM_RE.exec(s))) {
    if (m[0] !== '' && m[0] !== '-' && m[0] !== '+') out.push(Number(m[0]))
  }
  return out
}

function matchCommands(d: string): { cmd: string; argStr: string }[] {
  const cmdRe = /[MmLlHhVvCcSsQqTtAaZz]/g
  const idxs: { idx: number; ch: string }[] = []
  let m: RegExpExecArray | null
  while ((m = cmdRe.exec(d))) idxs.push({ idx: m.index, ch: m[0] })
  const out: { cmd: string; argStr: string }[] = []
  for (let i = 0; i < idxs.length; i++) {
    const start = idxs[i].idx
    const end = i + 1 < idxs.length ? idxs[i + 1].idx : d.length
    out.push({ cmd: idxs[i].ch, argStr: d.slice(start + 1, end) })
  }
  return out
}

/** Arc-command args (rx ry x-axis-rotation large-arc-flag sweep-flag x y);
 * the two flags are single characters and are commonly glued directly to
 * the following number with no separator, so they need dedicated parsing. */
function parseArcArgs(s: string): number[][] {
  let i = 0
  const n = s.length
  const groups: number[][] = []
  const numRe = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/y
  function skipSep() {
    while (i < n && /[\s,]/.test(s[i])) i++
  }
  function readNumber(): number | null {
    skipSep()
    numRe.lastIndex = i
    const m = numRe.exec(s)
    if (!m || m.index !== i || m[0] === '') return null
    i = numRe.lastIndex
    return Number(m[0])
  }
  function readFlag(): number | null {
    skipSep()
    if (i >= n) return null
    const ch = s[i]
    if (ch !== '0' && ch !== '1') return null
    i++
    return Number(ch)
  }
  for (;;) {
    skipSep()
    if (i >= n) break
    const rx = readNumber()
    if (rx === null) break
    const ry = readNumber()
    if (ry === null) break
    const rot = readNumber()
    if (rot === null) break
    const laf = readFlag()
    if (laf === null) break
    const sf = readFlag()
    if (sf === null) break
    const x = readNumber()
    if (x === null) break
    const y = readNumber()
    if (y === null) break
    groups.push([rx, ry, rot, laf, sf, x, y])
  }
  return groups
}

/** Reflection of the last cubic/quadratic control point through the current
 * point, used by the S and T shorthand commands (factored out so the
 * mutable `lastCtrl`/`lastQCtrl` tracking variables aren't referenced
 * inside a destructuring initializer, which trips up control-flow type
 * inference). */
function reflect(last: [number, number] | null, cx: number, cy: number): [number, number] {
  return last ? [2 * cx - last[0], 2 * cy - last[1]] : [cx, cy]
}

function argCount(upper: string): number {
  if (upper === 'H' || upper === 'V') return 1
  if (upper === 'M' || upper === 'L' || upper === 'T') return 2
  if (upper === 'S' || upper === 'Q') return 4
  return 6 // C
}

/** Parse a path `d` string into subpaths of absolute M/L/C/Q/A/Z segments. */
function parseSubpaths(d: string): Seg[][] {
  const subpaths: Seg[][] = []
  let current: Seg[] = []
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  let lastCtrl: [number, number] | null = null // last cubic control point, for S reflection
  let lastQCtrl: [number, number] | null = null // last quadratic control point, for T reflection

  for (const { cmd, argStr } of matchCommands(d)) {
    const upper = cmd.toUpperCase()
    const rel = cmd !== upper

    if (upper === 'Z') {
      current.push({ cmd: 'Z', args: [] })
      cx = sx
      cy = sy
      lastCtrl = null
      lastQCtrl = null
      continue
    }

    if (upper === 'A') {
      for (const g of parseArcArgs(argStr)) {
        let [rx, ry, rot, laf, sf, x, y] = g
        if (rel) {
          x += cx
          y += cy
        }
        current.push({ cmd: 'A', args: [rx, ry, rot, laf, sf, x, y] })
        cx = x
        cy = y
        lastCtrl = null
        lastQCtrl = null
      }
      continue
    }

    const nums = matchNumbers(argStr)
    const arity = argCount(upper)
    for (let k = 0; k + arity <= nums.length; k += arity) {
      const g = nums.slice(k, k + arity)
      const isFirst = k === 0
      const effectiveCmd = upper === 'M' && !isFirst ? 'L' : upper

      switch (effectiveCmd) {
        case 'M': {
          let [x, y] = g
          if (rel) {
            x += cx
            y += cy
          }
          if (current.length) subpaths.push(current)
          current = []
          current.push({ cmd: 'M', args: [x, y] })
          cx = x
          cy = y
          sx = x
          sy = y
          lastCtrl = null
          lastQCtrl = null
          break
        }
        case 'L': {
          let [x, y] = g
          if (rel) {
            x += cx
            y += cy
          }
          current.push({ cmd: 'L', args: [x, y] })
          cx = x
          cy = y
          lastCtrl = null
          lastQCtrl = null
          break
        }
        case 'H': {
          let [x] = g
          if (rel) x += cx
          current.push({ cmd: 'L', args: [x, cy] })
          cx = x
          lastCtrl = null
          lastQCtrl = null
          break
        }
        case 'V': {
          let [y] = g
          if (rel) y += cy
          current.push({ cmd: 'L', args: [cx, y] })
          cy = y
          lastCtrl = null
          lastQCtrl = null
          break
        }
        case 'C': {
          let [x1, y1, x2, y2, x, y] = g
          if (rel) {
            x1 += cx
            y1 += cy
            x2 += cx
            y2 += cy
            x += cx
            y += cy
          }
          current.push({ cmd: 'C', args: [x1, y1, x2, y2, x, y] })
          lastCtrl = [x2, y2]
          lastQCtrl = null
          cx = x
          cy = y
          break
        }
        case 'S': {
          let [x2, y2, x, y] = g
          if (rel) {
            x2 += cx
            y2 += cy
            x += cx
            y += cy
          }
          const [x1, y1] = reflect(lastCtrl, cx, cy)
          current.push({ cmd: 'C', args: [x1, y1, x2, y2, x, y] })
          lastCtrl = [x2, y2]
          lastQCtrl = null
          cx = x
          cy = y
          break
        }
        case 'Q': {
          let [x1, y1, x, y] = g
          if (rel) {
            x1 += cx
            y1 += cy
            x += cx
            y += cy
          }
          current.push({ cmd: 'Q', args: [x1, y1, x, y] })
          lastQCtrl = [x1, y1]
          lastCtrl = null
          cx = x
          cy = y
          break
        }
        case 'T': {
          let [x, y] = g
          if (rel) {
            x += cx
            y += cy
          }
          const [qx, qy] = reflect(lastQCtrl, cx, cy)
          current.push({ cmd: 'Q', args: [qx, qy, x, y] })
          lastQCtrl = [qx, qy]
          lastCtrl = null
          cx = x
          cy = y
          break
        }
      }
    }
  }
  if (current.length) subpaths.push(current)
  return subpaths
}

function subpathToD(segs: Seg[]): string {
  return segs
    .map((s) => {
      switch (s.cmd) {
        case 'M':
          return `M ${s.args[0]} ${s.args[1]}`
        case 'L':
          return `L ${s.args[0]} ${s.args[1]}`
        case 'C':
          return `C ${s.args.join(' ')}`
        case 'Q':
          return `Q ${s.args.join(' ')}`
        case 'A':
          return `A ${s.args.join(' ')}`
        case 'Z':
          return 'Z'
      }
    })
    .join(' ')
}

function isPolylineOnly(segs: Seg[]): boolean {
  return segs.every((s) => s.cmd === 'M' || s.cmd === 'L' || s.cmd === 'Z')
}

function samplePolylineVertices(segs: Seg[]): Pt[] {
  const pts: Pt[] = []
  for (const s of segs) {
    if (s.cmd === 'M' || s.cmd === 'L') pts.push([s.args[0], s.args[1]])
  }
  return pts
}

/** Flatten a curved subpath (contains C/Q/A) by building a standalone
 * <path> in the live document and sampling it with getPointAtLength. The
 * element only needs to be connected to a document for these geometry APIs
 * to work — it does not need correct ancestor transforms, since the
 * returned points stay in the path's own local coordinate space and the
 * caller maps them through the original element's CTM afterwards. */
function sampleCurvedSubpath(root: SVGSVGElement, segs: Seg[], toleranceUserUnits: number): Pt[] {
  const d = subpathToD(segs)
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)
  root.appendChild(path)
  try {
    const len = path.getTotalLength()
    if (!(len > 0)) return samplePolylineVertices(segs)
    const n = Math.min(4000, Math.max(3, Math.ceil(len / Math.max(toleranceUserUnits, 1e-6))))
    const pts: Pt[] = []
    for (let i = 0; i <= n; i++) {
      const p = path.getPointAtLength((i / n) * len)
      pts.push([p.x, p.y])
    }
    return pts
  } finally {
    root.removeChild(path)
  }
}

// ---------------------------------------------------------------------
// Basic shapes -> equivalent path `d` in the same local coordinate space
// ---------------------------------------------------------------------

function numAttr(el: Element, name: string, fallback: number): number {
  const v = el.getAttribute(name)
  if (v === null) return fallback
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

function shapeLocalD(el: Element): string | null {
  const tag = el.tagName.toLowerCase()
  switch (tag) {
    case 'path':
      return el.getAttribute('d') || null
    case 'rect': {
      const x = numAttr(el, 'x', 0)
      const y = numAttr(el, 'y', 0)
      const w = numAttr(el, 'width', 0)
      const h = numAttr(el, 'height', 0)
      if (w <= 0 || h <= 0) return null
      const rxAttr = el.hasAttribute('rx') ? numAttr(el, 'rx', 0) : el.hasAttribute('ry') ? numAttr(el, 'ry', 0) : 0
      const ryAttr = el.hasAttribute('ry') ? numAttr(el, 'ry', 0) : rxAttr
      const rx = Math.min(rxAttr, w / 2)
      const ry = Math.min(ryAttr, h / 2)
      if (rx <= 0 || ry <= 0) {
        return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`
      }
      return (
        `M ${x + rx} ${y} L ${x + w - rx} ${y} A ${rx} ${ry} 0 0 1 ${x + w} ${y + ry} ` +
        `L ${x + w} ${y + h - ry} A ${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} ` +
        `L ${x + rx} ${y + h} A ${rx} ${ry} 0 0 1 ${x} ${y + h - ry} ` +
        `L ${x} ${y + ry} A ${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`
      )
    }
    case 'circle': {
      const cx = numAttr(el, 'cx', 0)
      const cy = numAttr(el, 'cy', 0)
      const r = numAttr(el, 'r', 0)
      if (r <= 0) return null
      return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`
    }
    case 'ellipse': {
      const cx = numAttr(el, 'cx', 0)
      const cy = numAttr(el, 'cy', 0)
      const rx = numAttr(el, 'rx', 0)
      const ry = numAttr(el, 'ry', 0)
      if (rx <= 0 || ry <= 0) return null
      return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`
    }
    case 'polygon':
    case 'polyline': {
      const nums = matchNumbers(el.getAttribute('points') || '')
      if (nums.length < 6) return null // fewer than 3 points
      let d = `M ${nums[0]} ${nums[1]}`
      for (let i = 2; i + 1 < nums.length; i += 2) d += ` L ${nums[i]} ${nums[i + 1]}`
      // Filled subpaths are always treated as closed (see module comment).
      d += ' Z'
      return d
    }
    default:
      return null
  }
}

// ---------------------------------------------------------------------
// Fill classification
// ---------------------------------------------------------------------

function parseColorString(s: string): { r: number; g: number; b: number; a: number } | null {
  const trimmed = s.trim()
  const m = /rgba?\(([^)]+)\)/i.exec(trimmed)
  if (m) {
    const parts = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map((p) => parseFloat(p))
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1 }
    }
  }
  if (trimmed === 'transparent') return { r: 255, g: 255, b: 255, a: 0 }
  return null
}

type FillClass = 'dark' | 'light' | 'none'

function classifyFill(el: Element): FillClass {
  const cs = getComputedStyle(el)
  const fillStr = cs.fill
  if (!fillStr || fillStr === 'none') return 'none'
  const c = parseColorString(fillStr)
  if (!c) return 'dark' // unrecognized format (e.g. a paint server URL) — assume material, safest default
  const fillOpacity = parseFloat(cs.fillOpacity || '1')
  const a = c.a * (Number.isFinite(fillOpacity) ? fillOpacity : 1)
  if (a < 0.05) return 'none'
  const luminance = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255
  return luminance < 0.5 ? 'dark' : 'light'
}

function hasVisibleStroke(el: Element): boolean {
  const cs = getComputedStyle(el)
  if (!cs.stroke || cs.stroke === 'none') return false
  const w = parseFloat(cs.strokeWidth || '1')
  return !(w <= 0) || Number.isNaN(w)
}

// ---------------------------------------------------------------------
// Sizing: figure out the SVG's own physical size in mm and the scale from
// its viewBox/user-unit coordinate space to mm.
// ---------------------------------------------------------------------

function getViewBox(svg: SVGSVGElement): { x: number; y: number; w: number; h: number } | null {
  const vb = svg.getAttribute('viewBox')
  if (!vb) return null
  const nums = matchNumbers(vb)
  if (nums.length < 4) return null
  const [x, y, w, h] = nums
  if (!(w > 0) || !(h > 0)) return null
  return { x, y, w, h }
}

interface Sizing {
  sourceWidthMm: number
  sourceHeightMm: number
  scaleX: number
  scaleY: number
  originX: number // viewBox minX, in user units
  originY: number // viewBox minY, in user units
}

function computeSizing(svg: SVGSVGElement, widthMmOpt: number | undefined): Sizing {
  const vb = getViewBox(svg)
  const wAttr = svg.getAttribute('width')
  const hAttr = svg.getAttribute('height')
  const hasPhysicalWH = !!wAttr && !!hAttr && !wAttr.trim().endsWith('%') && !hAttr.trim().endsWith('%')

  let userW: number
  let userH: number
  if (vb) {
    userW = vb.w
    userH = vb.h
  } else if (hasPhysicalWH) {
    userW = parseFloat(wAttr!)
    userH = parseFloat(hAttr!)
  } else {
    const bbox = svg.getBBox()
    userW = bbox.width || 100
    userH = bbox.height || 100
  }

  let naturalWmm: number
  let naturalHmm: number
  if (hasPhysicalWH) {
    naturalWmm = lengthToMm(wAttr, userW)
    naturalHmm = lengthToMm(hAttr, userH)
  } else {
    // No physical width/height: treat viewBox (or fallback) units as mm directly.
    naturalWmm = userW
    naturalHmm = userH
  }

  let sourceWidthMm: number
  let sourceHeightMm: number
  if (widthMmOpt !== undefined && naturalWmm > 0) {
    sourceWidthMm = widthMmOpt
    sourceHeightMm = naturalHmm * (widthMmOpt / naturalWmm)
  } else {
    sourceWidthMm = naturalWmm
    sourceHeightMm = naturalHmm
  }

  return {
    sourceWidthMm,
    sourceHeightMm,
    scaleX: userW !== 0 ? sourceWidthMm / userW : 1,
    scaleY: userH !== 0 ? sourceHeightMm / userH : 1,
    originX: vb ? vb.x : 0,
    originY: vb ? vb.y : 0,
  }
}

function toMm(p: Pt, L: DOMMatrix, sizing: Sizing): Pt {
  const dp = L.transformPoint(new DOMPoint(p[0], p[1]))
  const xmm = (dp.x - sizing.originX) * sizing.scaleX
  const ymm = sizing.sourceHeightMm - (dp.y - sizing.originY) * sizing.scaleY
  return [xmm, ymm]
}

// ---------------------------------------------------------------------
// Hidden off-screen container
// ---------------------------------------------------------------------

function withHiddenContainer<T>(fn: (container: HTMLDivElement) => T): T {
  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.left = '-99999px'
  container.style.top = '0'
  container.style.visibility = 'hidden'
  container.style.width = '0'
  container.style.height = '0'
  container.style.overflow = 'hidden'
  document.body.appendChild(container)
  try {
    return fn(container)
  } finally {
    document.body.removeChild(container)
  }
}

// ---------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------

const SHAPE_SELECTOR = 'path, rect, circle, ellipse, polygon, polyline, line, text, image'
const NON_RENDERED_SELECTOR = 'defs, clipPath, mask, symbol, pattern'

export function importSvg(svgText: string, opts: SvgImportOptions = {}): SvgImportResult {
  const tolerance = opts.tolerance ?? 0.15
  const whiteIsMaterial = opts.whiteIsMaterial ?? true
  const warnings = new Set<string>()

  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const svgEl = doc.documentElement
  const parseError = doc.querySelector('parsererror')
  if (parseError || !svgEl || svgEl.tagName.toLowerCase() !== 'svg') {
    return {
      tile: { width: 0, height: 0, polygons: [], curves: [], ribWidth: 0 },
      subtract: [],
      warnings: ['could not parse SVG document'],
      sourceWidthMm: 0,
      sourceHeightMm: 0,
    }
  }

  return withHiddenContainer((container) => {
    const imported = document.importNode(svgEl, true) as unknown as SVGSVGElement
    container.appendChild(imported)

    const sizing = computeSizing(imported, opts.widthMm)
    const rootCTM = imported.getScreenCTM()
    if (!rootCTM) {
      warnings.add('could not establish SVG coordinate system')
      return {
        tile: { width: sizing.sourceWidthMm, height: sizing.sourceHeightMm, polygons: [], curves: [], ribWidth: 0 },
        subtract: [],
        warnings: [...warnings],
        sourceWidthMm: sizing.sourceWidthMm,
        sourceHeightMm: sizing.sourceHeightMm,
      }
    }
    const rootCTMInv = rootCTM.inverse()
    const toleranceUserUnits = tolerance / (sizing.scaleX || 1)

    const darkPolys: Pt[][] = []
    const lightPolys: Pt[][] = []

    const candidates = Array.from(imported.querySelectorAll(SHAPE_SELECTOR))
    for (const el of candidates) {
      if (el.closest(NON_RENDERED_SELECTOR)) continue

      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue

      const tag = el.tagName.toLowerCase()
      if (tag === 'text') {
        warnings.add('text elements ignored (outline text first)')
        continue
      }
      if (tag === 'image') {
        warnings.add('image elements ignored')
        continue
      }
      if (tag === 'line') {
        if (hasVisibleStroke(el)) warnings.add('stroke-only paths ignored')
        continue
      }

      const cls = classifyFill(el)
      if (cls === 'none') {
        if (hasVisibleStroke(el)) warnings.add('stroke-only paths ignored')
        continue
      }

      const d = shapeLocalD(el)
      if (!d) continue

      const elCTM = (el as SVGGraphicsElement).getScreenCTM()
      if (!elCTM) continue
      const L = rootCTMInv.multiply(elCTM)

      const subpaths = parseSubpaths(d)
      if (subpaths.length > 1) {
        const fillRule = cs.fillRule || el.getAttribute('fill-rule') || 'nonzero'
        if (fillRule !== 'evenodd') {
          warnings.add('path uses nonzero fill-rule with multiple subpaths; approximated as even-odd')
        }
      }

      for (const segs of subpaths) {
        if (segs.length === 0) continue
        const localPts = isPolylineOnly(segs) ? samplePolylineVertices(segs) : sampleCurvedSubpath(imported, segs, toleranceUserUnits)
        if (localPts.length < 3) continue
        const mmPts = localPts.map((p) => toMm(p, L, sizing))
        if (cls === 'dark') darkPolys.push(mmPts)
        else if (whiteIsMaterial) lightPolys.push(mmPts)
      }
    }

    return {
      tile: { width: sizing.sourceWidthMm, height: sizing.sourceHeightMm, polygons: darkPolys, curves: [], ribWidth: 0 },
      subtract: lightPolys,
      warnings: [...warnings],
      sourceWidthMm: sizing.sourceWidthMm,
      sourceHeightMm: sizing.sourceHeightMm,
    }
  })
}
