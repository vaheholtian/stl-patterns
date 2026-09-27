// The Pattern screen shows a parameter only while it can change the tile. Held
// to measurement: for every generator and every setting of its switches, each
// shown parameter must change the tile when nudged, and each hidden one must not.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generators, defaultParams, shownParams, generatorById } from '../src/patterns/index.ts'
import { libraryPatterns } from '../src/patterns/library/index.ts'
import type { Generator, GeneratorParam, ParamValue, Tile } from '../src/patterns/types.ts'
import { seededRandom } from '../src/geom/random.ts'

const r = (x: number) => Math.round(x * 1e3)
/** what reaches the cut: the box, the filled shapes, and the strokes with their width if there are any */
function signature(t: Tile): string {
  const parts: unknown[] = [r(t.width), r(t.height), t.polygons.map((p) => p.map(([x, y]) => [r(x), r(y)]))]
  if (t.curves.length) parts.push(r(t.ribWidth), t.curves.map((c) => [c.closed, c.points.map(([x, y]) => [r(x), r(y)])]))
  if (t.thicken) parts.push(r(t.thicken))
  return JSON.stringify(parts)
}
const run = (g: Generator, p: Record<string, ParamValue>) => signature(g.generate(p, { rand: seededRandom(Number(p.seed ?? 1)) }))

/** other values to try: every other option, or both ends of the range and two points between */
function nudges(p: GeneratorParam, current: ParamValue): ParamValue[] {
  if (p.type === 'boolean') return [!current]
  if (p.type === 'select') return (p.options ?? []).map((o) => o.value).filter((v) => v !== current)
  const d = Number(current), lo = p.min ?? d / 2, hi = p.max ?? d * 2
  const out = new Set<number>()
  for (let v of [lo, hi, d + (hi - d) * 0.3, d - (d - lo) * 0.3]) {
    if (p.type === 'int') v = Math.round(v)
    if (v !== d) out.add(v)
  }
  return [...out]
}

/** every combination of a generator's switches, over its defaults */
function switchSettings(g: Generator): Record<string, ParamValue>[] {
  let out: Record<string, ParamValue>[] = [defaultParams(g)]
  for (const p of g.params.filter((q) => q.type === 'select' || q.type === 'boolean')) {
    out = out.flatMap((c) => [c[p.key], ...nudges(p, c[p.key])].map((v) => ({ ...c, [p.key]: v })))
  }
  return out
}

// shown, but these settings happen not to reach it: the mandelbrot's inside at the
// default view has no contour small enough for the min feature filter to drop
const QUIET_AT_DEFAULTS = new Set(['julia:minFeature:{"kind":"mandelbrot","mode":"inside"}'])

test('a native generator shows exactly the parameters that change its tile', () => {
  const wrong: string[] = []
  for (const g of generators) {
    if (g.id === 'library') continue
    for (const params of switchSettings(g)) {
      const base = run(g, params)
      const shown = new Set(shownParams(g, params).map((p) => p.key))
      const switches = JSON.stringify(Object.fromEntries(g.params.filter((q) => q.type === 'select' || q.type === 'boolean').map((q) => [q.key, params[q.key]])))
      for (const p of g.params) {
        const moves = nudges(p, params[p.key]).some((v) => run(g, { ...params, [p.key]: v }) !== base)
        if (moves === shown.has(p.key) || QUIET_AT_DEFAULTS.has(`${g.id}:${p.key}:${switches}`)) continue
        wrong.push(`${g.id} ${switches}: ${p.key} is ${shown.has(p.key) ? 'shown but does nothing' : 'hidden but changes the tile'}`)
      }
    }
  }
  assert.deepEqual(wrong, [])
})

test('a library design shows rib width only when drawn as strokes, thicken only when drawn as shapes, and layers only when it has several', () => {
  const g = generatorById('library')!
  const wrong: string[] = []
  for (const design of libraryPatterns) {
    const params = { ...defaultParams(g), pattern: design.slug }
    const base = run(g, params)
    const shown = new Set(shownParams(g, params).map((p) => p.key))
    for (const key of ['ribWidth', 'thicken', 'layers']) {
      const p = g.params.find((q) => q.key === key)!
      const moves = nudges(p, params[key]).some((v) => run(g, { ...params, [key]: v }) !== base)
      if (moves !== shown.has(key)) wrong.push(`${design.slug}: ${key} is ${shown.has(key) ? 'shown but does nothing' : 'hidden but changes the tile'}`)
    }
    const layers = shownParams(g, params).find((p) => p.key === 'layers')
    if (layers) assert.equal(layers.max, design.layers.length, `${design.slug}: the layer control stops at the design's own count`)
  }
  assert.deepEqual(wrong, [])
})

test('rib width stays while connecting bridges are added, since it sets their width', () => {
  const g = generatorById('library')!
  const fill = libraryPatterns.find((p) => p.mode === 'fill')!
  const params = { ...defaultParams(g), pattern: fill.slug }
  assert.ok(!shownParams(g, params).some((p) => p.key === 'ribWidth'))
  assert.ok(shownParams(g, params, true).some((p) => p.key === 'ribWidth'))
})
