// Truchet tiling generator.
//
// The tile is divided into a grid of `cell` x `cell` squares (the box is
// snapped so an integer number of cells fills it exactly). Each cell gets
// one of a small set of motifs, drawn so every motif touches the four edge
// midpoints of its cell:
//   - 'arcs': the classic Truchet/Smith tile — two quarter-circle arcs, each
//     joining two adjacent edge midpoints, splitting the cell into two lens
//     shapes. A random 0/90 degree rotation picks which pair of corners the
//     arcs curve around.
//   - 'diagonals': a single straight line across one diagonal of the cell
//     ("/" or "\", chosen at random), corner to corner.
//   - 'arcsAndLines': each cell independently rolls 'arcs' or 'diagonals'.
//
// Every arc motif starts and ends exactly at an edge midpoint, and every
// diagonal motif starts and ends exactly at a cell corner; both midpoints
// and corners sit on the shared grid lattice, so neighbouring cells (and
// neighbouring tile repeats) always meet their curve endpoints exactly —
// the tiling is seamless across the tile box by construction.

import type { Generator, GeneratorContext, ParamValue, Pt, TileCurve } from './types'
import { getNum } from './types'

const TWO_PI = Math.PI * 2

/** Approximate a circular arc from angle a0 to a1 (radians) with segments
 * no longer than ~0.4mm and no coarser than ~6 degrees. */
function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number): Pt[] {
  const sweep = a1 - a0
  const byAngle = Math.abs(sweep) / (6 * Math.PI / 180)
  const byLength = (Math.abs(sweep) * r) / 0.4
  const segs = Math.max(1, Math.ceil(Math.max(byAngle, byLength)))
  const pts: Pt[] = []
  for (let i = 0; i <= segs; i++) {
    const a = a0 + (sweep * i) / segs
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

/** Two quarter-circle arcs per cell, radius = cell/2, centred on two opposite
 * corners chosen by `rot` (0 => corners at (0,0) and (cell,cell) via the two
 * remaining corners' arcs; 1 => the 90-degree-rotated pair). Each arc joins
 * the midpoints of the two cell edges adjacent to its centre corner. */
function arcCell(x0: number, y0: number, cell: number, rot: boolean): TileCurve[] {
  const r = cell / 2
  if (!rot) {
    // Arc centred at bottom-left corner (x0,y0): joins (mx,y0) top-of-bottom-edge
    // and (x0,my) — sweeps from angle 0 to 90deg.
    const a1: TileCurve = { points: arcPoints(x0, y0, r, 0, Math.PI / 2), closed: false }
    // Arc centred at top-right corner (x0+cell,y0+cell): joins (mx,y0+cell) and (x0+cell,my)
    const a2: TileCurve = { points: arcPoints(x0 + cell, y0 + cell, r, Math.PI, 1.5 * Math.PI), closed: false }
    return [a1, a2]
  } else {
    // Arc centred at bottom-right corner (x0+cell,y0): joins (mx,y0) and (x0+cell,my)
    const a1: TileCurve = { points: arcPoints(x0 + cell, y0, r, Math.PI / 2, Math.PI), closed: false }
    // Arc centred at top-left corner (x0,y0+cell): joins (mx,y0+cell) and (x0,my)
    const a2: TileCurve = { points: arcPoints(x0, y0 + cell, r, 1.5 * Math.PI, TWO_PI), closed: false }
    return [a1, a2]
  }
}

/** Single straight diagonal of the cell, corner to corner. `rot` picks the
 * "/" or "\" orientation. Corners sit on the shared grid lattice, so
 * diagonals from neighbouring cells always meet exactly at those points. */
function diagonalCell(x0: number, y0: number, cell: number, rot: boolean): TileCurve[] {
  const bl: Pt = [x0, y0]
  const br: Pt = [x0 + cell, y0]
  const tl: Pt = [x0, y0 + cell]
  const tr: Pt = [x0 + cell, y0 + cell]
  const pts: [Pt, Pt] = !rot ? [bl, tr] : [br, tl]
  return [{ points: [pts[0], pts[1]], closed: false }]
}

export const truchetGenerator: Generator = {
  id: 'truchet',
  name: 'Truchet tiling',
  description: 'Grid of square cells filled with random Truchet arcs/lines; seamless across tile edges.',
  params: [
    { key: 'width', label: 'Width', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    { key: 'height', label: 'Height', type: 'number', default: 40, min: 5, max: 300, step: 1 },
    { key: 'cell', label: 'Cell size', type: 'number', default: 8, min: 2, max: 50, step: 0.5 },
    {
      key: 'style', label: 'Style', type: 'select', default: 'arcs',
      options: [
        { value: 'arcs', label: 'Arcs (classic Truchet)' },
        { value: 'diagonals', label: 'Diagonals' },
        { value: 'arcsAndLines', label: 'Mixed arcs & lines' },
      ],
    },
    { key: 'ribWidth', label: 'Rib width', type: 'number', default: 1.6, min: 0.4, max: 6, step: 0.1 },
    { key: 'seed', label: 'Seed', type: 'int', default: 1, min: 0, max: 999999, step: 1 },
  ],
  generate(params: Record<string, ParamValue>, ctx: GeneratorContext) {
    const cell = Math.max(1, getNum(params, 'cell', 8))
    const wReq = getNum(params, 'width', 40)
    const hReq = getNum(params, 'height', 40)
    const cols = Math.max(1, Math.round(wReq / cell))
    const rows = Math.max(1, Math.round(hReq / cell))
    const width = cols * cell
    const height = rows * cell
    const style = String(params.style ?? 'arcs')
    const ribWidth = getNum(params, 'ribWidth', 1.6)

    const curves: TileCurve[] = []
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const x0 = cx * cell
        const y0 = cy * cell
        const rot = ctx.rand() < 0.5
        let useArc = style === 'arcs'
        if (style === 'arcsAndLines') useArc = ctx.rand() < 0.5
        if (useArc) curves.push(...arcCell(x0, y0, cell, rot))
        else curves.push(...diagonalCell(x0, y0, cell, rot))
      }
    }

    return { width, height, polygons: [], curves, ribWidth }
  },
}
