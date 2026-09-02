# Night build report, 2026-09-02

Written by Claude during the overnight build. Read this first in the morning.

## Where to find things

- Live app: https://vaheholtian.github.io/stl-patterns/ (deploys automatically on every push to main)
- Repo: https://github.com/vaheholtian/stl-patterns (public)
- Local dev: `npm run dev` in `C:\Code\STL-patterns`, then open http://localhost:5173/stl-patterns/
  - Dev shortcut: add `?load=/stl-patterns/fixtures/pen-cup.3mf` to auto-load the cup.
- Test files: `fixtures/pen-cup.3mf` (your cup), `fixtures/two-cubes-onshape.3mf`
- Spike pages (dev only): http://localhost:5173/stl-patterns/spikes/a.html?auto=1 and `.../spikes/b.html?auto=1`

## What to check yourself (in order)

1. **Bambu Studio import.** `C:\Users\vaheh\Downloads\Part 1 (1).3mf` is your cup with a Voronoi through-cut on the outer wall (8 mm cells, 2 mm ribs, 3 mm solid band at the rim and bottom edges). Open it in Bambu Studio. It should arrive at the right size (about 97 mm across, 55 mm tall) with no repair warnings. This is the Phase 1 acceptance check and the Test 1 candidate.
2. **Test 1 print.** If it slices cleanly, print it. Expect no supports needed on the wall holes at this size.
3. **Try the app on the cup**: load, click the outer wall, Apply Voronoi. It takes about 1.5 s.

## Note on your cup file

The file measures 97.2 mm across and 55 mm tall with a 5 mm wall, not 50 mm across. Onshape exported in meters and the app scales correctly, so the number is what Onshape has. If you meant 50 mm, the model is twice the size you think.

(sections below are filled in as phases complete)
