import assert from 'node:assert/strict'
import { test } from 'node:test'
import Module from 'manifold-3d'
import { perforationGenerators } from '../src/patterns/perforations.ts'
import { defaultParams, isSeamless } from '../src/patterns/index.ts'
import { tileToCrossSection } from '../src/patterns/pipeline.ts'

const m = await Module(); m.setup()
for (const g of perforationGenerators) test(`${g.name}: periodic holes retain a connected web without bridges or mirrors`, () => {
  assert.equal(isSeamless(g), true)
  assert.ok(!g.cutoutDefault, 'Holes must be cut directly, without inversion')
  for (const aspect of [0.25, 1, 4]) {
    const tile = g.generate({ ...defaultParams(g), width: 47, height: 31, aspect }, { rand: () => 0.5 })
    assert.equal(tile.curves.length, 0)
    const holes = tileToCrossSection(m, tile, { periodic: true })
    const copies = []
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) copies.push(holes.translate([x * tile.width, y * tile.height]))
    // A finite cropped panel keeps a solid rim, as the Apply screen does.
    // Without it, a hole crossing a corner can cut off that corner even when
    // the infinite lattice is connected and every repeat matches perfectly.
    const all = m.CrossSection.union(copies), outer = m.CrossSection.square([tile.width * 3 + 4, tile.height * 3 + 4]), box = outer.translate([-2, -2])
    const kept = m.CrossSection.difference(box, all), parts = kept.decompose()
    assert.equal(parts.length, 1)
    assert.ok(holes.area() > 0 && kept.area() > 0)
    // Expanding holes by just under half the specified web must not join
    // neighbouring holes, including holes on tile seams.
    // Use whole holes including neighbours across the repeat edges: clipping
    // can split one hole into fragments separated by numerical seam tolerances.
    const wholeHoles = new m.CrossSection(tile.polygons, 'NonZero')
    const original = wholeHoles.decompose(), expanded = wholeHoles.offset(tile.ribWidth * 0.49, 'Round', 2, 32), after = expanded.decompose()
    assert.equal(after.length, original.length, 'The promised web must remain between adjacent holes')
    const solid = kept.extrude(2), bodies = solid.decompose()
    assert.equal(solid.status(), 'NoError'); assert.equal(bodies.length, 1)
    bodies.forEach((p) => p.delete()); solid.delete()
    original.forEach((p) => p.delete()); after.forEach((p) => p.delete()); expanded.delete(); wholeHoles.delete()
    parts.forEach((p) => p.delete()); kept.delete(); box.delete(); outer.delete(); all.delete(); copies.forEach((p) => p.delete()); holes.delete()
  }
})

test('Diamond lattice has the expected open area, including partial holes at seams', () => {
  const g = perforationGenerators[0], tile = g.generate(defaultParams(g), { rand: () => 0 })
  const holes = tileToCrossSection(m, tile, { periodic: true })
  const pitch = 6 + 1.6 * Math.SQRT2, expected = 36 / (pitch * pitch)
  assert.ok(Math.abs(holes.area() / (tile.width * tile.height) - expected) < 0.0001)
  holes.delete()
})
