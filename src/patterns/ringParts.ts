/**
 * How many printable pieces a through-cut leaves on a closed ring of wall, worked
 * out from the tile alone.
 *
 * The first measurement cut one fixture, the 50 mm box, at one repeat size. Its
 * walls have about 44 mm between the edge margins, so a design whose repeat is
 * taller than that never had a whole copy on the wall: every copy was clipped by a
 * margin, and the solid margin held in whatever the copy would otherwise have cut
 * loose. Greek Key read as "whole" that way, and falls into 25 pieces at a 15 mm
 * repeat on the very same box. The answer was a property of that box, not of the
 * design.
 *
 * Here the wall is a cylinder several repeats around and several tall: the tile
 * wraps around the ring (x, as the app lays it with no rotation) and a solid
 * margin runs along the top and bottom. Every kind of failure shows up on it: an
 * island a copy encloses, a band a cut runs all the way round, a web that only
 * hangs together through ribs no nozzle can lay down. Nothing here depends on the
 * size of a box, so the answer holds for any wall big enough to repeat on.
 */
import type { ManifoldToplevel } from '../geom/manifold'
import type { Pt } from './types'

export interface RingOptions {
  /** raster resolution, pixels per millimetre of a 50 mm-wide repeat */
  pxPerMm?: number
  /** copies around the ring and up it */
  repeats?: number
  /** the solid edge margin above and below the pattern, mm */
  margin?: number
  /** connections narrower than this cannot be printed and do not hold anything, mm */
  lineWidth?: number
  /** pieces smaller than this are crumbs, not parts, mm^2 */
  minArea?: number
}

/**
 * Pieces of material left on the ring when `polygons` (tile coordinates, the part
 * the cut removes) are cut through it. 1 means the wall stays whole; 0 means the
 * tile cuts nothing, so the question does not arise.
 *
 * A neck too narrow to print is not a connection: a wall hanging on one comes off
 * the plate in pieces. Every cut shape is grown by one nozzle line on each side
 * first, exactly as thinConnectionParts() does in 3D, so a neck under two lines
 * wide closes up and stops counting. Checked against a cut of a 200 mm four-wall
 * tube, which is where the threshold showed: triangles-1 comes off that tube in
 * 194 pieces, held together by 0.36 mm necks that a raster erosion, and a growth of
 * only half a line, both read as whole.
 */
export function ringParts(m: ManifoldToplevel, polygons: Pt[][], tileW: number, tileH: number, opts: RingOptions = {}): number {
  if (!polygons.length) return 0
  const { pxPerMm = 10, repeats = 4, margin = 3, lineWidth = 0.42, minArea = 2 } = opts
  // grown in the tile's own repeat, so a shape at the edge grows into its neighbour
  const owned: { delete(): void }[] = []
  const own = <T extends { delete(): void }>(c: T) => (owned.push(c), c)
  let grown: Pt[][]
  try {
    const copies = []
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      copies.push(own(own(new m.CrossSection(polygons, 'EvenOdd')).translate([dx * tileW, dy * tileH])))
    const fat = own(own(m.CrossSection.union(copies)).offset(lineWidth, 'Round', 2, 16))
    grown = own(fat.intersect(own(new m.CrossSection([[[0, 0], [tileW, 0], [tileW, tileH], [0, tileH]]], 'EvenOdd')))).toPolygons() as Pt[][]
  } finally {
    for (const c of owned) c.delete()
  }
  if (!grown.length) return 0
  polygons = grown
  // measure at a 50 mm repeat whatever size the tile came in at
  const k = 50 / tileW, px = pxPerMm * k
  const Tw = Math.max(8, Math.round(tileW * px)), Th = Math.max(8, Math.round(tileH * px))
  const sx = Tw / tileW, sy = Th / tileH

  // one repeat, 1 = cut; crossings of the copies either side too, so a shape
  // drawn over the tile's edge lands where it wraps to
  const tile = new Uint8Array(Tw * Th)
  const xs: number[] = []
  for (let y = 0; y < Th; y++) {
    const Y = (y + .5) / sy
    xs.length = 0
    for (const dy of [-tileH, 0, tileH]) for (const poly of polygons) for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]
      const a = y1 + dy, b = y2 + dy
      if ((a > Y) !== (b > Y)) xs.push(x1 + (Y - a) / (b - a) * (x2 - x1))
    }
    xs.sort((a, b) => a - b)
    for (let j = 0; j + 1 < xs.length; j += 2) {
      const x0 = Math.ceil(xs[j] * sx - .5), x1 = Math.ceil(xs[j + 1] * sx - .5)
      for (let x = x0; x < x1; x++) tile[y * Tw + ((x % Tw) + Tw) % Tw] ^= 1
    }
  }

  // the ring: W wraps, rows [0, M) and [H - M, H) are the margins
  const M = Math.round(margin * pxPerMm), W = Tw * repeats, H = Th * repeats + 2 * M
  const solid = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    solid[y * W + x] = y < M || y >= H - M ? 1 : tile[((y - M) % Th) * Tw + (x % Tw)] ^ 1

  const kept = solid
  const minPx = minArea * pxPerMm * pxPerMm
  const seen = new Uint8Array(W * H), stack: number[] = []
  let parts = 0, all = 0
  for (let s = 0; s < W * H; s++) {
    if (!kept[s] || seen[s]) continue
    seen[s] = 1; stack.push(s)
    let size = 0
    while (stack.length) {
      const q = stack.pop()!, x = q % W, y = (q - x) / W
      size++
      const next = [y * W + (x + 1) % W, y * W + (x + W - 1) % W, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1]
      for (const n of next) if (n >= 0 && kept[n] && !seen[n]) { seen[n] = 1; stack.push(n) }
    }
    all++
    if (size >= minPx) parts++
  }
  // a design that leaves nothing but crumbs has not survived: say how many, rather
  // than 0, which means the tile cut nothing at all
  return parts || all
}
