// Does making the tile repeat divide the 50 mm wall put every corner on a tile boundary?
// Same fixture, generator and code as ring.ts; only the tile scale changes. Rotation 0, emboss.
//   node --import ./tests/register.mjs planning/box50-review-2026-09-09/expanded/ring-scale.ts <generatorId> <scale...>
import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs'
import {m,selectByNormals,layoutOnBody,applyLaid,allCreases,creaseMismatch3D,DEFAULTS} from '../helpers.ts'
import {manifoldFromTriMesh,triMeshFromManifold} from '../../../src/geom/manifold.ts'
import {parseStl,writeBinaryStl} from '../../../src/io/stl.ts'
import {generatorById} from '../../../src/patterns/index.ts'
const root=new URL('./after-final/',import.meta.url)
const id=process.argv[2]??'celtic',scales=(process.argv.slice(3).length?process.argv.slice(3):['1','0.8333']).map(Number)
const g=generatorById(id)!
mkdirSync(new URL('meshes/',root),{recursive:true})
const file=new URL(`ring-scale-${id}.jsonl`,root);writeFileSync(file,'')
const bytes=readFileSync(new URL('../../../fixtures/box-50.stl',import.meta.url))
const body=manifoldFromTriMesh(m,parseStl(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))),mesh=triMeshFromManifold(body)
const ring={name:'box50-ring',body,mesh,faceNormals:[[0,-1,0],[1,0,0],[0,1,0],[-1,0,0]] as [number,number,number][],origin:[37,0,23] as [number,number,number],region:selectByNormals(mesh,[[0,-1,0],[1,0,0],[0,1,0],[-1,0,0]],(x,y)=>x<.001||y<.001||x>49.999||y>49.999)}
const def={invert:Boolean(g.cutoutDefault),connectMaterial:Boolean(g.cutoutDefault&&!g.connectedRibs)}
for(const scale of scales){
 const s={...DEFAULTS,mode:'emboss' as const,rotationDeg:0,scale,margin:2.5,wallThickness:1.6,depth:.8,detail:2},started=performance.now()
 try{
  const {laid,log,tileWidth}=layoutOnBody(ring,id,{},s,ring.origin,30,def)
  const joined=laid.filter(l=>l.layout.closureJoined).length
  const notes=[...new Set(laid.flatMap(l=>l.layout.log))]
  const raw=applyLaid(ring,laid,s),simple=raw.simplify(.005),parts=simple.decompose(),vols=parts.map(p=>p.volume()),largest=Math.max(...vols)
  const keep=parts.filter((p,i)=>vols[i]===largest||vols[i]>=5),solid=m.Manifold.compose(keep),material=keep.filter(p=>p.volume()>0).length
  const creases=allCreases(laid,.1).map(c=>({a:c.a,b:c.b,longestRun:c.result.longestRun,threeD:creaseMismatch3D(solid,laid[c.a],laid[c.b],s).longestRun,closure:!!(laid[c.a].piece.closure&&laid[c.b].piece.closure)}))
  const stl=writeBinaryStl(triMeshFromManifold(solid))
  const meshFile=`meshes/${id}-ring-emboss-scale${scale}.stl`;writeFileSync(new URL(meshFile,root),new Uint8Array(stl))
  appendFileSync(file,JSON.stringify({id,scale,tileWidth,closureJoined:joined,materialParts:material,status:solid.status(),creases,notes,mesh:meshFile,ms:performance.now()-started})+'\n')
  console.log('scale',scale,'tileWidth',tileWidth?.toFixed(3),'joined',joined,'parts',material,'worst 3D',Math.max(...creases.map(c=>c.threeD)))
  for(const n of notes.filter(x=>/repeat|meets itself|closing|stretch/i.test(x)))console.log('   note:',n)
  solid.delete();parts.forEach(p=>p.delete());simple.delete();raw.delete()
 }catch(e){console.log('scale',scale,String(e));appendFileSync(file,JSON.stringify({id,scale,error:String(e)})+'\n')}
}
