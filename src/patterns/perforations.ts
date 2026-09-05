import type { Generator, Pt } from './types'
import { bounded } from './continuous'

const families = [
  ['diamondLattice', 'Diamond lattice', 'Diagonal ribs and diamond openings, like a woven lampshade.'],
  ['squareGrid', 'Square / rectangular grid', 'Straight ribs around square or rectangular openings.'],
  ['roundPerforations', 'Round perforations', 'Staggered circular holes with a connected web between them.'],
  ['honeycomb', 'Honeycomb', 'Regular hexagonal openings with a continuous honeycomb web.'],
  ['roundedSlots', 'Rounded slots', 'Rows of rounded rectangular openings for vents and shades.'],
] as const

export const perforationGenerators: Generator[] = families.map(([id, name, description]): Generator => ({
  id, name, description: `${description} Natively seamless; holes are the cut feature, so leave Invert off.`,
  seamless: () => true,
  params: [
    { key: 'width', label: 'Tile width (mm)', type: 'number', default: 60, min: 5, max: 300, step: 1, hint: 'Snaps to whole repeats without changing hole or rib sizes.' },
    { key: 'height', label: 'Tile height (mm)', type: 'number', default: 60, min: 5, max: 300, step: 1, hint: 'Snaps to whole repeats without changing hole or rib sizes.' },
    { key: 'holeSize', label: id === 'honeycomb' ? 'Hole across flats (mm)' : id === 'roundPerforations' ? 'Hole diameter (mm)' : 'Hole width (mm)', type: 'number', default: 6, min: 1, max: 40, step: 0.5 },
    ...(['diamondLattice', 'squareGrid', 'roundedSlots'].includes(id) ? [{ key: 'aspect', label: 'Hole height / width', type: 'number' as const, default: id === 'roundedSlots' ? 2.5 : 1, min: 0.25, max: 4, step: 0.25 }] : []),
    { key: 'ribWidth', label: 'Material between holes (mm)', type: 'number', default: 1.6, min: 0.4, max: 10, step: 0.1, hint: 'Minimum gap measured perpendicular to the neighbouring hole edges, before scaling on the model.' },
  ],
  generate(p) {
    const requestedWidth = bounded(p, 'width', 60, 5, 600), requestedHeight = bounded(p, 'height', 60, 5, 600)
    const size = bounded(p, 'holeSize', 6, 1, 80), ribWidth = bounded(p, 'ribWidth', 1.6, 0.4, 20)
    const aspect = bounded(p, 'aspect', id === 'roundedSlots' ? 2.5 : 1, 0.25, 4)
    const h = size * aspect
    let px: number, py: number, motif: Pt[]
    let staggered = false
    if (id === 'diamondLattice') {
      // Inflate the diamond by half a web width along its side normals, then
      // use its diagonals as the repeat box. Two staggered holes per box.
      px = size + ribWidth * Math.sqrt(1 + (size / h) ** 2)
      py = h + ribWidth * Math.sqrt(1 + (h / size) ** 2)
      motif = [[size / 2, 0], [0, h / 2], [-size / 2, 0], [0, -h / 2]]
      staggered = true
    } else if (id === 'roundPerforations' || id === 'honeycomb') {
      px = size + ribWidth; py = Math.sqrt(3) * px; staggered = true
      const radius = id === 'honeycomb' ? size / Math.sqrt(3) : size / 2
      const n = id === 'honeycomb' ? 6 : 64
      motif = Array.from({ length: n }, (_, i): Pt => [radius * Math.cos(Math.PI / 2 + i * 2 * Math.PI / n), radius * Math.sin(Math.PI / 2 + i * 2 * Math.PI / n)])
    } else {
      px = size + ribWidth; py = h + ribWidth
      if (id === 'squareGrid') motif = [[-size / 2, -h / 2], [size / 2, -h / 2], [size / 2, h / 2], [-size / 2, h / 2]]
      else {
        const r = Math.min(size, h) / 2
        motif = []
        for (let corner = 0; corner < 4; corner++) {
          const angle = corner * Math.PI / 2, cx = (corner === 0 || corner === 3 ? 1 : -1) * (size / 2 - r), cy = (corner < 2 ? 1 : -1) * (h / 2 - r)
          for (let i = 0; i <= 16; i++) {
            const a = angle + i * Math.PI / 32
            motif.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
          }
        }
      }
    }
    // Bound output even for imported definitions with tiny holes on huge tiles.
    let cols = Math.max(1, Math.round(requestedWidth / px)), rows = Math.max(1, Math.round(requestedHeight / py))
    const notes: string[] = []
    const limit = staggered ? 1500 : 3000
    if (cols * rows > limit) {
      const scale = Math.sqrt(limit / (cols * rows))
      cols = Math.max(1, Math.floor(cols * scale)); rows = Math.max(1, Math.floor(rows * scale))
      notes.push('Repeat count limited to keep the tile responsive; hole and rib sizes are preserved.')
    }
    const width = cols * px, height = rows * py, polygons: Pt[][] = []
    for (let y = -1; y <= rows; y++) for (let x = -1; x <= cols; x++) {
      for (let k = 0; k < (staggered ? 2 : 1); k++) {
        const cx = (x + (staggered ? 0.25 + k / 2 : 0.5)) * px, cy = (y + (staggered ? 0.25 + k / 2 : 0.5)) * py
        const poly = motif.map(([dx, dy]): Pt => [cx + dx, cy + dy])
        if (poly.every(([xx]) => xx < 0) || poly.every(([xx]) => xx > width) || poly.every(([, yy]) => yy < 0) || poly.every(([, yy]) => yy > height)) continue
        polygons.push(poly)
      }
    }
    notes.push(`${cols} × ${rows} whole repeats; tile ${width.toFixed(2)} × ${height.toFixed(2)} mm. Hole sizes and ${ribWidth.toFixed(2)} mm minimum web are preserved before layout scaling.`)
    return { width, height, ribWidth, polygons, curves: [], notes }
  },
}))
