import type { Generator, ParamValue } from './types'
import { voronoiTileGenerator } from './voronoiTile'
import { delaunayTileGenerator } from './delaunayTile'
import { truchetGenerator } from './truchet'
import { guillocheGenerator } from './guilloche'
import { hilbertGenerator } from './hilbert'
import { phyllotaxisGenerator } from './phyllotaxis'
import { moireGenerator } from './moire'
import { sierpinskiGenerator } from './sierpinski'
import { kochGenerator } from './koch'
import { penroseGenerator } from './penrose'
import { penroseApproximantGenerator } from './penroseApproximant'
import { hyperbolicGenerator } from './hyperbolic'
import { apollonianGenerator } from './apollonian'
import { juliaGenerator } from './julia'
import { lusonaGenerator } from './mirrorCurves'
import { mazeGenerator } from './maze'
import { ammannBeenkerGenerator } from './ammannBeenker'
import { hankinGenerator } from './hankin'
import { fermatSpiralsGenerator } from './fermatSpirals'
import { singleStrokeFractalGenerators } from './singleStrokeFractals'
import { greekKeyGenerator } from './greekKey'
import { perforationGenerators } from './perforations'
import { caneWeaveGenerator } from './caneWeave'
import { libraryGenerator, libraryPattern } from './library'
import { NATIVE_CUT_PARTS, cutAdvice, type CutAdvice } from './cutParts'

/** Ordered for the picker: patterns that fill the surface first, centred medallions last. */
export const generators: Generator[] = [
  libraryGenerator,
  ...perforationGenerators,
  caneWeaveGenerator,
  lusonaGenerator,
  mazeGenerator,
  ammannBeenkerGenerator,
  hankinGenerator,
  fermatSpiralsGenerator,
  ...singleStrokeFractalGenerators,
  greekKeyGenerator,
  voronoiTileGenerator,
  delaunayTileGenerator,
  truchetGenerator,
  penroseApproximantGenerator,
  hilbertGenerator,
  moireGenerator,
  guillocheGenerator,
  sierpinskiGenerator,
  kochGenerator,
  // medallions
  phyllotaxisGenerator,
  hyperbolicGenerator,
  apollonianGenerator,
  penroseGenerator,
  juliaGenerator,
]

/**
 * Whether a generator's opposite box edges match. This does not imply an
 * all-over design: see repeatKind for bounded motifs and bands. A
 * generator may decide from its parameters; otherwise its description is
 * consulted, where "not seamless" opts out even if the word appears elsewhere.
 */
export function isSeamless(g: Generator | undefined, params?: Record<string, ParamValue>): boolean {
  if (!g) return true
  if (g.seamless) return g.seamless(params ?? defaultParams(g))
  const d = g.description.toLowerCase()
  return d.includes('seamless') && !d.includes('not seamless')
}

export function generatorById(id: string): Generator | undefined {
  return generators.find((g) => g.id === id)
}

export function defaultParams(g: Generator): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {}
  for (const p of g.params) out[p.key] = p.default
  return out
}

/** Visual repeat character, separate from merely having matching box edges.
 * A medallion can repeat periodically and still have an obvious panel outline.
 */
export function repeatKind(g: Generator, params: Record<string, ParamValue> = defaultParams(g)): 'field' | 'band' | 'motif' {
  if (g.id === 'moire' && params.mode === 'radial') return 'motif'
  if (['hilbert', 'greekKey'].includes(g.id)) return 'band'
  if (g.id === 'guilloche') return params.style === 'band' ? 'band' : 'motif'
  if (g.id === 'koch') return params.style === 'curve-band' ? 'field' : 'motif'
  if (['phyllotaxis', 'hyperbolic', 'apollonian', 'penrose', 'julia', 'sierpinski', 'fermatSpirals', 'gosper', 'arrowhead', 'terdragon'].includes(g.id)) return 'motif'
  return 'field'
}

/**
 * What a through-cut on a closed box measured for this pattern, in each
 * orientation. The library carries a measurement per design; every other
 * generator has one against its default parameters.
 *
 * Used to steer the Invert control, so a pattern opens on the orientation that
 * survives instead of on whichever way its generator happened to be written.
 */
export function cutAdviceFor(g: Generator | undefined, params?: Record<string, ParamValue>): CutAdvice | undefined {
  if (!g) return undefined
  if (g.id === 'library') {
    const p = libraryPattern(String(params?.pattern ?? defaultParams(g).pattern))
    return p ? cutAdvice([p.cutAs, p.cutInv]) : undefined
  }
  return cutAdvice(NATIVE_CUT_PARTS[g.id])
}
