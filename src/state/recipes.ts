import { create } from 'zustand'
import type { TileDef } from './tileStore'
import type { TileLayoutUi, VoronoiUi } from './store'

/** Everything needed to redo an operation on a re-exported mesh of the same part. */
export interface Recipe {
  id: string
  name: string
  savedAt: number
  op: 'tile' | 'voronoi'
  region: {
    wholeBody: boolean
    /** a point on the region and its normal, used to find the region again */
    point: [number, number, number] | null
    normal: [number, number, number] | null
    segmentAngle: number
  }
  tile?: TileDef
  layout?: TileLayoutUi
  voronoi?: VoronoiUi
}

const KEY = 'stl-patterns.recipes.v1'

function read(): Recipe[] {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as Recipe[]) : [] } catch { return [] }
}
function write(list: Recipe[]) { try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* ignore */ } }

interface RecipeState {
  recipes: Recipe[]
  add: (r: Omit<Recipe, 'id' | 'savedAt'>) => void
  remove: (id: string) => void
  importList: (list: Recipe[]) => void
}

export const useRecipes = create<RecipeState>((set, get) => ({
  recipes: read(),
  add: (r) => {
    const recipes = [{ ...r, id: Date.now().toString(36), savedAt: Date.now() }, ...get().recipes].slice(0, 50)
    write(recipes); set({ recipes })
  },
  remove: (id) => { const recipes = get().recipes.filter((x) => x.id !== id); write(recipes); set({ recipes }) },
  importList: (list) => { const recipes = [...list, ...get().recipes].slice(0, 50); write(recipes); set({ recipes }) },
}))
