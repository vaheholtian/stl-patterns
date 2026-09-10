// Review-only harness: reads the exact user fixture; never changes application files.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { m, selectByNormals, layoutOnBody, allCreases, applyLaid, creaseMismatch3D, bentPlate, DEFAULTS } from './helpers.ts'
import { parseStl, writeBinaryStl } from '../../src/io/stl.ts'
import { manifoldFromTriMesh, triMeshFromManifold } from '../../src/geom/manifold.ts'
import { generators, repeatKind } from '../../src/patterns/index.ts'
import { generateTile } from '../../src/patterns/generate.ts'
import { intervals, mismatch, svg } from '../seam-audit/audit.mjs'
const out = new URL('./', import.meta.url)
mkdirSync(new URL('meshes/', out), {recursive:true}); mkdirSync(new URL('tiles/',out),{recursive:true})
const id=process.argv[2], g=generators.find(g=>g.id===id)!
if(!g) throw Error('generator required')
const bytes=readFileSync(new URL('../../fixtures/box-50.stl',out))
const body=manifoldFromTriMesh(m,parseStl(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)))
const mesh=triMeshFromManifold(body)
const normals:[number,number,number][]=[[0,-1,0],[1,0,0]]
const box={name:'box50-adjacent',body,mesh,faceNormals:normals,origin:[37,0,23] as [number,number,number],region:selectByNormals(mesh,normals,(x,y)=>y<0.001||x>49.999)}
const ring={...box,name:'box50-ring',region:selectByNormals(mesh,[[0,-1,0],[1,0,0],[0,1,0],[-1,0,0]],(x,y)=>x<.001||y<.001||x>49.999||y>49.999)}
const settings={...DEFAULTS,margin:2.5,wallThickness:1.6,depth:.8,detail:2}
const configs=[
 {name:'default',s:{},def:{},params:{}},
 {name:'rotated37',s:{rotationDeg:37,margin:0},def:{},params:{}},
 {name:'fine',s:{scale:.6,detail:1},def:{},params:{}},
 {name:'large-offset',s:{scale:1.7,rotationDeg:90,margin:4},def:{},params:{seed:42}},
 {name:'mirror',s:{rotationDeg:23,depth:1.2},def:{mirror:true},params:{}},
 {name:'inverted',s:{rotationDeg:37,depth:.4},def:{invert:true},params:{}},
 {name:'rectangle',s:{rotationDeg:17,margin:0,minScale:0},def:{},params:{width:23,height:37,seed:7}},
 {name:'single',s:{fit:'single',margin:0},def:{},params:{}},
] as any[]
const file=new URL(`${id}.jsonl`,out); writeFileSync(file,'')
const rec=(r:any)=>{appendFileSync(file,JSON.stringify({id,...r})+'\n');console.log(id,r.kind,r.body??'',r.config??'',r.mode??'',r.error??r.maxRun??'')}
rec({kind:'fixture',volume:body.volume(),bounds:body.boundingBox(),triangles:mesh.indices.length/3,regionTriangles:box.region.length,repeatKind:repeatKind(g)})
for(const config of configs){
 try {
  const gen=generateTile(m,{def:{name:id,generatorId:id,params:config.params,invert:false,...config.def},lineWidth:.42})
  const tile=gen.tile!;const edges=[0,1].map(axis=>mismatch(intervals(gen.polygons,axis,0),intervals(gen.polygons,axis,axis?tile.height:tile.width)))
  rec({kind:'tile',config:config.name,edges,warnings:gen.warnings,polygons:gen.polygons.length,width:tile.width,height:tile.height})
  if(config.name==='default')writeFileSync(new URL(`tiles/${id}.svg`,out),svg(tile,gen.polygons,id))
 } catch(e){rec({kind:'tile',config:config.name,error:String(e)})}
}
const plates=[45,90,135,-90].map(bentPlate)
for(const b of [box,ring,...plates]) for(const config of configs){
 const st={...settings,...config.s}
 try{
  const {laid,pieces,log}=layoutOnBody(b,id,config.params,st,b.origin,30,config.def)
  const creases=allCreases(laid).map(c=>{const r={...c.result,explained:undefined};return {a:c.a,b:c.b,...r,joined:Math.hypot(...r.phase)<.001}})
  rec({kind:'layout',body:b.name,config:config.name,settings:st,creases,maxRun:Math.max(0,...creases.filter(c=>c.joined).map(c=>c.longestRun)),pieces:pieces.length,log})
 }catch(e){rec({kind:'layout',body:b.name,config:config.name,error:String(e)})}
}
for(const config of configs) for(const mode of ['cut','emboss','recess'] as const){
 // All defaults/rotations and all requested output modes; other settings test cut and emboss.
 if(mode==='recess'&&!['default','rotated37','mirror'].includes(config.name))continue
 const st={...settings,...config.s,mode}
 const started=Date.now()
 try{
  const {laid}=layoutOnBody(box,id,config.params,st,box.origin,30,config.def)
  const raw=applyLaid(box,laid,st)
  // Match the worker's planar simplification and default island cutoff, retaining diagnostics before cleanup.
  const simple=raw.simplify(.005), parts=simple.decompose(),volumes=parts.map(p=>p.volume())
  const max=Math.max(...volumes),kept=parts.filter((p,i)=>volumes[i]===max||volumes[i]>=5)
  const solid=m.Manifold.compose(kept)
  const r=creaseMismatch3D(solid,laid[0],laid[1],st,.1,.05)
  const outputMesh=triMeshFromManifold(solid),stl=writeBinaryStl(outputMesh)
  const roundtrip=manifoldFromTriMesh(m,parseStl(stl))
  const save=['default','rotated37'].includes(config.name)||mode==='emboss'&&config.name==='inverted'
  const filename=`meshes/${id}-${config.name}-${mode}.stl`
  if(save)writeFileSync(new URL(filename,out),new Uint8Array(stl))
  rec({kind:'solid',body:box.name,config:config.name,mode,settings:st,...r,maxRun:r.longestRun,status:solid.status(),roundtrip:roundtrip.status(),volume:solid.volume(),volumeChange:solid.volume()-body.volume(),rawMaterialParts:volumes.filter(v=>v>.01).length,keptParts:kept.length,removedVolume:volumes.filter(v=>v<5&&v!==max).reduce((a,b)=>a+b,0),triangles:outputMesh.indices.length/3,ms:Date.now()-started,mesh:save?filename:undefined})
  roundtrip.delete();solid.delete();parts.forEach(p=>p.delete());simple.delete();raw.delete()
 }catch(e){rec({kind:'solid',config:config.name,mode,error:String(e),ms:Date.now()-started})}
}
body.delete();plates.forEach(b=>b.body.delete())
