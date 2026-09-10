// Independently check geometry before the pipeline's seam stitching can hide a defect.
import { appendFileSync, writeFileSync } from 'node:fs'
import Module from 'manifold-3d'
import { generators, defaultParams, isSeamless } from '../../src/patterns/index.ts'
import { seededRandom } from '../../src/geom/random.ts'
import { strokePolyline } from '../../src/patterns/pipeline.ts'
let m=await Module();m.setup()
const file=new URL((process.env.SEAM_AUDIT_OUTPUT??'./')+'raw-results.jsonl',import.meta.url);writeFileSync(file,'')
let tested=0,failed=0
for(const g of generators){
 const base=defaultParams(g);for(const p of g.params)if(p.seamlessValue!==undefined)base[p.key]=p.seamlessValue
 const variants=[{}]
 for(const p of g.params)if(p.type==='select'&&p.seamlessValue===undefined)for(const o of p.options??[])if(o.value!==p.default)variants.push({[p.key]:o.value})
 for(const variant of variants)for(const [width,height]of [[5,5],[5,61],[61,5],[23,37]])for(const wide of [false,true]){
   const p={...base,...variant,width,height,seed:7};if(wide&&g.params.some(q=>q.key==='ribWidth'))p.ribWidth=g.params.find(q=>q.key==='ribWidth').max
   if(!isSeamless(g,p))continue
   const owned=[];const own=c=>{owned.push(c);return c};let reset=false
   try{
     const tile=g.generate(p,{rand:seededRandom(7)}),parts=[]
     if(tile.polygons.length)parts.push(own(new m.CrossSection(tile.polygons,'EvenOdd')))
     const loops=[];for(const c of tile.curves)loops.push(...strokePolyline(c.points,c.closed,tile.ribWidth))
     if(loops.length)parts.push(own(new m.CrossSection(loops,'NonZero')))
     const raw=own(parts.length?m.CrossSection.union(parts):m.CrossSection.square([0,0]))
     const box=own(m.CrossSection.square([tile.width,tile.height],false)),plain=own(raw.intersect(box))
     const copies=[];for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)copies.push(own(raw.translate([x*tile.width,y*tile.height])))
     const periodic=own(own(m.CrossSection.union(copies)).intersect(box)),extra=own(periodic.subtract(plain)).area()
     const fail=extra>0.05;tested++;if(fail)failed++
     appendFileSync(file,JSON.stringify({id:g.id,params:p,width:tile.width,height:tile.height,extra,fail})+'\n')
     if(fail)console.log('RAW',g.id,JSON.stringify({variant,width,height,wide,extra}))
   }catch(e){tested++;failed++;reset=true;appendFileSync(file,JSON.stringify({id:g.id,params:p,error:String(e)})+'\n')}
   finally{for(const c of owned.reverse())try{c.delete()}catch{};if(reset){m=await Module();m.setup()}}
 }
 console.log('RAW COMPLETE',g.id)
}
console.log(JSON.stringify({tested,failed}))
if(failed)process.exitCode=1
