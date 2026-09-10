# Extended timeout retries — 7 September 2026

All **22 original timeouts** were retried at their exact recorded settings in fresh processes, with **180 seconds per case** instead of 8 seconds (targeted) or 20 seconds (broad sweep). Results: **14 completed with matching edge profiles, 0 seam failures, 1 error, 7 remaining timeouts**.

Of the completed geometries, **0 were empty and 5 covered more than 98% of the tile**. Equal edges alone do not establish a usable pattern. These new measurements supplement the [original review](REPORT.md); its historical counts are unchanged. See the [prioritized fix plan](FIX-PLAN.md) and [exact repeated previews](retry-gallery.html).

## What the retries establish

- **guilloche/55 is now a reproduced failure rather than an inconclusive timeout:** `RuntimeError: Aborted(). Build with -sASSERTIONS for more info.` after 28.25 seconds. Last recorded process RSS: 4.03 GiB. Discard the failed kernel; do not continue other geometry on that instance.
- **Still inconclusive for seams at 180 seconds:** penrose/30, targeted/64, targeted/65, targeted/71, targeted/77, targeted/83, targeted/101. These inputs need profiling, feasibility handling or bounded-work behavior; extending the UI wait is not a fix.
- **5 completed cases are almost solid.** The inspected Hilbert previews lose the space-filling-line appearance under these thick-stroke settings. Preserve this distinction in regression results, even when opposing boundaries match.
- The implementation order is captured in [FIX-PLAN.md](FIX-PLAN.md): strict regression contracts; invalid geometry and worker recovery; truthful wrap fitting; convex erosion; periodic cleanup; measured performance work; residual bridges; final all-pattern verification.

## Method and limits

- Reused the original generator resolution, seeded randomness, forced/optional mirrors, inversion, cleanup and bridge rules. Targeted Hilbert cases retain their original native-tile semantics. No source fixes or parameter substitutions were made.
- Two disposable child processes ran concurrently on AMD Ryzen 5 7535HS with Radeon Graphics with 12 logical CPUs, win32, Node v24.11.1. Wall times include process startup and output writing and are not isolated performance benchmarks.
- Both final opposing edge profiles are compared without suppressing features under 0.35 mm. The longest continuous mismatch must be at most 0.02 mm. Exact mismatch extents and feature areas are stored in [retry-results.json](retry-results.json).
- Generation and full-pipeline stages are timed separately. For errors/timeouts, the last stage is recorded. A stalled pipeline does not by itself identify which internal boolean/offset operation is responsible.
- A separate [pre-kernel complexity probe](retry-complexity.json) measures generation and stroke assembly without booleans. Penrose emits 38,392 stroked loops / 691,056 stroke vertices after mirroring; several rounded Hilbert inputs emit 52,433 loops / 766,834 vertices. Creating these arrays took well under a second in the probe. This narrows the performance investigation to the subsequent geometry processing, without proving a particular kernel operation is at fault.
- Peak RSS is process resident memory reported by Node, not a measurement of retained WASM allocations. Timeout processes may not emit a peak measurement. High RSS plus a kernel abort does not prove the abort's internal cause.
- SHA-256 hashes of all application source files matched before and after the run. The baseline working tree already had uncommitted source changes.
- Completed output was rendered as exact 3 × 3 repeated SVG geometry. These are tile/pipeline checks; they do not verify browser responsiveness or physical STL wrap/export continuity.

## Results

“targeted” entries below are Hilbert, rib width 6 mm and cleanup 0.84 mm, seed 7. Other complete settings are in [timeout-cases.json](timeout-cases.json). Feature coverage refers to the region used by the pipeline, with inversion already applied.

| Original case | Requested settings (mm) | Result | Wall seconds | Max mismatch (mm) | Feature coverage | Peak RSS (MiB) |
|---|---|---|---:|---:|---:|---:|
| guilloche/55 | 61 × 11, invert off | error | 28.25 | unmeasured | — | 4129 |
| guilloche/56 | 23 × 37, invert on | completed | 39.53 | 0.000000 | 58.34% | 160 |
| guilloche/57 | 61 × 11, invert off | completed | 155.45 | 0.000000 | 10.34% | 134 |
| hyperbolic/55 | 23 × 37, invert on | completed | 25.52 | 0.000000 | 58.94% | 119 |
| julia/30 | 300 × 300, invert off | completed | 30.82 | 0.000000 | 9.83% | 372 |
| julia/31 | 300 × 300, invert on | completed | 39.11 | 0.000000 | 90.11% | 396 |
| penrose/30 | 300 × 300, invert off | timeout | 180.14 | unmeasured | — | not captured |
| targeted/64 | 5 × 5, order 7, rounded off | timeout | 180.04 | unmeasured | — | not captured |
| targeted/65 | 5 × 5, order 7, rounded on | timeout | 180.17 | unmeasured | — | not captured |
| targeted/70 | 23 × 5, order 7, rounded off | completed | 55.56 | 0.000000 | 99.99% | 300 |
| targeted/71 | 23 × 5, order 7, rounded on | timeout | 180.16 | unmeasured | — | not captured |
| targeted/76 | 61 × 5, order 7, rounded off | completed | 28.53 | 0.000000 | 99.99% | 185 |
| targeted/77 | 61 × 5, order 7, rounded on | timeout | 180.07 | unmeasured | — | not captured |
| targeted/82 | 5 × 7, order 7, rounded off | completed | 83.77 | 0.000000 | 97.87% | 833 |
| targeted/83 | 5 × 7, order 7, rounded on | timeout | 180.27 | unmeasured | — | not captured |
| targeted/88 | 23 × 7, order 7, rounded off | completed | 55.65 | 0.000000 | 97.71% | 474 |
| targeted/89 | 23 × 7, order 7, rounded on | completed | 9.28 | 0.000000 | 96.24% | 161 |
| targeted/94 | 61 × 7, order 7, rounded off | completed | 29.10 | 0.000000 | 97.78% | 293 |
| targeted/100 | 5 × 11, order 7, rounded off | completed | 73.52 | 0.000000 | 98.48% | 224 |
| targeted/101 | 5 × 11, order 7, rounded on | timeout | 180.04 | unmeasured | — | not captured |
| targeted/106 | 23 × 11, order 7, rounded off | completed | 43.70 | 0.000000 | 98.04% | 171 |
| targeted/112 | 61 × 11, order 7, rounded off | completed | 21.95 | 0.000000 | 98.18% | 159 |

## Reproduce

```powershell
node --import ./tests/register.mjs planning/seam-audit/retry-timeouts.mjs
python planning/seam-audit/retry-report.py
```

The runner writes incremental results, preserving the original broad and targeted logs. Use `--only=0,1 --jobs=1 --budget=180000 --output=retry-isolated-results.json` for selected isolated timing runs; numbers index `timeout-cases.json`. Keep the alternate output filename to preserve this complete retry record. The runner exits successfully when orchestration finishes, even if geometry fails; inspect its summary. The report generator asserts coverage and result consistency, not that all patterns are correct.
