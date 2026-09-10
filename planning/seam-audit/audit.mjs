// Reproducible review harness; does not modify application code.
// Run: node --import ./tests/register.mjs planning/seam-audit/audit.mjs [generatorId]
import { appendFileSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { generators, defaultParams } from '../../src/patterns/index.ts'
import { resolveDef } from '../../src/state/tileStore.ts'
import { seededRandom } from '../../src/geom/random.ts'
import { mirrorTile } from '../../src/patterns/mirror.ts'
import { tileToCrossSection } from '../../src/patterns/pipeline.ts'
import Module from 'manifold-3d'

const m = await Module(); m.setup()
const outDir = new URL(process.env.SEAM_AUDIT_OUTPUT ?? './', import.meta.url)
mkdirSync(outDir, { recursive: true })
export function intervals(polys, axis, edge) {
  const list = []
  for (const poly of polys) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    if (Math.abs(a[axis] - edge) < 1e-6 && Math.abs(b[axis] - edge) < 1e-6) {
      const lo = Math.min(a[1-axis], b[1-axis]), hi = Math.max(a[1-axis], b[1-axis])
      if (hi-lo > 1e-7) list.push([lo, hi])
    }
  }
  list.sort((a,b) => a[0]-b[0])
  const merged=[]
  for (const iv of list) {
    const last=merged.at(-1)
    if (last && iv[0]-last[1] < 1e-6) last[1]=Math.max(last[1],iv[1])
    else merged.push([...iv])
  }
  return merged
}
export function mismatch(a,b) {
  const points=[...new Set([...a.flat(),...b.flat()])].sort((a,b)=>a-b)
  const diff=[]
  for (let i=1;i<points.length;i++) {
    const lo=points[i-1],hi=points[i],mid=(lo+hi)/2
    if(a.some(([l,h])=>l<mid&&mid<h) !== b.some(([l,h])=>l<mid&&mid<h)) {
      if(diff.length && Math.abs(diff.at(-1)[1]-lo)<1e-6)diff.at(-1)[1]=hi
      else diff.push([lo,hi])
    }
  }
  return { total:diff.reduce((s,[l,h])=>s+h-l,0), max:Math.max(0,...diff.map(([l,h])=>h-l)), intervals:diff }
}
export function svg(tile, polys, title) {
  const w=tile.width,h=tile.height
  const d=polys.map(p=>'M'+p.map(q=>q.join(',')).join('L')+'Z').join('')
  let body=''
  for(let y=0;y<3;y++)for(let x=0;x<3;x++)body+=`<use transform="translate(${x*w},${y*h})" href="#tile"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w*3} ${h*3}" width="900" height="900"><title>${title}</title><defs><path id="tile" d="${d}"/></defs><rect width="100%" height="100%" fill="white"/><g fill="#203448" fill-rule="evenodd">${body}</g><path d="M${w},0V${h*3}M${2*w},0V${h*3}M0,${h}H${3*w}M0,${2*h}H${3*w}" stroke="#ec4661" stroke-width="${Math.min(w,h)/300}" stroke-dasharray="${Math.min(w,h)/100}" fill="none"/></svg>`
}
export function cases(g) {
  const result=[], base=defaultParams(g)
  const add=(label,params={},options={})=>result.push({label,params:{...base,...params},minFeature:0.84,invert:!!g.cutoutDefault,mirror:false,bridge:false,...options})
  for(const minFeature of [0,0.4,0.84,1.6])for(const invert of [false,true])for(const mirror of [false,true])add('default',{},{minFeature,invert,mirror})
  for(const invert of [false,true])for(const mirror of [false,true])add('bridges',{},{invert,mirror,bridge:true})
  for(const [width,height] of [[5,5],[5,300],[300,5],[23,37],[100,45],[300,300]])for(const invert of [false,true])add('size',{width,height,seed:42},{invert})
  for(const p of g.params) {
    if(['width','height','seed'].includes(p.key)||p.seamlessValue!==undefined)continue
    const values=p.type==='select'?p.options.map(o=>o.value):p.type==='boolean'?[false,true]:[p.min,p.max]
    for(const value of values)if(value!==undefined&&value!==p.default)add(`${p.key}=${value}`,{width:40,height:40,seed:7,[p.key]:value},{minFeature:0.4})
  }
  const rng=seededRandom(20260907)
  for(let i=0;i<12;i++) {
    const params={width:i%2?23:61,height:i%2?37:11,seed:[0,7,999999][i%3]}
    const candidates=g.params.filter(p=>!['width','height','seed'].includes(p.key)&&p.seamlessValue===undefined)
    for(let j=0;j<3;j++) {
      const p=candidates[Math.floor(rng()*candidates.length)]
      if(!p)continue
      if(p.type==='select')params[p.key]=p.options[Math.floor(rng()*p.options.length)].value
      else if(p.type==='boolean')params[p.key]=rng()<0.5
      else { const v=p.min+rng()*(p.max-p.min);params[p.key]=p.type==='int'?Math.round(v):Math.round(v/(p.step??0.1))*(p.step??0.1) }
    }
    add('combined '+i,params,{invert:!!(i%2),mirror:i%3===0,bridge:i%4===0,minFeature:[0,0.4,0.84,1.6][i%4]})
  }
  return result
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) for(const g of generators.filter(g=>!process.argv[2]||g.id===process.argv[2])) {
  const file=new URL(g.id+'.jsonl',outDir)
  const resume=process.argv.includes('--resume')
  if(!resume)writeFileSync(file,'')
  const completed=new Set(resume&&existsSync(file)?readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l).index):[])
  const only=process.argv.find(a=>a.startsWith('--case='))?.split('=')[1]
  const configs=cases(g)
  let failed=0,errors=0
  for(let i=0;i<configs.length;i++) {
    if(completed.has(i)||(only!==undefined&&i!==Number(only)))continue
    const config=configs[i],started=performance.now()
    writeFileSync(new URL(g.id+'-current.json',outDir),JSON.stringify({index:i,config}))
    let cs
    try {
      const def={name:g.name,generatorId:g.id,params:config.params,seamless:true,mirror:config.mirror,invert:config.invert}
      const resolved=resolveDef(def)
      let tile=g.generate(resolved.params,{rand:seededRandom(Number(resolved.params.seed??1))})
      if(resolved.mirror)tile=mirrorTile(tile)
      const finite=[...tile.polygons,...tile.curves.map(c=>c.points)].every(p=>p.every(q=>Number.isFinite(q[0])&&Number.isFinite(q[1])))
      if(!finite||!Number.isFinite(tile.width)||!Number.isFinite(tile.height)||tile.width<=0||tile.height<=0)throw Error('Invalid geometry')
      const bridge=config.bridge&&!(g.connectedRibs&&config.invert)
      cs=tileToCrossSection(m,tile,{periodic:true,invert:config.invert,minFeature:config.minFeature,connectMaterial:bridge})
      const polys=cs.toPolygons()
      const edges=[0,1].map(axis=>{const a=intervals(polys,axis,0),b=intervals(polys,axis,axis?tile.height:tile.width);return {axis,a,b,...mismatch(a,b)}})
      const fail=edges.some(e=>e.max>0.02)
      if(fail)failed++
      const record={index:i,config,actual:{width:tile.width,height:tile.height,mirror:resolved.mirror,bridge},area:cs.area(),empty:cs.isEmpty(),edges,fail,ms:performance.now()-started}
      appendFileSync(file,JSON.stringify(record)+'\n')
      if(i===4 || (fail&&failed<=3))writeFileSync(new URL(`${g.id}-${i}.svg`,outDir),svg(tile,polys,`${g.name}: ${config.label}`))
      if(fail)console.log('SEAM',g.id,i,config.label,JSON.stringify(edges.map(e=>({axis:e.axis,max:e.max}))))
    } catch(e) { errors++;appendFileSync(file,JSON.stringify({index:i,config,error:String(e),ms:performance.now()-started})+'\n');console.log('ERROR',g.id,i,String(e)) }
    finally{cs?.delete()}
  }
  console.log('COMPLETE',g.id,JSON.stringify({cases:configs.length,failed,errors}))
  if(failed||errors)process.exitCode=1
}
