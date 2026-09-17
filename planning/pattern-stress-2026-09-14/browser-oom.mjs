// Checks the honeycomb WASM out-of-memory case in real Chrome, through the app's own workers.
// Needs: vite dev server on :5199 and Chrome with --remote-debugging-port=9224 open on the app.
// usage: node planning/pattern-stress-2026-09-14/browser-oom.mjs
import { connectBrowser } from '../seam-audit/browser-session.mjs'
const b = await connectBrowser()
await b.waitFor('document.readyState === "complete"', 30000)
const crash = { width: 272, height: 298, holeSize: 4.5, ribWidth: 1.1 }
const result = await b.evaluate(`(async () => {
  const base = '/stl-patterns/src/'
  const { generatorById, defaultParams } = await import(base + 'patterns/index.ts')
  const g = generatorById('honeycomb')
  const input = (params, extra) => ({ def: { name: 'h', generatorId: 'honeycomb', params: { ...defaultParams(g), ...params }, invert: true, connectMaterial: true, seamless: true, mirror: true, ...extra }, lineWidth: 0.46 })
  const small = input({}, { mirror: false })
  const summary = r => r && { polygons: r.polygons.length, warnings: r.warnings }
  const out = {}
  // 1. raw preview worker, reused after the failure (what happens without the client's recovery)
  const raw = new Worker(new URL(base + 'worker/preview.worker.ts', location.origin), { type: 'module' })
  const ask = (w, req) => new Promise(res => { const t0 = performance.now(); w.onmessage = e => res({ ms: Math.round(performance.now() - t0), ok: e.data.ok, fatal: e.data.fatal, error: e.data.error, result: summary(e.data.result) }); w.onerror = e => res({ workerError: e.message }); w.postMessage(req) })
  out.rawBigTile = await ask(raw, { id: 1, type: 'generate', input: input(${JSON.stringify(crash)}) })
  out.rawNextSmallTile = await ask(raw, { id: 2, type: 'generate', input: small })
  raw.terminate()
  // 2. the app's PreviewClient, as the Pattern screen uses it
  const { PreviewClient } = await import(base + 'worker/preview-client.ts')
  const client = new PreviewClient()
  const t = async p => { const t0 = performance.now(); try { return { ms: Math.round(performance.now() - t0), ok: true, result: summary(await p) } } catch (e) { return { ms: Math.round(performance.now() - t0), ok: false, error: e.message } } }
  out.clientBigTile = await t(client.generate(input(${JSON.stringify(crash)})))
  out.clientNextSmallTile = await t(client.generate(small))
  client.dispose()
  return out
})()`)
console.log(JSON.stringify(result, null, 1))
console.log('page exceptions:', b.errors.length)
b.close()
