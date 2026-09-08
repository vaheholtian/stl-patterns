import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PreviewClient } from '../src/worker/preview-client.ts'
import type { PreviewRequest, PreviewResponse } from '../src/worker/preview-protocol.ts'

class FakeWorker {
  onmessage: ((e: { data: PreviewResponse }) => void) | null = null
  onerror: ((e: { message: string; preventDefault: () => void }) => void) | null = null
  onmessageerror: (() => void) | null = null
  requests: PreviewRequest[] = []
  terminated = false
  postMessage(r: PreviewRequest) { this.requests.push(r) }
  terminate() { this.terminated = true }
  reply(data: Omit<Extract<PreviewResponse, { ok: true }>, 'id'> | Omit<Extract<PreviewResponse, { ok: false }>, 'id'>) { this.onmessage?.({ data: { ...data, id: this.requests.at(-1)!.id } }) }
}
const input = { def: { name: 'Grid', generatorId: 'squareGrid', params: {}, invert: false }, lineWidth: .42 }
const result = { tile: null, polygons: [], warnings: [] }
function fixture(budget = 1000) {
  const workers: FakeWorker[] = []
  const client = new PreviewClient(() => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker }, budget)
  return { client, workers }
}
test('latest preview cancels stale work and ignores its eventual response', async () => {
  const { client, workers } = fixture()
  const old = client.generate(input), rejected = assert.rejects(old, /cancelled/)
  const latest = client.generate(input)
  assert.equal(workers[0].terminated, true)
  workers[0].reply({ ok: true, result: { ...result, warnings: ['stale'] } })
  workers[1].reply({ ok: true, result })
  assert.deepEqual(await latest, result)
  await rejected
  client.dispose()
})
test('fatal kernel and worker errors discard the worker; the next request succeeds', async () => {
  for (const kind of ['fatal', 'error', 'messageerror']) {
    const { client, workers } = fixture()
    const first = client.generate(input), rejected = assert.rejects(first)
    if (kind === 'fatal') workers[0].reply({ ok: false, fatal: true, error: 'Aborted()' })
    else if (kind === 'error') workers[0].onerror!({ message: 'crash', preventDefault() {} })
    else workers[0].onmessageerror!()
    await rejected
    assert.equal(workers[0].terminated, true)
    const next = client.generate(input)
    workers[1].reply({ ok: true, result })
    assert.deepEqual(await next, result)
    client.dispose()
  }
})
test('validation errors can reuse a healthy worker; cancellation is immediate', async () => {
  const { client, workers } = fixture()
  const first = client.generate(input), rejected = assert.rejects(first, /rib width/)
  workers[0].reply({ ok: false, fatal: false, error: 'rib width too large' })
  await rejected
  const next = client.generate(input), cancelled = assert.rejects(next, /cancelled/)
  assert.equal(workers.length, 1)
  client.cancel()
  assert.equal(workers[0].terminated, true)
  await cancelled
  client.dispose()
})
test('unresponsive work times out, terminates, and leaves a recoverable client', async () => {
  const { client, workers } = fixture(15)
  await assert.rejects(client.generate(input), /exceeded/)
  assert.equal(workers[0].terminated, true)
  const next = client.generate(input)
  workers[1].reply({ ok: true, result })
  assert.deepEqual(await next, result)
  client.dispose()
})
