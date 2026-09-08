import type { TileGenerationInput, TileGenerationResult } from '../patterns/generate'
import type { LayoutResult, LayoutSettings } from '../geom/layout'
import type { FlattenedRegion } from '../geom/regionFlatten'
import type { Pt } from '../patterns/types'

export interface LayoutInput { flat: FlattenedRegion; polygons: Pt[][]; width: number; height: number; settings: LayoutSettings }
export type PreviewLayoutResult = Omit<LayoutResult, 'param'>
export type PreviewRequest =
  | { id: number; type: 'generate'; input: TileGenerationInput }
  | { id: number; type: 'layout'; input: LayoutInput }
export type PreviewResponse =
  | { id: number; ok: true; result: TileGenerationResult | PreviewLayoutResult }
  | { id: number; ok: false; error: string; fatal: boolean }
