import type { Generator } from './types'
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

export const generators: Generator[] = [
  voronoiTileGenerator,
  delaunayTileGenerator,
  truchetGenerator,
  guillocheGenerator,
  hilbertGenerator,
  phyllotaxisGenerator,
  moireGenerator,
  sierpinskiGenerator,
  kochGenerator,
  penroseApproximantGenerator,
  penroseGenerator,
  hyperbolicGenerator,
  apollonianGenerator,
  juliaGenerator,
]

/**
 * Whether a generator's tiles can be repeated without visible joins (from its
 * description). A description that says "not seamless" opts out even when it
 * also mentions the word elsewhere.
 */
export function isSeamless(g: Generator | undefined): boolean {
  if (!g) return true
  const d = g.description.toLowerCase()
  return d.includes('seamless') && !d.includes('not seamless')
}

export function generatorById(id: string): Generator | undefined {
  return generators.find((g) => g.id === id)
}

export function defaultParams(g: Generator): Record<string, import('./types').ParamValue> {
  const out: Record<string, import('./types').ParamValue> = {}
  for (const p of g.params) out[p.key] = p.default
  return out
}
