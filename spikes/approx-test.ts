// Self-test for the periodic Penrose approximant generator. Run with:
//   ./node_modules/.bin/tsc --ignoreConfig --ignoreDeprecations 6.0 --module commonjs --target es2022 \
//     --moduleResolution node --esModuleInterop --skipLibCheck --rootDir . --outDir <tmp> spikes/approx-test.ts
//   node <tmp>/spikes/approx-test.js
// Checks, for a few sizes: the generator's own area self-check, exact
// periodicity of the vertex set across both box edges, and (rasterized)
// 100% coverage with no overlaps for the filled style.
import { penroseApproximantGenerator as g } from '../src/patterns/penroseApproximant'

function rand(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

type P = [number, number]
const inside = (p: P[], x: number, y: number) => {
  let c = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c
  }
  return c
}

let failures = 0
for (const [width, height, edge, minOrder] of [[40, 40, 4, 1], [40, 40, 4, 2], [60, 30, 3, 2], [100, 60, 2, 3], [305, 50, 3, 2]] as number[][]) {
  const t0 = Date.now()
  const tile = g.generate({ width, height, edge, minOrder, style: 'edges', seed: 3 }, { rand: rand(3) })
  const dt = Date.now() - t0
  const notes = tile.notes ?? []
  console.log(`--- ${width}x${height} edge ${edge} minOrder ${minOrder}: ${dt} ms, ${tile.curves.length} edges, box ${tile.width.toFixed(2)} x ${tile.height.toFixed(2)}`)
  for (const n of notes) console.log('   ', n)
  if (notes.some((n) => n.includes('self-check failed'))) failures++

  // periodicity: vertices within 1.5 mm of the left/bottom edges reappear one period away
  const W = tile.width, H = tile.height
  const key = (x: number, y: number) => `${Math.round(x * 100)},${Math.round(y * 100)}`
  const set = new Set<string>()
  const pts: P[] = []
  for (const c of tile.curves) for (const p of c.points) { const k = key(p[0], p[1]); if (!set.has(k)) { set.add(k); pts.push([p[0], p[1]]) } }
  let miss = 0, checked = 0
  for (const [x, y] of pts) {
    if (x >= -0.5 && x < 1.5 && y >= 0 && y < H) { checked++; if (!set.has(key(x + W, y))) miss++ }
    if (y >= -0.5 && y < 1.5 && x >= 0 && x < W) { checked++; if (!set.has(key(x, y + H))) miss++ }
  }
  console.log(`    periodicity: ${checked - miss}/${checked} edge vertices have a partner one period away`)
  if (miss) failures++

  // coverage: rasterize the filled tile
  if (width <= 100) {
    const filled = g.generate({ width, height, edge, minOrder, style: 'all', gap: 0, seed: 3 }, { rand: rand(3) })
    const polys = filled.polygons.map((p) => ({ p: p as P[], minX: Math.min(...p.map((q) => q[0])), maxX: Math.max(...p.map((q) => q[0])), minY: Math.min(...p.map((q) => q[1])), maxY: Math.max(...p.map((q) => q[1])) }))
    const step = 0.1
    let covered = 0, multi = 0, total = 0
    for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) {
      total++
      let n = 0
      for (const q of polys) { if (x < q.minX || x > q.maxX || y < q.minY || y > q.maxY) continue; if (inside(q.p, x, y)) n++ }
      if (n >= 1) covered++
      if (n >= 2) multi++
    }
    console.log(`    raster: coverage ${(100 * covered / total).toFixed(2)}%, overlaps ${(100 * multi / total).toFixed(2)}% (${filled.polygons.length} rhombi)`)
    if (covered < total || multi > 0) failures++
  }
}
console.log(failures ? `FAILED (${failures})` : 'all checks passed')
if (failures) throw new Error("penrose approximant checks failed")
