import { readFileSync, writeFileSync } from 'node:fs'
import Module from 'manifold-3d'
import { generatorById, defaultParams } from '../../src/patterns/index.ts'
import { seededRandom } from '../../src/geom/random.ts'
import { intervals, mismatch } from './audit.mjs'
const original = readFileSync(new URL('./probe-original.ts', import.meta.url), 'utf8')
const anchored = original.replace('if (onBoundary(pts[i]))', 'if (onBoundary(pts[i]) || Math.min(Math.abs(pts[i][0]), Math.abs(pts[i][0] - w), Math.abs(pts[i][1]), Math.abs(pts[i][1] - h)) <= 2 * eps)')
writeFileSync(new URL('./probe-anchorOriginal.ts', import.meta.url), anchored)
for (const [name, path] of [['original','./probe-original.ts'],['anchorOriginal','./probe-anchorOriginal.ts'],['fine','./probe-fine.ts'],['current','../../src/patterns/pipeline.ts']]) {
  const { tileToCrossSection } = await import(path)
  const m = await Module(); m.setup()
  for(const [id,params,opts] of [ ['unicursalMaze',{}, {invert:true,connectMaterial:true,minFeature:.8}], ['voronoiTile',{width:40,height:40,relax:0,seed:7},{minFeature:.4}], ['penroseApproximant',{width:40,height:40,style:'edges',ribWidth:.4,seed:7},{minFeature:.4}], ['moire',{width:61,height:11,angleA:40,angleB:-2,seed:7},{minFeature:.84}] ]) {
    const g=generatorById(id),tile=g.generate({...defaultParams(g),...params},{rand:seededRandom(params.seed??1)})
    const cs=tileToCrossSection(m,tile,{periodic:true,...opts}), polys=cs.toPolygons()
    const edges=[0,1].map(axis=>{const a=intervals(polys,axis,0),b=intervals(polys,axis,axis?tile.height:tile.width);return {a,b,diff:mismatch(a,b)}})
    console.log(JSON.stringify({name,id,area:cs.area(),edges}));cs.delete()
  }
}
