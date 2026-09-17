import type { Pt, Tile } from '../../src/patterns/types.ts'
const PATHS = [
  'M-50.129 12.685C-33.346 12.358-16.786 4.918 0 5c16.787.082 43.213 10 60 10s43.213-9.918 60-10c16.786-.082 33.346 7.358 50.129 7.685',
  'M-50.129 32.685C-33.346 32.358-16.786 24.918 0 25c16.787.082 43.213 10 60 10s43.213-9.918 60-10c16.786-.082 33.346 7.358 50.129 7.685',
  'M-50.129 52.685C-33.346 52.358-16.786 44.918 0 45c16.787.082 43.213 10 60 10s43.213-9.918 60-10c16.786-.082 33.346 7.358 50.129 7.685',
  'M-50.129 72.685C-33.346 72.358-16.786 64.918 0 65c16.787.082 43.213 10 60 10s43.213-9.918 60-10c16.786-.082 33.346 7.358 50.129 7.685',
]
const SRC_W = 120, SRC_H = 80, TILE_W = 50, RIB = 1.2
export function flatten(d: string, tol = 0.05): Pt[] {
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
    if (cmd === 'M' || cmd === 'm' || cmd === 'L' || cmd === 'l') { cur = abs(v[0], v[1]); out.push(cur); prevC2 = null; continue }
    for (let i = 0; i < v.length;) {
      let c1: Pt, c2: Pt, p: Pt
      if (cmd === 'C' || cmd === 'c') { c1 = abs(v[i], v[i + 1]); c2 = abs(v[i + 2], v[i + 3]); p = abs(v[i + 4], v[i + 5]); i += 6 }
      else { c1 = prevC2 ? [2 * cur[0] - prevC2[0], 2 * cur[1] - prevC2[1]] : cur; c2 = abs(v[i], v[i + 1]); p = abs(v[i + 2], v[i + 3]); i += 4 }
      cubic(cur, c1, c2, p); cur = p; prevC2 = c2
    }
  }
  return out
}
export function buildTile(): Tile {
  const k = TILE_W / SRC_W
  return { width: TILE_W, height: SRC_H * k, ribWidth: RIB, polygons: [],
    curves: PATHS.map(d => ({ points: flatten(d).map(([x, y]) => [x * k, (SRC_H - y) * k] as Pt), closed: false })) }
}
