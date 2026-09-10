import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs'
import {m,selectByNormals,layoutOnBody,allCreases,DEFAULTS,type Body} from '../helpers.ts'
import {manifoldFromTriMesh,triMeshFromManifold} from '../../../src/geom/manifold.ts'
import {parseStl,writeBinaryStl} from '../../../src/io/stl.ts'
import {buildSurfaceTool,mitreTool,isPlanar} from '../../../src/geom/tileTool.ts'
import {toolMitres} from '../../../src/geom/layout.ts'
import {generatorById} from '../../../src/patterns/index.ts'
const root=new URL(`./${process.argv[2]??'before'}/`,import.meta.url),id=process.argv[3]??'honeycomb',g=generatorById(id)!
mkdirSync(new URL('meshes/',root),{recursive:true})
const file=new URL(`geometry-${id}.jsonl`,root);writeFileSync(file,'')
const record=(r:any)=>{appendFileSync(file,JSON.stringify({id,...r})+'\n');console.log(id,r.body,r.mode,r.error??r.status)}
function boxMesh(){const b=readFileSync(new URL('../../../fixtures/box-50.stl',import.meta.url));return manifoldFromTriMesh(m,parseStl(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)))}
function fixture(name:string):Body{
 let body=boxMesh(),mesh=triMeshFromManifold(body),origin:[number,number,number]=[37,0,23],region:Uint32Array
 if(name==='cylinder'){
  body=m.Manifold.difference(m.Manifold.cylinder(35,18,18,48),m.Manifold.cylinder(35,16.4,16.4,48).translate([0,0,1.6]));mesh=triMeshFromManifold(body);origin=[18,0,18]
  region=selectByNormals(mesh,Array.from({length:48},(_,i)=>[Math.cos((i+.5)*2*Math.PI/48),Math.sin((i+.5)*2*Math.PI/48),0] as [number,number,number]),(x,y)=>Math.hypot(x,y)>17.8,5)
 }else if(name==='rounded-box'){
  const cs=m.CrossSection.square([34,34],true).offset(4,'Round',2,32),inside=cs.offset(-1.6,'Round',2,32)
  body=m.Manifold.difference(cs.extrude(40),inside.extrude(40).translate([0,0,1.6]));mesh=triMeshFromManifold(body);origin=[0,-21,20]
  const ix=mesh.indices,p=mesh.positions,out:number[]=[]
  for(let t=0;t<ix.length/3;t++){let x=0,y=0;let lo=Infinity,hi=-Infinity;for(let c=0;c<3;c++){const v=ix[t*3+c]*3;x+=p[v]/3;y+=p[v+1]/3;lo=Math.min(lo,p[v+2]);hi=Math.max(hi,p[v+2])}if(hi-lo>10&&Math.hypot(Math.max(Math.abs(x)-17,0),Math.max(Math.abs(y)-17,0))>3.8)out.push(t)}
  region=Uint32Array.from(out);cs.delete();inside.delete()
 }else if(name==='three-face')region=selectByNormals(mesh,[[0,-1,0],[1,0,0],[0,0,-1]],(x,y,z)=>y<.001||x>49.999||z<.001)
 else if(name==='interior'){origin=[25,1.6,23];region=selectByNormals(mesh,[[0,1,0],[-1,0,0],[0,0,1]],(x,y,z)=>Math.abs(y-1.6)<.01||Math.abs(x-48.4)<.01||Math.abs(z-1.6)<.01)}
 else if(name==='whole-shell')region=Uint32Array.from({length:mesh.indices.length/3},(_,i)=>i)
 else if(name==='opposite-faces')region=selectByNormals(mesh,[[0,-1,0],[0,1,0]],(x,y)=>y<.001||y>49.999)
 else if(name==='nonuniform'){
  body=m.Manifold.difference(m.Manifold.cube([50,50,50]),m.Manifold.cube([45,47.6,50]).translate([.8,.8,2.4]));mesh=triMeshFromManifold(body)
  region=selectByNormals(mesh,[[0,-1,0],[1,0,0]],(x,y)=>y<.001||x>49.999)
 }else throw Error(name)
 if(!region.length)throw Error(`empty fixture selection ${name}`)
 return {name,body,mesh,region,origin,faceNormals:[]}
}
for(const name of ['cylinder','rounded-box','three-face','interior','whole-shell','opposite-faces','nonuniform']){
 const b=fixture(name)
 for(const mode of ['cut','emboss','recess'] as const){
  const s={...DEFAULTS,mode,wallThickness:name==='nonuniform'?4.2:1.6,depth:.8,scale:.6,margin:2.5,rotationDeg:['cylinder','rounded-box'].includes(name)?0:37,detail:3}
  const started=performance.now();writeFileSync(new URL(`geometry-${id}-current.json`,root),JSON.stringify({id,name,mode,settings:s}))
  try{
   const {laid,pieces,log}=layoutOnBody(b,id,{},s,b.origin,30,{invert:Boolean(g.cutoutDefault),connectMaterial:Boolean(g.cutoutDefault&&!g.connectedRibs)})
   const zMin=mode==='cut'?-(s.wallThickness+1):mode==='recess'?-s.depth:-.2,zMax=mode==='emboss'?s.depth:1
   const tools=laid.filter(l=>l.layout.polygons.length).map(l=>mitreTool(m,buildSurfaceTool(m,l.layout.param,[...l.layout.polygons,...l.layout.foldPolygons],zMin,zMax,s.detail),toolMitres(l.piece,l.layout),zMin,zMax))
   if(!tools.length)throw Error('No pattern shapes on region')
   const tool=m.Manifold.union(tools),raw=mode==='emboss'?b.body.add(tool):b.body.subtract(tool);tool.delete();tools.forEach(t=>t.delete())
   const simple=laid.every(l=>isPlanar(l.layout.param))?raw.simplify(.005):raw,parts=simple.decompose(),vols=parts.map(p=>p.volume()),largest=Math.max(...vols),keep=parts.filter((p,i)=>vols[i]===largest||vols[i]>=5),solid=m.Manifold.compose(keep)
   const mesh=triMeshFromManifold(solid),stl=writeBinaryStl(mesh),reimport=manifoldFromTriMesh(m,parseStl(stl))
   const save=['honeycomb','celtic','voronoiTile','penroseApproximant'].includes(id)&&mode!=='recess'
   const meshFile=`meshes/${id}-${name}-${mode}.stl`;if(save)writeFileSync(new URL(meshFile,root),new Uint8Array(stl))
   const creases=allCreases(laid,.25).map(c=>({...c.result,explained:undefined}))
   record({body:name,mode,settings:s,status:solid.status(),roundtrip:reimport.status(),volumeChange:solid.volume()-b.body.volume(),retainedParts:keep.length,rawParts:vols.filter(v=>v>.01).length,triangles:mesh.indices.length/3,pieces:pieces.length,localScales:laid.map(l=>[l.layout.scaleMin,l.layout.scaleMax]),creases,log,layoutLog:laid.flatMap(l=>l.layout.log),mesh:save?meshFile:undefined,ms:performance.now()-started})
   reimport.delete();solid.delete();parts.forEach(p=>p.delete());if(simple!==raw)simple.delete();raw.delete()
  }catch(e){record({body:name,mode,settings:s,error:String(e),ms:performance.now()-started})}
 }
 b.body.delete()
}
