import type { Generator, Pt } from './types'
import { baseTile, bounded, continuousParams, fitPath } from './continuous'

const systems = {
  gosper: { name: 'Gosper / flowsnake', axiom: 'A', rules: { A: 'A-B--B+A++AA+B-', B: '+A-BB--B-A++A+B' }, draw: 'AB', angle: 60, max: 4 },
  arrowhead: { name: 'Sierpiński arrowhead', axiom: 'A', rules: { A: 'B-A-B', B: 'A+B+A' }, draw: 'AB', angle: 60, max: 7 },
  terdragon: { name: 'Terdragon', axiom: 'F', rules: { F: 'F+F-F' }, draw: 'F', angle: 120, max: 7 },
}
export const singleStrokeFractalGenerators: Generator[] = Object.entries(systems).map(([id, system]) => ({
  id, name: system.name, cutoutDefault: true, seamless: () => false,
  description: 'A single continuous fractal motif. Reflection matches the tile edges, but the motif outlines remain visible; not an all-over surface pattern.',
  params: [...continuousParams, { key: 'order', label: 'Order', type: 'int', default: id === 'gosper' ? 2 : 4, min: 1, max: system.max }],
  generate(p) {
    const tile = baseTile(p), order = Math.round(bounded(p, 'order', id === 'gosper' ? 2 : 4, 1, system.max))
    let word = system.axiom
    const rules: Record<string, string> = system.rules
    for (let i = 0; i < order; i++) word = [...word].map((s) => rules[s] ?? s).join('')
    let x = 0, y = 0, heading = id === 'arrowhead' && order % 2 ? 60 : 0
    const points: Pt[] = [[0, 0]]
    for (const s of word) {
      if (s === '+') heading += system.angle
      else if (s === '-') heading -= system.angle
      else if (system.draw.includes(s)) { x += Math.cos(heading * Math.PI / 180); y += Math.sin(heading * Math.PI / 180); points.push([x, y]) }
    }
    tile.curves = [{ points: fitPath(points, tile), closed: false }]
    tile.notes = [`One open stroke (${points.length - 1} segments). Increase the tile size or lower the order if gaps close up.`]
    return tile
  },
}))
