# Handover — corner-aligned tile repeats on a closed ring

Written 2026-09-09 for a fresh session. Everything below was measured in this repo at
commit `c46c75e`; nothing is estimated.

## What the user wants

When a pattern wraps a closed ring of walls, the tile repeat should be able to land **on the
folds** so that every corner falls on a tile boundary and each wall carries a whole number of
tiles. Today the repeat is fitted to the whole circumference only, so a corner usually lands
mid-motif and a single motif gets folded through 90°. The geometry is correct either way — this
is about where the seam of the repeat sits, not about continuity.

The user saw and approved the target output:
`planning/box50-review-2026-09-09/expanded/after-final/meshes/celtic-ring-emboss-scale0.8333.stl`

## Proof it is achievable (already measured)

On `fixtures/box-50.stl`, four outer walls, celtic, emboss 0.8 mm, margin 2.5 mm, rotation 0:

| tile scale | layout note | wall-aligned? |
|---|---|---|
| 1 | `3 repeats around the seam, tile stretched 11.1%` | no — 66.667 mm repeat vs 50 mm wall |
| 0.8333 | `4 repeats around the seam, tile stretched 0.0%` | yes — 50 mm repeat, one tile per wall |

Verified on the two meshes by unrolling the walls into a height map and testing periodicity:

- scale 1: periodic at 66.667 mm (mean abs difference 0.022 mm), **not** at 50 mm (0.465 mm)
- scale 0.8333: periodic at 50 mm (0.022 mm)

Both close the ring (closing edge joined on 2 pieces, one material part, 0 mm crease
disagreement) and relief stays connected across every corner (92–98% of the rows that carry
relief belong to one connected strand on both sides of each fold).

So the win here costs nothing in stretch for this case — it *removes* 11.1% of stretch.

## Where the code is

`src/geom/layout.ts:135-150` is the whole decision:

```ts
if (period && settings.fitSeam) {
  repeats = Math.max(1, Math.round(len / tileWidth))   // line 138
  stretch = len / (repeats * tileWidth)
  log.push(`${repeats} repeats around the seam, tile stretched ${...}%`)
}
```

`len` is the ring period (200 mm for the 50 mm box). `repeats` is rounded against the
circumference alone — the fold positions inside the ring are not considered.

Related pieces the change touches or must not break:

- `src/geom/regionFlatten.ts` — `closeRings` decides a sheet's `period` and marks the two end
  pieces with `closure`. Fold positions along the sheet come from the unfolding tree here.
- `src/geom/layout.ts` — `LayoutResult.repeatsAround`, `stretch`, `stretchY`, `closureJoined`.
- `src/app/panels/TilePanel.tsx` — the "Fit whole repeats around seam" checkbox and the notes
  surfaced in the Tile layout panel.

## Suggested approach

1. Collect the fold offsets along the sheet (distance from the closure origin to each fold) at
   the point where `period` is known. For the box these are 50, 100, 150 out of 200.
2. Candidate repeat counts: instead of only `round(len / tileWidth)`, consider every `n` whose
   repeat length `len / n` divides all fold offsets to within a tolerance (say 0.01 mm).
   For the box: `n = 4, 8, 12 …`.
3. Pick the candidate whose stretch is closest to 1 and within a user-visible budget
   (a `±10%` band is a reasonable default). Fall back to today's behaviour when no candidate
   qualifies.
4. Say what happened in the log, e.g. `4 repeats around the seam, tile stretched 0.0%;
   every fold falls on a tile boundary`.
5. Expose it as a choice, not a silent change — the existing checkbox could become a
   three-way (off / fit the ring / fit the ring and the folds), or a separate
   "Align repeats to corners" toggle that only appears when a candidate exists.

## Limits worth stating in the UI (verified reasoning, not measured)

- Only works when the circumference divides into a whole number of tiles at an acceptable
  scale. 200/60 rounds to 3 or 4; 4 happens to give exactly 50 mm. Other box/tile sizes will
  need real stretch or will have no candidate at all.
- A rectangular box is harder: one repeat length must divide **both** wall lengths, so it needs
  their ratio to be rational with a small denominator.
- Impossible at rotations other than 0/90/180/270 — the layout already refuses to close the
  ring there and leaves the seam cut (`src/geom/layout.ts:182`).
- Does nothing for the top and bottom rim, which the margin band blanks regardless.

## Reproduce

```powershell
node --import ./tests/register.mjs planning/box50-review-2026-09-09/expanded/ring-scale.ts celtic 1 0.8333
```

Writes `expanded/after-final/meshes/celtic-ring-emboss-scale<scale>.stl` and
`expanded/after-final/ring-scale-celtic.jsonl`, and prints the layout notes.

## Loose ends in the tree right now

Two untracked harness files created while investigating, neither wired into any test script:

- `planning/box50-review-2026-09-09/expanded/ring-scale.ts` — the scale sweep above (keep).
- `planning/box50-review-2026-09-09/expanded/repro-app.ts` — reproduces a live app run headlessly;
  used to prove the deployed build was stale. Delete if not wanted.

## Separate, unrelated, and urgent

`main` is **3 commits ahead of `origin/main`**. `origin/main` is at `120d4df` (2026-09-08) and
does not contain `closeRings` at all, so the deployed GitHub Pages app is running pre-fix code.
Push before judging any app behaviour. See the conversation notes for the evidence.
