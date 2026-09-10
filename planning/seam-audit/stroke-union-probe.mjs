import { readFileSync, writeFileSync } from 'node:fs'
import Module from 'manifold-3d'
import { generatorById, defaultParams } from '../../src/patterns/index.ts'
import { seededRandom } from '../../src/geom/random.ts'
import { mirrorTile } from '../../src/patterns/mirror.ts'
import { intervals, mismatch } from './audit.mjs'
const source = readFileSync(new URL('../../src/patterns/pipeline.ts',import.meta.url),'utf8').replaceAll("'./types'", "'../../src/patterns/types'").replaceAll("'./connectMaterial'", "'../../src/patterns/connectMaterial'")
let variant = source.replace("if (loops.length) parts.push(own(new m.CrossSection(loops, 'NonZero')))", `if (loops.length) {
      const batches: CrossSection[] = []
      for (let i=0;i<loops.length;i+=128) batches.push(own(new m.CrossSection(loops.slice(i,i+128), 'NonZero')))
      parts.push(own(m.CrossSection.union(batches)))
    }`)
variant = variant.replace('    const copies: CrossSection[] = []', `    const haloSize = Math.min(tile.width, tile.height) / 8 + (opts.minFeature ?? 0) + .02
    const halo = own(own(m.CrossSection.square([tile.width + 2 * haloSize, tile.height + 2 * haloSize])).translate([-haloSize, -haloSize]))
    const copies: CrossSection[] = []`)
variant = variant.replace('copies.push(own(cs.translate([x * tile.width, y * tile.height])))', 'copies.push(own(m.CrossSection.intersection(own(cs.translate([x * tile.width, y * tile.height])), halo)))')
variant = variant.replace("cs = own(own(cs.offset(-r, 'Round', 2, 32)).offset(r, 'Round', 2, 32))", `if (cs.numVert() > 20000) {
      const filtered: CrossSection[] = [], b = cs.bounds(), n = 4, pad = 2 * r + .02
      const bw = (b.max[0] - b.min[0]) / n, bh = (b.max[1] - b.min[1]) / n
      for (let y=0;y<n;y++) for(let x=0;x<n;x++) {
        const ox=b.min[0]+x*bw, oy=b.min[1]+y*bh
        const region=own(own(m.CrossSection.square([bw+2*pad,bh+2*pad])).translate([ox-pad,oy-pad]))
        const input=own(m.CrossSection.intersection(cs,region))
        const opened=own(own(input.offset(-r,'Round',2,32)).offset(r,'Round',2,32))
        const core=own(own(m.CrossSection.square([bw,bh])).translate([ox,oy]))
        filtered.push(own(m.CrossSection.intersection(opened,core)))
      }
      cs=own(m.CrossSection.union(filtered))
    } else cs = own(own(cs.offset(-r, 'Round', 2, 32)).offset(r, 'Round', 2, 32))`)
variant = variant.replace('cs = own(cs.simplify(0.01))', 'if (cs.numVert() <= 20000) cs = own(cs.simplify(0.01))')
for (const marker of ['  let cs = parts.length', '  if (opts.periodic) {', '  if (opts.minFeature &&', '  cs = own(cs.simplify', '  const lean =', '  const simplified =']) variant = variant.replace(marker, "  console.log('STAGE', " + JSON.stringify(marker.trim()) + ", performance.now())\n" + marker)
const url=new URL('./probe-batched.ts',import.meta.url);writeFileSync(url,variant)
const {tileToCrossSection}=await import(url.href)
const n=Number(process.argv[2]??2),item=JSON.parse(readFileSync(new URL('./timeout-cases.json',import.meta.url),'utf8'))[n]
const c=item.config,g=generatorById(c.id??item.source)
let tile=g.generate({...defaultParams(g),...c.params},{rand:seededRandom(c.params.seed??7)})
if(c.mirror||g.id==='penrose'||g.id==='julia')tile=mirrorTile(tile)
const m=await Module();m.setup();const start=performance.now()
console.log('PIPELINE',g.id,n)
const cs=tileToCrossSection(m,tile,{periodic:true,invert:!!c.invert,minFeature:c.minFeature,connectMaterial:!!c.bridge})
const polys=cs.toPolygons(),result={n,id:g.id,ms:performance.now()-start,area:cs.area(),vertices:polys.reduce((s,p)=>s+p.length,0),edges:[0,1].map(axis=>mismatch(intervals(polys,axis,0),intervals(polys,axis,axis?tile.height:tile.width)))}
writeFileSync(new URL(`./stroke-union-${n}.json`,import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));cs.delete()
