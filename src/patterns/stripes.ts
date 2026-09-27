import type { Generator, Pt } from './types'
import { bounded } from './continuous'

/**
 * Straight parallel stripes: bands of printed material and blank (cut) bands,
 * each with its own width. The blank bands are the polygons, so they become the
 * holes, recesses or relief like any other tile; Invert swaps the two roles.
 */
export const stripesGenerator: Generator = {
  id: 'stripes', name: 'Stripes',
  description: 'Straight vertical or horizontal stripes with separate printed and blank widths. Natively seamless; blank bands are the cut feature.',
  seamless: () => true,
  params: [
    {
      key: 'direction', label: 'Direction', type: 'select', default: 'vertical',
      options: [{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }],
    },
    { key: 'printed', label: 'Printed width (mm)', type: 'number', default: 3, min: 0.4, max: 50, step: 0.1, hint: 'Width of each band of material, before scaling on the model.' },
    { key: 'blank', label: 'Blank width (mm)', type: 'number', default: 3, min: 0.2, max: 50, step: 0.1, hint: 'Width of each cut band, before scaling on the model.' },
  ],
  generate(p) {
    const vertical = String(p.direction ?? 'vertical') !== 'horizontal'
    const printed = bounded(p, 'printed', 3, 0.4, 100), blank = bounded(p, 'blank', 3, 0.2, 100)
    const pitch = printed + blank
    // Whole stripes in a square tile of about 40 mm, so previews and placement
    // behave like the other tiles; the stripe is uniform along its length.
    const count = Math.max(1, Math.round(40 / pitch)), side = count * pitch
    const width = side, height = side
    // Each blank band sits between half-width printed edges and overruns the box
    // along its length, so no sliver of material is left at the seam.
    const over = side * 0.1, polygons: Pt[][] = []
    for (let i = 0; i < count; i++) {
      const a0 = i * pitch + printed / 2, a1 = a0 + blank
      polygons.push(vertical
        ? [[a0, -over], [a1, -over], [a1, height + over], [a0, height + over]]
        : [[-over, a0], [width + over, a0], [width + over, a1], [-over, a1]])
    }
    const notes = [`${count} stripes of ${printed.toFixed(2)} mm printed and ${blank.toFixed(2)} mm blank, pitch ${pitch.toFixed(2)} mm, before layout scaling.`]
    return { width, height, ribWidth: printed, polygons, curves: [], notes }
  },
}
