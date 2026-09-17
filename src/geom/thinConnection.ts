import type { Manifold, ManifoldToplevel } from './manifold'
import type { Parameterization } from './parameterization'
import { buildSurfaceTool, mitreTool, type Mitre, type Polygon } from './tileTool'

/** One flattened piece of the region, with the pattern shapes laid out on it. */
export interface ProbePiece { param: Parameterization; polygons: Polygon[]; mitres: Mitre[] }

/** Separate parts of material: a cavity decomposes as a negative volume and is not a part. */
export function countMaterial(parts: Manifold[], minVolume: number): number {
  let n = 0
  for (const p of parts) { const v = p.volume(); if (v > 0 && v >= minVolume) n++ }
  return Math.max(1, n)
}

/**
 * How many parts a through-cut really leaves, discounting connections too thin
 * to print. `decompose()` counts a ribbon of any width as a connection, so a
 * body held together by a 0.01 mm sliver reports as one solid and then comes
 * off the plate in pieces. Re-cut with every pattern shape grown by `gap` on
 * each side: a neck narrower than 2 * gap closes up under that growth and the
 * count rises. The probe never touches the result mesh; it only decides what
 * can honestly be claimed about it.
 */
export function thinConnectionParts(
  m: ManifoldToplevel, body: Manifold, pieces: ProbePiece[],
  gap: number, zMin: number, zMax: number, detail: number, minVolume: number,
): number {
  const grown: Manifold[] = []
  try {
    for (const { param, polygons, mitres } of pieces) {
      if (!polygons.length) continue
      const cs = new m.CrossSection(polygons, 'EvenOdd')
      const fat = cs.offset(gap, 'Round', 2, 16)
      const poly = fat.toPolygons() as Polygon[]
      cs.delete(); fat.delete()
      if (!poly.length) continue
      grown.push(mitreTool(m, buildSurfaceTool(m, param, poly, zMin, zMax, detail), mitres, zMin, zMax))
    }
    if (!grown.length) return 1
    const tool = grown.length === 1 ? grown[0] : m.Manifold.union(grown)
    const cut = m.Manifold.difference(body, tool)
    if (tool !== grown[0]) tool.delete()
    const parts = cut.decompose()
    const n = countMaterial(parts, minVolume)
    for (const p of parts) p.delete()
    cut.delete()
    return n
  } finally { for (const g of grown) g.delete() }
}
