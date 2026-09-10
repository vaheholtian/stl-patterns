// Controlled connected-cut comparison for one generator on the box's two adjacent walls: the picker
// default, then invert and Connect material toggled one at a time, at the same origin, rotation,
// scale and margin. Records the positive-volume material parts after the app's island filter, the
// removed island volume, and the minimum rib width of the retained 2D layout (a proxy for
// printability). All cut mode; emboss/recess are unaffected by a cut-specific remedy.
//   node --import ./tests/register.mjs planning/box50-review-2026-09-09/expanded/connectivity.ts <phase> <generatorId>
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs'
import {m,selectByNormals,layoutOnBody,applyLaid,DEFAULTS} from '../helpers.ts'
import {manifoldFromTriMesh,triMeshFromManifold} from '../../../src/geom/manifold.ts'
import {parseStl} from '../../../src/io/stl.ts'
import {generatorById} from '../../../src/patterns/index.ts'
const root=new URL(`./${process.argv[2]??'after'}/`,import.meta.url),id=process.argv[3]??'delaunayTile',g=generatorById(id)!
const file=new URL(`connectivity-${id}.jsonl`,root);writeFileSync(file,'')
const bytes=readFileSync(new URL('../../../fixtures/box-50.stl',import.meta.url)),body=manifoldFromTriMesh(m,parseStl(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))),mesh=triMeshFromManifold(body)
const box={name:'box50',body,mesh,faceNormals:[[0,-1,0],[1,0,0]] as [number,number,number][],origin:[37,0,23] as [number,number,number],region:selectByNormals(mesh,[[0,-1,0],[1,0,0]],(x,y)=>y<.001||x>49.999)}
const picker={invert:Boolean(g.cutoutDefault),connectMaterial:Boolean(g.cutoutDefault&&!g.connectedRibs)}
const variants=[
 {label:'picker',def:picker},
 {label:'invert-toggled',def:{...picker,invert:!picker.invert}},
 {label:'connect-toggled',def:{...picker,connectMaterial:!picker.connectMaterial}},
 {label:'both-toggled',def:{invert:!picker.invert,connectMaterial:!picker.connectMaterial}},
]
for(const v of variants)for(const cutoff of [5,0,20])for(const scale of [1,.6]){
 const s={...DEFAULTS,mode:'cut' as const,wallThickness:1.6,depth:.8,margin:2.5,scale,detail:2},started=performance.now()
 try{
  const {laid}=layoutOnBody(box,id,{},s,box.origin,30,v.def),raw=applyLaid(box,laid,s),simple=raw.simplify(.005)
  const parts=simple.decompose(),vols=parts.map(p=>p.volume()),largest=Math.max(...vols)
  const keep=parts.filter((p,i)=>vols[i]===largest||vols[i]>=cutoff),material=keep.filter(p=>p.volume()>0).length
  const removedVolume=vols.filter((x,i)=>x<cutoff&&x!==largest&&x>0).reduce((a,b)=>a+b,0)
  // minimum feature width of the retained pattern in 2D: erode the layout polygons until they vanish
  let minRib:number|null=null
  const cs=new m.CrossSection(laid.flatMap(l=>l.layout.polygons),'EvenOdd')
  for(const r of [.2,.3,.42,.6,.84,1.2]){const e=cs.offset(-r/2,'Miter');const a=e.area();e.delete();if(a<1e-6){minRib=r;break}}
  cs.delete()
  appendFileSync(file,JSON.stringify({id,variant:v.label,def:v.def,cutoff,scale,status:simple.status(),materialParts:material,rawParts:vols.filter(x=>x>.01).length,removedIslands:parts.length-keep.length,removedVolume,largestVolume:largest,minRibBelow:minRib,ms:performance.now()-started})+'\n')
  console.log(id,v.label,'cutoff',cutoff,'scale',scale,'parts',material,'removed',parts.length-keep.length)
  parts.forEach(p=>p.delete());simple.delete();raw.delete()
 }catch(e){appendFileSync(file,JSON.stringify({id,variant:v.label,def:v.def,cutoff,scale,error:String(e),ms:performance.now()-started})+'\n');console.log(id,v.label,String(e))}
}
