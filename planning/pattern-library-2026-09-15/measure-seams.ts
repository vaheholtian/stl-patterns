// Does each library tile reproduce its design when repeated? Writes seams.json.
//
//   node --import ./tests/register.mjs planning/pattern-library-2026-09-15/measure-seams.ts
//
// Two different things can go wrong, and conflating them is what made earlier
// readings of this library wrong in both directions:
//
//   clipLoss  -- the artwork is drawn past its repeat box, and what lies out
//     there is NOT what the neighbouring copy puts back. Clipping to the box
//     then destroys part of the design. This is the real test of "does it
//     tile as drawn", and it is the one that matters for every tile.
//
//   edgeMismatch -- material meets the left edge where it does not meet the
//     right. For a stroked rib this means the rib stops dead at the seam. For
//     a filled design it usually means nothing at all: a checkerboard covers
//     one edge and not the other and still tiles perfectly, which is why an
//     edge-matching test rejects half this library for no reason.
import { readFileSync, writeFileSync } from 'node:fs'
import Module from 'manifold-3d'
import type { CrossSection } from 'manifold-3d'
import { buildLibraryTile, type LibraryPattern } from '../../src/patterns/library/tile.ts'
import { tileToCrossSection } from '../../src/patterns/pipeline.ts'
import type { Pt } from '../../src/patterns/types.ts'

const m = await Module(); m.setup()
const dir = new URL('./', import.meta.url)
const dataFile = new URL('../../src/patterns/library/data.json', import.meta.url)
const data: LibraryPattern[] = JSON.parse(readFileSync(dataFile, 'utf8'))

const REPEAT_MM = 50
const LINE_WIDTH = 0.42
const TOL = 0.01          // mm: numerical slack when comparing the two constructions

function spans(polys: Pt[][], axis: 0 | 1, edge: number): number[][] {
  const list: number[][] = []
  for (const poly of polys) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    if (Math.abs(a[axis] - edge) < 1e-6 && Math.abs(b[axis] - edge) < 1e-6) {
      const lo = Math.min(a[1 - axis], b[1 - axis]), hi = Math.max(a[1 - axis], b[1 - axis])
      if (hi - lo > 1e-5) list.push([lo, hi])
    }
  }
  list.sort((p, q) => p[0] - q[0])
  const merged: number[][] = []
  for (const s of list) {
    const last = merged[merged.length - 1]
    if (last && s[0] - last[1] < 1e-9) last[1] = Math.max(last[1], s[1]); else merged.push(s)
  }
  return merged
}

/** Length covered by one span set and not the other, in mm. */
function mismatch(a: number[][], b: number[][]): number {
  const cuts = [...new Set([...a, ...b].flat())].sort((x, y) => x - y)
  const inside = (s: number[][], t: number) => s.some(([lo, hi]) => t >= lo && t < hi)
  let total = 0
  for (let i = 0; i < cuts.length - 1; i++) {
    const mid = (cuts[i] + cuts[i + 1]) / 2
    if (inside(a, mid) !== inside(b, mid)) total += cuts[i + 1] - cuts[i]
  }
  return total
}

