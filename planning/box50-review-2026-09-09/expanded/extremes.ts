import {writeFileSync,appendFileSync} from 'node:fs'
import {generators,defaultParams} from '../../../src/patterns/index.ts'
import {generateTile} from '../../../src/patterns/generate.ts'
import {resolveDef} from '../../../src/patterns/definition.ts'
import {intervals,mismatch,svg} from '../../seam-audit/audit.mjs'
import Module from 'manifold-3d'
const m=await Module();m.setup()
const root=new URL(`./${process.argv[2]??'before'}/`,import.meta.url),id=process.argv[3],g=generators.find(g=>g.id===id)!,file=new URL(`extremes-${id}.jsonl`,root);writeFileSync(file,'')
const configs:any[]=[]
for(const p of g.params){if(['seed','width','height'].includes(p.key))continue;const vals=p.type==='select'?p.options!.map(o=>o.value):p.type==='boolean'?[false,true]:[p.min,p.max];for(const v of vals){if(v===undefined||v===p.default)continue;configs.push({label:`${p.key}=${v}`,params:{[p.key]:v},seamless:p.seamlessValue===undefined})}}
for(const seed of [0,7,42,99999])configs.push({label:`seed=${seed}`,params:{seed},seamless:true})
for(const [width,height] of [[5,5],[5,61],[61,5],[23,37],[100,100]])for(const lineWidth of [.2,.8])configs.push({label:`size=${width}x${height},line=${lineWidth}`,params:{width,height},lineWidth,seamless:true})
configs.push({label:'combined-min',params:Object.fromEntries(g.params.filter(p=>p.min!==undefined&&!['width','height','seed'].includes(p.key)).map(p=>[p.key,p.min])),seamless:true})
configs.push({label:'combined-max',params:Object.fromEntries(g.params.filter(p=>p.max!==undefined&&!['width','height','seed'].includes(p.key)).map(p=>[p.key,p.max])),seamless:true})
for(let i=0;i<configs.length;i++){
 const c=configs[i],started=performance.now();writeFileSync(new URL(`extremes-${id}-current.json`,root),JSON.stringify({i,config:c}));
 try{
  const def={name:g.name,generatorId:id,params:{...defaultParams(g),...c.params},invert:Boolean(g.cutoutDefault),connectMaterial:Boolean(g.cutoutDefault&&!g.connectedRibs),seamless:c.seamless}
  const resolved=resolveDef(def),r=generateTile(m,{def,lineWidth:c.lineWidth??.42}),tile=r.tile!
  if(!r.polygons.every(p=>p.every(q=>q.every(Number.isFinite))))throw Error('Nonfinite output')
  // an empty result is a feasibility outcome (the generator warns), not a crash: manifold cannot build a CrossSection from no polygons
  const edges=[0,1].map(a=>mismatch(intervals(r.polygons,a,0),intervals(r.polygons,a,a?tile.height:tile.width))),max=Math.max(...edges.map(e=>e.max))
  let fraction=0;if(r.polygons.length){const cs=new m.CrossSection(r.polygons,'EvenOdd');fraction=cs.area()/(tile.width*tile.height);cs.delete()}
  const rec={id,i,config:c,actual:resolved,edgeMax:max,seamExpected:c.seamless,fail:c.seamless&&max>.02,empty:!r.polygons.length,areaFraction:fraction,polygons:r.polygons.length,warnings:r.warnings,ms:performance.now()-started};appendFileSync(file,JSON.stringify(rec)+'\n')
  if(rec.fail)writeFileSync(new URL(`extreme-${id}-${i}.svg`,root),svg(tile,r.polygons,c.label))
 }catch(e){appendFileSync(file,JSON.stringify({id,i,config:c,error:String(e),ms:performance.now()-started})+'\n')}
 console.log(id,i,configs.length,c.label)
}
