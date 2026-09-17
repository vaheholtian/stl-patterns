"""Cross-check: raster coverage (even-odd) vs the app's own CrossSection area, per run. Large gaps mean the
contact-sheet picture is not what the app computes."""
import json, sys
from pathlib import Path
import render as R
out=[]
for gid in sys.argv[1:]:
    recs={}
    for l in (R.RES/f'{gid}.jsonl').read_text(encoding='utf-8').splitlines():
        if l.strip(): r=json.loads(l); recs[r['i']]=r
    for l in (R.RES/f'{gid}.polys.jsonl').read_text(encoding='utf-8').splitlines():
        if not l.strip(): continue
        p=json.loads(l); r=recs.get(p['i'])
        if not r or r.get('error') or not p['polys']: continue
        res=max(0.05,max(p['w'],p['h'])/800)
        f=R.raster(p['w'],p['h'],p['polys'],res).mean()
        out.append((abs(f-r['areaFraction']),gid,p['i'],r['label'],round(f,3),round(r['areaFraction'],3)))
out.sort(reverse=True)
for o in out[:12]: print(*o)
print('n',len(out),'gap>0.05:',sum(1 for o in out if o[0]>.05))
