/**
 * How many printable pieces a closed 50 mm box falls into when each generator is
 * cut right through it, at default parameters, in each orientation: [plain, inverted].
 *
 * Measured by planning/pattern-library-2026-09-15/invert-natives.ts against
 * fixtures/box-50.stl. It exists because `cutoutDefault` is a claim in the source
 * and nobody had cut these the other way to check it. Four generators turned out
 * to have no flag at all and to default to the orientation that shatters the box
 * -- delaunayTile, penroseApproximant, moire and penrose, at 262, 323, 257 and 196
 * pieces -- so the UI steers by this table rather than by the flag.
 *
 * One configuration only: default parameters, a 50 mm box, a through-cut. A
 * different scale or parameter set can change the answer, which is why the UI
 * treats this as a strong default to steer by and not as a prohibition.
 */
export const NATIVE_CUT_PARTS: Record<string, readonly [plain: number, inverted: number]> = {
  diamondLattice: [1, 191],
  squareGrid: [1, 122],
  roundPerforations: [1, 146],
  honeycomb: [1, 146],
  roundedSlots: [1, 50],
  lusona: [89, 1],
  unicursalMaze: [1, 1],
  ammannBeenker: [4, 1],
  hankin: [1, 1],
  fermatSpirals: [9, 1],
  gosper: [1, 1],
  arrowhead: [1, 1],
  terdragon: [1, 1],
  greekKey: [1, 1],
  voronoiTile: [1, 121],
  delaunayTile: [262, 1],
  truchet: [11, 11],
  penroseApproximant: [323, 1],
  hilbert: [1, 2],
  moire: [257, 1],
  guilloche: [38, 2],
  sierpinski: [1, 42],
  koch: [1, 2],
  phyllotaxis: [1, 41],
  hyperbolic: [122, 2],
  apollonian: [1, 69],
  penrose: [196, 1],
  julia: [1, 8],
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
