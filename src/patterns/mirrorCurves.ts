// Diamond edges around each dot form the RG[p,q] midpoint graph.
// A pairing at each vertex chooses straight passage or a two-sided mirror.
// Joining pairings from DISTINCT circuits merges them; never split a circuit.
import type { Generator, Pt } from './types'
import { baseTile, bounded, continuousParams, fitPath, roundPath, seedParam } from './continuous'

function makeGenerator(celtic: boolean): Generator {
  return {
    id: celtic ? 'celtic' : 'lusona', name: celtic ? 'Celtic plait' : 'Mirror curves / lusona',
    description: celtic ? 'One closed plait, with rounded turns and fused crossings for cutouts. Seeded barriers vary the weave.' : 'One closed sand-drawing curve. Mirrors merge separate circuits into a single stroke for every grid and seed.',
    cutoutDefault: true,
    seamless: () => false,
    params: [...continuousParams,
      { key: 'columns', label: 'Columns', type: 'int', default: 6, min: 2, max: 24 },
      { key: 'rows', label: 'Rows', type: 'int', default: 5, min: 2, max: 24 },
      { key: 'mirrors', label: 'Barrier density', type: 'number', default: celtic ? 0.12 : 0.3, min: 0, max: 1, step: 0.05 },
      { key: 'rounding', label: 'Round turns', type: 'number', default: celtic ? 0.4 : 0.2, min: 0, max: 0.45, step: 0.05 }, seedParam],
    generate(p, ctx) {
      const tile = baseTile(p)
      const cols = Math.round(bounded(p, 'columns', 6, 2, 24)), rows = Math.round(bounded(p, 'rows', 5, 2, 24))
      const vertices: Pt[] = [], ports: number[][] = [], ends: number[] = [], pair: number[] = []
      const ids = new Map<string, number>()
      const vertex = (v: Pt) => {
        const key = v.join(','); let id = ids.get(key)
        if (id === undefined) { id = vertices.length; ids.set(key, id); vertices.push(v); ports.push([]) }
        return id
      }
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const vs: Pt[] = [[2 * x + 1, 2 * y], [2 * x + 2, 2 * y + 1], [2 * x + 1, 2 * y + 2], [2 * x, 2 * y + 1]]
        for (let k = 0; k < 4; k++) {
          const a = vertex(vs[k]), b = vertex(vs[(k + 1) % 4]), h = ends.length
          ends.push(a, b); ports[a].push(h); ports[b].push(h + 1)
        }
      }
      const connect = (a: number, b: number) => { pair[a] = b; pair[b] = a }
      const density = bounded(p, 'mirrors', celtic ? 0.12 : 0.3, 0, 1)
      for (let v = 0; v < vertices.length; v++) {
        const list = ports[v], at = vertices[v]
        list.sort((a, b) => {
          const va = vertices[ends[a ^ 1]], vb = vertices[ends[b ^ 1]]
          return Math.atan2(va[1] - at[1], va[0] - at[0]) - Math.atan2(vb[1] - at[1], vb[0] - at[0])
        })
        if (list.length === 2) connect(list[0], list[1])
        else if (ctx.rand() < density) {
          const k = ctx.rand() < 0.5 ? 0 : 1
          connect(list[k], list[(k + 1) % 4]); connect(list[(k + 2) % 4], list[(k + 3) % 4])
        } else { connect(list[0], list[2]); connect(list[1], list[3]) }
      }
      // Label circuits once, then union labels as each crossing is rewired.
      const labels = new Int32Array(ends.length).fill(-1)
      let count = 0
      for (let h = 0; h < ends.length; h++) if (labels[h] < 0) {
        let at = h
        do { labels[at] = labels[at ^ 1] = count; at = pair[at ^ 1] } while (at !== h)
        count++
      }
      const parent = Array.from({ length: count }, (_, i) => i)
      const root = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
      let merges = 0
      for (const list of ports) if (list.length === 4) {
        const a = list[0], b = pair[a], c = list.find((h) => h !== a && h !== b)!, d = pair[c]
        const ra = root(labels[a]), rc = root(labels[c])
        if (ra !== rc) { connect(a, c); connect(b, d); parent[ra] = rc; merges++ }
      }
      if (merges !== count - 1) throw new Error('Mirror curve could not merge every circuit')
      const points: Pt[] = []; let at = 0
      do { points.push(vertices[ends[at]]); at = pair[at ^ 1] } while (at !== 0 && points.length <= ends.length)
      if (points.length !== ends.length / 2) throw new Error('Mirror curve traversal missed an edge')
      tile.curves = [roundPath(fitPath(points, tile), true, bounded(p, 'rounding', celtic ? 0.4 : 0.2, 0, 0.45))]
      tile.notes = [`One closed stroke; ${merges} circuit merges. Crossings are fused, with no over-under gaps.`]
      return tile
    },
  }
}
export const lusonaGenerator = makeGenerator(false)
export const celticGenerator = makeGenerator(true)
