// Cheap pre-kernel diagnostics for the exact retry inputs; does not run booleans.
import { readFileSync, writeFileSync } from 'node:fs'
import { generatorById, defaultParams } from '../../src/patterns/index.ts'
import { resolveDef } from '../../src/state/tileStore.ts'
import { seededRandom } from '../../src/geom/random.ts'
import { mirrorTile } from '../../src/patterns/mirror.ts'
import { strokePolyline } from '../../src/patterns/pipeline.ts'
const configs = JSON.parse(readFileSync(new URL('./timeout-cases.json', import.meta.url), 'utf8'))
const results = []
for (const [n, item] of configs.entries()) {
  const c = item.config, id = c.id ?? item.source, g = generatorById(id)
  const resolved = item.source === 'targeted' ? { params: { ...defaultParams(g), ...c.params }, mirror: false } : resolveDef({ name: g.name, generatorId: id, params: c.params, seamless: true, mirror: c.mirror, invert: c.invert })
  const start = performance.now()
  let tile = g.generate(resolved.params, { rand: seededRandom(Number(resolved.params.seed ?? 1)) })
  if (resolved.mirror) tile = mirrorTile(tile)
  const generatedMs = performance.now() - start
  let strokeLoops = 0, strokeVertices = 0
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const curve of tile.curves) {
    const loops = strokePolyline(curve.points, curve.closed, tile.ribWidth)
    strokeLoops += loops.length
    for (const loop of loops) {
      strokeVertices += loop.length
      for (const [x, y] of loop) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
    }
  }
  results.push({ n, source: item.source, index: item.index, id, generatedMs, strokeMs: performance.now() - start - generatedMs, width: tile.width, height: tile.height, mirror: resolved.mirror, curves: tile.curves.length, curvePoints: tile.curves.reduce((s, c) => s + c.points.length, 0), polygons: tile.polygons.length, polygonVertices: tile.polygons.reduce((s, p) => s + p.length, 0), strokeLoops, strokeVertices, strokeBounds: strokeLoops ? [minX, minY, maxX, maxY] : null })
}
writeFileSync(new URL('./retry-complexity.json', import.meta.url), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results.map(({ n, id, generatedMs, strokeMs, strokeLoops, strokeVertices, polygonVertices }) => ({ n, id, generatedMs: Math.round(generatedMs), strokeMs: Math.round(strokeMs), strokeLoops, strokeVertices, polygonVertices })), null, 2))
