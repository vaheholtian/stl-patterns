// Request/response types shared by the main thread and the geometry worker.
import type { TriMesh } from '../geom/manifold'
import type { FlattenedRegion, FlattenedPiece } from '../geom/regionFlatten'

export interface VoronoiParams {
  cellSize: number       // mm, target mean cell size
  ribWidth: number       // mm
  relaxPasses: number
  seed: number
  mode: 'cut' | 'recess' | 'emboss'
  depth: number          // mm, for recess/emboss; ignored for cut
  minRib: number         // mm, printability floor (rib clamped to this)
  minIslandVolume: number // mm^3; components below this are dropped
  neighbours: number
  /** which part of the pattern becomes the tool: the cells, or the rib network between them */
  feature: 'cells' | 'ribs'
  /** untouched band along every region edge, mm */
  edgeMargin: number
}

/** One flattened piece of the region with its laid-out polygons. */
export interface TilePiece {
  /** closed polygons in the piece's flattened mm space (already repeated/laid out by the caller) */
  polygons: Float32Array[]   // each is xy interleaved
  /** the flattening: submesh + uv, produced on the main thread */
  positions: Float32Array
  indices: Uint32Array
  normals: Float32Array
  uv: Float32Array
}

export interface TileParams {
  /** the smooth pieces of the region, each flattened on its own; one tool is built per piece */
  pieces: TilePiece[]
  mode: 'cut' | 'recess' | 'emboss'
  depth: number
  minIslandVolume: number
  wallThickness: number  // used to size through-cuts
  /** max edge length of the warped tool mesh, mm (smaller = smoother on tight curves, more triangles) */
  detail?: number
}

export type Request =
  | { id: number; type: 'check'; mesh: TriMesh }
  | { id: number; type: 'voronoi'; mesh: TriMesh; region: Uint32Array; params: VoronoiParams }
  | { id: number; type: 'tile'; mesh: TriMesh; params: TileParams }
  | { id: number; type: 'flatten'; mesh: TriMesh; region: Uint32Array; origin: [number, number, number] }
  | { id: number; type: 'flattenPieces'; mesh: TriMesh; region: Uint32Array; origin: [number, number, number]; maxAngleDeg: number }

export interface OpResult {
  mesh: TriMesh
  islandsRemoved: number
  log: string[]
  ms: number
}

export type RequestBody = Request extends infer R ? (R extends Request ? Omit<R, 'id'> : never) : never

export interface CheckResponse { id: number; ok: true; type: 'check'; manifold: boolean; status: string; volume: number; area: number }
export interface OpResponse { id: number; ok: true; type: 'voronoi' | 'tile'; result: OpResult }
export interface FlattenResponse { id: number; ok: true; type: 'flatten'; result: FlattenedRegion }
export interface FlattenPiecesResponse { id: number; ok: true; type: 'flattenPieces'; pieces: FlattenedPiece[]; log: string[] }
export interface ErrorResponse { id: number; ok: false; error: string }
export interface ProgressResponse { id: number; progress: string; fraction?: number }

export type Response = CheckResponse | OpResponse | FlattenResponse | FlattenPiecesResponse | ErrorResponse | ProgressResponse
