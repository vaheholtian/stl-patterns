import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { connectBrowser } from './browser-session.mjs'
const b=await connectBrowser(), detail=Number(process.argv[2]??1.5)
try {
  await b.evaluate(`(async()=>{
    const moduleUrl=path=>performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname===path)?.name ?? path;
    globalThis.auditApp=(await import(moduleUrl('/stl-patterns/src/state/store.ts'))).useStore;
    globalThis.auditTile=(await import(moduleUrl('/stl-patterns/src/state/tileStore.ts'))).useTileStore;
    globalThis.auditGeom=(await import(moduleUrl('/stl-patterns/src/worker/client.ts'))).geomClient();
    globalThis.auditManifold=await import(moduleUrl('/stl-patterns/src/geom/manifold.ts'));
    globalThis.auditM=await auditManifold.getManifold();
    const outer=auditM.Manifold.cylinder(40,20,20,64),inner=auditM.Manifold.cylinder(40,18,18,64),tube=outer.subtract(inner);
    const mesh=auditManifold.triMeshFromManifold(tube);outer.delete();inner.delete();tube.delete();
    globalThis.restoreFlatten?.();
    const s=auditApp.getState();for(const body of s.bodies)s.removeBody(body.id);
    s.addBodies([{name:'Wrap verification tube',mesh}]);s.setScreen('apply');
    const mask=new Uint8Array(mesh.indices.length/3);
    for(let t=0;t<mask.length;t++)mask[t]=[0,1,2].every(j=>{const v=mesh.indices[t*3+j]*3;return Math.hypot(mesh.positions[v],mesh.positions[v+1])>19.9}) && new Set([0,1,2].map(j=>mesh.positions[mesh.indices[t*3+j]*3+2])).size>1 ?1:0;
    s.setSelection(mask);s.setTileLayout({mode:'cut',origin:[20,0,20],fit:'repeat',rotationDeg:0,scale:1,margin:2,wallThickness:2,minScale:0,detail:${detail}});
    auditTile.getState().setDef({name:'Voronoi wrap',generatorId:'voronoiTile',params:{width:23,height:37,seed:7},invert:false,seamless:true});
    const original=auditGeom.flattenPieces.bind(auditGeom);
    globalThis.restoreFlatten=()=>{auditGeom.flattenPieces=original};
    auditGeom.flattenPieces=async(...args)=>{const result=await original(...args);globalThis.auditFlat=result.pieces[0];
      return result};
  })()`)
  await b.waitFor('auditTile.getState().tile && auditTile.getState().polygons.length>0')
  await b.waitFor('[...document.querySelectorAll("button")].some(x=>x.textContent.includes("Flatten region")&&!x.disabled)')
  await b.evaluate('[...document.querySelectorAll("button")].find(x=>x.textContent.includes("Flatten region")).click()')
  await b.waitFor('!!globalThis.auditFlat && document.querySelector(".notifications").innerText.includes("repeats around the seam")',60000)
  assert.equal(await b.evaluate('auditFlat.topology'),'seam')
  const fitted=await b.evaluate('document.querySelector(".notifications").innerText')
  await b.evaluate('auditApp.getState().setTileLayout({rotationDeg:30})')
  await b.waitFor('document.querySelector(".notifications").innerText.includes("automatic seam fit unsupported")')
  const rotated=await b.evaluate('document.querySelector(".notifications").innerText')
  await b.evaluate('auditApp.getState().setTileLayout({rotationDeg:0})')
  await b.waitFor('document.querySelector(".notifications").innerText.includes("repeats around the seam") && ![...document.querySelectorAll("button")].find(x=>x.textContent.includes("3. Apply tile")).disabled')
  await b.evaluate('[...document.querySelectorAll("button")].find(x=>x.textContent.includes("3. Apply tile")).click()')
  await b.waitFor('auditApp.getState().log.includes("Tiled pattern applied") && !auditApp.getState().busy',60000)
  const result=await b.evaluate(`(async()=>{
    restoreFlatten();
    const mesh=auditApp.getState().bodies[0].mesh;
    const {writeBinaryStl}=await import('/stl-patterns/src/io/stl.ts');
    const {loadMeshFile}=await import('/stl-patterns/src/io/load.ts');
    const data=writeBinaryStl(mesh),loaded=await loadMeshFile(new File([data],'wrap.stl'));
    const man=auditManifold.manifoldFromTriMesh(auditM,loaded[0].mesh);
    const v=auditFlat.seamVertices[0]*3,theta=Math.atan2(auditFlat.positions[v+1],auditFlat.positions[v]);
    let mismatches=0,holes=0,material=0;
    for(let i=0;i<400;i++){
      const z=2+(i+.5)*36/400;
      const sides=[-1,1].map(sign=>{const a=theta+sign*1e-5;return man.rayCast([0,0,z],[22*Math.cos(a),22*Math.sin(a),z]).length>0});
      if(sides[0]!==sides[1])mismatches++;
      if(sides[0])material++;else holes++;
    }
    const components=man.decompose();const componentVolumes=components.map(c=>c.volume());const count=components.length;components.forEach(x=>x.delete());man.delete();
    return {check:await auditGeom.check(loaded[0].mesh),bytes:data.byteLength,seamAngle:theta,mismatches,holes,material,samples:400,components:count,componentVolumes,solidComponents:componentVolumes.filter(v=>v>1e-6).length,log:auditApp.getState().log};
  })()`)
  writeFileSync(new URL(`./fixed/browser-wrap-results-${detail}.json`,import.meta.url),JSON.stringify({fitted,rotated,...result,errors:b.errors},null,2))
  console.log(JSON.stringify(result,null,2))
  assert.equal(result.check.status,'NoError')
  assert.equal(result.mismatches,0)
  assert.ok(result.holes>0 && result.material>0)
  assert.equal(result.solidComponents,1)
  assert.equal(b.errors.length,0,JSON.stringify(b.errors))
  const shot=await b.send('Page.captureScreenshot',{format:'png'})
  writeFileSync(new URL(`./fixed/browser-wrap-${detail}.png`,import.meta.url),Buffer.from(shot.data,'base64'))
  writeFileSync(new URL(`./fixed/browser-wrap-results-${detail}.json`,import.meta.url),JSON.stringify({fitted,rotated,...result,errors:b.errors},null,2))
  console.log(JSON.stringify(result,null,2))
} finally {b.close()}
