// Voronoi's two ways onto a model: the repeating tile every pattern uses, or
// cells generated over the surface. One catalog card, one remembered switch,
// and the recipe kind follows whichever method is in force.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { catalog, catalogEntry, defForVariant } from '../src/patterns/catalog.ts'
import { METHOD_KEY, readMethod, writeMethod, supportsSurfaceMethod, effectiveMethod, recipeOp } from '../src/state/voronoiMethod.ts'

function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, map: m }
}

const voronoiCard = catalogEntry('voronoi')!
const voronoiDef = { name: '', invert: false, ...defForVariant(voronoiCard, voronoiCard.variants[0]) }

test('Voronoi is the one card that offers surface generation, and it stays a single card', () => {
  const surfaceCards = catalog.filter((e) => e.surface)
  assert.deepEqual(surfaceCards.map((e) => e.id), ['voronoi'])
  assert.equal(voronoiCard.variants.length, 1, 'the surface routine is a method, not a variant')
  assert.equal(voronoiCard.variants[0].generatorId, 'voronoiTile', 'the tile generator id is unchanged')
})

test('only a Voronoi tile definition supports the surface method', () => {
  assert.equal(supportsSurfaceMethod(voronoiDef), true)
  assert.equal(supportsSurfaceMethod({ generatorId: 'voronoiTile', params: { cellSize: 12 } }), true, 'edited parameters keep the switch')
  assert.equal(supportsSurfaceMethod({ generatorId: 'honeycomb', params: {} }), false)
  assert.equal(supportsSurfaceMethod({ generatorId: 'delaunayTile', params: {} }), false, 'the other organic card has no surface routine')
  assert.equal(supportsSurfaceMethod({ generatorId: 'library', params: { pattern: 'hexagon-1' } }), false)
  assert.equal(supportsSurfaceMethod({ generatorId: 'svg', params: {} }), false)
})

test('surface generation is in force only when offered, chosen and a model is loaded', () => {
  assert.equal(effectiveMethod(voronoiDef, 'surface', true), 'surface')
  assert.equal(effectiveMethod(voronoiDef, 'surface', false), 'tile', 'nothing to generate on without a model')
  assert.equal(effectiveMethod(voronoiDef, 'tile', true), 'tile')
  assert.equal(effectiveMethod({ generatorId: 'honeycomb', params: {} }, 'surface', true), 'tile', 'the remembered choice does not leak onto other patterns')
})

test('the recipe kind follows the method in force, keeping both saved formats', () => {
  assert.equal(recipeOp(voronoiDef, 'surface', true), 'voronoi')
  assert.equal(recipeOp(voronoiDef, 'tile', true), 'tile')
  assert.equal(recipeOp({ generatorId: 'honeycomb', params: {} }, 'surface', true), 'tile')
})

test('the choice is remembered under its own key and anything else reads as the tile', () => {
  assert.equal(readMethod(fakeStorage()), 'tile')
  assert.equal(readMethod(fakeStorage({ [METHOD_KEY]: 'surface' })), 'surface')
  assert.equal(readMethod(fakeStorage({ [METHOD_KEY]: 'garbage' })), 'tile')
  assert.equal(readMethod(null), 'tile')
  assert.equal(readMethod({ getItem: () => { throw new Error('blocked') }, setItem: () => {} }), 'tile')
  const s = fakeStorage()
  writeMethod('surface', s)
  assert.equal(s.map.get(METHOD_KEY), 'surface')
  assert.equal(readMethod(s), 'surface')
  writeMethod('tile', s)
  assert.equal(readMethod(s), 'tile')
  assert.doesNotThrow(() => writeMethod('surface', { getItem: () => null, setItem: () => { throw new Error('full') } }))
})