const rows = []
for (const p of data) {
  const tile = buildLibraryTile(p, { widthMm: REPEAT_MM, ribWidth: 1.2, layers: p.layers.length, spacingX: 0, spacingY: 0 })
  const owned: CrossSection[] = [], own = (cs: CrossSection) => { owned.push(cs); return cs }
  const w = tile.width, h = tile.height
  try {
    // the artwork as drawn, overhang and all
    const drawn = own(tileToCrossSection(m, tile, { minFeature: 0, periodic: false, clipToBox: false }))
    const box = own(m.CrossSection.square([w, h], false))
    const kept = own(m.CrossSection.intersection(drawn, box))
    // what repeating the clipped tile actually puts on the plane
    const copies: CrossSection[] = []
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) copies.push(own(kept.translate([i * w, j * h])))
    const repeated = own(m.CrossSection.union(copies))
    // the design that clipping threw away and repetition did not restore
    const margin = Math.min(w, h) / 2
    const near = own(own(m.CrossSection.square([w + 2 * margin, h + 2 * margin], false)).translate([-margin, -margin]))
    const lost = own(m.CrossSection.difference(own(m.CrossSection.intersection(drawn, near)), own(repeated.offset(TOL, 'Round', 2, 16))))
    const clipLoss = lost.area()
    // A hairline offset between two constructions of the same curve can span a
    // long rib and add up to several mm² while being invisible and unprintable.
    // Only what survives an opening of one extrusion width is real lost design.
    const solid = own(own(lost.offset(-LINE_WIDTH / 2, 'Round', 2, 16)).offset(LINE_WIDTH / 2, 'Round', 2, 16))
    const clipLossSolid = solid.area()

    const polys = kept.toPolygons() as Pt[][]
    const edgeX = mismatch(spans(polys, 0, 0), spans(polys, 0, w))
    const edgeY = mismatch(spans(polys, 1, 0), spans(polys, 1, h))
    rows.push({
      slug: p.slug, title: p.title, mode: p.mode, w: +w.toFixed(2), h: +h.toFixed(2),
      area: +kept.area().toFixed(2),
      clipLoss: +clipLoss.toFixed(4),
      clipLossSolid: +clipLossSolid.toFixed(4),
      clipLossPct: +(kept.area() ? (clipLossSolid / kept.area()) * 100 : 0).toFixed(3),
      edgeX: +edgeX.toFixed(3), edgeY: +edgeY.toFixed(3),
    })
    // the measurement belongs with the data it describes
    p.clipLoss = +clipLossSolid.toFixed(3)
    p.clipLossPct = +(kept.area() ? (clipLossSolid / kept.area()) * 100 : 0).toFixed(2)
    p.ribBreak = p.mode === 'fill' ? 0 : +Math.max(edgeX, edgeY).toFixed(3)
  } finally { owned.forEach(cs => cs.delete()) }
}
writeFileSync(new URL('seams.json', dir), JSON.stringify(rows, null, 1))
writeFileSync(dataFile, JSON.stringify(data))

// below one extrusion square, there is nothing a printer could have rendered
const FLOOR = LINE_WIDTH * LINE_WIDTH
const broken = rows.filter(r => r.clipLossSolid > FLOOR)
const hairline = rows.filter(r => r.clipLossSolid <= FLOOR && r.clipLoss > FLOOR)
const strokes = rows.filter(r => r.mode !== 'fill')
const ribBreak = strokes.filter(r => Math.max(r.edgeX, r.edgeY) > LINE_WIDTH)
console.log(`${rows.length} patterns at a ${REPEAT_MM} mm repeat\n`)
console.log(`clipping to the repeat box destroys printable design on ${broken.length}:`)
for (const r of [...broken].sort((a, b) => b.clipLossSolid - a.clipLossSolid)) console.log(`  ${r.slug.padEnd(26)} ${r.clipLossSolid.toFixed(2).padStart(9)} mm²  (${r.clipLossPct.toFixed(2)}% of the tile)`)
console.log(`
${hairline.length} more differ only by a hairline the printer cannot render (drawing imprecision, not a seam):`)
console.log('  ' + hairline.map(r => r.slug).join(', '))
console.log(`\nstroked tiles whose ribs stop at the seam (over ${LINE_WIDTH} mm): ${ribBreak.length} of ${strokes.length}`)
for (const r of [...ribBreak].sort((a, b) => Math.max(b.edgeX, b.edgeY) - Math.max(a.edgeX, a.edgeY))) console.log(`  ${r.slug.padEnd(26)} x ${r.edgeX.toFixed(2).padStart(7)}  y ${r.edgeY.toFixed(2).padStart(7)} mm`)
