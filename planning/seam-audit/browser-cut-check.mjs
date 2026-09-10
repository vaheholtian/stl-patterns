import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { connectBrowser } from './browser-session.mjs'
const b = await connectBrowser(), results = []
try {
  const previousOrigin = await b.evaluate('performance.timeOrigin')
  await b.send('Page.navigate', { url: 'http://127.0.0.1:5173/stl-patterns/?load=demo:box' })
  await b.waitFor(`performance.timeOrigin > ${previousOrigin} && document.readyState === 'complete' && !!document.querySelector('.topbar')`)
  await b.evaluate(`(async()=>{
    const moduleUrl=(path)=>performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname===path)?.name ?? path;
    globalThis.auditTile=(await import(moduleUrl('/stl-patterns/src/state/tileStore.ts'))).useTileStore;
    globalThis.auditApp=(await import(moduleUrl('/stl-patterns/src/state/store.ts'))).useStore;
    globalThis.auditGeom=(await import(moduleUrl('/stl-patterns/src/worker/client.ts'))).geomClient();
    auditTile.getState().setDef({name:'Square grid',generatorId:'squareGrid',params:{width:24,height:24,spacing:8,ribWidth:2},invert:false,seamless:true});
  })()`)
  await b.waitFor('auditApp.getState().bodies.length === 1 && auditTile.getState().polygons.length > 0')
  const initial = await b.evaluate('auditGeom.check(auditApp.getState().bodies[0].mesh)')
  for (const mode of ['cut', 'recess', 'emboss']) {
    await b.evaluate(`(()=>{
      const s=auditApp.getState(), body=s.bodies[0];
      s.clearLog();
      s.setSelection(new Uint8Array(body.mesh.indices.length/3).fill(1));
      s.setTileLayout({mode:${JSON.stringify(mode)},origin:[30,20,0],fit:'repeat',margin:3,wallThickness:2,depth:.6,detail:2});
      globalThis.auditProgress=[];
      globalThis.auditUnsub=auditApp.subscribe((state,prev)=>{if(state.busy?.startsWith('tile:') && (state.busy!==prev.busy || state.progress!==prev.progress)) auditProgress.push({stage:state.busy,value:state.progress});});
    })()`)
    await b.waitFor('[...document.querySelectorAll("button")].some(x=>x.textContent.includes("Flatten region")&&!x.disabled)')
    await b.evaluate('[...document.querySelectorAll("button")].find(x=>x.textContent.includes("Flatten region")).click()')
    await b.waitFor('[...document.querySelectorAll("button")].some(x=>x.textContent.includes("3. Apply tile")&&!x.disabled)', 60000)
    if (mode === 'cut') {
      await b.evaluate(`(async()=>{
        [...document.querySelectorAll('button')].find(x=>x.textContent.includes('3. Apply tile')).click();
        await new Promise(requestAnimationFrame);
        document.querySelector('.progress-notice button').click();
      })()`)
      await b.waitFor('!auditApp.getState().busy && auditApp.getState().log.includes("Tiled operation cancelled")')
      assert.equal(await b.evaluate('auditApp.getState().bodies[0].history.length'), 0)
      assert.equal(await b.evaluate('auditApp.getState().log.some(x=>x.includes("tile failed"))'), false)
      await b.evaluate('auditProgress=[]')
    }
    await b.evaluate('[...document.querySelectorAll("button")].find(x=>x.textContent.includes("3. Apply tile")).click()')
    await b.waitFor('auditApp.getState().busy?.startsWith("tile:")')
    assert.ok(await b.evaluate('!!document.querySelector(".progress-notice progress")'))
    if (mode === 'cut') {
      const shot = await b.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(new URL('./fixed/browser-actual-cut.png', import.meta.url), Buffer.from(shot.data, 'base64'))
    }
    await b.waitFor('auditApp.getState().busy === null', 60000)
    const state = await b.evaluate(`(()=>{auditUnsub();const s=auditApp.getState();return {log:s.log,history:s.bodies[0].history.length,progress:auditProgress,notice:document.querySelector('.notifications').innerText}})()`)
    assert.ok(state.log.includes('Tiled pattern applied'), JSON.stringify(state))
    assert.equal(state.history, 1)
    assert.ok(state.notice.includes('Tiled pattern applied'))
    const fractions = state.progress.map(p => p.value)
    assert.equal(fractions[0], 0); assert.equal(fractions.at(-1), 1)
    assert.ok(fractions.every((x, i) => x !== null && (!i || x >= fractions[i-1])))
    const mesh = await b.evaluate('auditGeom.check(auditApp.getState().bodies[0].mesh)')
    assert.ok(mode === 'emboss' ? mesh.volume > initial.volume : mesh.volume < initial.volume)
    const exports = await b.evaluate(`(async()=>{
      const mesh=auditApp.getState().bodies[0].mesh;
      const {writeBinaryStl}=await import('/stl-patterns/src/io/stl.ts');
      const {write3mf}=await import('/stl-patterns/src/io/threemf.ts');
      const {loadMeshFile}=await import('/stl-patterns/src/io/load.ts');
      const results=[];
      for(const [extension,data] of [['stl',writeBinaryStl(mesh)],['3mf',write3mf([{name:'test',mesh}])]]){
        const loaded=await loadMeshFile(new File([data],'pattern.'+extension));
        results.push({extension,bytes:data.byteLength,check:await auditGeom.check(loaded[0].mesh)});
      }
      return results;
    })()`)
    for (const exported of exports) {
      assert.equal(exported.check.status, 'NoError')
      assert.ok(Math.abs(exported.check.volume-mesh.volume) < .01)
    }
    results.push({ mode, initial, mesh, exports, ...state })
    await b.evaluate('auditApp.getState().undo(auditApp.getState().bodies[0].id)')
  }
  assert.equal(b.errors.length, 0, JSON.stringify(b.errors))
  writeFileSync(new URL('./fixed/browser-cut-results.json', import.meta.url), JSON.stringify({ results, errors: b.errors }, null, 2))
  console.log(JSON.stringify(results, null, 2))
} finally { b.close() }
