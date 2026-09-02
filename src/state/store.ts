import { create } from 'zustand'
import type { TriMesh } from '../geom/manifold'
import { FaceAdjacency } from '../geom/segmentation'
import type { VoronoiParams } from '../worker/protocol'

export interface BodyState {
  id: number
  name: string
  mesh: TriMesh          // welded, millimetres
  adjacency?: FaceAdjacency
  history: TriMesh[]     // previous meshes for undo
  visible: boolean
}

export type Screen = 'pattern' | 'apply'
export type PickMode = 'region' | 'origin'

export interface VoronoiUi extends VoronoiParams {}

export interface TileLayoutUi {
  origin: [number, number, number] | null
  rotationDeg: number
  scale: number
  margin: number
  fitSeam: boolean
  mode: 'cut' | 'recess' | 'emboss'
  depth: number
  wallThickness: number
  minIslandVolume: number
}

interface State {
  screen: Screen
  bodies: BodyState[]
  activeBodyId: number | null
  /** per-triangle selection mask for the active body */
  selection: Uint8Array | null
  segmentAngle: number
  busy: string | null
  log: string[]
  voronoi: VoronoiUi
  lineWidth: number
  pickMode: PickMode
  tileLayout: TileLayoutUi
  setPickMode: (m: PickMode) => void
  setTileLayout: (patch: Partial<TileLayoutUi>) => void
  setScreen: (s: Screen) => void
  addBodies: (bodies: { name: string; mesh: TriMesh }[]) => void
  removeBody: (id: number) => void
  setActive: (id: number | null) => void
  toggleVisible: (id: number) => void
  setSelection: (sel: Uint8Array | null) => void
  setSegmentAngle: (a: number) => void
  setBusy: (b: string | null) => void
  pushLog: (lines: string | string[]) => void
  clearLog: () => void
  setVoronoi: (patch: Partial<VoronoiUi>) => void
  setLineWidth: (w: number) => void
  replaceMesh: (id: number, mesh: TriMesh) => void
  undo: (id: number) => void
  adjacencyFor: (id: number) => FaceAdjacency | null
}

let nextBodyId = 1

export const useStore = create<State>((set, get) => ({
  screen: 'apply',
  bodies: [],
  activeBodyId: null,
  selection: null,
  segmentAngle: 30,
  busy: null,
  log: [],
  lineWidth: 0.42,
  voronoi: {
    cellSize: 8,
    ribWidth: 2,
    relaxPasses: 2,
    seed: 1,
    mode: 'cut',
    depth: 5,
    minRib: 0.84,
    minIslandVolume: 5,
    neighbours: 12,
    feature: 'cells',
    edgeMargin: 3,
  },
  pickMode: 'region',
  tileLayout: {
    origin: null,
    rotationDeg: 0,
    scale: 1,
    margin: 3,
    fitSeam: true,
    mode: 'emboss',
    depth: 0.8,
    wallThickness: 5,
    minIslandVolume: 5,
  },
  setPickMode: (pickMode) => set({ pickMode }),
  setTileLayout: (patch) => set((s) => ({ tileLayout: { ...s.tileLayout, ...patch } })),
  setScreen: (screen) => set({ screen }),
  addBodies: (list) =>
    set((s) => {
      const added = list.map((b) => ({ id: nextBodyId++, name: b.name, mesh: b.mesh, history: [], visible: true }))
      const bodies = [...s.bodies, ...added]
      const activeBodyId = s.activeBodyId ?? added[0]?.id ?? null
      return { bodies, activeBodyId, selection: s.activeBodyId ? s.selection : null }
    }),
  removeBody: (id) =>
    set((s) => {
      const bodies = s.bodies.filter((b) => b.id !== id)
      const activeBodyId = s.activeBodyId === id ? bodies[0]?.id ?? null : s.activeBodyId
      return { bodies, activeBodyId, selection: s.activeBodyId === id ? null : s.selection }
    }),
  setActive: (id) => set({ activeBodyId: id, selection: null }),
  toggleVisible: (id) => set((s) => ({ bodies: s.bodies.map((b) => (b.id === id ? { ...b, visible: !b.visible } : b)) })),
  setSelection: (selection) => set({ selection }),
  setSegmentAngle: (segmentAngle) => set({ segmentAngle }),
  setBusy: (busy) => set({ busy }),
  pushLog: (lines) => set((s) => ({ log: [...s.log, ...(Array.isArray(lines) ? lines : [lines])].slice(-200) })),
  clearLog: () => set({ log: [] }),
  setVoronoi: (patch) => set((s) => ({ voronoi: { ...s.voronoi, ...patch } })),
  setLineWidth: (lineWidth) => set((s) => ({ lineWidth, voronoi: { ...s.voronoi, minRib: Math.round(lineWidth * 2 * 100) / 100 } })),
  replaceMesh: (id, mesh) =>
    set((s) => ({
      bodies: s.bodies.map((b) => (b.id === id ? { ...b, mesh, adjacency: undefined, history: [...b.history, b.mesh].slice(-5) } : b)),
      selection: s.activeBodyId === id ? null : s.selection,
    })),
  undo: (id) =>
    set((s) => ({
      bodies: s.bodies.map((b) => {
        if (b.id !== id || b.history.length === 0) return b
        const history = b.history.slice(0, -1)
        return { ...b, mesh: b.history[b.history.length - 1], adjacency: undefined, history }
      }),
      selection: s.activeBodyId === id ? null : s.selection,
    })),
  adjacencyFor: (id) => {
    const b = get().bodies.find((x) => x.id === id)
    if (!b) return null
    if (!b.adjacency) {
      b.adjacency = new FaceAdjacency(b.mesh)
    }
    return b.adjacency
  },
}))

/** Triangle index list from a selection mask (null mask = every triangle). */
export function selectionToRegion(mask: Uint8Array | null, nTri: number): Uint32Array {
  if (!mask) {
    const all = new Uint32Array(nTri)
    for (let i = 0; i < nTri; i++) all[i] = i
    return all
  }
  const out: number[] = []
  for (let i = 0; i < mask.length; i++) if (mask[i]) out.push(i)
  return Uint32Array.from(out)
}
