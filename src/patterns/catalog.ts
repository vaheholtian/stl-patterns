/**
 * The catalog the pattern browser reads: every built-in pattern as a card,
 * sorted by what it looks like rather than by which generator draws it.
 *
 * A card can carry several variants where separate generators, or one
 * generator under a different switch, are one look to the person choosing:
 * the five perforation shapes, the three single-stroke fractals, Penrose as
 * tiling or medallion. Each variant still resolves to its own generator id and
 * parameters, so nothing in the pipeline or in saved tiles changes.
 *
 * Library designs are one card each, categorised by families.json, which is
 * explicit per-design metadata (first written by scripts/library-families.ts).
 */
import type { ParamValue } from './types'
import type { TileDef } from './definition'
import { generators, generatorById, defaultParams, repeatKind, cutAdviceFor, isSeamless } from './index'
import { libraryPatterns, libraryGenerator } from './library'
import type { LibraryPattern } from './library/tile'
import type { CutAdvice } from './cutParts'
import { FAMILY_IDS, familyInfo, type Family, type Layout } from './catalogTypes'
import familiesRaw from './library/families.json' with { type: 'json' }

export interface CatalogVariant {
  /** stable; also the native thumbnail's file name */
  id: string
  /** the tile's name when chosen */
  label: string
  generatorId: string
  /** overrides on the generator's defaults that make this variant */
  params: Record<string, ParamValue>
  layout: Layout
  /** repeats without being mirrored (natives), or clean seams (library) */
  seamless: boolean
  /** reference through-cut measurement, at the variant's defaults; undefined when never measured */
  cut?: CutAdvice
}

export interface CatalogEntry {
  id: string
  title: string
  family: Family
  /** shape chips or sub-buckets inside the family */
  shapes: string[]
  /** words search should also hit */
  aliases: string[]
  /** the source's own tags; searchable, never shown as headings */
  tags: string[]
  description: string
  variants: CatalogVariant[]
  /** set for library designs, whose swatch is drawn live from the path data */
  library?: LibraryPattern
  /** the pattern can also be generated straight over the selected surface on the Apply screen, instead of as a repeating tile */
  surface?: boolean
}

/** What a reference cut says about a variant, for the badge on its card. */
export type CutState = 'holds' | 'loose' | 'empty' | 'unmeasured'

export function cutState(cut: CutAdvice | undefined): CutState {
  if (!cut) return 'unmeasured'
  if (cut.plain === 0 && cut.inverted === 0) return 'empty'
  return cut.plain === 1 || cut.inverted === 1 ? 'holds' : 'loose'
}

export const CUT_STATE_LABEL: Record<CutState, string> = {
  holds: 'Holds together',
  loose: 'Creates loose pieces',
  empty: 'Nothing to cut',
  unmeasured: 'Not measured',
}

interface NativeVariantSpec { generatorId: string; id?: string; label?: string; params?: Record<string, ParamValue> }
interface NativeCardSpec {
  id: string
  title: string
  family: Family
  shapes?: string[]
  aliases: string[]
  variants: NativeVariantSpec[]
  surface?: boolean
}

