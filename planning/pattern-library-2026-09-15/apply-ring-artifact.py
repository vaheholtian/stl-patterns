"""Patch the triage artifact's embedded figures and legend with the ring sweep.

    python planning/pattern-library-2026-09-15/apply-ring-artifact.py <artifact.html>
"""
import json, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
ring = json.load(open(os.path.join(here, 'ring.json')))['library']
path = sys.argv[1]
html = open(path, encoding='utf8').read()

start = html.index('<script type="application/json" id="patterns">') + len('<script type="application/json" id="patterns">')
end = html.index('</script>', start)
rows = json.loads(html[start:end])
changed = 0
for r in rows:
    a, i = ring[r['slug']]
    if (r['cutAs'], r['cutInv']) != (a, i):
        changed += 1
    r['cutAs'], r['cutInv'] = a, i
html = html[:start] + json.dumps(rows, separators=(',', ':')) + html[end:]

html = html.replace(
    'what a closed 50&nbsp;mm box falls into when cut right through at a 50&nbsp;mm repeat, counting only connections thick enough to print',
    'what a box wall falls into when cut right through &mdash; measured on a ring four repeats around and four tall, counting only connections thick enough to print, so it does not depend on the size of the box')
open(path, 'w', encoding='utf8', newline='').write(html)
print(f'{changed} of {len(rows)} cards re-measured')
