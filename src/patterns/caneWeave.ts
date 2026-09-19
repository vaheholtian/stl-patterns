import type { Generator, Pt, TileCurve } from './types'
import { bounded } from './continuous'

/**
 * Six-way cane weave, as on a chair seat: paired horizontal and vertical
 * strands with single strands running along both diagonals. The openings are
 * the gaps the strands leave: a regular octagon at every cell corner, a small
 * square where the gaps inside two pairs cross, and small pentagons between.
 *
 * Square cells of one repeat each. Pairs sit either side of the cell's centre
 * line and the diagonals cross halfway along each cell edge, so every strand
 * family repeats once per cell in both directions and a tile of whole cells
 * repeats without a seam.
 *
 * The octagon is held regular: its straight sides come from the pairs and its
 * slanted sides from the diagonals, so the pair spacing is derived from both
 * widths and the small square absorbs whatever is left over.
 */
export const caneWeaveGenerator: Generator = {
  id: 'caneWeave', name: 'Cane weave', cutoutDefault: true, connectedRibs: true,
  seamless: () => true,
  description: 'Chair-cane lattice: paired horizontal and vertical strands crossed by both diagonals, leaving regular octagons and small square openings. Strands are the kept material; seamless in both directions.',
  params: [
    { key: 'cellSize', label: 'Cell size (mm)', type: 'number', default: 10, min: 3, max: 60, step: 0.5, hint: 'One repeat of the weave, square.' },
    { key: 'columns', label: 'Cells across', type: 'int', default: 6, min: 1, max: 40 },
    { key: 'rows', label: 'Cells down', type: 'int', default: 6, min: 1, max: 40 },
    { key: 'strandWidth', label: 'Strand width (mm)', type: 'number', default: 1.8, min: 0.4, max: 6, step: 0.1, hint: 'Each horizontal and vertical strand. Thicker closes the small squares; the octagons keep their size.' },
    { key: 'diagonalWidth', label: 'Diagonal width (mm)', type: 'number', default: 1.87, min: 0.4, max: 6, step: 0.01, hint: 'Each diagonal strand. Thicker shrinks the octagons and opens the small squares.' },
  ],
  generate(p) {
    const cell = bounded(p, 'cellSize', 10, 1, 200)
    const cols = Math.round(bounded(p, 'columns', 6, 1, 200)), rows = Math.round(bounded(p, 'rows', 6, 1, 200))
    const notes: string[] = []
    // Diagonals are c / sqrt(2) apart; leave the octagon at least a tenth of a cell.
    const maxDiagonal = cell / Math.SQRT2 - 0.1 * cell
    const diagonal = Math.min(bounded(p, 'diagonalWidth', 1.87, 0.1, 20), maxDiagonal)
    if (diagonal < Number(p.diagonalWidth)) notes.push(`Diagonal width limited to ${diagonal.toFixed(2)} mm so the octagons stay open.`)
    // Regular octagon: its straight sides sit as far from its centre as its slanted ones.
    const octagon = cell / Math.SQRT2 - diagonal
    const strand = Math.min(bounded(p, 'strandWidth', 1.8, 0.1, 20), (cell - octagon) / 2)
    const square = cell - octagon - 2 * strand
    const width = cols * cell, height = rows * cell
    const x0 = -cell, x1 = width + cell, y0 = -cell, y1 = height + cell

    // Axial strands as exact rectangles. Polygons fill even-odd, so wherever a
    // horizontal band crosses a vertical one the overlap is added a third time
    // to stay filled; the same numbers bound both, so the parity is exact.
    const bands = (count: number): [number, number][] => {
      const out: [number, number][] = []
      for (let k = -1; k <= count; k++) {
        const mid = (k + 0.5) * cell
        // A pair with no gap left is one wide strand, drawn once.
        if (square > 1e-9) out.push([mid - square / 2 - strand, mid - square / 2], [mid + square / 2, mid + square / 2 + strand])
        else out.push([mid - (cell - octagon) / 2, mid + (cell - octagon) / 2])
      }
      return out
    }
    const rect = (ax: number, ay: number, bx: number, by: number): Pt[] => [[ax, ay], [bx, ay], [bx, by], [ax, by]]
    const horizontal = bands(rows), vertical = bands(cols), polygons: Pt[][] = []
    for (const [a, b] of horizontal) polygons.push(rect(x0, a, x1, b))
    for (const [a, b] of vertical) polygons.push(rect(a, y0, b, y1))
    for (const [ya, yb] of horizontal) for (const [xa, xb] of vertical) polygons.push(rect(xa, ya, xb, yb))

    // Diagonals y = x - c and y = -x + c, c an odd multiple of half a cell,
    // stroked at their own width and cut to the padded box.
    const curves: TileCurve[] = []
    const line = (ax: number, ay: number, bx: number, by: number) => curves.push({ points: [[ax, ay], [bx, by]], closed: false })
    for (let j = Math.floor((x0 - y1) / cell) - 1; j <= Math.ceil((x1 - y0) / cell) + 1; j++) {
      const c = (j + 0.5) * cell
      const a = Math.max(x0, y0 + c), b = Math.min(x1, y1 + c)
      if (b > a) line(a, a - c, b, b - c)
    }
    for (let j = Math.floor((x0 + y0) / cell) - 1; j <= Math.ceil((x1 + y1) / cell) + 1; j++) {
      const c = (j + 0.5) * cell
      const a = Math.max(x0, c - y1), b = Math.min(x1, c - y0)
      if (b > a) line(a, c - a, b, c - b)
    }
    notes.push(`${cols} × ${rows} cells of ${cell.toFixed(1)} mm; tile ${width.toFixed(1)} × ${height.toFixed(1)} mm. Octagons ${octagon.toFixed(2)} mm across flats, small squares ${Math.max(0, square).toFixed(2)} mm.`)
    return { width, height, ribWidth: diagonal, polygons, curves, notes }
  },
}
