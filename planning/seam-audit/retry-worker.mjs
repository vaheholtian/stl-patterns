// One original timed-out configuration, in a disposable process/WASM instance.
import { readFileSync, writeFileSync } from 'node:fs'
import Module from 'manifold-3d'
import { generatorById, defaultParams } from '../../src/patterns/index.ts'
import { resolveDef } from '../../src/state/tileStore.ts'
import { seededRandom } from '../../src/geom/random.ts'
import { mirrorTile } from '../../src/patterns/mirror.ts'
import { tileToCrossSection } from '../../src/patterns/pipeline.ts'
import { intervals, mismatch, svg } from './audit.mjs'

const n = Number(process.argv[2])
const item = JSON.parse(readFileSync(new URL('./timeout-cases.json', import.meta.url), 'utf8'))[n]
const started = performance.now()
const emit = (event, data = {}) => console.log(JSON.stringify({ event, ms: performance.now() - started, ...data }))
let cs
try {
  emit('initializing')
  const m = await Module(); m.setup()
  const c = item.config, id = c.id ?? item.source, g = generatorById(id)
  // Preserve the two original harnesses' semantics (targeted tests use native tiles).
  const resolved = item.source === 'targeted'
    ? { params: { ...defaultParams(g), ...c.params }, mirror: false }
    : resolveDef({ name: g.name, generatorId: id, params: c.params, seamless: true, mirror: c.mirror, invert: c.invert })
  emit('generating', { id, params: resolved.params })
  let tile = g.generate(resolved.params, { rand: seededRandom(Number(resolved.params.seed ?? 1)) })
  emit('generated', { width: tile.width, height: tile.height, polygons: tile.polygons.length, curves: tile.curves.length, points: [...tile.polygons, ...tile.curves.map(c => c.points)].reduce((n, p) => n + p.length, 0) })
  if (resolved.mirror) { emit('mirroring'); tile = mirrorTile(tile) }
  const finite = [...tile.polygons, ...tile.curves.map(c => c.points)].every(p => p.every(q => q.every(Number.isFinite)))
  if (!finite || !Number.isFinite(tile.width) || !Number.isFinite(tile.height) || tile.width <= 0 || tile.height <= 0) throw Error('Invalid geometry')
  const bridge = !!c.bridge && !(g.connectedRibs && c.invert)
  emit('pipeline', { mirror: resolved.mirror, bridge, points: [...tile.polygons, ...tile.curves.map(c => c.points)].reduce((n, p) => n + p.length, 0) })
  cs = tileToCrossSection(m, tile, { periodic: true, invert: !!c.invert, minFeature: c.minFeature, connectMaterial: bridge })
  emit('extracting')
  const polys = cs.toPolygons()
  const edges = [0, 1].map(axis => mismatch(intervals(polys, axis, 0), intervals(polys, axis, axis ? tile.height : tile.width)))
  const area = cs.area(), fillFraction = area / (tile.width * tile.height)
  const result = { id, actual: { width: tile.width, height: tile.height, mirror: resolved.mirror, bridge }, area, fillFraction, empty: cs.isEmpty(), edges, fail: edges.some(e => e.max > 0.02), polygons: polys.length, vertices: polys.reduce((s, p) => s + p.length, 0), peakRssBytes: process.resourceUsage().maxRSS * 1024 }
  writeFileSync(new URL(`retry-${n}.svg`, new URL(process.env.SEAM_AUDIT_OUTPUT ?? './', import.meta.url)), svg(tile, polys, `${g.name}: retry ${n}, ${item.source}/${item.index}`))
  emit('result', result)
} catch (e) {
  emit('error', { error: String(e), stack: e?.stack, peakRssBytes: process.resourceUsage().maxRSS * 1024 })
  process.exitCode = 1
} finally { cs?.delete() }
