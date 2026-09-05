import type { Generator } from './types'
import { celticGenerator } from './celtic'

// Both families use the periodic midpoint/mirror graph, without inset panels.
export const lusonaGenerator: Generator = {
  ...celticGenerator,
  id: 'lusona', name: 'Mirror curves / lusona',
  description: 'A periodic sand-drawing lattice with seeded mirror turns. Lines flow through both tile edges; disconnected loops are joined at existing crossings.',
  params: celticGenerator.params.map((p) => p.key === 'mirrors' ? { ...p, default: 0.45 } : p.key === 'rounding' ? { ...p, default: 0.45 } : p),
}
