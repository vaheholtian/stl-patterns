import { readFileSync, writeFileSync } from 'node:fs'
import Module from 'manifold-3d'
import { generatorById, defaultParams } from '../../src/patterns/index.ts'
import { seededRandom } from '../../src/geom/random.ts'
import { intervals, mismatch } from './audit.mjs'
const source = readFileSync(new URL('../../src/patterns/pipeline.ts', import.meta.url), 'utf8').replaceAll('\r\n', '\n').replaceAll("'./types'", "'../../src/patterns/types'").replaceAll("'./connectMaterial'", "'../../src/patterns/connectMaterial'")
const noSimplify = source.replace('cs = own(cs.simplify(0.01))', '// no preliminary simplification')
const a = noSimplify.indexOf('  if (opts.periodic) {\n    // The boolean kernel'), b = noSimplify.indexOf('  // Simplify with the box-boundary', a)
const noStitch = noSimplify.slice(0, a) + '  if (opts.periodic) cs = own(m.CrossSection.intersection(cs, box))\n' + noSimplify.slice(b)
const anchored = noSimplify.replace('if (onBoundary(pts[i]))', 'if (onBoundary(pts[i]) || Math.min(Math.abs(pts[i][0]), Math.abs(pts[i][0] - w), Math.abs(pts[i][1]), Math.abs(pts[i][1] - h)) <= 2 * eps)')
const variants = { anchored, original: source, noSimplify, noStitch, exact: noStitch.replace('tile.height, 0.01)', 'tile.height, 0)'), fine: source.replaceAll('simplify(0.01)', 'simplify(0.001)').replace('tile.height, 0.01)', 'tile.height, 0.001)') }
const cases = [ ['voronoiTile', {width:40,height:40,relax:0},.4], ['penroseApproximant',{width:40,height:40,style:'edges',ribWidth:.4},.4], ['moire',{width:61,height:11,angleA:40,angleB:-2},.84] ]
const results = []
for (const [name, code] of Object.entries(variants)) {
  const url = new URL(`./probe-${name}.ts`, import.meta.url); writeFileSync(url, code)
  const { tileToCrossSection } = await import(url.href)
  const m = await Module(); m.setup()
  for (const [id, params, minFeature] of cases) {
    const g=generatorById(id), tile=g.generate({...defaultParams(g),...params,seed:7},{rand:seededRandom(7)})
    const start=performance.now(), cs=tileToCrossSection(m,tile,{periodic:true,minFeature})
    const polys=cs.toPolygons(), edges=[0,1].map(axis=>mismatch(intervals(polys,axis,0),intervals(polys,axis,axis?tile.height:tile.width)))
    const record={name,id,ms:performance.now()-start,edges,area:cs.area(),vertices:polys.reduce((s,p)=>s+p.length,0)}
    results.push(record); console.log(JSON.stringify(record)); cs.delete()
  }
}
writeFileSync(new URL('./pipeline-probe.json',import.meta.url),JSON.stringify(results,null,2))

