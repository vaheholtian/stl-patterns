import type { CrossSection, ManifoldToplevel } from 'manifold-3d'
import type { Pt } from './types'

interface Boundary { loops: Pt[][]; min: Pt; max: Pt }
const distance2 = (a: Pt, b: Pt) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
function closestOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy
  const t = length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2)) : 0
  return [a[0] + t * dx, a[1] + t * dy]
}
function bounds(loops: Pt[][]): Boundary {
  const min: Pt = [Infinity, Infinity], max: Pt = [-Infinity, -Infinity]
  for (const loop of loops) for (const p of loop) for (let k = 0; k < 2; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]) }
  return { loops, min, max }
}

/** Return a NEW cut feature. Owns all temporary WASM objects, never the inputs.
 * Repair the actual kept material AFTER clipping and minimum-feature filtering.
 * Matched edge ports anchor every component across both repeat directions.
 */
export function connectMaterial(m: ManifoldToplevel, feature: CrossSection, width: number, height: number, ribWidth: number, notes?: string[], pass = 0, added = 0): CrossSection {
  const owned: CrossSection[] = []
  const own = (cs: CrossSection) => { owned.push(cs); return cs }
  try {
    const box = own(m.CrossSection.square([width, height], false))
    const w = Math.min(Math.min(width, height) / 3, Math.max(0.1, ribWidth))
    const rect = (x: number, y: number, sx: number, sy: number): Pt[] => [[x, y], [x + sx, y], [x + sx, y + sy], [x, y + sy]]
    // Opposite sides have identical ports, without a perimeter frame/grid.
    const ports = own(new m.CrossSection([
      rect(0, height / 2 - w / 2, w, w), rect(width - w, height / 2 - w / 2, w, w),
      rect(width / 2 - w / 2, 0, w, w), rect(width / 2 - w / 2, height - w, w, w),
    ], 'NonZero'))
    const kept = own(m.CrossSection.difference(box, feature))
    const framed = own(m.CrossSection.union([ports, kept]))
    const components = framed.decompose(); owned.push(...components)
    if (!components.length) throw new Error('Could not construct material connections')
    // Sort deterministically. Each new component links to a preceding one,
    // forming a spanning tree, including all four edge ports.
    const boundaries = components.map((cs) => bounds(cs.toPolygons() as Pt[][])).sort((a, b) => a.min[0] - b.min[0] || a.min[1] - b.min[1])
    const bridges: Pt[][] = []
    let budget = 2_000_000
    for (let i = 1; i < boundaries.length; i++) {
      const source = boundaries[i]
      let from: Pt = source.loops[0][0], to: Pt = boundaries[0].loops[0][0], best = distance2(from, to)
      // Prefer a shorter bridge to a preceding component. This ordering forms
      // a tree. Bound the search for raster/SVG imports.
      for (let j = 0; j < i && budget > 0; j++) {
        const target = boundaries[j]
        const dx = Math.max(0, target.min[0] - source.max[0], source.min[0] - target.max[0])
        const dy = Math.max(0, target.min[1] - source.max[1], source.min[1] - target.max[1])
        if (dx * dx + dy * dy >= best) continue
        for (const loop of source.loops) for (const p of loop) {
          if (budget <= 0) break
          for (const polygon of target.loops) for (let k = 0; k < polygon.length && budget-- > 0; k++) {
            const q = closestOnSegment(p, polygon[k], polygon[(k + 1) % polygon.length]), d = distance2(p, q)
            if (d < best) { best = d; from = p; to = q }
          }
        }
      }
      const length = Math.sqrt(best)
      if (length < 1e-9) continue
      const dx = (to[0] - from[0]) / length, dy = (to[1] - from[1]) / length, r = w / 2
      // Extend one full rib into each component, avoiding point contacts.
      const a: Pt = [from[0] - dx * w, from[1] - dy * w], b: Pt = [to[0] + dx * w, to[1] + dy * w]
      bridges.push([[a[0] + dy * r, a[1] - dx * r], [b[0] + dy * r, b[1] - dx * r], [b[0] - dy * r, b[1] + dx * r], [a[0] - dy * r, a[1] + dx * r]])
    }
    // Wrap bridge overhangs, so additions cannot introduce mismatched seams.
    const repeated: Pt[][] = []
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
      for (const poly of bridges) repeated.push(poly.map(([px, py]) => [px + x * width, py + y * height]))
    }
    const bars = repeated.length ? own(new m.CrossSection(repeated, 'NonZero')) : null
    const union = bars ? own(m.CrossSection.union([framed, bars])) : framed
    let material = own(m.CrossSection.intersection(union, box))
    // A bar can lie exactly along a boundary (no overhang to wrap). Share the
    // material in a narrow collar with the opposite edge too. This preserves
    // matching edge profiles even for these tangential contacts, without
    // adding a solid border around the tile.
    for (const axis of [0, 1]) {
      const collars = own(new m.CrossSection(axis === 0
        ? [rect(0, 0, w, height), rect(width - w, 0, w, height)]
        : [rect(0, 0, width, w), rect(0, height - w, width, w)], 'NonZero'))
      const reflected = own(material.mirror(axis === 0 ? [1, 0] : [0, 1]))
      const opposite = own(reflected.translate(axis === 0 ? [width, 0] : [0, height]))
      const shared = own(m.CrossSection.intersection(opposite, collars))
      material = own(m.CrossSection.union([material, shared]))
    }
    const check = material.decompose(); owned.push(...check)
    if (check.length !== 1) {
      // A wrapped overhang can introduce a fragment on the opposite side of a
      // tile. Join these too, and fail explicitly if numerical repair stalls.
      if (pass >= 4) throw new Error(`Material still has ${check.length} components after bridging`)
      const repairedFeature = own(m.CrossSection.difference(box, material))
      return connectMaterial(m, repairedFeature, width, height, ribWidth, notes, pass + 1, added + bridges.length)
    }
    notes?.push(`Kept material: 1 connected component; ${added + bridges.length} bridges, ${w.toFixed(2)} mm ribs joining both repeat directions.`)
    return m.CrossSection.difference(box, material)
  } finally { for (const cs of owned) cs.delete() }
}
