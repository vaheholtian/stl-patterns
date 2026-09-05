import type { Generator, Pt } from './types'
import { baseTile, bounded, continuousParams, roundPath, seedParam } from './continuous'

/** Periodic diagonal midpoint lattice. There is no outer boundary to reflect:
 * neighbours, barrier choices and curve tangents all wrap modulo the grid.
 * Crossings are fused for cutouts. Opening a barrier only ADDS connectivity.
 */
export const celticGenerator: Generator = {
  id: 'celtic', name: 'Celtic plait', cutoutDefault: true, connectedRibs: true,
  seamless: () => true,
  description: 'An all-over diagonal plait with rounded, seeded turns. Strands continue across both tile edges; crossings are fused for cutouts. No mirrored panels or joining bars.',
  params: [...continuousParams,
    { key: 'columns', label: 'Columns', type: 'int', default: 6, min: 2, max: 24 },
    { key: 'rows', label: 'Rows', type: 'int', default: 5, min: 2, max: 24 },
    { key: 'mirrors', label: 'Barrier density', type: 'number', default: 0.25, min: 0, max: 1, step: 0.05 },
    { key: 'rounding', label: 'Round turns', type: 'number', default: 0.4, min: 0.1, max: 0.45, step: 0.05 }, seedParam],
  generate(p, ctx) {
    const tile = baseTile(p), cols = Math.round(bounded(p, 'columns', 6, 2, 24)), rows = Math.round(bounded(p, 'rows', 5, 2, 24))
    const nx = 2 * cols, ny = 2 * rows, sx = tile.width / nx, sy = tile.height / ny
    const density = bounded(p, 'mirrors', 0.25, 0, 1), rounding = bounded(p, 'rounding', 0.4, 0.1, 0.45)
    const directions: Pt[] = [[1, 1], [-1, 1], [-1, -1], [1, -1]]
    const nodes: { x: number; y: number; pairing: number }[] = [], ids = new Map<number, number>()
    const mod = (a: number, n: number) => (a % n + n) % n
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) if ((x + y) % 2) {
      const choice = ctx.rand(), orientation = ctx.rand()
      // Two zigzag winding paths retain connections between neighbouring
      // repeats even at 100% barriers. They use ordinary lattice edges,
      // not a frame or an extra straight joining bar.
      const windingPath = x <= 1 || y <= 1
      const pairing = !windingPath && choice < density ? (orientation < 0.5 ? 1 : 2) : 0
      ids.set(y * nx + x, nodes.length); nodes.push({ x, y, pairing })
    }
    const parent = Array.from({ length: nodes.length * 4 }, (_, i) => i)
    const root = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
    const join = (a: number, b: number) => { parent[root(a)] = root(b) }
    const pairs = (kind: number): [number, number][] => kind === 1 ? [[0, 1], [2, 3]] : kind === 2 ? [[0, 3], [1, 2]] : [[0, 2], [1, 3]]
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      for (let d = 0; d < 4; d++) {
        const [dx, dy] = directions[d], neighbour = ids.get(mod(n.y + dy, ny) * nx + mod(n.x + dx, nx))!
        join(i * 4 + d, neighbour * 4 + (d + 2) % 4)
      }
      for (const [a, b] of pairs(n.pairing)) join(i * 4 + a, i * 4 + b)
      if (!n.pairing) join(i * 4, i * 4 + 1)
    }
    let repairs = 0
    for (let i = 0; i < nodes.length; i++) if (nodes[i].pairing) {
      const [a, b] = pairs(nodes[i].pairing)
      if (root(i * 4 + a[0]) !== root(i * 4 + b[0])) {
        nodes[i].pairing = 0; join(i * 4 + a[0], i * 4 + b[0]); repairs++
      }
    }
    if (parent.some((_, i) => root(i) !== root(0))) throw new Error('Periodic plait connectivity check failed')
    // Render local strand pieces in an extended lattice. Shared endpoints are
    // halfway along the same diagonal edge, with identical straight tangents.
    // No long closing chord is introduced when a strand crosses the period.
    const padX = Math.ceil(tile.ribWidth / sx) + 2, padY = Math.ceil(tile.ribWidth / sy) + 2
    for (let y = -padY; y <= ny + padY; y++) for (let x = -padX; x <= nx + padX; x++) if (mod(x + y, 2)) {
      const n = nodes[ids.get(mod(y, ny) * nx + mod(x, nx))!]
      for (const [a, b] of pairs(n.pairing)) {
        const centre: Pt = [x * sx, y * sy]
        const at = (d: number): Pt => [(x + directions[d][0] / 2) * sx, (y + directions[d][1] / 2) * sy]
        // These pieces span half an edge on each side of the node. Use twice
        // the whole-edge rounding fraction so paired turns stay visibly apart.
        tile.curves.push(roundPath([at(a), centre, at(b)], false, n.pairing ? 2 * rounding : 0))
      }
    }
    tile.notes = [`Periodic connected plait; ${repairs} barriers opened to prevent isolated loops. Crossings are fused; no over-under gaps.`]
    return tile
  },
}
