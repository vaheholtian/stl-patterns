import type { Generator, Pt } from './types'
import { baseTile, bounded, continuousParams } from './continuous'

export const fermatSpiralsGenerator: Generator = {
  id: 'fermatSpirals', name: 'Stitched Fermat spirals', cutoutDefault: true, seamless: () => false,
  description: 'Smooth double-arm whorls joined into one stroke inside a panel. Reflected repeats retain visible panels; not an all-over surface fill.',
  params: [...continuousParams,
    { key: 'columns', label: 'Columns', type: 'int', default: 2, min: 1, max: 8 },
    { key: 'rows', label: 'Rows', type: 'int', default: 2, min: 1, max: 8 },
    { key: 'turns', label: 'Turns per whorl', type: 'number', default: 3, min: 1, max: 10, step: 0.5 }],
  generate(p) {
    const tile = baseTile(p), cols = Math.round(bounded(p, 'columns', 2, 1, 8)), rows = Math.round(bounded(p, 'rows', 2, 1, 8))
    const turns = bounded(p, 'turns', 3, 1, 10), steps = Math.ceil(turns * 100)
    const sx = tile.width / cols, sy = tile.height / rows, radius = Math.max(0.2, Math.min(sx, sy) / 2 - tile.ribWidth)
    const points: Pt[] = []
    for (let row = 0; row < rows; row++) for (let i = 0; i < cols; i++) {
      const col = row % 2 ? cols - 1 - i : i, cx = (col + 0.5) * sx, cy = (row + 0.5) * sy
      // Opposite Fermat arms meet at the origin with a common tangent.
      // Start left and end right, reversing direction on alternating rows.
      const rotation = Math.PI - turns * Math.PI * 2 + (row % 2 ? Math.PI : 0)
      for (let k = steps; k >= -steps; k--) {
        const t = Math.abs(k) / steps, r = radius * Math.sqrt(t), a = turns * Math.PI * 2 * t + rotation + (k < 0 ? Math.PI : 0)
        points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
      }
    }
    tile.curves = [{ points, closed: false }]
    tile.notes = ['One continuous stroke with explicit links between circular whorls. Links may cross a whorl; all crossings are fused.']
    return tile
  },
}
