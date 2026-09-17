import { readFileSync } from 'node:fs'
import { m, selectByNormals } from '../box50-review-2026-09-09/helpers.ts'
import { manifoldFromTriMesh, triMeshFromManifold } from '../../src/geom/manifold.ts'
import { parseStl } from '../../src/io/stl.ts'
import { flattenPieces } from '../../src/geom/regionFlatten.ts'
import { layoutTile } from '../../src/geom/layout.ts'
import { toolOffsetRange } from '../../src/geom/tileTool.ts'
import { generateTile } from '../../src/patterns/generate.ts'
const bytes = readFileSync(new URL('../../fixtures/box-50.stl', import.meta.url))
const body = manifoldFromTriMesh(m, parseStl(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)))
const mesh = triMeshFromManifold(body)
const fn: [number, number, number][] = [[0, -1, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0]]
const region = selectByNormals(mesh, fn, (x, y) => x < .001 || y < .001 || x > 49.999 || y > 49.999)
const { pieces } = flattenPieces(mesh, region, [37, 0, 23], 30, true)
console.log('generateTile with an unknown generator id:')
const g = generateTile(m, { def: { name: 'x', generatorId: 'waves-1', params: {}, invert: false }, lineWidth: .42 })
console.log('  tile', g.tile, 'polygons', g.polygons.length, 'warnings', g.warnings)
console.log('calling layoutTile with tileWidth/Height = 0 ...')
const base = { rotationDeg: 0, scale: 1, margin: 3, fitSeam: true, minScale: .5, single: false, normalRange: toolOffsetRange('cut', 1.6, 1.6), origin: pieces[0].origin }
const r = layoutTile(m, pieces[0], [], 0, 0, base)
console.log('  returned', r.polygons.length, 'polygons')
