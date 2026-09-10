import {connectBrowser} from './browser-session.mjs'
import {writeFileSync} from 'node:fs'
const b=await connectBrowser()
try{
 const result=await b.evaluate(`(async()=>{
   const moduleUrl=path=>performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname===path)?.name ?? path;
   const {layoutTile}=await import(moduleUrl('/stl-patterns/src/geom/layout.ts'));
   const flat=auditFlat,s=auditApp.getState(),tile=auditTile.getState().tile;
   const layout=layoutTile(auditM,flat,auditTile.getState().polygons,tile.width,tile.height,{...s.tileLayout,origin:flat.origin,single:false});
   const pairs=flat.seamVertices.map(v=>({v,p:Array.from(flat.positions.slice(v*3,v*3+3)),n:Array.from(flat.normals.slice(v*3,v*3+3)),uv:Array.from(layout.param.uv.slice(v*2,v*2+2))}));
   const v=flat.seamVertices[0]*3,theta=Math.atan2(flat.positions[v+1],flat.positions[v]);
   const man=auditManifold.manifoldFromTriMesh(auditM,s.bodies[0].mesh);
   const rays=[];
   for(const delta of [1e-5,.0001,.001,.01,.03]){
     let mismatches=0,holes=0,material=0;const examples=[];
     for(let i=0;i<400;i++){
       const z=2+(i+.5)*36/400;
       const hits=[-1,1].map(sign=>{const a=theta+sign*delta;return man.rayCast([0,0,z],[22*Math.cos(a),22*Math.sin(a),z])});
       const sides=hits.map(h=>h.length>0);
       if(sides[0]!==sides[1]){mismatches++;if(examples.length<3)examples.push({z,hits:hits.map(h=>({type:typeof h,length:h.length,keys:Object.keys(h),json:JSON.stringify(h,(k,v)=>typeof v === "bigint" ? v.toString() : v)}))})}
       if(sides[0])material++;else holes++;
     }
     rays.push({delta,mismatches,holes,material,examples});
   }
   man.delete();
   return {period:flat.period,origin:flat.origin,pairs,layout:{log:layout.log,tw:layout.tileWidth,th:layout.tileHeight,bounds:layout.param.bounds()},rays};
 })()`)
 writeFileSync(new URL('./fixed/wrap-debug.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
}finally{b.close()}
