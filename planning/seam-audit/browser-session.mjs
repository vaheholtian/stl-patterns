export async function connectBrowser() {
  const tabs = await (await fetch('http://127.0.0.1:9224/json/list')).json()
  const tab = tabs.find(t => t.type === 'page')
  const socket = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let id = 0; const pending = new Map(), errors = []
  socket.addEventListener('message', ({ data }) => {
    const msg = JSON.parse(data)
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails)
    if (!msg.id) return
    const p = pending.get(msg.id); if (!p) return
    pending.delete(msg.id); if (msg.error) p.reject(Error(JSON.stringify(msg.error))); else p.resolve(msg.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); socket.send(JSON.stringify({ id: n, method, params })) })
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails))
    return r.result.value
  }
  const waitFor = async (expression, timeout = 20000) => {
    const end = Date.now() + timeout
    while (Date.now() < end) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 100)) }
    throw Error(`Timed out: ${expression}`)
  }
  await send('Runtime.enable'); await send('Page.enable')
  return { send, evaluate, waitFor, errors, close: () => socket.close() }
}
