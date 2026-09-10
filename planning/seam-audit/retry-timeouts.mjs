// Run exact prior timeouts without overwriting the historical audit.
// node --import ./tests/register.mjs planning/seam-audit/retry-timeouts.mjs
// Optional: --budget=180000 --jobs=2 --only=0,1 --output=retry-results.json
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const arg = (key, fallback) => process.argv.find(a => a.startsWith(`--${key}=`))?.split('=')[1] ?? fallback
const budgetMs = Number(arg('budget', 180000)), jobs = Number(arg('jobs', 2))
const root = fileURLToPath(new URL('../../', import.meta.url))
const configs = JSON.parse(readFileSync(new URL('./timeout-cases.json', import.meta.url), 'utf8'))
const only = arg('only', '').split(',').filter(Boolean).map(Number)
const queue = configs.map((item, n) => ({ ...item, n })).filter(item => !only.length || only.includes(item.n))
const hashSource = () => Object.fromEntries(readdirSync(new URL('../../src/', import.meta.url), { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => { const path = `${e.parentPath}/${e.name}`; return [path.slice(root.length).replaceAll('\\', '/'), createHash('sha256').update(readFileSync(path)).digest('hex')] }).sort(([a], [b]) => a.localeCompare(b)))
const report = { startedAt: new Date().toISOString(), budgetMs, jobs, node: process.version, platform: process.platform, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, sourceHashes: hashSource(), results: [] }
const output = new URL(`./${arg('output', 'retry-results.json')}`, import.meta.url)
const save = () => writeFileSync(output, JSON.stringify(report, null, 2))
save()
async function run(item) {
  console.log(`START ${item.n}: ${item.source}/${item.index}`)
  const started = performance.now(), events = []
  const child = spawn(process.execPath, ['--import', './tests/register.mjs', 'planning/seam-audit/retry-worker.mjs', String(item.n)], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let buffer = '', stderr = '', timedOut = false, spawnError
  child.stdout.on('data', chunk => {
    buffer += chunk
    const lines = buffer.split('\n'); buffer = lines.pop()
    for (const line of lines) { try { events.push(JSON.parse(line)) } catch { stderr += line + '\n' } }
  })
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-12000) })
  child.on('error', error => { spawnError = String(error) })
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, budgetMs)
  const completion = await new Promise(resolve => child.on('close', (code, signal) => resolve({ code, signal })))
  clearTimeout(timer)
  const result = events.find(e => e.event === 'result'), error = events.find(e => e.event === 'error')
  const status = timedOut ? 'timeout' : error || spawnError || !result || completion.code !== 0 ? 'error' : result.fail ? 'seam-failure' : 'completed'
  report.results.push({ ...item, originalBudgetMs: item.originalBudgetMs ?? 8000, budgetMs, status, wallMs: performance.now() - started, lastStage: events.at(-1)?.event ?? 'startup', events, stderr, spawnError, ...completion })
  report.results.sort((a, b) => a.n - b.n); save()
  console.log(`END ${item.n}: ${status}, ${Math.round((performance.now() - started) / 1000)}s, last stage ${events.at(-1)?.event ?? 'startup'}`)
}
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => { for (;;) { const item = queue.shift(); if (!item) return; await run(item) } }))
report.finishedAt = new Date().toISOString()
report.sourceUnchanged = JSON.stringify(report.sourceHashes) === JSON.stringify(hashSource())
report.summary = Object.fromEntries(['completed', 'seam-failure', 'error', 'timeout'].map(s => [s, report.results.filter(r => r.status === s).length]))
save()
console.log(JSON.stringify({ ...report.summary, sourceUnchanged: report.sourceUnchanged }))
