// A pattern applied across a fold must produce the requested physical relief,
// recess or through-cut right up to the edge, whatever the tile scale or the
// bend, and the requested margin must stay in millimetres. These tests measure
// the finished solid against the analytic offset envelope: two offset planes
// meeting at a mitre. The uniformly filled diagnostic tile makes every point
// patterned, so a shortfall is a tool defect, not a pattern feature.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { box, plate, filled, hit, select, type Mode, type V3 } from './physical-fixtures.ts'
import { triMeshFromManifold } from '../src/geom/manifold.ts'

const TOL = 0.02
const close = (p: V3 | null, q: V3, what: string) => {
  assert.ok(p, `${what}: no surface found`)
  assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= TOL, `${what}: expected ${q.map(v => v.toFixed(3))}, got ${p.map(v => v.toFixed(3))}`)
}

test('the box corner keeps its full physical relief, recess and cut at every tile scale, rotation and depth', () => {
  const f = box()
  try {
    for (const mode of ['emboss', 'recess', 'cut'] as Mode[]) for (const scale of [0.6, 1, 1.7]) for (const rotationDeg of [0, 37, 90]) for (const depth of [0.4, 0.8, 1.2]) {
      if (mode === 'cut' && depth !== 0.8) continue // a cut has no depth setting
      const { solid, laid } = filled(f, { mode, scale, rotationDeg, depth })
      try {
        assert.equal(solid.status(), 'NoError')
        for (const l of laid) assert.ok(l.layout.foldPolygons.length > 0, 'the pattern continues past the fold')
        const what = `${mode} scale ${scale} rot ${rotationDeg} depth ${depth}`
        // along the corner's diagonal, from outside in, at mid height
        const p = hit(solid, [55, -5, 25], [45, 5, 25])
        if (mode === 'emboss') close(p, [50 + depth, -depth, 25], `${what}: raised corner`)
        else if (mode === 'recess') close(p, [50 - depth, depth, 25], `${what}: recessed corner`)
        else {
          // cut through both walls: no material anywhere on the diagonal through the corner
          assert.ok(!p || (p[0] < 48.4 - 1 && p[1] > 1.6 + 1), `${what}: material left at the corner: ${p?.map(v => v.toFixed(3))}`)
        }
        // and straight into each face, 5 mm from the corner (a cut goes through to the opposite inner wall)
        const front = hit(solid, [45, -5, 25], [45, 60, 25]), right = hit(solid, [55, 5, 25], [-10, 5, 25])
        const off = mode === 'emboss' ? -depth : mode === 'recess' ? depth : 48.4
        close(front, [45, off, 25], `${what}: front face level`)
        close(right, [mode === 'cut' ? 1.6 : 50 - off, 5, 25], `${what}: right face level`)
      } finally { solid.delete() }
    }
  } finally { f.body.delete() }
})

test('a convex ridge of any bend is raised to the mitre apex, and a valley is cut and recessed to its bisector', () => {
  const depth = 0.8, wall = 1.6
  // 20° is below the 30° segmentation threshold: one exact sheet, the tool follows the vertex normals
  for (const angle of [20, 45, 90, 135, 160]) for (const scale of [0.6, 1]) {
    const f = plate(angle, 8)
    const { solid, pieces, log } = filled(f, { mode: 'emboss', depth, scale })
    try {
      assert.equal(solid.status(), 'NoError', log.join('\n'))
      assert.equal(pieces.length, angle > 30 ? 2 : 1, log.join('\n'))
      const apex = hit(solid, [0, 10, 25], [0, -10, 25])
      const expected = depth / Math.cos((angle * Math.PI) / 360)
      assert.ok(apex, `${angle}° scale ${scale}: no ridge`)
      if (angle > 30) assert.ok(Math.abs(apex[1] - expected) <= TOL, `${angle}° scale ${scale}: apex at y=${apex[1].toFixed(4)}, expected ${expected.toFixed(4)}`)
      else assert.ok(apex[1] >= depth - TOL && apex[1] <= expected + TOL, `${angle}° scale ${scale}: apex at y=${apex[1].toFixed(4)}, expected ${depth.toFixed(3)} to ${expected.toFixed(4)}`)
    } finally { solid.delete(); f.body.delete() }
  }
  for (const angle of [-45, -90, -135]) for (const scale of [0.6, 1]) {
    const half = (Math.abs(angle) * Math.PI) / 360
    const f = plate(angle, wall)
    for (const mode of ['cut', 'recess', 'emboss'] as Mode[]) {
      const { solid, pieces, log } = filled(f, { mode, depth, scale, wallThickness: wall })
      try {
        assert.equal(solid.status(), 'NoError', log.join('\n'))
        assert.equal(pieces.length, 2, log.join('\n'))
        const what = `valley ${angle}° ${mode} scale ${scale}`
        // straight down the valley's bisector from above
        const p = hit(solid, [0, 10, 25], [0, -10, 25])
        if (mode === 'cut') {
          // both plates are cut through: nothing until well below their undersides
          const underside = -wall / Math.cos(half)
          assert.ok(!p || p[1] < underside - 0.5, `${what}: material left in the valley at y=${p?.[1].toFixed(3)}`)
        } else if (mode === 'recess') close(p, [0, -depth / Math.cos(half), 25], `${what}: recessed valley`)
        else close(p, [0, depth / Math.cos(half), 25], `${what}: raised valley`)
        // and the left plate's face level 5 mm up from the valley: its face runs from the origin
        // at angle 90° + half above +x, its outward normal is that direction turned 90° clockwise
        const c = Math.cos(half), s = Math.sin(half)
        const on = (d: number): V3 => [-5 * c + d * s, 5 * s + d * c, 25]
        const face = hit(solid, on(3), on(-3))
        const level = mode === 'emboss' ? depth : mode === 'recess' ? -depth : -wall - 2
        if (mode === 'cut') assert.ok(!face || Math.hypot(face[0] - on(0)[0], face[1] - on(0)[1]) > wall + 0.5, `${what}: plate not cut through`)
        else close(face, on(level), `${what}: face level`)
      } finally { solid.delete() }
    }
    f.body.delete()
  }
})

