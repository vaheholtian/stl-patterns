import type { Generator, Pt } from './types'
import { baseTile, bounded, continuousParams, roundPath } from './continuous'

export const greekKeyGenerator: Generator = {
  id: 'greekKey', name: 'Greek key / meander', cutoutDefault: true, seamless: () => true,
  description: 'A continuous right-angled ornamental band. Ends meet across horizontal repeats; bridges connect neighbouring bands vertically.',
  params: [...continuousParams,
    { key: 'repeats', label: 'Keys per band', type: 'int', default: 3, min: 1, max: 16 },
    { key: 'bands', label: 'Bands', type: 'int', default: 3, min: 1, max: 12 },
    { key: 'rounding', label: 'Round turns', type: 'number', default: 0, min: 0, max: 0.4, step: 0.05 }],
  generate(p) {
    const tile = baseTile(p), repeats = Math.round(bounded(p, 'repeats', 3, 1, 16)), bands = Math.round(bounded(p, 'bands', 3, 1, 12))
    const sx = tile.width / repeats, sy = tile.height / bands
    // Open nested-hook motif; straight horizontal endpoints preserve the seam
    // even when the interior corners are rounded.
    const motif: Pt[] = [[0, 0.1], [0.8, 0.1], [0.8, 0.7], [0.4, 0.7], [0.4, 0.5], [0.6, 0.5], [0.6, 0.3], [0.2, 0.3], [0.2, 0.9], [0.95, 0.9], [0.95, 0.1], [1, 0.1]]
    for (let row = 0; row < bands; row++) {
      const points: Pt[] = []
      for (let i = 0; i < repeats; i++) for (const [x, y] of (i ? motif.slice(1) : motif)) points.push([(i + x) * sx, (row + y) * sy])
      tile.curves.push(roundPath(points, false, bounded(p, 'rounding', 0, 0, 0.4)))
    }
    return tile
  },
}
