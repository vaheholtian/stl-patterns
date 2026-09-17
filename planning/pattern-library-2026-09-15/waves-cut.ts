// Apply pattern.monster "Waves - 1" to fixtures/box-50.stl as a through-cut, twice:
// once with the waves running around the box (rotation 0) and once running up it (rotation 90).
// Tile comes in as an imported SVG (generatorId 'svg'), the way the app takes user artwork.
//   node --import ./tests/register.mjs planning/pattern-library-2026-09-15/waves-cut.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { m, selectByNormals, layoutOnBody, applyLaid, DEFAULTS, type Body } from '../box50-review-2026-09-09/helpers.ts'
import { manifoldFromTriMesh, triMeshFromManifold } from '../../src/geom/manifold.ts'
import { parseStl, writeBinaryStl } from '../../src/io/stl.ts'
import type { Pt, Tile } from '../../src/patterns/types.ts'

// ---------------------------------------------------------------- the tile
// Waves - 1 from pattern.monster: four wavy strokes in a 120 x 80 box, y down.
const PATHS = [
  'M-50.129 12.685C-33.346 12.358-16.786 4.918 0 5c16.787.082 43.213 10 60 10s43.213-9.918 60-10c16.786-.082 33.346 7.358 50.129 7.685',
  'M-50.129 32.685C-33.346 32.358-16.786 24.918 0 25c16.787.082 43.213 10 60 10s43.213-9.918 60-10c16.786-.082 33.346 7.358 50.129 7.685',
  'M-50.129 52.685C-33.346 52.358-16.786 44.918 0 45c16.787.082 43.213 10 60 10s43.213-9.918 60-10c16.786-.082 33.346 7.358 50.129 7.685',
  'M-50.129 72.685C-33.346 72.358-16.786 64.918 0 65c16.787.082 43.213 10 60 10s43.213-9.918 60-10c16.786-.082 33.346 7.358 50.129 7.685',
]
const SRC_W = 120, SRC_H = 80
const TILE_W = 50            // mm: the box is 50 mm wide, so the tile repeats exactly 4x around
const RIB = 1.2              // mm rib, comfortably over the 0.84 mm minimum feature

/** Flatten an SVG path (M/C/c/S/s only, which is all Waves - 1 uses) to a polyline. */
function flatten(d: string, tol = 0.05): Pt[] {
  const nums = (s: string) => (s.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number)
  const tokens = d.match(/[MCcSsLl][^MCcSsLl]*/g) ?? []
  const out: Pt[] = []
  let cur: Pt = [0, 0], prevC2: Pt | null = null
  const cubic = (p0: Pt, c1: Pt, c2: Pt, p3: Pt) => {
    const n = Math.max(8, Math.ceil(Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) / tol / 8))
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t
      out.push([u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0],
                u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1]])
    }
  }
  for (const tk of tokens) {
    const cmd = tk[0], v = nums(tk.slice(1))
    const rel = cmd === cmd.toLowerCase()
    const abs = (x: number, y: number): Pt => rel ? [cur[0] + x, cur[1] + y] : [x, y]
    if (cmd === 'M' || cmd === 'm') { cur = abs(v[0], v[1]); out.push(cur); prevC2 = null; continue }
    if (cmd === 'L' || cmd === 'l') { cur = abs(v[0], v[1]); out.push(cur); prevC2 = null; continue }
    for (let i = 0; i < v.length;) {
      let c1: Pt, c2: Pt, p: Pt
      if (cmd === 'C' || cmd === 'c') { c1 = abs(v[i], v[i + 1]); c2 = abs(v[i + 2], v[i + 3]); p = abs(v[i + 4], v[i + 5]); i += 6 }
      else { // S/s: first control point mirrors the previous one
        c1 = prevC2 ? [2 * cur[0] - prevC2[0], 2 * cur[1] - prevC2[1]] : cur
        c2 = abs(v[i], v[i + 1]); p = abs(v[i + 2], v[i + 3]); i += 4
      }
      cubic(cur, c1, c2, p)
      cur = p; prevC2 = c2
    }
  }
  return out
}

const k = TILE_W / SRC_W
const tile: Tile = {
  width: TILE_W,
  height: SRC_H * k,
  ribWidth: RIB,
  polygons: [],
  // SVG is y-down, tiles are y-up
  curves: PATHS.map((d) => ({ points: flatten(d).map(([x, y]) => [x * k, (SRC_H - y) * k] as Pt), closed: false })),
}

// ---------------------------------------------------------------- the body
const bytes = readFileSync(new URL('../../fixtures/box-50.stl', import.meta.url))
const body = manifoldFromTriMesh(m, parseStl(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)))
const mesh = triMeshFromManifold(body)
const faceNormals: [number, number, number][] = [[0, -1, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0]]
const ring: Body = {
  name: 'box50-ring', body, mesh, faceNormals,
  origin: [37, 0, 23],
  region: selectByNormals(mesh, faceNormals, (x, y) => x < .001 || y < .001 || x > 49.999 || y > 49.999),
}
console.log('box volume', body.volume().toFixed(1), 'mm3   region triangles', ring.region.length)

const settings = { ...DEFAULTS, mode: 'cut' as const, wallThickness: 1.6, depth: 1.6, margin: 3, scale: 1, detail: 2 }
const def = { svgTile: tile, invert: false, seamless: false, mirror: false, connectMaterial: false }

mkdirSync(new URL('./out/', import.meta.url), { recursive: true })
for (const rotationDeg of [0, 90]) {
  const s = { ...settings, rotationDeg }
  const { laid, log } = layoutOnBody(ring, 'svg', {}, s, ring.origin, 30, def)
  const solid = applyLaid(ring, laid, s)
  const parts = solid.simplify(.005).decompose()
  const vols = parts.map((p) => p.volume()).sort((a, b) => b - a)
  const file = new URL(`./out/box50-waves1-cut-rot${rotationDeg}.stl`, import.meta.url)
  writeFileSync(file, new Uint8Array(writeBinaryStl(triMeshFromManifold(solid))))
  console.log(`\nrotation ${rotationDeg}°  pieces laid ${laid.length}  status ${solid.status()}`)
  console.log('  flatten:', log.join(' | ') || '(none)')
  console.log('  notes:', [...new Set(laid.flatMap((l) => l.layout.log))].join(' | ') || '(none)')
  console.log(`  separate solids after the cut: ${parts.length}  volumes ${vols.map((v) => v.toFixed(1)).join(', ')}`)
  console.log('  wrote', file.pathname)
}
