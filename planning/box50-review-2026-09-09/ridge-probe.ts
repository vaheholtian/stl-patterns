// A filled tile isolates tool geometry from pattern phase and outline ambiguity.
import {m,bentPlate,layoutOnBody,applyLaid,DEFAULTS} from './helpers.ts'
import {writeFileSync,readFileSync} from 'node:fs'
import {parseStl,writeBinaryStl} from '../../src/io/stl.ts'
import {manifoldFromTriMesh,triMeshFromManifold} from '../../src/geom/manifold.ts'
import {selectByNormals} from './helpers.ts'
const root=new URL('./',import.meta.url),rows:any[]=[]
const def={generatorId:'svg',svgTile:{width:20,height:20,ribWidth:1,curves:[],polygons:[[[0,0],[20,0],[20,20],[0,20]]]},seamless:true,invert:false}
const bytes=readFileSync(new URL('../../fixtures/box-50.stl',root)),body=manifoldFromTriMesh(m,parseStl(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))),mesh=triMeshFromManifold(body)
const box={name:'box50',body,mesh,faceNormals:[[0,-1,0],[1,0,0]] as [number,number,number][],origin:[37,0,23] as [number,number,number],region:selectByNormals(mesh,[[0,-1,0],[1,0,0]],(x,y)=>y<.001||x>49.999)}
for(const angle of [45,90,135])for(const scale of [.6,1,1.7]){
 const b=bentPlate(angle),s={...DEFAULTS,margin:2.5,wallThickness:8,depth:.8,scale,mode:'emboss' as const}
 const {laid}=layoutOnBody(b,'svg',{},s,b.origin,30,def),solid=applyLaid(b,laid,s)
 const expected=.8/Math.cos(angle*Math.PI/360),hits=solid.rayCast([0,5,5],[0,-5,5]),actual=hits[0]?.position[1]
 const r={body:b.name,angle,scale,depth:.8,expectedRidgeY:expected,actualRidgeY:actual,missingHeight:expected-actual,status:solid.status()};rows.push(r);console.log(r)
 if(angle===135&&scale===1)writeFileSync(new URL('meshes/control-filled-135-emboss.stl',root),new Uint8Array(writeBinaryStl(triMeshFromManifold(solid))))
 solid.delete();b.body.delete()
}
for(const scale of [.6,1,1.7]){
 const s={...DEFAULTS,margin:2.5,wallThickness:1.6,depth:.8,scale,mode:'emboss' as const}
 const {laid}=layoutOnBody(box,'svg',{},s,box.origin,30,def),solid=applyLaid(box,laid,s)
 const hits=solid.rayCast([55,-5,25],[49,1,25]),actual=hits[0]?.position
 const r={body:box.name,scale,depth:.8,expected:[50.8,-.8,25],actual,missingHeight:.8-(actual[0]-50),status:solid.status()};rows.push(r);console.log(r)
 writeFileSync(new URL(`meshes/control-box50-scale${scale}-emboss.stl`,root),new Uint8Array(writeBinaryStl(triMeshFromManifold(solid))))
 solid.delete()
}
writeFileSync(new URL('ridge-probe.json',root),JSON.stringify(rows,null,2))
