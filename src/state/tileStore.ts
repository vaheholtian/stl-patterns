import { create } from 'zustand'
import type { ParamValue, Pt, Tile } from '../patterns/types'
import { generatorById, defaultParams, isSeamless } from '../patterns'

/** Everything needed to regenerate a tile. */
export interface TileDef {
  name: string
  generatorId: string          // 'svg' for imported artwork
  params: Record<string, ParamValue>
  /** for imported SVGs: the raw tile since it cannot be regenerated */
  svgTile?: Tile
  svgSubtract?: Pt[][]
  invert: boolean
  /** kaleidoscope: reflect the tile into a 2 x 2 arrangement so any pattern repeats seamlessly */
  mirror?: boolean
  /** lock every setting that would break seamless repetition (default on) */
  seamless?: boolean
}

/** A tile definition with the Seamless lock applied. */
export interface ResolvedDef {
  /** generator parameters with defaults filled in and locked values forced */
  params: Record<string, ParamValue>
  mirror: boolean
  /** parameter keys held at their seamless value */
  lockedParams: Set<string>
  /** mirror is on because nothing else makes this pattern seamless */
  mirrorForced: boolean
}

export function resolveDef(def: TileDef): ResolvedDef {
  const gen = def.generatorId === 'svg' ? undefined : generatorById(def.generatorId)
  const params: Record<string, ParamValue> = gen ? { ...defaultParams(gen), ...def.params } : { ...def.params }
  const lockedParams = new Set<string>()
  let mirror = Boolean(def.mirror)
  let mirrorForced = false
  if (def.seamless !== false) {
    if (gen) {
      for (const p of gen.params) {
        if (p.seamlessValue === undefined) continue
        params[p.key] = p.seamlessValue
        lockedParams.add(p.key)
      }
    }
    const inherentlySeamless = gen ? isSeamless(gen, params) : false // imported SVGs are not
    if (!inherentlySeamless) { mirror = true; mirrorForced = true }
  }
  return { params, mirror, lockedParams, mirrorForced }
}

export interface SavedTile extends TileDef {
  id: string
  savedAt: number
}

interface TileState {
  def: TileDef
  /** generated tile (before the 2D pipeline) */
  tile: Tile | null
  /** pipeline output: closed polygons in tile mm space, ready to cut */
  polygons: Pt[][]
  warnings: string[]
  saved: SavedTile[]
  setDef: (patch: Partial<TileDef>) => void
  setParam: (key: string, value: ParamValue) => void
  setResult: (tile: Tile | null, polygons: Pt[][], warnings: string[]) => void
  save: () => void
  load: (id: string) => void
  remove: (id: string) => void
  importDefs: (defs: SavedTile[]) => void
}

const STORAGE_KEY = 'stl-patterns.tiles.v1'

function readSaved(): SavedTile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedTile[]) : []
  } catch {
    return []
  }
}
function writeSaved(list: SavedTile[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch { /* storage unavailable */ }
}

const CURRENT_KEY = 'stl-patterns.currentTile.v1'
function readCurrent(): TileDef {
  try {
    const raw = localStorage.getItem(CURRENT_KEY)
    if (raw) return JSON.parse(raw) as TileDef
  } catch { /* ignore */ }
  return { name: 'Voronoi cells', generatorId: 'voronoiTile', params: {}, invert: false }
}

export const useTileStore = create<TileState>((set, get) => ({
  def: readCurrent(),
  tile: null,
  polygons: [],
  warnings: [],
  saved: readSaved(),
  setDef: (patch) => set((s) => ({ def: { ...s.def, ...patch } })),
  setParam: (key, value) => set((s) => ({ def: { ...s.def, params: { ...s.def.params, [key]: value } } })),
  setResult: (tile, polygons, warnings) => set({ tile, polygons, warnings }),
  save: () => {
    const d = get().def
    const entry: SavedTile = { ...d, id: `${Date.now().toString(36)}`, savedAt: Date.now() }
    const saved = [entry, ...get().saved].slice(0, 50)
    writeSaved(saved)
    set({ saved })
  },
  load: (id) => {
    const e = get().saved.find((x) => x.id === id)
    if (!e) return
    const { id: _id, savedAt: _t, ...def } = e
    void _id; void _t
    set({ def })
  },
  remove: (id) => {
    const saved = get().saved.filter((x) => x.id !== id)
    writeSaved(saved)
    set({ saved })
  },
  importDefs: (defs) => {
    const saved = [...defs, ...get().saved].slice(0, 50)
    writeSaved(saved)
    set({ saved })
  },
}))

// remember the current tile across reloads
useTileStore.subscribe((s, prev) => {
  if (s.def !== prev.def) {
    try { localStorage.setItem(CURRENT_KEY, JSON.stringify(s.def)) } catch { /* ignore */ }
  }
})
