import type { ApplyMode, TileGenerationInput, TileGenerationResult } from '../patterns/generate'
import type { LayoutResult, LayoutSettings, Flat } from '../geom/layout'
import type { PieceReport } from '../patterns/loosePieces'
import type { TileDef } from '../patterns/definition'
import type { Pt } from '../patterns/types'

export interface LayoutInput { flat: Flat; polygons: Pt[][]; width: number; height: number; settings: LayoutSettings }
export type PreviewLayoutResult = Omit<LayoutResult, 'param'>
/** The generated tile, for the live piece count: its polygons, and its definition for the other orientation. */
export interface PiecesInput { def: TileDef; lineWidth: number; mode?: ApplyMode; scale?: number; polygons: Pt[][]; width: number; height: number }
export interface PiecesResult {
  current: PieceReport
  /** the same tile with solid and openings swapped */
  other: { pieces: number }
  /** the piece count with every connection required a tenth wider: more pieces means it holds only just */
  strict: number
}
export type PreviewRequest =
  | { id: number; type: 'generate'; input: TileGenerationInput }
  | { id: number; type: 'layout'; input: LayoutInput }
  | { id: number; type: 'pieces'; input: PiecesInput }
export type PreviewResponse =
  | { id: number; ok: true; result: TileGenerationResult | PreviewLayoutResult | PiecesResult }
  | { id: number; ok: false; error: string; fatal: boolean }
