import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { connectBrowser } from './browser-session.mjs'
const b = await connectBrowser(), results = []
try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  const previousOrigin = await b.evaluate('performance.timeOrigin')
  await b.send('Page.navigate', { url: 'http://127.0.0.1:5173/stl-patterns/' })
  await b.waitFor(`performance.timeOrigin > ${previousOrigin} && document.readyState === 'complete' && !!document.querySelector('.topbar')`)
  await b.evaluate(`(async()=>{
    const moduleUrl=(path)=>performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname===path)?.name ?? path;
    globalThis.auditTile=(await import(moduleUrl('/stl-patterns/src/state/tileStore.ts'))).useTileStore;
    globalThis.auditApp=(await import(moduleUrl('/stl-patterns/src/state/store.ts'))).useStore;
    auditApp.getState().setScreen('pattern');
    auditTile.getState().setDef({name:'Square grid',generatorId:'squareGrid',params:{},invert:false,mirror:false,seamless:true,connectMaterial:false});
  })()`)
  await b.waitFor('auditTile.getState().polygons.length > 0')
  results.push({ check: 'actual worker generates default preview', polygons: await b.evaluate('auditTile.getState().polygons.length') })
  await b.evaluate(`auditTile.getState().setDef({name:'Guilloche',generatorId:'guilloche',params:{width:5,height:5,ribWidth:6},invert:false})`)
  await b.waitFor('auditTile.getState().warnings.some(x=>x.includes("too large"))')
  assert.ok(await b.evaluate('document.querySelector(".notifications").innerText.includes("too large")'))
  results.push({ check: 'invalid geometry produces a top-right error' })
  await b.evaluate(`auditTile.getState().setDef({name:'Penrose',generatorId:'penrose',params:{width:300,height:300,edge:6},invert:false})`)
  await new Promise(r => setTimeout(r, 500))
  const responseStart = performance.now()
  assert.equal(await b.evaluate('document.querySelector(".topbar").textContent.includes("STL patterns")'), true)
  const responseMs = performance.now() - responseStart
  await b.evaluate(`auditTile.getState().setDef({name:'Square grid',generatorId:'squareGrid',params:{},invert:false})`)
  await b.waitFor('auditTile.getState().tile !== null && auditTile.getState().def.generatorId === "squareGrid" && auditTile.getState().polygons.length > 0')
  results.push({ check: 'UI responds during heavy geometry and latest selection replaces it', responseMs })
  assert.ok(responseMs < 250)
  await b.evaluate(`auditApp.getState().setBusy('tile: Cutting the pattern', .5)`)
  await b.waitFor('document.querySelector("progress")?.value === .5')
  const position = await b.evaluate(`(()=>{const r=document.querySelector('.notifications').getBoundingClientRect();return {right:innerWidth-r.right,top:r.top,width:r.width}})()`)
  assert.ok(position.right >= 0 && position.right <= 20 && position.top < 70)
  results.push({ check: 'cut progress is accessible and positioned at top right', position })
  const screenshot = await b.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(new URL('./fixed/browser-progress.png', import.meta.url), Buffer.from(screenshot.data, 'base64'))
  await b.evaluate(`auditApp.getState().setBusy(null)`)
  await b.waitFor('!document.querySelector(".progress-notice")')
  assert.equal(b.errors.length, 0, JSON.stringify(b.errors))
  writeFileSync(new URL('./fixed/browser-results.json', import.meta.url), JSON.stringify({ results, errors: b.errors }, null, 2))
  console.log(JSON.stringify(results, null, 2))
} finally { b.close() }
