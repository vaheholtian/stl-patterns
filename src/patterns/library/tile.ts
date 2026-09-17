import type { Pt, Tile, TileCurve } from '../types'
import { flattenPath } from '../svg/pathFlatten'

/** One pattern.monster design, as stored in data.json. */
export interface LibraryPattern {
  slug: string
  title: string
  /** how the source draws it: filled shapes, or centrelines to be stroked */
  mode: 'fill' | 'stroke' | 'stroke-join'
  /** the repeat box in the artwork's own units */
  w: number
  h: number
  /** >0 when dropping a colour layer also shortens the box by this much */
  vHeight: number
  /** one `d` string per colour layer, outermost first */
  layers: string[]
  tags: string[]
  /** the widest stroke the source site offers, in artwork units */
  maxStroke: number
  /** mm^2 of printable design that clipping to the repeat box destroys, at a 50 mm
   * repeat; 0 means the tile reproduces its design exactly when repeated. Measured
   * by planning/pattern-library-2026-09-15/measure-seams.ts, not taken on trust. */
  clipLoss: number
  /** share of the tile that clipping costs, in percent */
  clipLossPct: number
  /** mm of box edge where a stroked rib stops instead of continuing into the next copy */
  ribBreak: number
  /** Pieces the closed 50 mm box falls into when this is cut through all four walls
   * at a 50 mm repeat, counting only connections thick enough to print. 1 means it
   * survives a through-cut on a closed ring; more means it needs recess, emboss, or
   * a bounded patch. 0 means the design produced nothing to cut with at that size.
   *
   * Both orientations are recorded because which side of the drawing is material
   * decides the answer, and the app lets you flip that with a checkbox: a design
   * can sever the box one way and hold as one piece the other. An earlier sweep
   * measured only `cutAs` and reported it as the design's property, which was
   * wrong for 74 of the 330. Measured by invert-sweep.ts on fixtures/box-50.stl. */
  cutAs: number
  /** the same cut with the pattern inverted; see cutAs */
  cutInv: number
}

export interface LibraryTileOptions {
  /** the repeat's width in millimetres, excluding spacing */
  widthMm: number
  /** stroke width in millimetres, for `stroke` sources */
  ribWidth: number
  /** how many colour layers to draw, from the outermost */
  layers: number
  /** extra millimetres added to the box, with the artwork centred in it */
  spacingX: number
  spacingY: number
}

const ORIGIN: Pt = [0, 0]

/**
 * Which of the nine repeat positions a subpath has to be drawn at for the box to
 * end up correctly filled: its own, plus any neighbour whose copy would reach
 * inside the box. A shape well inside the box needs only its own.
 */
function neighbours(points: Pt[], width: number, height: number, grow: number): Pt[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const r = grow / 2
  const out: Pt[] = []
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const dx = i * width, dy = j * height
    if (maxX + dx + r < 0 || minX + dx - r > width || maxY + dy + r < 0 || minY + dy - r > height) continue
    out.push([dx, dy])
  }
  return out
}

/** The source box once `shown` of the layers are drawn. */
export function sourceHeight(p: LibraryPattern, shown: number): number {
  return p.h - p.vHeight * (p.layers.length - shown)
}

/**
 * Build the tile for one library pattern.
 *
 * The artwork is y-down in its own units and the tile is y-up in millimetres,
 * so every point is flipped through the source box and scaled. Spacing grows
 * the repeat box and centres the artwork in it, as the source site does.
 * Geometry outside the box is left as drawn for the pipeline to clip.
 */
export function buildLibraryTile(p: LibraryPattern, opts: LibraryTileOptions): Tile {
  const shown = Math.max(1, Math.min(Math.round(opts.layers), p.layers.length))
  const srcH = sourceHeight(p, shown)
  const k = opts.widthMm / p.w
  const sx = Math.max(0, opts.spacingX), sy = Math.max(0, opts.spacingY)
  const ox = sx / 2, oy = sy / 2
  // flatten finely enough that the pipeline's own 0.01 mm simplifier decides the
  // final vertex count, not this step
  const tol = 0.005 / k
  const at = ([x, y]: Pt): Pt => [x * k + ox, (srcH - y) * k + oy]
  const width = opts.widthMm + sx, height = srcH * k + sy
  const polygons: Pt[][] = [], curves: TileCurve[] = []
  for (const d of p.layers.slice(0, shown)) {
    for (const sub of flattenPath(d, tol)) {
      const points = sub.points.map(at)
      // A stroked design drawn past its repeat box needs the neighbouring copy
      // of any rib that reaches an edge, or clipping throws away the part that
      // belongs inside and the rib stops dead at the seam. Stroke loops are
      // unioned with the nonzero rule downstream, so overlapping copies merge.
      //
      // Filled shapes cannot be treated this way: a tile's polygons are filled
      // even-odd, so a ring overlapping its own neighbour would cancel to a hole
      // instead of merging. Those are left as drawn and clipped, which is what
      // the source site does with them too.
      for (const shift of p.mode === 'fill' ? [ORIGIN] : neighbours(points, width, height, opts.ribWidth)) {
        const moved: Pt[] = shift[0] || shift[1] ? points.map(([x, y]) => [x + shift[0], y + shift[1]] as Pt) : points
        if (p.mode !== 'fill') { curves.push({ points: moved, closed: sub.closed }); continue }
        // a ring carries its start point again at the end; a polygon must not
        const ring = moved === points ? moved.slice() : moved
        if (ring.length > 1 && Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) < 1e-9) ring.pop()
        if (ring.length >= 3) polygons.push(ring)
      }
    }
  }
  return {
    width: opts.widthMm + sx,
    height: srcH * k + sy,
    polygons,
    curves,
    ribWidth: Math.max(0.01, opts.ribWidth),
    notes: libraryNotes(p),
  }
}

/** What the measurements say about this design, in the app's own warning channel. */
export function libraryNotes(p: LibraryPattern): string[] | undefined {
  const notes: string[] = []
  if (p.clipLossPct >= 1)
    notes.push(`${p.title} is drawn past its repeat box and ${p.clipLossPct.toFixed(0)}% of the design is cut away where the copies meet; it will not look like the original.`)
  if (p.ribBreak > 0.42)
    notes.push(`Its ribs stop at the repeat edge over ${p.ribBreak.toFixed(1)} mm instead of carrying into the next copy.`)
  // Only warn about what ticking Invert cannot fix. If one side holds, the design
  // is usable and the UI steers you to that side instead of condemning it.
  // A count of 0 is not zero pieces: it means the design produced nothing to cut
  // with at that size. An earlier merge recorded that case as 1 -- "survives a
  // through-cut" -- which is how four collapsed designs passed as safe.
  const pieces = (n: number) => (n === 0 ? 'nothing the printer can lay down' : `${n} loose piece${n === 1 ? '' : 's'}`)
  if (p.cutAs !== 1 && p.cutInv !== 1)
    notes.push(`As drawn this leaves ${pieces(p.cutAs)}; inverted, ${pieces(p.cutInv)}. Neither orientation survives a through-cut on a closed box (measured on a 50 mm box at a 50 mm repeat): use recess or emboss, a bounded region, or turn on Connect material.`)
  return notes.length ? notes : undefined
}
