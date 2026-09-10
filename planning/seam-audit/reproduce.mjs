import { writeFileSync } from 'node:fs'
import Module from 'manifold-3d'
import { generatorById, defaultParams } from '../../src/patterns/index.ts'
import { seededRandom } from '../../src/geom/random.ts'
import { mirrorTile } from '../../src/patterns/mirror.ts'
import { tileToCrossSection, strokePolyline } from '../../src/patterns/pipeline.ts'
import { svg, intervals, mismatch } from './audit.mjs'
const scenarios=[
 ['voronoiTile',{width:40,height:40,relax:0,seed:7},false,false],
 ['penroseApproximant',{width:5,height:5,style:'thin',seed:7},false,false],
 ['hilbert',{width:61,height:5,ribWidth:6,seed:7},false,false],
 ['diamondLattice',{width:61,height:11,holeSize:21,aspect:0.75,seed:0},true,true],
 ['guilloche',{width:5,height:5,ribWidth:6,seed:7},false,false],
]
const records=[]
for(const[id,params,mirror,bridge]of scenarios)for(const minFeature of [0,0.2,0.4,0.84,1.6]){
 const m=await Module();m.setup()
 const g=generatorById(id);let tile=g.generate({...defaultParams(g),...params},{rand:seededRandom(params.seed)})
 if(mirror)tile=mirrorTile(tile)
 const owned=[];const own=c=>{owned.push(c);return c}
 let record={id,params,mirror,bridge,minFeature}
 try {
   const cs=own(tileToCrossSection(m,tile,{periodic:true,minFeature,connectMaterial:bridge})),polys=cs.toPolygons()
   const edges=[0,1].map(axis=>mismatch(intervals(polys,axis,0),intervals(polys,axis,axis?tile.height:tile.width)))
   record={...record,area:cs.area(),edges}
   if(minFeature===0.4||minFeature===0.84)writeFileSync(new URL(`./repro-${id}-${minFeature}.svg`,import.meta.url),svg(tile,polys,`${id} cleanup ${minFeature}`))
 }catch(e){record.error=String(e)}
 finally{for(const c of owned)try{c.delete()}catch{}}
 records.push(record);console.log(JSON.stringify(record))
 writeFileSync(new URL('./reproductions.json',import.meta.url),JSON.stringify(records,null,2))
}
