// Independent positive controls, exported-mesh footprint checks, thin bent plates, ring results.
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs'
import {m,selectByNormals,layoutOnBody,allCreases,applyLaid,creaseMismatch3D,DEFAULTS} from './helpers.ts'
import {parseStl,writeBinaryStl} from '../../src/io/stl.ts'
import {manifoldFromTriMesh,triMeshFromManifold} from '../../src/geom/manifold.ts'
import {generators} from '../../src/patterns/index.ts'
const root=new URL('./',import.meta.url),file=new URL('extra.jsonl',root);writeFileSync(file,'')
function read(path:string){const b=readFileSync(new URL(path,root));return manifoldFromTriMesh(m,parseStl(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)))}
const body=read('../../fixtures/box-50.stl'),mesh=triMeshFromManifold(body)
const box={name:'box50-adjacent',body,mesh,origin:[37,0,23] as [number,number,number],faceNormals:[[0,-1,0],[1,0,0]] as [number,number,number][],region:selectByNormals(mesh,[[0,-1,0],[1,0,0]],(x,y)=>y<.001||x>49.999)}
const ring={...box,name:'box50-ring',region:selectByNormals(mesh,[[0,-1,0],[1,0,0],[0,1,0],[-1,0,0]],(x,y)=>x<.001||y<.001||x>49.999||y>49.999)}
const settings={...DEFAULTS,margin:2.5,wallThickness:1.6,depth:.8,detail:2}
const rec=(r:any)=>{appendFileSync(file,JSON.stringify(r)+'\n');console.log(r.id,r.kind,r.body??'',r.config??'',r.error??'')}
function finish(raw:any){const simple=raw.simplify(.005),parts=simple.decompose(),max=Math.max(...parts.map(p=>p.volume()));const kept=parts.filter(p=>p.volume()===max||p.volume()>=5);const solid=m.Manifold.compose(kept);parts.forEach(p=>p.delete());simple.delete();raw.delete();return {solid,keptParts:kept.length}}
function save(solid:any,id:string,config:string,mode:string,s:any,info:any){const filename=`meshes/${id}-${config}-${mode}.stl`;writeFileSync(new URL(filename,root),new Uint8Array(writeBinaryStl(triMeshFromManifold(solid))));return {id,config,mode,settings:s,mesh:filename,roundtrip:solid.status(),...info}}
function inside(polys:any[],x:number,y:number){let v=false;for(const p of polys)for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])v=!v}return v}
// 2026-09-09 fix: plates start past the bisector so a concave valley is solid underneath (the original started at the ridge and left a V gap)
function thinPlate(angle:number){const L=50,T=1.6,W=50,h=angle*Math.PI/360;const a=m.Manifold.cube([L+5,T,W]).translate([-5,-T,0]).rotate([0,0,-angle/2]),b=m.Manifold.cube([L+5,T,W]).translate([-L,-T,0]).rotate([0,0,angle/2]);const right=m.Manifold.cube([100,200,100]).translate([0,-100,-25]),left=right.translate([-100,0,0]);const body=m.Manifold.union(a.intersect(right),b.intersect(left)),mesh=triMeshFromManifold(body);const normals:any=[[Math.sin(h),Math.cos(h),0],[-Math.sin(h),Math.cos(h),0]];return {name:`thin-plate-${angle}`,body,mesh,origin:[20*Math.cos(h),-20*Math.sin(h),23] as [number,number,number],faceNormals:normals,region:selectByNormals(mesh,normals,(x,y)=>Math.hypot(x,y)<L-1)}}
const plates=[45,135,-90].map(thinPlate)
for(const g of generators){try{
 const id=g.id
 // A broken-layout control proves the corner metric can detect phase discontinuities.
 if(['honeycomb','voronoiTile','celtic'].includes(id)){
  const {laid}=layoutOnBody(box,id,{}, {...settings,margin:0,rotationDeg:37},box.origin,30,{},false)
  rec({id,kind:'control',creases:allCreases(laid).map(c=>({...c.result,explained:undefined}))})
 }
 for(const mode of ['cut','emboss'] as const){
  const s={...settings,rotationDeg:37,depth:.4,mode}, {laid}=layoutOnBody(box,id,{},s,box.origin,30,{invert:true})
  const {solid,keptParts}=finish(applyLaid(box,laid,s)),r=creaseMismatch3D(solid,laid[0],laid[1],s)
  rec({kind:'extra-solid',...save(solid,id,'inverted',mode,s,{...r,keptParts})});solid.delete()
 }
 for(const b of plates)for(const mode of ['cut','emboss','recess'] as const){
  const s={...settings,rotationDeg:37,margin:2.5,mode}, {laid}=layoutOnBody(b,id,{},s,b.origin,30,{})
  const {solid,keptParts}=finish(applyLaid(b,laid,s));const r=creaseMismatch3D(solid,laid[0],laid[1],s)
  rec({id,kind:'angle-solid',body:b.name,mode,...r,status:solid.status(),keptParts,volumeChange:solid.volume()-b.body.volume()});solid.delete()
 }
 // Independently compare final exported surface to intended footprints, on both faces,
 // not merely the two sides to one another (which could miss symmetric underfill).
 for(const config of ['default','rotated37'])for(const mode of ['cut','emboss','recess'] as const){
  const s={...settings,mode,...(config==='rotated37'?{rotationDeg:37,margin:0}:{})}
  const {laid}=layoutOnBody(box,id,{},s,box.origin)
  const solid=read(`meshes/${id}-${config}-${mode}.stl`)
  let samples=0,mismatches=0,expectedFeature=0,expectedPlain=0;const examples:any[]=[]
  for(const l of laid){const front=l.piece.normals[1]<-.9,n=front?[0,-1,0]:[1,0,0]
   for(const offset of [.25,1,3,8,20])for(let z=3.17;z<47;z+=.41){
    const p=front?[50-offset,0,z]:[50,offset,z],uv=l.layout.param.uvAt3D(0,...p as [number,number,number]),polys=l.layout.polygons
    const expected=inside(polys,...uv as [number,number]);
    // Ignore outlines within .04 mm, where tiny placement differences legitimately change classification.
    if([[.04,0],[-.04,0],[0,.04],[0,-.04]].some(([dx,dy])=>inside(polys,uv[0]+dx,uv[1]+dy)!==expected))continue
    const start=mode==='emboss'?s.depth+.5:.5,o=p.map((v,i)=>v+n[i]*start),end=p.map((v,i)=>v-n[i]*(mode==='cut'?2.7:1.3))
    const hits=solid.rayCast(o as any,end as any),distance=hits.length?Math.hypot(...hits[0].position.map((v,i)=>v-o[i])):Infinity
    const modified=Math.abs(distance-start)>.03
    samples++;if(expected)expectedFeature++;else expectedPlain++
    if(modified!==expected){mismatches++;if(examples.length<8)examples.push({p,expected,distance})}
   }
  }
  rec({id,kind:'footprint',config,mode,samples,mismatches,expectedFeature,expectedPlain,examples});solid.delete()
 }
 if(['honeycomb','voronoiTile','celtic','penroseApproximant'].includes(id))for(const config of ['ring-margin','ring-no-margin'])for(const mode of ['cut','emboss'] as const){
  const s={...settings,margin:config==='ring-margin'?2.5:0,rotationDeg:37,mode}
  const {laid,log}=layoutOnBody(ring,id,{},s,ring.origin),{solid,keptParts}=finish(applyLaid(ring,laid,s))
  const creases=allCreases(laid).map(c=>({...c.result,explained:undefined,threeD:creaseMismatch3D(solid,laid[c.a],laid[c.b],s)}))
  rec({kind:'ring-solid',body:ring.name,...save(solid,id,config,mode,s,{keptParts,longestRun:Math.max(...creases.map(c=>c.threeD.longestRun))}),creases,log});solid.delete()
 }
}catch(e){rec({id:g.id,kind:'extra-error',error:String(e)})}}
