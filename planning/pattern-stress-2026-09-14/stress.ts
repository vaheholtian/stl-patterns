// Pattern generator stress test: parameter extremes + seeded random configs, for one generator.
// usage (repo root): node --import ./tests/register.mjs planning/pattern-stress-2026-09-14/stress.ts <generatorId> [nRandom] [startIndex]
import {writeFileSync,appendFileSync,mkdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {generators,defaultParams} from '../../src/patterns/index.ts'
import {generateTile} from '../../src/patterns/generate.ts'
import {resolveDef} from '../../src/patterns/definition.ts'
import {seededRandom} from '../../src/geom/random.ts'
import {intervals,mismatch} from '../seam-audit/audit.mjs'
import Module from 'manifold-3d'
const m=await Module();m.setup()
const id=process.argv[2],nRandom=Number(process.argv[3]??40),start=Number(process.argv[4]??0)
const g=generators.find(g=>g.id===id)
if(!g)throw Error(`unknown generator ${id}`)
const out=new URL('./results/',import.meta.url);mkdirSync(out,{recursive:true})
const file=new URL(`${id}.jsonl`,out),polyFile=new URL(`${id}.polys.jsonl`,out)
if(start===0){writeFileSync(file,'');writeFileSync(polyFile,'')}
const base=()=>({invert:Boolean(g.cutoutDefault),connectMaterial:Boolean(g.cutoutDefault&&!g.connectedRibs),seamless:true,mirror:false,lineWidth:.42})
const configs:any[]=[]
configs.push({kind:'default',label:'default',params:{},...base()})
for(const p of g.params){
  if(['seed','width','height'].includes(p.key))continue
  const vals=p.type==='select'?p.options!.map(o=>o.value):p.type==='boolean'?[false,true]:[p.min,p.max]
  for(const v of vals){if(v===undefined||v===p.default)continue;configs.push({kind:'extreme',label:`${p.key}=${v}`,params:{[p.key]:v},...base(),seamless:p.seamlessValue===undefined})}
}
for(const seed of [0,7,42,99999])configs.push({kind:'extreme',label:`seed=${seed}`,params:{seed},...base()})
for(const [width,height] of [[5,5],[5,61],[61,5],[23,37],[100,100]])for(const lineWidth of [.2,.8])configs.push({kind:'extreme',label:`size=${width}x${height} line=${lineWidth}`,params:{width,height},...base(),lineWidth})
const lim=(k:'min'|'max')=>Object.fromEntries(g.params.filter(p=>p[k]!==undefined&&!['width','height','seed'].includes(p.key)).map(p=>[p.key,p[k]]))
configs.push({kind:'extreme',label:'combined-min',params:lim('min'),...base()})
configs.push({kind:'extreme',label:'combined-max',params:lim('max'),...base()})
configs.push({kind:'extreme',label:'combined-max seamless-off',params:lim('max'),...base(),seamless:false})
configs.push({kind:'extreme',label:'invert-flipped',params:{},...base(),invert:!g.cutoutDefault})
configs.push({kind:'extreme',label:'connect-flipped',params:{},...base(),connectMaterial:!base().connectMaterial})
configs.push({kind:'extreme',label:'mirror',params:{},...base(),mirror:true})
configs.push({kind:'extreme',label:'seamless-off',params:{},...base(),seamless:false})
// random: every param drawn in range (int/step respected); a third of draws biased to the outer 10% of the range
const R=seededRandom(0x5eed^[...id].reduce((a,c)=>(a*31+c.charCodeAt(0))|0,0))
for(let k=0;k<nRandom;k++){
  const params:any={}
  for(const p of g.params){
    if(p.type==='select')params[p.key]=p.options![Math.floor(R()*p.options!.length)].value
    else if(p.type==='boolean')params[p.key]=R()<.5
    else if(p.key==='seed')params[p.key]=Math.floor(R()*1e6)
    else if(p.min!==undefined&&p.max!==undefined){
      const u=R()<.33?(R()<.5?R()*.1:.9+R()*.1):R()
      let v=p.min+u*(p.max-p.min)
      if(p.type==='int')v=Math.round(v);else if(p.step)v=Math.round(v/p.step)*p.step
      params[p.key]=Math.min(p.max,Math.max(p.min,+v.toFixed(6)))
    }
  }
  configs.push({kind:'random',label:`random-${k}`,params,invert:R()<.5,connectMaterial:R()<.5,seamless:R()<.8,mirror:R()<.15,lineWidth:+(0.2+R()*.6).toFixed(2)})
}
const hash=(ps:number[][][])=>createHash('sha1').update(JSON.stringify(ps.map(p=>p.map(q=>q.map(v=>Math.round(v*1e4)))))).digest('hex').slice(0,12)
for(let i=start;i<configs.length;i++){
  const c=configs[i],t0=performance.now()
  writeFileSync(new URL(`${id}.current.json`,out),JSON.stringify({i,n:configs.length,config:c}))
  const def={name:g.name,generatorId:id,params:{...defaultParams(g),...c.params},invert:c.invert,connectMaterial:c.connectMaterial,seamless:c.seamless,mirror:c.mirror}
  let rec:any={id,i,kind:c.kind,label:c.label,config:c}
  try{
    const r=generateTile(m,{def,lineWidth:c.lineWidth});const ms=performance.now()-t0
    const tile=r.tile!,resolved=resolveDef(def)
    const finite=r.polygons.every(p=>p.every(q=>q.every(Number.isFinite)))
    const points=r.polygons.reduce((n,p)=>n+p.length,0)
    const seamExpected=c.seamless||resolved.mirror
    let edgeMax=0
    if(r.polygons.length&&finite){const e=[0,1].map(a=>mismatch(intervals(r.polygons,a,0),intervals(r.polygons,a,a?tile.height:tile.width)));edgeMax=Math.max(...e.map((x:any)=>x.max))}
    let area=0,topo:any={}
    if(r.polygons.length&&finite){const cs=new m.CrossSection(r.polygons as any,"EvenOdd");area=cs.area()/(tile.width*tile.height);cs.delete();}
    const tiny=r.polygons.filter(p=>{let a=0;for(let k=0;k<p.length;k++){const [x1,y1]=p[k],[x2,y2]=p[(k+1)%p.length];a+=x1*y2-x2*y1}return Math.abs(a/2)<.05}).length
    let deterministic:boolean|undefined
    if(c.kind!=='extreme'){const r2=generateTile(m,{def,lineWidth:c.lineWidth});deterministic=hash(r2.polygons as any)===hash(r.polygons as any)}
    rec={...rec,ms,tileW:tile.width,tileH:tile.height,mirror:resolved.mirror,locked:[...resolved.lockedParams],polygons:r.polygons.length,points,finite,empty:!r.polygons.length,areaFraction:area,edgeMax,seamExpected,seamFail:seamExpected&&edgeMax>.02,tinyPolygons:tiny,deterministic,warnings:r.warnings,...topo,heapMB:process.memoryUsage().heapUsed/1e6}
    appendFileSync(polyFile,JSON.stringify({i,w:tile.width,h:tile.height,polys:r.polygons.map(p=>p.map(q=>q.map(v=>+v.toFixed(3))))})+'\n')
  }catch(e:any){rec={...rec,error:String(e?.stack??e).slice(0,600),ms:performance.now()-t0}}
  appendFileSync(file,JSON.stringify(rec)+'\n')
  // a wasm fault poisons the module for every later call: stop so the runner restarts in a fresh process
  if(rec.error?.startsWith('RuntimeError'))process.exit(3)
}
writeFileSync(new URL(`${id}.current.json`,out),JSON.stringify({done:true,n:configs.length}))
