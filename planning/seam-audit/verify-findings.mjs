// Fast, fresh confirmation of recorded seam defects; assertions expect the observed defects.
import assert from 'node:assert/strict'
import Module from 'manifold-3d'
import { generatorById, defaultParams } from '../../src/patterns/index.ts'
import { seededRandom } from '../../src/geom/random.ts'
import { tileToCrossSection } from '../../src/patterns/pipeline.ts'
import { insetConvex } from '../../src/patterns/penrose.ts'
import { intervals, mismatch } from './audit.mjs'
const m=await Module();m.setup()
for(const [id,p,minFeature,expected] of [
 ['penroseApproximant',{width:23,height:37,gap:5,style:'thin',seed:7},0.84,1.3344410806894302],
 ['voronoiTile',{width:40,height:40,relax:0,seed:7},0.4,0.043878525495529175],
 ['moire',{width:61,height:11,angleA:40,angleB:-2,seed:7},0.84,0.0995716005563736],
 ['hilbert',{width:23,height:5,ribWidth:6,order:4,rounded:true,seed:7},0.84,0.05742376297712326],
]){
 const g=generatorById(id),tile=g.generate({...defaultParams(g),...p},{rand:seededRandom(7)})
 const cs=tileToCrossSection(m,tile,{periodic:true,minFeature})
 try{
  const polys=cs.toPolygons(),max=Math.max(...[0,1].map(axis=>mismatch(intervals(polys,axis,0),intervals(polys,axis,axis?tile.height:tile.width)).max))
  assert.ok(Math.abs(max-expected)<1e-6,`${id}: expected recorded defect ${expected}, got ${max}`)
  console.log(`${id}: reproduced ${max.toFixed(6)} mm seam mismatch`)
 }finally{cs.delete()}
}
assert.deepEqual(insetConvex([[0,0],[1,0],[1,1],[0,1]],2),[[2,2],[-1,2],[-1,-1],[2,-1]])
console.log('Collapsed convex inset incorrectly grows to 3 x 3: reproduced')
