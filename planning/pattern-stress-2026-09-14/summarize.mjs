// Aggregate results/*.jsonl + results/analysis.jsonl into results/summary.json and a printed table.
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs'
const dir=new URL('./results/',import.meta.url)
const an=new Map()
if(existsSync(new URL('analysis.jsonl',dir)))for(const l of readFileSync(new URL('analysis.jsonl',dir),'utf8').split('\n'))if(l.trim()){const r=JSON.parse(l);an.set(`${r.id}:${r.i}`,r)}
const rows=[],flags=[]
for(const f of readdirSync(dir).filter(f=>/^[A-Za-z]+\.jsonl$/.test(f)&&f!=='analysis.jsonl')){
  const byI=new Map();for(const l of readFileSync(new URL(f,dir),'utf8').trim().split('\n'))if(l){const r=JSON.parse(l);byI.set(r.i,r)}
  const R=[...byI.values()].map(r=>({...r,...(an.get(`${r.id}:${r.i}`)??{})}))
  const ok=R.filter(r=>!r.error),ms=ok.map(r=>r.ms).sort((a,b)=>a-b)
  const row={id:f.replace('.jsonl',''),runs:R.length,errors:R.filter(r=>r.error&&!r.error.startsWith('Timeout')).length,timeouts:R.filter(r=>r.error?.startsWith('Timeout')).length,
    empty:ok.filter(r=>r.empty).length,seamFail:ok.filter(r=>r.seamFail).length,nondet:ok.filter(r=>r.deterministic===false).length,nonfinite:ok.filter(r=>r.finite===false).length,
    p50ms:Math.round(ms[Math.floor(ms.length/2)]??0),maxMs:Math.round(ms.at(-1)??0),maxPts:Math.max(0,...ok.map(r=>r.points)),
    over20kPts:ok.filter(r=>r.points>20000).length,thinRibs:ok.filter(r=>(r.matThin??0)>.5&&!r.empty).length,maxHeapMB:Math.round(Math.max(0,...ok.map(r=>r.heapMB??0)))}
  rows.push(row)
  for(const r of R){
    const why=[]
    if(r.error)why.push(r.error.split('\n')[0].slice(0,100))
    if(r.seamFail)why.push(`seam ${r.edgeMax.toFixed(3)}mm`)
    if(r.deterministic===false)why.push('nondeterministic')
    if(r.finite===false)why.push('non-finite')
    if(r.ms>5000&&!r.error)why.push(`slow ${Math.round(r.ms)}ms`)
    if(why.length)flags.push({id:r.id,i:r.i,label:r.label,why,config:r.config})
  }
}
writeFileSync(new URL('summary.json',dir),JSON.stringify({rows,flags},null,1))
console.table(rows)
for(const f of flags)console.log(f.id,f.i,f.label,f.why.join('; '),JSON.stringify(f.config.params).slice(0,160),`inv=${f.config.invert} con=${f.config.connectMaterial} seam=${f.config.seamless} mir=${f.config.mirror} lw=${f.config.lineWidth}`)
