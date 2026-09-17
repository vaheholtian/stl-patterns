"""Merge the sliced cut sweeps into cuts.json and report what the box actually did.

    for s in 0 55 110 165 220 275; do node --import ./tests/register.mjs \
        planning/pattern-library-2026-09-15/sweep-cut.ts $s 55; done
    python planning/pattern-library-2026-09-15/merge-cuts.py

Each slice runs in its own process because Manifold's WASM heap does not survive
hundreds of box-sized booleans in one session.
"""
import json
import glob
import os

here = os.path.dirname(os.path.abspath(__file__))
rows = []
for f in sorted(glob.glob(os.path.join(here, 'cuts-*.json')), key=lambda p: int(p.rsplit('-', 1)[1][:-5])):
    rows.extend(json.load(open(f)))
json.dump(rows, open(os.path.join(here, 'cuts.json'), 'w'), indent=1)

print(f'{len(rows)} patterns cut through fixtures/box-50.stl\n')
for width in (25, 50):
    key = f'w{width}'
    at = [r.get(key, {}) for r in rows]
    cut = [a for a in at if 'parts' in a]
    whole = [a for a in cut if a['thin'] == 1]
    broke = [a for a in cut if a['parts'] > 1]
    thin_only = [a for a in cut if a['parts'] == 1 and a['thin'] > 1]
    print(f'at a {width} mm repeat, of {len(cut)} cut:')
    print(f'  {len(whole):3d} stay one printable piece')
    print(f'  {len(broke):3d} visibly fall apart')
    print(f'  {len(thin_only):3d} look whole but hang on connections too thin to print')
    print(f'      (decompose() alone would have passed every one of these)')
    print(f'  {len([a for a in at if "skipped" in a]):3d} skipped, {len([a for a in at if "error" in a]):3d} errored')
    print()

# the tiles the probe rescued, which is the concrete value of that fix
rescued = sorted({r['slug'] for r in rows for k in ('w25', 'w50')
                  if r.get(k, {}).get('parts') == 1 and r.get(k, {}).get('thin', 1) > 1})
print(f'{len(rescued)} designs pass decompose() but fall apart once sub-nozzle ribbons are discounted:')
print('  ' + ', '.join(rescued))

# a design that survives a through-cut at 50 mm on a closed ring is the useful set
safe = sorted({r['slug'] for r in rows if r.get('w50', {}).get('thin') == 1})
print(f'\n{len(safe)} survive a through-cut on the closed 50 mm ring at a 50 mm repeat.')
print('The rest are still fine as recess or emboss, or as a cut on a bounded patch.')

# Carry the result into the library data, so the app warns at the moment a design
# is picked instead of leaving the finding in a planning folder.
data_path = os.path.join(here, '..', '..', 'src', 'patterns', 'library', 'data.json')
data = json.load(open(data_path))
by = {r['slug']: r for r in rows}
changed = 0
for p in data:
    w = by.get(p['slug'], {}).get('w50', {})
    parts = w.get('thin', 1) if 'thin' in w else 1
    if p.get('ringParts') != parts:
        p['ringParts'] = parts
        changed += 1
json.dump(data, open(data_path, 'w'))
print(f'\nwrote ringParts into src/patterns/library/data.json ({changed} changed)')