const NATIVE_CARDS: NativeCardSpec[] = [
  {
    id: 'perforations', title: 'Perforations', family: 'grids', shapes: ['hexagons', 'circles', 'squares', 'diamonds'],
    aliases: ['vent', 'holes', 'grille', 'lattice', 'mesh', 'honeycomb', 'hex', 'slots', 'speaker'],
    variants: [
      { generatorId: 'honeycomb', label: 'Honeycomb' },
      { generatorId: 'roundPerforations', label: 'Round perforations' },
      { generatorId: 'squareGrid', label: 'Square grid' },
      { generatorId: 'diamondLattice', label: 'Diamond lattice' },
      { generatorId: 'roundedSlots', label: 'Rounded slots' },
    ],
  },
  // the one card with two methods: this repeating tile, or cells generated over the selected surface (see state/voronoiMethod)
  { id: 'voronoi', title: 'Voronoi cells', family: 'organic', aliases: ['cells', 'cellular', 'crackle', 'foam', 'organic', 'surface'], variants: [{ generatorId: 'voronoiTile' }], surface: true },
  { id: 'delaunay', title: 'Delaunay mesh', family: 'organic', shapes: ['triangles'], aliases: ['triangulation', 'mesh', 'web', 'truss'], variants: [{ generatorId: 'delaunayTile' }] },
  { id: 'caneWeave', title: 'Cane weave', family: 'weaves', aliases: ['rattan', 'wicker', 'basket', 'chair', 'weave'], variants: [{ generatorId: 'caneWeave' }] },
  {
    id: 'mirrorCurves', title: 'Mirror curves', family: 'weaves', aliases: ['lusona', 'sona', 'celtic', 'plait', 'knot', 'knotwork', 'interlace'],
    variants: [
      { generatorId: 'lusona', label: 'Mirror curves (lusona)' },
      { generatorId: 'celtic', label: 'Celtic plait' },
    ],
  },
  { id: 'hankin', title: 'Islamic star strapwork', family: 'weaves', shapes: ['stars'], aliases: ['islamic', 'girih', 'star', 'strapwork', 'arabesque', 'moorish'], variants: [{ generatorId: 'hankin' }] },
  { id: 'truchet', title: 'Truchet tiling', family: 'weaves', aliases: ['truchet', 'arcs', 'quarter circles'], variants: [{ generatorId: 'truchet' }] },
  { id: 'greekKey', title: 'Greek key', family: 'weaves', aliases: ['meander', 'greek', 'border', 'key', 'band'], variants: [{ generatorId: 'greekKey' }] },
  {
    id: 'penrose', title: 'Penrose tiling', family: 'tiles', shapes: ['diamonds'], aliases: ['quasicrystal', 'rhombus', 'kites', 'darts', 'aperiodic'],
    variants: [
      { generatorId: 'penroseApproximant', label: 'Penrose tiling' },
      { generatorId: 'penrose', label: 'Penrose medallion' },
    ],
  },
  { id: 'ammannBeenker', title: 'Ammann–Beenker tiling', family: 'tiles', shapes: ['squares', 'diamonds'], aliases: ['octagonal', 'aperiodic', 'quasicrystal', 'ammann', 'beenker'], variants: [{ generatorId: 'ammannBeenker' }] },
  { id: 'hyperbolic', title: 'Hyperbolic tiling', family: 'tiles', shapes: ['mixed'], aliases: ['poincare', 'escher', 'disc', 'circle limit'], variants: [{ generatorId: 'hyperbolic' }] },
  { id: 'stripes', title: 'Stripes', family: 'lines', aliases: ['stripe', 'bands', 'lines', 'slats', 'ribs', 'vertical', 'horizontal', 'pinstripe'], variants: [{ generatorId: 'stripes' }] },
  {
    id: 'moire', title: 'Moiré lines', family: 'lines', aliases: ['moire', 'interference', 'lines', 'stripes'],
    variants: [
      { generatorId: 'moire', label: 'Moiré lines' },
      { generatorId: 'moire', id: 'moire-radial', label: 'Moiré lines + circles', params: { mode: 'radial' } },
    ],
  },
  { id: 'maze', title: 'Periodic maze', family: 'mazes', aliases: ['labyrinth', 'maze', 'path'], variants: [{ generatorId: 'unicursalMaze' }] },
  { id: 'hilbert', title: 'Hilbert curve', family: 'mazes', aliases: ['space-filling', 'curve', 'circuit', 'band'], variants: [{ generatorId: 'hilbert' }] },
  {
    id: 'strokeFractals', title: 'Single-stroke fractals', family: 'mazes', aliases: ['gosper', 'flowsnake', 'arrowhead', 'terdragon', 'dragon', 'l-system', 'curve'],
    variants: [
      { generatorId: 'gosper', label: 'Gosper curve' },
      { generatorId: 'arrowhead', label: 'Sierpiński arrowhead' },
      { generatorId: 'terdragon', label: 'Terdragon' },
    ],
  },
  { id: 'fermatSpirals', title: 'Stitched Fermat spirals', family: 'mazes', aliases: ['spiral', 'fermat', 'sunflower'], variants: [{ generatorId: 'fermatSpirals' }] },
  { id: 'sierpinski', title: 'Sierpinski fractal', family: 'mazes', shapes: ['triangles'], aliases: ['triangle', 'carpet', 'gasket'], variants: [{ generatorId: 'sierpinski' }] },
  {
    id: 'koch', title: 'Koch fractal', family: 'mazes', aliases: ['snowflake', 'koch', 'curve'],
    variants: [
      { generatorId: 'koch', label: 'Koch snowflake' },
      { generatorId: 'koch', id: 'koch-curve-band', label: 'Koch curve band', params: { style: 'curve-band' } },
    ],
  },
  { id: 'julia', title: 'Julia / Mandelbrot', family: 'mazes', aliases: ['mandelbrot', 'julia', 'fractal', 'set'], variants: [{ generatorId: 'julia' }] },
  { id: 'apollonian', title: 'Apollonian gasket', family: 'rosettes', shapes: ['circles'], aliases: ['circle packing', 'gasket', 'bubbles'], variants: [{ generatorId: 'apollonian' }] },
  { id: 'phyllotaxis', title: 'Phyllotaxis spiral', family: 'rosettes', aliases: ['sunflower', 'fibonacci', 'golden', 'seeds', 'dots'], variants: [{ generatorId: 'phyllotaxis' }] },
  {
    id: 'guilloche', title: 'Guilloche', family: 'rosettes', aliases: ['rosette', 'spirograph', 'engine turned', 'banknote'],
    variants: [
      { generatorId: 'guilloche', label: 'Guilloche rosette' },
      { generatorId: 'guilloche', id: 'guilloche-band', label: 'Guilloche band', params: { style: 'band' } },
    ],
  },
]

