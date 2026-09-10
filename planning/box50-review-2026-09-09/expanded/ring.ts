// Four-wall ring of the 50 mm container for one generator: rotations 0, 90 and 180 (supported fits)
// and 37 (unsupported), cut/emboss/recess, 2.5 mm margin. Records whether the closing edge was
// joined, the 2D and 3D crease agreement on all four vertical edges, the material parts and the
// layout notes. Saves the rotation-0 STL for honeycomb, celtic, voronoiTile and penroseApproximant.
//   node --import ./tests/register.mjs planning/box50-review-2026-09-09/expanded/ring.ts <phase> <generatorId>
import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs'
import {m,selectByNormals,layoutOnBody,applyLaid,allCreases,creaseMismatch3D,DEFAULTS} from '../helpers.ts'
import {manifoldFromTriMesh,triMeshFromManifold} from '../../../src/geom/manifold.ts'
import {parseStl,writeBinaryStl} from '../../../src/io/stl.ts'
import {generatorById} from '../../../src/patterns/index.ts'
const root=new URL(`./${process.argv[2]??'after'}/`,import.meta.url),id=process.argv[3]??'honeycomb',g=generatorById(id)!
mkdirSync(new URL('meshes/',root),{recursive:true})
const file=new URL(`ring-${id}.jsonl`,root);writeFileSync(file,'')
const bytes=readFileSync(new URL('../../../fixtures/box-50.stl',import.meta.url)),body=manifoldFromTriMesh(m,parseStl(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))),mesh=triMeshFromManifold(body)
const ring={name:'box50-ring',body,mesh,faceNormals:[[0,-1,0],[1,0,0],[0,1,0],[-1,0,0]] as [number,number,number][],origin:[37,0,23] as [number,number,number],region:selectByNormals(mesh,[[0,-1,0],[1,0,0],[0,1,0],[-1,0,0]],(x,y)=>x<.001||y<.001||x>49.999||y>49.999)}
const def={invert:Boolean(g.cutoutDefault),connectMaterial:Boolean(g.cutoutDefault&&!g.connectedRibs)}
for(const rotationDeg of [0,90,180,37])for(const mode of ['cut','emboss','recess'] as const){
 const s={...DEFAULTS,mode,rotationDeg,margin:2.5,wallThickness:1.6,depth:.8,detail:2},started=performance.now()
 writeFileSync(new URL(`ring-${id}-current.json`,root),JSON.stringify({id,rotationDeg,mode}))
 try{
  const {laid,log}=layoutOnBody(ring,id,{},s,ring.origin,30,def)
  const joined=laid.filter(l=>l.layout.closureJoined).length,notes=[...new Set(laid.flatMap(l=>l.layout.log.filter(x=>x.includes('closing')||x.includes('meets itself')||x.includes('repeats around')||x.includes('unsupported'))))]
  const raw=applyLaid(ring,laid,s),simple=raw.simplify(.005),parts=simple.decompose(),vols=parts.map(p=>p.volume()),largest=Math.max(...vols)
  const keep=parts.filter((p,i)=>vols[i]===largest||vols[i]>=5),solid=m.Manifold.compose(keep),material=keep.filter(p=>p.volume()>0).length
  const creases=allCreases(laid,.1).map(c=>({a:c.a,b:c.b,samples:c.result.samples,longestRun:c.result.longestRun,raw:c.result.raw.longestRun,threeD:creaseMismatch3D(solid,laid[c.a],laid[c.b],s).longestRun,closure:!!(laid[c.a].piece.closure&&laid[c.b].piece.closure)}))
  const stl=writeBinaryStl(triMeshFromManifold(solid)),reimport=manifoldFromTriMesh(m,parseStl(stl))
  let meshFile:string|undefined
  if(rotationDeg===0&&['honeycomb','celtic','voronoiTile','penroseApproximant'].includes(id)){meshFile=`meshes/${id}-ring-${mode}.stl`;writeFileSync(new URL(meshFile,root),new Uint8Array(stl))}
  appendFileSync(file,JSON.stringify({id,rotationDeg,mode,settings:s,def,status:solid.status(),roundtrip:reimport.status(),closureJoined:joined,materialParts:material,volumeChange:solid.volume()-body.volume(),creases,notes,flattenLog:log.filter(x=>x.includes('meet')||x.includes('cut')),mesh:meshFile,ms:performance.now()-started})+'\n')
  console.log(id,rotationDeg,mode,'joined',joined,'parts',material,'worst 3D',Math.max(...creases.map(c=>c.threeD)))
  reimport.delete();solid.delete();parts.forEach(p=>p.delete());simple.delete();raw.delete()
 }catch(e){appendFileSync(file,JSON.stringify({id,rotationDeg,mode,settings:s,def,error:String(e),ms:performance.now()-started})+'\n');console.log(id,rotationDeg,mode,String(e))}
}
