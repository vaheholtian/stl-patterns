// Thin bent plates (1.6 mm) at 45°, 135° and a -90° valley for one generator, all three modes,
// exactly as extra.ts's angle-solid runs, plus two controls that attribute the original 41 flags:
//   mitred  – the corrected fixture (each plate clipped at the bisector, a solid valley)
//   gap     – the original audit fixture (plates start at the ridge; a valley only touches along its top line)
// Records the original-surface crease comparison and the physical relief at the fold from a filled tile.
//   node --import ./tests/register.mjs planning/box50-review-2026-09-09/expanded/angles.ts <phase> <generatorId>
import {writeFileSync,appendFileSync} from 'node:fs'
import {m,selectByNormals,layoutOnBody,applyLaid,creaseMismatch3D,DEFAULTS,type Body} from '../helpers.ts'
import {triMeshFromManifold} from '../../../src/geom/manifold.ts'
import {generatorById} from '../../../src/patterns/index.ts'
const root=new URL(`./${process.argv[2]??'before'}/`,import.meta.url),id=process.argv[3]??'honeycomb',g=generatorById(id)!
const file=new URL(`angles-${id}.jsonl`,root);writeFileSync(file,'')
const record=(r:any)=>{appendFileSync(file,JSON.stringify({id,...r})+'\n');console.log(id,r.fixture,r.body,r.mode,r.error??r.longestRun)}
function thinPlate(angle:number,gap:boolean):Body{const L=50,T=1.6,W=50,h=angle*Math.PI/360,pre=gap?0:5
 const a=m.Manifold.cube([L+pre,T,W]).translate([-pre,-T,0]).rotate([0,0,-angle/2]),b=m.Manifold.cube([L+pre,T,W]).translate([-L,-T,0]).rotate([0,0,angle/2])
 const right=m.Manifold.cube([100,200,100]).translate([0,-100,-25]),left=right.translate([-100,0,0]);const body=m.Manifold.union(a.intersect(right),b.intersect(left)),mesh=triMeshFromManifold(body)
 const normals:[number,number,number][]=[[Math.sin(h),Math.cos(h),0],[-Math.sin(h),Math.cos(h),0]]
 return {name:`thin-plate-${angle}`,body,mesh,origin:[20*Math.cos(h),-20*Math.sin(h),23],faceNormals:normals,region:selectByNormals(mesh,normals,(x,y)=>Math.hypot(x,y)<L-1)}}
const filledDef={generatorId:'svg',svgTile:{width:20,height:20,ribWidth:1,curves:[],polygons:[[[0,0],[20,0],[20,20],[0,20]]]},seamless:true,invert:false}
for(const fixture of ['mitred','gap'] as const)for(const angle of [45,135,-90]){
 const b=thinPlate(angle,fixture==='gap')
 for(const mode of ['cut','emboss','recess'] as const){
  const s={...DEFAULTS,rotationDeg:37,margin:2.5,wallThickness:1.6,depth:.8,detail:2,mode},started=performance.now()
  writeFileSync(new URL(`angles-${id}-current.json`,root),JSON.stringify({id,fixture,angle,mode}))
  try{
   const {laid}=layoutOnBody(b,id,{},s,b.origin,30,{invert:Boolean(g.cutoutDefault),connectMaterial:Boolean(g.cutoutDefault&&!g.connectedRibs)})
   const raw=applyLaid(b,laid,s),simple=raw.simplify(.005),parts=simple.decompose(),vols=parts.map(p=>p.volume()),largest=Math.max(...vols)
   const keep=parts.filter((p,i)=>vols[i]===largest||vols[i]>=5),solid=m.Manifold.compose(keep)
   const r=creaseMismatch3D(solid,laid[0],laid[1],s),far=creaseMismatch3D(solid,laid[0],laid[1],s,.1,1)
   // physical control on the same fixture: a filled tile's ridge or valley height on the bisector
   const control=layoutOnBody(b,'svg',{},s,b.origin,30,filledDef),cs=applyLaid(b,control.laid,s)
   const half=Math.abs(angle)*Math.PI/360,hitY=cs.rayCast([0,10,25],[0,-10,25])[0]?.position[1]
   const expectedY=mode==='cut'?null:(mode==='emboss'?.8:-.8)/Math.cos(half)*(angle<0?1:1)
   record({fixture,body:b.name,angle,mode,settings:s,status:solid.status(),retainedParts:keep.length,rawParts:vols.filter(v=>v>.01).length,volumeChange:solid.volume()-b.body.volume(),...r,explained:undefined,farLongestRun:far.longestRun,farMismatched:far.mismatched,control:{hitY,expectedY,missing:expectedY===null?null:expectedY-hitY},ms:performance.now()-started})
   cs.delete();solid.delete();parts.forEach(p=>p.delete());simple.delete();raw.delete()
  }catch(e){record({fixture,body:b.name,angle,mode,settings:s,error:String(e),ms:performance.now()-started})}
 }
 b.body.delete()
}
