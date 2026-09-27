/**
 * The appearance categories the pattern browser sorts by. A pattern's family
 * is what it looks like on a printed part, not how its generator works: a
 * Voronoi lattice and a honeycomb are both "holes" to someone choosing a vent.
 */
export type Family = 'grids' | 'lines' | 'weaves' | 'tiles' | 'organic' | 'nature' | 'mazes' | 'rosettes'

export type Layout = 'field' | 'band' | 'motif'

export interface FamilyInfo {
  id: Family
  label: string
  blurb: string
  /** second axis inside a family that would otherwise be too big to browse */
  chips?: { id: string; label: string }[]
}

export const FAMILIES: FamilyInfo[] = [
  {
    id: 'grids', label: 'Grids & holes', blurb: 'Lattices of openings: honeycomb, perforations, slots, block walls.',
    chips: [{ id: 'hexagons', label: 'Hexagons' }, { id: 'circles', label: 'Round' }, { id: 'squares', label: 'Squares' }, { id: 'diamonds', label: 'Diamonds' }, { id: 'crosses', label: 'Crosses' }, { id: 'mixed', label: 'Mixed' }],
  },
  { id: 'lines', label: 'Lines & waves', blurb: 'Stripes, waves, moiré, herringbone and flowing curves.' },
  { id: 'weaves', label: 'Weaves & knots', blurb: 'Cane, plait, strapwork, meanders and interlacing.' },
  {
    id: 'tiles', label: 'Tiles & geometry', blurb: 'Geometric repeats and quasi-periodic tilings.',
    chips: [
      { id: 'triangles', label: 'Triangles' }, { id: 'squares', label: 'Squares' }, { id: 'diamonds', label: 'Diamonds' },
      { id: 'circles', label: 'Circles' }, { id: 'hexagons', label: 'Hexagons' }, { id: 'stars', label: 'Stars' }, { id: 'mixed', label: 'Mixed' },
    ],
  },
  { id: 'organic', label: 'Organic & cellular', blurb: 'Voronoi cells, scales, bubbles and irregular patches.' },
  {
    id: 'nature', label: 'Nature & decorative', blurb: 'Leaves, flowers, textiles, folk and seasonal designs.',
    chips: [
      { id: 'floral', label: 'Floral' }, { id: 'textile', label: 'Textile' }, { id: 'cultural', label: 'Cultural' },
      { id: 'holiday', label: 'Holiday' }, { id: 'abstract', label: 'Abstract' },
    ],
  },
  { id: 'mazes', label: 'Mazes & fractals', blurb: 'One continuous line, or a shape that repeats inside itself.' },
  { id: 'rosettes', label: 'Rosettes & medallions', blurb: 'Centred showpieces: guilloche, spirals, circle packings.' },
]

export const FAMILY_IDS: Family[] = FAMILIES.map((f) => f.id)

export function familyInfo(id: Family): FamilyInfo {
  return FAMILIES.find((f) => f.id === id) ?? FAMILIES[0]
}
