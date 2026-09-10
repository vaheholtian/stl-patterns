// The audit's exact dimensional probes, rerun into a phase directory so before and after can be
// compared: ridge-probe.ts (filled-tile ridge apex on 8 mm plates at 45/90/135° and the box corner
// at scales 0.6/1/1.7) and diagnostics.ts's physical-margin control (pattern z extents on the box).
//   node --import ./tests/register.mjs planning/box50-review-2026-09-09/expanded/probes.ts <phase>
import {m,bentPlate,layoutOnBody,applyLaid,DEFAULTS,selectByNormals} from '../helpers.ts'
import {writeFileSync,readFileSync,mkdirSync} from 'node:fs'
import {parseStl,writeBinaryStl} from '../../../src/io/stl.ts'
import {manifoldFromTriMesh,triMeshFromManifold} from '../../../src/geom/manifold.ts'
const root=new URL(`./${process.argv[2]??'after'}/`,import.meta.url);mkdirSync(new URL('meshes/',root),{recursive:true})
const rows:any[]=[]
const def={generatorId:'svg',svgTile:{width:20,height:20,ribWidth:1,curves:[],polygons:[[[0,0],[20,0],[20,20],[0,20]]]},seamless:true,invert:false}
const bytes=readFileSync(new URL('../../../fixtures/box-50.stl',import.meta.url)),body=manifoldFromTriMesh(m,parseStl(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))),mesh=triMeshFromManifold(body)
const box={name:'box50',body,mesh,faceNormals:[[0,-1,0],[1,0,0]] as [number,number,number][],origin:[37,0,23] as [number,number,number],region:selectByNormals(mesh,[[0,-1,0],[1,0,0]],(x,y)=>y<.001||x>49.999)}
for(const angle of [45,90,135,-90])for(const scale of [.6,1,1.7]){
 const b=bentPlate(angle),s={...DEFAULTS,margin:2.5,wallThickness:8,depth:.8,scale,mode:'emboss' as const}
 const {laid}=layoutOnBody(b,'svg',{},s,b.origin,30,def),solid=applyLaid(b,laid,s)
 const expected=.8/Math.cos(Math.abs(angle)*Math.PI/360),hits=solid.rayCast([0,5,5],[0,-5,5]),actual=hits[0]?.position[1]
 const r={body:b.name,angle,scale,depth:.8,expectedRidgeY:expected,actualRidgeY:actual,missingHeight:expected-actual,status:solid.status()};rows.push(r);console.log(r)
 if(angle===135&&scale===1)writeFileSync(new URL('meshes/control-filled-135-emboss.stl',root),new Uint8Array(writeBinaryStl(triMeshFromManifold(solid))))
 solid.delete();b.body.delete()
}
for(const mode of ['emboss','recess','cut'] as const)for(const scale of [.6,1,1.7]){
 const s={...DEFAULTS,margin:2.5,wallThickness:1.6,depth:.8,scale,mode}
 const {laid}=layoutOnBody(box,'svg',{},s,box.origin,30,def),solid=applyLaid(box,laid,s)
 const hits=solid.rayCast([55,-5,25],[45,5,25]),actual=hits[0]?.position??null
 const expected=mode==='emboss'?[50.8,-.8,25]:mode==='recess'?[49.2,.8,25]:null
 const r={body:box.name,mode,scale,depth:.8,expected,actual,missingHeight:expected&&actual?Math.abs(expected[0]-actual[0]):null,status:solid.status()};rows.push(r);console.log(r)
 if(mode==='emboss')writeFileSync(new URL(`meshes/control-box50-scale${scale}-emboss.stl`,root),new Uint8Array(writeBinaryStl(triMeshFromManifold(solid))))
 // physical margin: the laid-out pattern's z extents on each wall (the audit's diagnostics.ts control) and on the final solid
 const p=new Float32Array(3)
 const extents=laid.map(l=>{let min=Infinity,max=-Infinity;for(const poly of l.layout.polygons)for(const uv of poly){l.layout.param.toSurface(uv[0],uv[1],0,p);min=Math.min(min,p[2]);max=Math.max(max,p[2])}return {minZ:min,maxZ:max}})
 const level=(z:number)=>{const h=solid.rayCast([25,-5,z],[25,60,z])[0];return h?h.position[1]:null}
 const solidBand={z47_4:level(47.4),z47_6:level(47.6),z2_4:level(2.4),z2_6:level(2.6)}
 rows.push({body:box.name,kind:'physical-margin',mode,scale,requestedMargin:2.5,extents,solidBand});console.log('physical-margin',mode,scale,extents,solidBand)
 solid.delete()
}
writeFileSync(new URL('probes.json',root),JSON.stringify(rows,null,2))
