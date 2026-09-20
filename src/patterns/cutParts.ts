/**
 * How many printable pieces a closed ring of wall falls into when each generator
 * is cut right through it, at default parameters, in each orientation:
 * [plain, inverted]. Worked out by ringParts() on a ring four repeats around and
 * four tall, by planning/pattern-library-2026-09-15/ring-sweep.ts.
 *
 * It exists because `cutoutDefault` is a claim in the source and nobody had cut
 * these the other way to check it: some generators default to the orientation
 * that shatters a box, so the UI steers by this table rather than by the flag.
 *
 * An earlier table was cut through fixtures/box-50.stl at one repeat size. That
 * box's walls are about 44 mm tall between margins, so a repeat too tall to fit
 * whole was held in by the margin and read as surviving; the ring has no such
 * accident of size. Default parameters only: a different parameter set can change
 * the answer, which is why the UI treats this as a strong default to steer by and
 * not as a prohibition.
 */
export const NATIVE_CUT_PARTS: Record<string, readonly [plain: number, inverted: number]> = {
  diamondLattice: [1, 1514],
  squareGrid: [1, 1026],
  roundPerforations: [1, 1282],
  honeycomb: [1, 1282],
  roundedSlots: [1, 514],
  caneWeave: [554, 1],
  lusona: [762, 1],
  unicursalMaze: [10, 1],
  ammannBeenker: [1566, 1],
  hankin: [362, 1],
  fermatSpirals: [513, 66],
  gosper: [1, 66],
  arrowhead: [1, 66],
  terdragon: [1, 66],
  greekKey: [13, 14],
  voronoiTile: [1, 450],
  delaunayTile: [798, 1],
  truchet: [45, 45],
  penroseApproximant: [910, 1],
  hilbert: [634, 6],
  moire: [2, 1],
  guilloche: [145, 34],
  sierpinski: [1, 146],
  koch: [1, 18],
  phyllotaxis: [1, 2],
  hyperbolic: [465, 18],
  apollonian: [1, 194],
  penrose: [2162, 1],
  julia: [1, 194],
}

export interface CutAdvice {
  /** printable pieces the box falls into, not inverted; 0 means nothing to cut with */
  plain: number
  /** the same, inverted */
  inverted: number
  /** the orientation that survives a through-cut, or null when both do or neither does */
  good: boolean | null
}

/** Read the measured pair for a generator, or for one library design. */
export function cutAdvice(parts: readonly [number, number] | undefined): CutAdvice | undefined {
  if (!parts) return undefined
  const [plain, inverted] = parts
  // A lock is only useful when one orientation works and the other does not.
  // Both working means there is nothing to protect; neither working means the
  // choice cannot rescue it and the user needs a warning, not a locked control.
  const good = plain === 1 && inverted !== 1 ? false : inverted === 1 && plain !== 1 ? true : null
  return { plain, inverted, good }
}
