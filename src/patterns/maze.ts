import type { Generator, Pt } from './types'
import { baseTile, bounded, continuousParams, fitPath, roundPath, seedParam } from './continuous'

export const mazeGenerator: Generator = {
  id: 'unicursalMaze', name: 'Unicursal maze', cutoutDefault: true, seamless: () => false,
  description: 'Seeded perfect maze: trace its tree as one closed ribbon, or keep the connected maze walls. Reflected repeats join across tile edges.',
  params: [...continuousParams,
    { key: 'columns', label: 'Columns', type: 'int', default: 7, min: 2, max: 24 },
    { key: 'rows', label: 'Rows', type: 'int', default: 7, min: 2, max: 24 },
    { key: 'style', label: 'Style', type: 'select', default: 'contour', options: [{ value: 'contour', label: 'Single ribbon' }, { value: 'walls', label: 'Connected walls' }] },
    { key: 'rounding', label: 'Round turns', type: 'number', default: 0.25, min: 0, max: 0.45, step: 0.05 }, seedParam],
  generate(p, ctx) {
    const tile = baseTile(p), cols = Math.round(bounded(p, 'columns', 7, 2, 24)), rows = Math.round(bounded(p, 'rows', 7, 2, 24))
    const visited = new Set([0]), stack = [0], tree: [number, number][] = []
    while (stack.length) {
      const a = stack[stack.length - 1], x = a % cols, y = Math.floor(a / cols)
      const neighbours = [x > 0 ? a - 1 : -1, x < cols - 1 ? a + 1 : -1, y > 0 ? a - cols : -1, y < rows - 1 ? a + cols : -1].filter((b) => b >= 0 && !visited.has(b))
      if (!neighbours.length) { stack.pop(); continue }
      const b = neighbours[Math.floor(ctx.rand() * neighbours.length)]
      visited.add(b); stack.push(b); tree.push([a, b])
    }
    if (p.style === 'walls') {
      const passages = new Set(tree.map(([a, b]) => `${Math.min(a, b)},${Math.max(a, b)}`))
      const sx = tile.width / cols, sy = tile.height / rows
      tile.curves.push({ points: [[0, 0], [tile.width, 0], [tile.width, tile.height], [0, tile.height]], closed: true })
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const a = y * cols + x
        if (x < cols - 1 && !passages.has(`${a},${a + 1}`)) tile.curves.push({ points: [[(x + 1) * sx, y * sy], [(x + 1) * sx, (y + 1) * sy]], closed: false })
        if (y < rows - 1 && !passages.has(`${a},${a + cols}`)) tile.curves.push({ points: [[x * sx, (y + 1) * sy], [(x + 1) * sx, (y + 1) * sy]], closed: false })
      }
    } else {
      // Each cell starts as a clockwise 4-cycle. A tree edge splices two cycles
      // by replacing their facing sides with the two sides of a corridor.
      const points: Pt[] = [], next: number[] = []
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const id = points.length
        points.push([x + 0.25, y + 0.25], [x + 0.75, y + 0.25], [x + 0.75, y + 0.75], [x + 0.25, y + 0.75])
        next.push(id + 1, id + 2, id + 3, id)
      }
      for (const [u, v] of tree) {
        const a = Math.min(u, v) * 4, b = Math.max(u, v) * 4
        if (Math.abs(u - v) === 1) { next[a + 1] = b; next[b + 3] = a + 2 }
        else { next[a + 2] = b + 1; next[b] = a + 3 }
      }
      const contour: Pt[] = []; let at = 0
      do { contour.push(points[at]); at = next[at] } while (at !== 0 && contour.length <= points.length)
      if (contour.length !== points.length) throw new Error('Maze contour is not a single cycle')
      tile.curves = [roundPath(fitPath(contour, tile), true, bounded(p, 'rounding', 0.25, 0, 0.45))]
    }
    tile.notes = [p.style === 'walls' ? 'Connected perfect-maze walls, including the boundary.' : 'One closed contour of a spanning tree; no disconnected loops.']
    return tile
  },
}