test('the requested margin stays in millimetres on the finished solid, at every scale, rotation and mode, including at the fold ends', () => {
  const f = box()
  try {
    const margin = 2.5, depth = 0.8
    for (const mode of ['emboss', 'recess', 'cut'] as Mode[]) for (const scale of [0.6, 1, 1.7]) for (const rotationDeg of [0, 37, 90]) {
      const { solid } = filled(f, { mode, scale, rotationDeg, depth, margin })
      try {
        const what = `${mode} scale ${scale} rot ${rotationDeg}`
        // y of the first hit into the front wall where patterned: a cut goes through to the back wall's inner
        // face, or, next to the fold where the ray runs inside the right wall, to that wall's own end margin
        const modified = (x: number) => mode === 'emboss' ? -depth : mode === 'recess' ? depth : x > 48.4 ? 47.5 : 48.4
        // front wall (y = 0, x from 0 to 50): the rim (z 47.5..50), the floor edge (z 0..2.5) and
        // the far edge (x 0..2.5, a fold to an unselected face) are real boundaries; the fold at x = 50 is not.
        // Next to the fold the right wall's own recess (x from 49.2) has removed the front wall, so
        // a recess is sampled at x 49.1, where only the front wall's recess acts
        const near = mode === 'recess' ? 49.1 : 49.9
        for (const [x, z, inside] of [[25, 49.9, false], [25, 47.6, false], [25, 47.4, true], [25, 0.1, false], [25, 2.4, false], [25, 2.6, true], [0.1, 25, false], [2.4, 25, false], [2.6, 25, true], [near, 25, true], [near, 47.4, true], [near, 47.6, false], [near, 2.4, false]] as [number, number, boolean][]) {
          const p = hit(solid, [x, -5, z], [x, 60, z])
          close(p, [x, inside ? modified(x) : 0, z], `${what}: front wall at x ${x} z ${z} (${inside ? 'patterned' : 'margin'})`)
        }
        // the ridge itself, inside the rim margin, must be the original corner
        for (const z of [49.9, 47.6, 2.4, 0.1]) close(hit(solid, [55, -5, z], [45, 5, z]), [50, 0, z], `${what}: ridge in the margin band at z ${z}`)
        for (const z of [47.4, 2.6]) {
          const p = hit(solid, [55, -5, z], [45, 5, z])
          if (mode === 'emboss') close(p, [50 + depth, -depth, z], `${what}: ridge just inside the band at z ${z}`)
          else if (mode === 'recess') close(p, [50 - depth, depth, z], `${what}: ridge just inside the band at z ${z}`)
          else assert.ok(!p || p[0] < 47, `${what}: ridge just inside the band at z ${z} not cut`)
        }
      } finally { solid.delete() }
    }
  } finally { f.body.delete() }
})

test('a fold too sharp to mitre within reach is reported, not silently clamped', () => {
  const f = plate(176, 8)
  try {
    assert.throws(() => filled(f, { mode: 'emboss', depth: 0.8 }), /Fold too sharp/)
  } finally { f.body.delete() }
})

test('a tile rotated with the model keeps the same physical corner (representation independence)', () => {
  // the same box turned 90° about z and moved: same relief at its corner
  const f = box()
  const turned = f.body.rotate([0, 0, 90]).translate([120, 30, -7])
  const mesh = triMeshFromManifold(turned)
  // the front wall (-y) becomes +x at x = 120; the right wall (+x) becomes +y at y = 80
  const g = { body: turned, mesh, origin: [120, 67, 16] as V3, region: select(mesh, [[1, 0, 0], [0, 1, 0]], (x, y) => x > 119.999 || y > 79.999) }
  try {
    for (const scale of [0.6, 1.7]) {
      const { solid } = filled(g, { mode: 'emboss', depth: 0.8, scale })
      try { close(hit(solid, [125, 85, 18], [115, 75, 18]), [120.8, 80.8, 18], `turned box scale ${scale}`) } finally { solid.delete() }
    }
  } finally { turned.delete(); f.body.delete() }
})