function nativeVariant(card: NativeCardSpec, v: NativeVariantSpec): CatalogVariant {
  const g = generatorById(v.generatorId)
  if (!g) throw new Error(`catalog: card '${card.id}' names unregistered generator '${v.generatorId}'`)
  const params = v.params ?? {}
  const full = { ...defaultParams(g), ...params }
  return {
    id: v.id ?? v.generatorId,
    label: v.label ?? card.title,
    generatorId: v.generatorId,
    params,
    layout: repeatKind(g, full),
    seamless: isSeamless(g, full),
    // the reference table is keyed by generator at its defaults: a variant that
    // changes a parameter was not on the ring, so it is not measured
    cut: Object.keys(params).length ? undefined : cutAdviceFor(g, full),
  }
}

function nativeEntry(card: NativeCardSpec): CatalogEntry {
  const variants = card.variants.map((v) => nativeVariant(card, v))
  const first = generatorById(variants[0].generatorId)!
  return {
    id: card.id, title: card.title, family: card.family, shapes: card.shapes ?? [], aliases: card.aliases, tags: [],
    description: first.description, variants, surface: card.surface,
  }
}

interface LibraryAssignment { family: Family; shapes: string[]; reviewed?: boolean }
const libraryFamilies = familiesRaw as Record<string, LibraryAssignment>

export const LIBRARY_ENTRY_PREFIX = 'lib:'

function libraryEntry(p: LibraryPattern): CatalogEntry {
  const a = libraryFamilies[p.slug]
  const family: Family = a && FAMILY_IDS.includes(a.family) ? a.family : 'tiles'
  const shapes = a?.shapes ?? ['mixed']
  const params = { pattern: p.slug }
  return {
    id: LIBRARY_ENTRY_PREFIX + p.slug, title: p.title, family, shapes, aliases: [], tags: p.tags,
    description: `${p.title}, a ${familyInfo(family).label.toLowerCase()} design from the pattern.monster library.`,
    variants: [{
      id: 'lib-' + p.slug, label: p.title, generatorId: 'library', params, layout: 'field',
      // the source drawings are periodic once clipped; "seamless" here means the
      // clip costs nothing visible, the same measure the old picker's toggle used
      seamless: p.clipLossPct < 1 && p.ribBreak <= 0.42,
      cut: cutAdviceFor(libraryGenerator, params),
    }],
    library: p,
  }
}

export const catalog: CatalogEntry[] = [
  ...NATIVE_CARDS.map(nativeEntry),
  ...libraryPatterns.map(libraryEntry),
]

const byId = new Map(catalog.map((e) => [e.id, e]))

export function catalogEntry(id: string): CatalogEntry | undefined {
  return byId.get(id)
}

/** Every native variant, for thumbnail generation and coverage checks. */
export function nativeVariants(): { entry: CatalogEntry; variant: CatalogVariant }[] {
  return catalog.filter((e) => !e.library).flatMap((entry) => entry.variants.map((variant) => ({ entry, variant })))
}

/** Generator ids the catalog covers, for the test that nothing registered is left out. */
export function coveredGeneratorIds(): string[] {
  return [...new Set(nativeVariants().map((v) => v.variant.generatorId))]
}

