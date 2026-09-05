import type { Generator, TileCurve } from './types'
import { baseTile, bounded, continuousParams, seedParam } from './continuous'

export const mazeGenerator: Generator = {
  id: 'unicursalMaze', name: 'Periodic maze', cutoutDefault: true, connectedRibs: true,
  seamless: () => true,
  description: 'Connected maze walls generated on a wrap-around grid. Passages and walls continue into neighbouring tiles, with no enclosing rectangle. A branching network, not a single stroke.',
  params: [...continuousParams,
    { key: 'columns', label: 'Columns', type: 'int', default: 7, min: 2, max: 24 },
    { key: 'rows', label: 'Rows', type: 'int', default: 7, min: 2, max: 24 }, seedParam],
  generate(p, ctx) {
    const tile = baseTile(p), cols = Math.round(bounded(p, 'columns', 7, 2, 24)), rows = Math.round(bounded(p, 'rows', 7, 2, 24))
    const mod = (a: number, n: number) => (a % n + n) % n
    const id = (x: number, y: number) => mod(y, rows) * cols + mod(x, cols)
    const visited = new Set([0]), stack = [0], passages = new Set<number>()
    while (stack.length) {
      const a = stack[stack.length - 1], x = a % cols, y = Math.floor(a / cols)
      // Distinct edge IDs handle the parallel adjacencies of a 2-cell torus.
      const choices = [
        { b: id(x + 1, y), edge: 2 * a },
        { b: id(x - 1, y), edge: 2 * id(x - 1, y) },
        { b: id(x, y + 1), edge: 2 * a + 1 },
        { b: id(x, y - 1), edge: 2 * id(x, y - 1) + 1 },
      ].filter(({ b }) => !visited.has(b))
      if (!choices.length) { stack.pop(); continue }
      const choice = choices[Math.floor(ctx.rand() * choices.length)]
      visited.add(choice.b); stack.push(choice.b); passages.add(choice.edge)
    }
    // The dual wall graph of a toroidal passage tree is connected and retains
    // both winding directions. No special boundary walls are added.
    const sx = tile.width / cols, sy = tile.height / rows, curves: TileCurve[] = []
    for (let y = -1; y <= rows; y++) for (let x = -1; x <= cols; x++) {
      const a = id(x, y)
      if (!passages.has(2 * a)) curves.push({ points: [[(x + 1) * sx, y * sy], [(x + 1) * sx, (y + 1) * sy]], closed: false })
      if (!passages.has(2 * a + 1)) curves.push({ points: [[x * sx, (y + 1) * sy], [(x + 1) * sx, (y + 1) * sy]], closed: false })
    }
    tile.curves = curves
    tile.notes = ['Native periodic maze walls. The former closed-ribbon motif is replaced by a connected wrap-around wall network.']
    return tile
  },
}
