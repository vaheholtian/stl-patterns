import {readFileSync,writeFileSync,appendFileSync} from 'node:fs'
import {m,selectByNormals,layoutOnBody,applyLaid,creaseMismatch3D,DEFAULTS} from './helpers.ts'
import {parseStl,writeBinaryStl} from '../../src/io/stl.ts'
import {manifoldFromTriMesh,triMeshFromManifold} from '../../src/geom/manifold.ts'
import {generators} from '../../src/patterns/index.ts'
const root=new URL('./',import.meta.url),file=new URL('diagnostics.jsonl',root);writeFileSync(file,'')
function read(path:string){const b=readFileSync(new URL(path,root));return manifoldFromTriMesh(m,parseStl(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)))}
const body=read('../../fixtures/box-50.stl'),mesh=triMeshFromManifold(body)
const box={name:'box50-adjacent',body,mesh,origin:[37,0,23] as [number,number,number],faceNormals:[[0,-1,0],[1,0,0]] as [number,number,number][],region:selectByNormals(mesh,[[0,-1,0],[1,0,0]],(x,y)=>y<.001||x>49.999)}
const settings={...DEFAULTS,margin:2.5,wallThickness:1.6,depth:.8,detail:2}
function finish(raw:any){const simple=raw.simplify(.005),parts=simple.decompose(),max=Math.max(...parts.map(p=>p.volume()));const kept=parts.filter(p=>p.volume()===max||p.volume()>=5);const solid=m.Manifold.compose(kept);parts.forEach(p=>p.delete());simple.delete();return {solid,keptParts:kept.length}}
const rec=(r:any)=>{appendFileSync(file,JSON.stringify(r)+'\n');console.log(r.id,r.kind,r.config??'')}
for(const g of generators)for(const mode of ['cut','emboss','recess'] as const){
 const s={...settings,mode},def={invert:Boolean(g.cutoutDefault),connectMaterial:Boolean(g.cutoutDefault&&!g.connectedRibs)}
 const {laid}=layoutOnBody(box,g.id,{},s,box.origin,30,def),raw=applyLaid(box,laid,s),{solid,keptParts}=finish(raw),r=creaseMismatch3D(solid,laid[0],laid[1],s)
 const filename=`meshes/${g.id}-picker-default-${mode}.stl`;writeFileSync(new URL(filename,root),new Uint8Array(writeBinaryStl(triMeshFromManifold(solid))))
 rec({id:g.id,kind:'picker-solid',config:'picker-default',mode,settings:s,def,...r,keptParts,mesh:filename,roundtrip:solid.status()});solid.delete();raw.delete()
}
for(const id of ['honeycomb','voronoiTile','celtic'])for(const mode of ['cut','emboss'] as const){
 const s={...settings,mode,scale:.6},g=generators.find(g=>g.id===id)!,def={invert:Boolean(g.cutoutDefault)}
 const {laid}=layoutOnBody(box,id,{},s,box.origin,30,def),raw=applyLaid(box,laid,s),{solid,keptParts}=finish(raw),r=creaseMismatch3D(solid,laid[0],laid[1],s)
 const filename=`meshes/${id}-fine-picker-${mode}.stl`;writeFileSync(new URL(filename,root),new Uint8Array(writeBinaryStl(triMeshFromManifold(solid))))
 rec({id,kind:'fine-solid',config:'fine-picker',mode,settings:s,...r,keptParts,mesh:filename,roundtrip:solid.status()});solid.delete();raw.delete()
}
// Attribute sampled footprint differences before and after the intentional island filter.
const prior=readFileSync(new URL('extra.jsonl',root),'utf8').trim().split('\n').map(l=>JSON.parse(l))
for(const r of prior.filter(r=>r.kind==='footprint'&&r.mismatches)){
 const s={...settings,mode:r.mode,...(r.config==='rotated37'?{rotationDeg:37,margin:0}:{})}, {laid}=layoutOnBody(box,r.id,{},s,box.origin),raw=applyLaid(box,laid,s),simple=raw.simplify(.005)
 const examples=r.examples.map((e:any)=>{const n=e.p[1]===0?[0,-1,0]:[1,0,0],o=e.p.map((v:number,i:number)=>v+n[i]*.5),end=e.p.map((v:number,i:number)=>v-n[i]*2.7);return {...e,rawOriginal:raw.rayCast(o,end).some((h:any)=>Math.abs(Math.hypot(...h.position.map((v:number,i:number)=>v-o[i]))-.5)<.03),simplifiedOriginal:simple.rayCast(o,end).some((h:any)=>Math.abs(Math.hypot(...h.position.map((v:number,i:number)=>v-o[i]))-.5)<.03)}})
 rec({id:r.id,kind:'footprint-attribution',config:r.config,mode:r.mode,examples});raw.delete();simple.delete()
}
// Measure physical margin independently of layout's UV coordinates.
const def={generatorId:'svg',svgTile:{width:20,height:20,ribWidth:1,curves:[],polygons:[[[0,0],[20,0],[20,20],[0,20]]]},invert:false}
for(const scale of [.6,1,1.7]){
 const {laid}=layoutOnBody(box,'svg',{}, {...settings,scale},box.origin,30,def),p=new Float32Array(3)
 const extents=laid.map(l=>{let min=Infinity,max=-Infinity;for(const poly of l.layout.polygons)for(const uv of poly){l.layout.param.toSurface(uv[0],uv[1],0,p);min=Math.min(min,p[2]);max=Math.max(max,p[2])}return {minZ:min,maxZ:max}})
 rec({id:'control',kind:'physical-margin',scale,requestedMargin:2.5,extents})
}
// Exact mesh sections for the dimensional reproductions.
const sections:any[]=[]
for(const path of ['control-box50-scale0.6-emboss','control-box50-scale1-emboss','control-filled-135-emboss']){
 const solid=read(`meshes/${path}.stl`),cs=solid.slice(path.includes('135')?5:25)
 sections.push({name:path,polygons:cs.toPolygons()});cs.delete();solid.delete()
}
writeFileSync(new URL('sections.json',root),JSON.stringify(sections))
