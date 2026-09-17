import type { Generator, GeneratorParam, ParamValue } from '../types'
import { buildLibraryTile, sourceHeight, type LibraryPattern } from './tile'
import raw from './data.json' with { type: 'json' }

/**
 * The pattern.monster library (MIT, see NOTICE.md), as one generator with the
 * design as a parameter rather than 330 entries in the picker.
 *
 * Every tile here is genuinely periodic once clipped to its repeat box, so the
 * generator declares itself seamless and the pipeline's periodic cleanup runs.
 * Where a design is drawn past that box and loses something to the clip, the
 * tile says so in its notes -- measured per pattern, not assumed either way.
 */
export const libraryPatterns = raw as LibraryPattern[]

const bySlug = new Map(libraryPatterns.map((p) => [p.slug, p]))

export function libraryPattern(slug: string): LibraryPattern | undefined {
  return bySlug.get(slug)
}

const DEFAULT_SLUG = 'hexagon-1'

const patternOptions = libraryPatterns
  .map((p) => ({ value: p.slug, label: p.title }))
  .sort((a, b) => a.label.localeCompare(b.label))

const params: GeneratorParam[] = [
  { key: 'pattern', label: 'Design', type: 'select', default: bySlug.has(DEFAULT_SLUG) ? DEFAULT_SLUG : libraryPatterns[0].slug, options: patternOptions, hint: 'pattern.monster design; the picker shows them as thumbnails' },
  { key: 'width', label: 'Repeat width (mm)', type: 'number', default: 50, min: 5, max: 400, step: 1, hint: 'the height follows the design’s own proportions' },
  { key: 'ribWidth', label: 'Rib width (mm)', type: 'number', default: 1.2, min: 0.2, max: 8, step: 0.1, hint: 'line thickness; only used by designs drawn as strokes' },
  { key: 'layers', label: 'Colour layers drawn', type: 'int', default: 9, min: 1, max: 9, hint: 'fewer layers drops the shapes that only differed by colour' },
  { key: 'spacingX', label: 'Extra spacing across (mm)', type: 'number', default: 0, min: 0, max: 100, step: 1 },
  { key: 'spacingY', label: 'Extra spacing down (mm)', type: 'number', default: 0, min: 0, max: 100, step: 1 },
]

function chosen(p: Record<string, ParamValue>): LibraryPattern {
  return bySlug.get(String(p.pattern)) ?? bySlug.get(DEFAULT_SLUG) ?? libraryPatterns[0]
}

export const libraryGenerator: Generator = {
  id: 'library',
  name: 'Pattern library',
  description: 'Seamless all-over designs from the pattern.monster library: geometric, floral, woven and folk repeats, sized in millimetres.',
  seamless: () => true,
  params,
  generate(p) {
    const pattern = chosen(p)
    const width = Math.max(1, Number(p.width) || 50)
    const layers = Math.max(1, Math.min(Math.round(Number(p.layers) || pattern.layers.length), pattern.layers.length))
    const tile = buildLibraryTile(pattern, {
      widthMm: width,
      ribWidth: Math.max(0.05, Number(p.ribWidth) || 1.2),
      layers,
      spacingX: Math.max(0, Number(p.spacingX) || 0),
      spacingY: Math.max(0, Number(p.spacingY) || 0),
    })
    const notes = tile.notes ?? []
    if (pattern.layers.length > 1) notes.push(`${pattern.title}: ${layers} of ${pattern.layers.length} colour layers drawn.`)
    if (pattern.vHeight > 0 && layers < pattern.layers.length) {
      notes.push(`Dropping layers also shortens the repeat, to ${(sourceHeight(pattern, layers) * (width / pattern.w)).toFixed(1)} mm.`)
    }
    if (pattern.mode === 'fill' && Number(p.ribWidth) !== 1.2) notes.push('This design is drawn as filled shapes, so rib width does nothing here.')
    tile.notes = notes.length ? notes : undefined
    return tile
  },
}
