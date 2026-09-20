"""Write the ring-sweep figures into the library data and the generator table.

    python planning/pattern-library-2026-09-15/apply-ring.py

Replaces cutAs/cutInv, which were cut through fixtures/box-50.stl and so depended
on how each repeat compared with that box's wall height.
"""
import json, os, re
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(os.path.dirname(here))
ring = json.load(open(os.path.join(here, 'ring.json')))

p = os.path.join(root, 'src/patterns/library/data.json')
data = json.load(open(p, encoding='utf8'))
changed = 0
for d in data:
    a, i = ring['library'][d['slug']]
    if (d['cutAs'], d['cutInv']) != (a, i):
        changed += 1
    d['cutAs'], d['cutInv'] = a, i
open(p, 'w', encoding='utf8', newline='').write(json.dumps(data, separators=(',', ':')))
print(f'{changed} of {len(data)} library designs re-measured')

p = os.path.join(root, 'src/patterns/cutParts.ts')
src = open(p, encoding='utf8').read()
body = ''.join(f'  {k}: [{v[0]}, {v[1]}],\n' for k, v in ring['native'].items())
src = re.sub(r'(NATIVE_CUT_PARTS: Record<string, readonly \[plain: number, inverted: number\]> = \{\n).*?(\})',
             lambda m: m.group(1) + body + m.group(2), src, flags=re.S)
open(p, 'w', encoding='utf8', newline='').write(src)
print(f'{len(ring["native"])} generators re-measured')
