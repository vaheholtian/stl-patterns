import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generatorById } from '../src/patterns/index.ts'

const g = generatorById('stripes')!
const ctx = { rand: Math.random }

test('stripes: blank bands have the chosen width and repeat at printed + blank', () => {
  for (const direction of ['vertical', 'horizontal']) {
    const t = g.generate({ direction, printed: 2, blank: 5 }, ctx)
    const pitch = 7
    assert.equal(t.polygons.length, Math.round(40 / pitch))
    assert.ok(Math.abs(t.width - t.polygons.length * pitch) < 1e-9 && t.width === t.height)
    const axis = direction === 'vertical' ? 0 : 1
    t.polygons.forEach((poly, i) => {
      const across = poly.map((pt) => pt[axis]), along = poly.map((pt) => pt[1 - axis])
      assert.ok(Math.abs(Math.max(...across) - Math.min(...across) - 5) < 1e-9, 'blank width')
      assert.ok(Math.abs(Math.min(...across) - (i * pitch + 1)) < 1e-9, 'half a printed band each side of the seam')
      assert.ok(Math.min(...along) < 0 && Math.max(...along) > t.height, 'band runs past both ends of the box')
    })
  }
})

test('the gap floor holds on the model: through-cut keeps 0.2 mm gaps, emboss wants two lines, both after scaling', async () => {
  const { m } = await import('./physical-fixtures.ts')
  const { generateTile, GAP_FLOOR } = await import('../src/patterns/generate.ts')
  const bands = (blank: number, mode: 'cut' | 'emboss', scale: number) => generateTile(m, {
    def: { name: 's', generatorId: 'stripes', invert: false, seamless: true, params: { direction: 'vertical', printed: 5, blank } } as never,
    lineWidth: 0.42, mode, scale,
  }).polygons.length
  // blank widths are in tile mm: at scale k a tile gap w is w * k on the model
  assert.equal(bands(0.5, 'cut', 1), 7, 'a 0.5 mm gap is kept, well above the floor')
  assert.equal(bands(0.5, 'cut', 0.5), 7, '0.25 mm on the model is still above the floor')
  assert.equal(bands(0.3, 'cut', 0.5), 0, '0.15 mm on the model is under the 0.2 mm floor')
  assert.equal(bands(0.3, 'cut', 1), 8, 'the same gap at full size is kept (pitch 5.3 mm: 8 stripes)')
  assert.equal(bands(1, 'emboss', 1), 7, 'a 1 mm rib is two 0.42 mm lines')
  assert.equal(bands(1, 'emboss', 0.5), 0, 'at half size it is 0.5 mm, under two lines')
  assert.equal(GAP_FLOOR, 0.2)
})
