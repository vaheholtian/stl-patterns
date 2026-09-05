// Shared tile model for the Pattern screen. Everything is in millimetres.
// A tile is a repeat box [0,width) x [0,height) containing:
//   - polygons: closed filled regions (become holes, recesses or relief)
//   - curves: centrelines that are stroked with ribWidth (become grooves or ridges)
// Generators must produce output that repeats seamlessly across the box edges
// where the pattern family allows it.

export type Pt = [number, number]

export interface TileCurve {
  points: Pt[]
  closed: boolean
}

export interface Tile {
  width: number
  height: number
  /** closed polygons, filled with the even-odd rule; may be nested to make holes */
  polygons: Pt[][]
  /** stroked centrelines */
  curves: TileCurve[]
  /** stroke width for curves, mm */
  ribWidth: number
  /** informational messages from the generator (snapped sizes, self-check results) */
  notes?: string[]
}

export type ParamValue = number | string | boolean

export interface GeneratorParam {
  key: string
  label: string
  type: 'number' | 'int' | 'select' | 'boolean'
  default: ParamValue
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
  /** short hint shown as a tooltip */
  hint?: string
  /** value this parameter is locked to while the tile's Seamless switch is on */
  seamlessValue?: ParamValue
}

export interface GeneratorContext {
  /** deterministic PRNG in [0,1) seeded from the tile's seed parameter */
  rand: () => number
}

export interface Generator {
  id: string
  name: string
  /** one line shown in the UI */
  description: string
  /** New kept-rib families start inverted, with bridges and seamless repeats. */
  cutoutDefault?: boolean
  /** Native periodic rib network; automatic joining bars are unnecessary when inverted. */
  connectedRibs?: boolean
  params: GeneratorParam[]
  generate(params: Record<string, ParamValue>, ctx: GeneratorContext): Tile
  /** whether the tile repeats without joins for these parameters; defaults to a description check */
  seamless?(params: Record<string, ParamValue>): boolean
}

/** Density gradient shared by generators that place seeds or dots. */
export type GradientKind = 'none' | 'radial' | 'linear'

export const gradientParams: GeneratorParam[] = [
  {
    key: 'gradient', label: 'Density gradient', type: 'select', default: 'none',
    options: [
      { value: 'none', label: 'Uniform' },
      { value: 'radial', label: 'Radial (dense at centre)' },
      { value: 'radialOut', label: 'Radial (dense at edge)' },
      { value: 'linear', label: 'Linear (dense at left)' },
    ],
  },
  { key: 'gradientStrength', label: 'Gradient strength', type: 'number', default: 2, min: 1, max: 8, step: 0.5, hint: 'ratio between densest and sparsest areas' },
]

/**
 * Relative density in [1/strength, 1] at a point of the tile, for rejection
 * sampling. Returns 1 for uniform.
 */
export function densityAt(params: Record<string, ParamValue>, x: number, y: number, width: number, height: number): number {
  const kind = String(params.gradient ?? 'none')
  const strength = Math.max(1, Number(params.gradientStrength ?? 2))
  if (kind === 'none') return 1
  let t: number // 0 = densest, 1 = sparsest
  if (kind === 'radial' || kind === 'radialOut') {
    const dx = (x / width - 0.5) * 2, dy = (y / height - 0.5) * 2
    t = Math.min(1, Math.hypot(dx, dy) / Math.SQRT2)
    if (kind === 'radialOut') t = 1 - t
  } else {
    t = x / width
  }
  return 1 / (1 + (strength - 1) * t)
}

/** Sample `count` points in the box following the density field (rejection sampling). */
export function samplePoints(params: Record<string, ParamValue>, count: number, width: number, height: number, rand: () => number): Pt[] {
  const out: Pt[] = []
  let guard = 0
  while (out.length < count && guard++ < count * 50) {
    const x = rand() * width, y = rand() * height
    if (rand() <= densityAt(params, x, y, width, height)) out.push([x, y])
  }
  return out
}

export function getNum(params: Record<string, ParamValue>, key: string, fallback: number): number {
  const v = Number(params[key])
  return Number.isFinite(v) ? v : fallback
}
