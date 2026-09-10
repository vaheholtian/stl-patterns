import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import Module from 'manifold-3d'
import { generatorById, defaultParams } from '../../src/patterns/index.ts'
import { seededRandom } from '../../src/geom/random.ts'
import { tileToCrossSection } from '../../src/patterns/pipeline.ts'
import { svg, intervals, mismatch } from './audit.mjs'
const m=await Module();m.setup()
const resultFile=new URL((process.env.SEAM_AUDIT_OUTPUT??'./')+'targeted-results.json',import.meta.url)
const resume=process.argv.includes('--resume')
const result=resume&&existsSync(resultFile)?JSON.parse(readFileSync(resultFile,'utf8')):[];let shown=0
const configs=[]
for(const width of [5,10,23,40,61])for(const gap of [1,3,5])for(const style of ['thin','all'])for(const minFeature of [0.2,0.84])configs.push({id:'penroseApproximant',params:{width,height:37,gap,style,seed:7},minFeature})
for(const height of [5,7,11])for(const width of [5,23,61])for(const order of [1,4,7])for(const rounded of [false,true])configs.push({id:'hilbert',params:{width,height,order,rounded,ribWidth:6,seed:7},minFeature:0.84})
for(let index=0;index<configs.length;index++){
 if(index<result.length)continue
 const only=process.argv.find(a=>a.startsWith('--case='))?.split('=')[1]
 if(only!==undefined&&index!==Number(only))continue
 const c=configs[index]
 const g=generatorById(c.id)
 let tile
 let cs
 try{
  tile=g.generate({...defaultParams(g),...c.params},{rand:seededRandom(7)})
  cs=tileToCrossSection(m,tile,{periodic:true,minFeature:c.minFeature})
  const polys=cs.toPolygons(),edges=[0,1].map(axis=>mismatch(intervals(polys,axis,0),intervals(polys,axis,axis?tile.height:tile.width)))
  const fail=edges.some(e=>e.max>0.02),record={...c,width:tile.width,height:tile.height,area:cs.area(),edges,fail}
  result.push(record)
  if(fail){console.log(JSON.stringify(record));if(shown++<4)writeFileSync(new URL(`${process.env.SEAM_AUDIT_OUTPUT??'./'}targeted-${shown}.svg`,import.meta.url),svg(tile,polys,JSON.stringify(c)))}
 }catch(e){result.push({...c,error:String(e)})}finally{cs?.delete()}
 writeFileSync(new URL((process.env.SEAM_AUDIT_OUTPUT??'./')+'targeted-results.json',import.meta.url),JSON.stringify(result,null,2))
}
console.log(JSON.stringify({cases:result.length,failed:result.filter(r=>r.fail).length,errors:result.filter(r=>r.error).length}))
if(result.some(r=>r.fail||r.error))process.exitCode=1
