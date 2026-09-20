/**
 * For every stroked design: how much of each neighbour copy that
 * `buildLibraryTile` draws lands where the subpath itself already draws?
 *
 * A copy that only retraces the original is not harmless. Where the overflow is a
 * lead-in rather than a true continuation the two do not coincide -- waves-1
 * drifts 0.6 mm over the overlap, a fifth of its rib -- and the union steps wider
 * and back, which is the nub visible on the print.
 *
 *   node --import ./tests/register.mjs planning/cut-renders-2026-09-19/neighbour-audit.ts
 */
import { flattenPath } from '../../src/patterns/svg/pathFlatten.ts'
import { libraryPatterns } from '../../src/patterns/library/index.ts'

const WIDTH = 50, RIB = 1.2

/** fraction of the shifted copy's samples inside the box that the original does not already cover */
function newFraction(points: [number, number][], shift: [number, number], width: number, height: number, cell: number) {
  const nx = Math.max(1, Math.ceil(width / cell)), ny = Math.max(1, Math.ceil(height / cell))
  const seen = new Uint8Array(nx * ny)
  const walk = (dx: number, dy: number, mark: boolean) => {
    let inside = 0, fresh = 0
    for (let i = 0; i + 1 < points.length; i++) {
      const ax = points[i][0] + dx, ay = points[i][1] + dy
      const bx = points[i + 1][0] + dx, by = points[i + 1][1] + dy
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (cell / 2)))
      for (let s = 0; s <= steps; s++) {
        const x = ax + ((bx - ax) * s) / steps, y = ay + ((by - ay) * s) / steps
        const ix = Math.floor(x / cell), iy = Math.floor(y / cell)
        if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) continue
        inside++
        if (mark) {
          // dilate by a cell: a copy within a rib of the original is a retrace
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
            const jx = ix + a, jy = iy + b
            if (jx >= 0 && jy >= 0 && jx < nx && jy < ny) seen[jy * nx + jx] = 1
          }
        } else if (!seen[iy * nx + ix]) fresh++
      }
    }
    return { inside, fresh }
  }
  walk(0, 0, true)
  const c = walk(shift[0], shift[1], false)
  return c.inside ? c.fresh / c.inside : 0
}

const rows: { slug: string; copies: number; worst: number; best: number }[] = []
for (const p of libraryPatterns) {
  if (p.mode === 'fill') continue
  const k = WIDTH / p.w, height = p.h * k
  const at = ([x, y]: [number, number]): [number, number] => [x * k, (p.h - y) * k]
  const cell = Math.max(RIB, Math.min(WIDTH, height) / 64)
  let worst = 1, best = 0, copies = 0
  for (const d of p.layers) {
    for (const sub of flattenPath(d, 0.005 / k)) {
      const points = sub.points.map(at)
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const [x, y] of points) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
      const r = RIB / 2
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        if (!i && !j) continue
        const dx = i * WIDTH, dy = j * height
        if (maxX + dx + r < 0 || minX + dx - r > WIDTH || maxY + dy + r < 0 || minY + dy - r > height) continue
        copies++
        const f = newFraction(points, [dx, dy], WIDTH, height, cell)
        if (f < worst) worst = f
        if (f > best) best = f
      }
    }
  }
  if (copies) rows.push({ slug: p.slug, copies, worst, best })
}

rows.sort((a, b) => a.worst - b.worst)
console.log(`${rows.length} stroked designs draw neighbour copies\n`)
console.log('the most redundant copies (a copy that only retraces the original):')
for (const r of rows.slice(0, 18)) console.log(`  ${r.slug.padEnd(22)} ${r.copies} copies, least new ${(r.worst * 100).toFixed(1)}%, most new ${(r.best * 100).toFixed(1)}%`)
console.log('\nthe copies that bring the most:')
for (const r of rows.slice(-8)) console.log(`  ${r.slug.padEnd(22)} ${r.copies} copies, least new ${(r.worst * 100).toFixed(1)}%, most new ${(r.best * 100).toFixed(1)}%`)
const buckets = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5]
console.log('\ndesigns whose least-new copy falls under a threshold:')
for (const t of buckets) console.log(`  under ${(t * 100).toFixed(0)}%: ${rows.filter(r => r.worst < t).length}`)
