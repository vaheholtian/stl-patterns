// The pattern catalog: every built-in reachable from the browser, once, with a
// family, a resolvable definition and a thumbnail.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync } from 'node:fs'
import Module from 'manifold-3d'
import {
  catalog, catalogEntry, nativeVariants, uncoveredGenerators, defForVariant, entryForDef, atReference,
  filterCatalog, cutState, START_HERE, LIBRARY_ENTRY_PREFIX,
} from '../src/patterns/catalog.ts'
import { FAMILY_IDS, FAMILIES } from '../src/patterns/catalogTypes.ts'
import { generators, generatorById } from '../src/patterns/index.ts'
import { libraryPatterns } from '../src/patterns/library/index.ts'
import { generateTile } from '../src/patterns/generate.ts'
import type { TileDef } from '../src/patterns/definition.ts'

const m = await Module(); m.setup()
const NATIVE_COUNT = generators.filter((g) => g.id !== 'library').length

test('every registered generator is on exactly one card, and every library design has a card', () => {
  assert.deepEqual(uncoveredGenerators(), [])
  const seen = new Map<string, number>()
  for (const { variant } of nativeVariants()) seen.set(variant.generatorId, (seen.get(variant.generatorId) ?? 0) + 1)
  // a generator with a switch may appear as more than one variant of its own card, never on two cards
  for (const [id, n] of seen) {
    const cards = catalog.filter((e) => e.variants.some((v) => v.generatorId === id))
    assert.equal(cards.length, 1, `${id} appears on ${cards.length} cards (${n} variants)`)
    assert.ok(generatorById(id), `${id} resolves`)
  }
  assert.equal(seen.size, NATIVE_COUNT, `${seen.size} of ${NATIVE_COUNT} native generators covered`)
  const libraryCards = catalog.filter((e) => e.library)
  assert.equal(libraryCards.length, libraryPatterns.length)
  const ids = new Set(catalog.map((e) => e.id))
  assert.equal(ids.size, catalog.length, 'catalog ids are unique')
  for (const p of libraryPatterns) assert.ok(ids.has(LIBRARY_ENTRY_PREFIX + p.slug), `library card for ${p.slug}`)
  const variantIds = nativeVariants().map((v) => v.variant.id)
  assert.equal(new Set(variantIds).size, variantIds.length, 'variant ids are unique')
})

test('every card has a valid family, and its chips are ones the family declares', () => {
  for (const e of catalog) {
    assert.ok(FAMILY_IDS.includes(e.family), `${e.id}: family ${e.family}`)
    const chips = FAMILIES.find((f) => f.id === e.family)?.chips
    if (chips) for (const s of e.shapes) assert.ok(chips.some((c) => c.id === s), `${e.id}: chip '${s}' not declared for ${e.family}`)
    assert.ok(e.variants.length >= 1, `${e.id} has a variant`)
    assert.ok(e.title.trim().length, `${e.id} has a title`)
  }
})

test('the Start here list resolves and is varied', () => {
  assert.equal(START_HERE.length, 20)
  assert.equal(new Set(START_HERE).size, 20)
  const families = new Set<string>()
  for (const id of START_HERE) {
    const e = catalogEntry(id)
    assert.ok(e, `${id} is in the catalog`)
    families.add(e!.family)
  }
  assert.ok(families.size >= 6, `${families.size} families represented`)
  const holds = START_HERE.filter((id) => catalogEntry(id)!.variants.some((v) => cutState(v.cut) === 'holds'))
  assert.ok(holds.length >= 16, `${holds.length} of 20 survive a reference cut`)
})

test('every native variant has a thumbnail, and its definition generates a tile', () => {
  for (const { entry, variant } of nativeVariants()) {
    assert.ok(existsSync(new URL(`../src/patterns/thumbs/${variant.id}.svg`, import.meta.url)), `thumbnail for ${variant.id}`)
    const def = { name: '', invert: false, ...defForVariant(entry, variant) } as TileDef
    assert.equal(def.generatorId, variant.generatorId)
    for (const [k, v] of Object.entries(variant.params)) assert.equal(def.params[k], v, `${variant.id}: ${k} carried into the definition`)
    const { tile, polygons } = generateTile(m, { def, lineWidth: 0.42 })
    assert.ok(tile && polygons.length, `${variant.id} generates`)
  }
})

test('a definition finds its way back to its card and variant', () => {
  assert.equal(entryForDef({ generatorId: 'honeycomb', params: {} })?.entry.id, 'perforations')
  assert.equal(entryForDef({ generatorId: 'moire', params: {} })?.variant.id, 'moire')
  assert.equal(entryForDef({ generatorId: 'moire', params: { mode: 'radial' } })?.variant.id, 'moire-radial')
  assert.equal(entryForDef({ generatorId: 'koch', params: { style: 'curve-band' } })?.variant.id, 'koch-curve-band')
  assert.equal(entryForDef({ generatorId: 'koch', params: { style: 'snowflake' } })?.variant.id, 'koch')
  assert.equal(entryForDef({ generatorId: 'library', params: { pattern: 'hexagon-1' } })?.entry.id, 'lib:hexagon-1')
  assert.equal(entryForDef({ generatorId: 'library', params: { pattern: 'no-such' } }), undefined)
  assert.equal(entryForDef({ generatorId: 'svg', params: {} }), undefined)
  assert.equal(entryForDef({ generatorId: 'celtic', params: {} })?.entry.id, 'mirrorCurves')
})

test('the cut badge is silent once a parameter leaves the reference', () => {
  const { entry, variant } = entryForDef({ generatorId: 'honeycomb', params: {} })!
  const def = { name: '', invert: false, ...defForVariant(entry, variant) } as TileDef
  assert.equal(atReference(def, variant), true)
  assert.equal(atReference({ ...def, params: { ...def.params, holeSize: 9 } }, variant), false)
  assert.equal(cutState(variant.cut), 'holds')
  assert.equal(cutState(undefined), 'unmeasured')
  assert.equal(cutState({ plain: 0, inverted: 0, good: null }), 'empty', 'zero is never success')
  assert.equal(cutState({ plain: 45, inverted: 45, good: null }), 'loose')
})

test('search hits titles, aliases and tags, and only registered options come back', () => {
  const hex = filterCatalog(catalog, { query: 'hex' }).map((e) => e.id)
  assert.ok(hex.includes('perforations'), 'hex finds the honeycomb card')
  assert.ok(hex.includes('lib:hexagon-1'))
  assert.ok(filterCatalog(catalog, { query: 'vent' }).some((e) => e.id === 'perforations'))
  assert.ok(filterCatalog(catalog, { query: 'knot' }).some((e) => e.id === 'mirrorCurves'))
  assert.ok(filterCatalog(catalog, { query: 'santaclaus' }).every((e) => e.family === 'nature'), 'raw tags stay searchable')
  assert.equal(filterCatalog(catalog, { query: 'zzzz-no-such' }).length, 0)
  for (const e of filterCatalog(catalog, { family: 'tiles', shape: 'stars' })) assert.ok(e.shapes.includes('stars'))
  for (const e of filterCatalog(catalog, { layout: 'band' })) assert.ok(e.variants.some((v) => v.layout === 'band'))
  for (const e of filterCatalog(catalog, { holdsOnly: true })) assert.ok(e.variants.some((v) => cutState(v.cut) === 'holds'))
  for (const e of filterCatalog(catalog, { seamlessOnly: true })) assert.ok(e.variants.some((v) => v.seamless))
})