/** Registered generators a card should have covered but did not. */
export function uncoveredGenerators(): string[] {
  const covered = new Set(coveredGeneratorIds())
  return generators.filter((g) => g.id !== 'library' && !covered.has(g.id)).map((g) => g.id)
}

/**
 * The tile definition a variant opens with: its generator's defaults under the
 * variant's overrides, on the orientation measured to survive a through-cut
 * (falling back to the generator's own claim where nothing was measured), seamless
 * and without connecting bridges: those are the user's to add, and the reference
 * cut that steers the orientation was measured without them.
 */
export function defForVariant(_entry: CatalogEntry, variant: CatalogVariant): Partial<TileDef> {
  const g = generatorById(variant.generatorId)
  const params = g ? { ...defaultParams(g), ...variant.params } : { ...variant.params }
  const nextInvert = variant.cut?.good ?? Boolean(g?.cutoutDefault)
  return {
    generatorId: variant.generatorId, params, name: variant.label,
    svgTile: undefined, svgSubtract: undefined, svgSeamless: undefined,
    invert: nextInvert, connectMaterial: false, seamless: true, mirror: false,
  }
}

/** Which card and variant a tile definition is, or undefined for imported artwork. */
export function entryForDef(def: Pick<TileDef, 'generatorId' | 'params'>): { entry: CatalogEntry; variant: CatalogVariant } | undefined {
  if (def.generatorId === 'svg') return undefined
  if (def.generatorId === 'library') {
    const entry = byId.get(LIBRARY_ENTRY_PREFIX + String(def.params.pattern ?? ''))
    return entry ? { entry, variant: entry.variants[0] } : undefined
  }
  let fallback: { entry: CatalogEntry; variant: CatalogVariant } | undefined
  for (const entry of catalog) {
    if (entry.library) break
    for (const variant of entry.variants) {
      if (variant.generatorId !== def.generatorId) continue
      const keys = Object.keys(variant.params)
      // a variant made by a switch owns the definition only while the switch is set its way
      if (keys.length && keys.every((k) => def.params[k] === variant.params[k])) return { entry, variant }
      if (!keys.length && !fallback) fallback = { entry, variant }
    }
  }
  return fallback
}

/** Whether a definition still sits at the variant's reference parameters, so its cut badge may speak. */
export function atReference(def: Pick<TileDef, 'generatorId' | 'params'>, variant: CatalogVariant): boolean {
  const g = generatorById(variant.generatorId)
  if (!g) return false
  const reference = { ...defaultParams(g), ...variant.params }
  return Object.keys(reference).every((k) => def.params[k] === undefined || def.params[k] === reference[k])
}

/** A fixed, reviewed opening view: varied looks, mostly all-over repeats that survive a through-cut. */
export const START_HERE: string[] = [
  'perforations', 'lib:hexagon-1', 'voronoi', 'caneWeave', 'lib:herringbone-1', 'mirrorCurves', 'hankin', 'lib:waves-18',
  'penrose', 'lib:scales-7', 'delaunay', 'maze', 'lib:leaves-1', 'ammannBeenker', 'lib:plus-1', 'moire',
  'strokeFractals', 'lib:japanese-pattern-1', 'phyllotaxis', 'lib:geometric-2',
]

export interface CatalogFilters {
  query?: string
  family?: Family | null
  shape?: string | null
  layout?: Layout | null
  seamlessOnly?: boolean
  holdsOnly?: boolean
}

function haystack(e: CatalogEntry): string {
  return [e.title, e.id, ...e.aliases, ...e.tags, ...e.shapes, familyInfo(e.family).label, ...e.variants.map((v) => v.label + ' ' + v.generatorId)]
    .join(' ').toLowerCase()
}

const haystacks = new Map(catalog.map((e) => [e.id, haystack(e)]))

export function filterCatalog(entries: CatalogEntry[], f: CatalogFilters): CatalogEntry[] {
  const words = (f.query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  return entries.filter((e) => {
    if (f.family && e.family !== f.family) return false
    if (f.shape && !e.shapes.includes(f.shape)) return false
    if (f.layout && !e.variants.some((v) => v.layout === f.layout)) return false
    if (f.seamlessOnly && !e.variants.some((v) => v.seamless)) return false
    if (f.holdsOnly && !e.variants.some((v) => cutState(v.cut) === 'holds')) return false
    if (!words.length) return true
    const hay = haystacks.get(e.id) ?? haystack(e)
    return words.every((w) => hay.includes(w))
  })
}
