/**
 * Voronoi is the one pattern with two ways onto a model: the repeating tile
 * that every other pattern uses, and cells generated straight over the selected
 * surface (no flattening, no placement). The choice lives here, apart from the
 * tile definition, so saved tiles keep their format and the catalog card stays
 * a single entry. It is remembered across reloads under its own key.
 */
import { entryForDef } from '../patterns/catalog'
import type { TileDef } from '../patterns/definition'

export type VoronoiMethod = 'tile' | 'surface'

export const METHOD_KEY = 'stl-patterns.voronoiMethod.v1'

interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }

function storage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

/** Never throws: anything but a known method reads as the tile. */
export function readMethod(store: StorageLike | null = storage()): VoronoiMethod {
  try { return store?.getItem(METHOD_KEY) === 'surface' ? 'surface' : 'tile' } catch { return 'tile' }
}

export function writeMethod(method: VoronoiMethod, store: StorageLike | null = storage()): void {
  try { store?.setItem(METHOD_KEY, method) } catch { /* storage unavailable */ }
}

/** Whether the current tile is one whose card offers surface generation. */
export function supportsSurfaceMethod(def: Pick<TileDef, 'generatorId' | 'params'>): boolean {
  return Boolean(entryForDef(def)?.entry.surface)
}

/**
 * The method actually in force: surface generation only when the tile offers
 * it, it was chosen, and there is a model to generate on. Otherwise the tile.
 */
export function effectiveMethod(def: Pick<TileDef, 'generatorId' | 'params'>, chosen: VoronoiMethod, modelLoaded: boolean): VoronoiMethod {
  return chosen === 'surface' && modelLoaded && supportsSurfaceMethod(def) ? 'surface' : 'tile'
}

/** Which recipe a save produces: the surface routine keeps its own record, as it always has. */
export function recipeOp(def: Pick<TileDef, 'generatorId' | 'params'>, chosen: VoronoiMethod, modelLoaded: boolean): 'tile' | 'voronoi' {
  return effectiveMethod(def, chosen, modelLoaded) === 'surface' ? 'voronoi' : 'tile'
}
