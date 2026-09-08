import type { TileGenerationInput, TileGenerationResult } from '../patterns/generate'
import type { LayoutInput, PreviewLayoutResult, PreviewRequest, PreviewResponse } from './preview-protocol'

/** One cancellable preview stream. It never shares a worker with mesh operations. */
export class PreviewClient {
  private worker: Worker | null = null
  private nextId = 0
  private pending: { id: number; resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null
  private readonly factory: () => Worker
  private readonly budgetMs: number
  constructor(factory = () => new Worker(new URL('./preview.worker.ts', import.meta.url), { type: 'module' }), budgetMs = 60000) {
    this.factory = factory
    this.budgetMs = budgetMs
  }
  private stop(error: Error) {
    this.worker?.terminate()
    this.worker = null
    const pending = this.pending
    this.pending = null
    if (pending) { clearTimeout(pending.timer); pending.reject(error) }
  }
  cancel() { if (this.pending) this.stop(new Error('cancelled')) }
  dispose() { this.stop(new Error('cancelled')) }
  private request<T>(body: Omit<Extract<PreviewRequest, { type: 'generate' }>, 'id'> | Omit<Extract<PreviewRequest, { type: 'layout' }>, 'id'>): Promise<T> {
    this.cancel()
    return new Promise<T>((resolve, reject) => {
      const id = ++this.nextId
      if (!this.worker) {
        const worker = this.factory()
        this.worker = worker
        worker.onmessage = ({ data }: MessageEvent<PreviewResponse>) => {
          const p = this.pending
          if (this.worker !== worker || !p || data.id !== p.id) return
          if (!data.ok && data.fatal) { this.stop(new Error(data.error)); return }
          clearTimeout(p.timer)
          this.pending = null
          if (data.ok) p.resolve(data.result)
          else p.reject(new Error(data.error))
        }
        worker.onerror = e => {
          if (this.worker !== worker) return
          e.preventDefault()
          this.stop(new Error(e.message || 'Preview worker failed'))
        }
        worker.onmessageerror = () => { if (this.worker === worker) this.stop(new Error('Could not read the preview result')) }
      }
      const timer = setTimeout(() => this.stop(new Error(`Preview exceeded ${this.budgetMs / 1000} seconds. Reduce pattern detail or increase feature size, then try again.`)), this.budgetMs)
      this.pending = { id, resolve: resolve as (value: unknown) => void, reject, timer }
      try { this.worker.postMessage({ ...body, id }) } catch (e) { this.stop(e instanceof Error ? e : new Error(String(e))) }
    })
  }
  generate(input: TileGenerationInput) { return this.request<TileGenerationResult>({ type: 'generate', input }) }
  layout(input: LayoutInput) { return this.request<PreviewLayoutResult>({ type: 'layout', input }) }
}
