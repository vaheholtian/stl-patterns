// Typed client for the geometry worker.
import type { RequestBody, Response, OpResult, VoronoiParams, TileParams, CheckResponse, OpResponse } from './protocol'
import type { TriMesh } from '../geom/manifold'

type Pending = { resolve: (r: Response) => void; reject: (e: Error) => void; onProgress?: (s: string) => void }

class GeomClient {
  private worker: Worker
  private nextId = 1
  private pending = new Map<number, Pending>()

  constructor() {
    this.worker = this.spawn()
  }

  private spawn(): Worker {
    const worker = new Worker(new URL('./geom.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (ev: MessageEvent<Response>) => {
      const msg = ev.data
      const p = this.pending.get(msg.id)
      if (!p) return
      if ('progress' in msg) { p.onProgress?.(msg.progress); return }
      this.pending.delete(msg.id)
      if (msg.ok) p.resolve(msg)
      else p.reject(new Error(msg.error))
    }
    worker.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error(e.message))
      this.pending.clear()
    }
    return worker
  }

  private send<T extends Response>(req: RequestBody, onProgress?: (s: string) => void): Promise<T> {
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (r: Response) => void, reject, onProgress })
      this.worker.postMessage({ ...req, id })
    })
  }

  async check(mesh: TriMesh): Promise<CheckResponse> {
    return this.send<CheckResponse>({ type: 'check', mesh })
  }

  async voronoi(mesh: TriMesh, region: Uint32Array, params: VoronoiParams, onProgress?: (s: string) => void): Promise<OpResult> {
    const r = await this.send<OpResponse>({ type: 'voronoi', mesh, region, params }, onProgress)
    return r.result
  }

  async tile(mesh: TriMesh, params: TileParams, onProgress?: (s: string) => void): Promise<OpResult> {
    const r = await this.send<OpResponse>({ type: 'tile', mesh, params }, onProgress)
    return r.result
  }

  /** Abort everything by restarting the worker. */
  restart() {
    this.worker.terminate()
    for (const p of this.pending.values()) p.reject(new Error('cancelled'))
    this.pending.clear()
    this.worker = this.spawn()
  }
}

let client: GeomClient | null = null
export function geomClient(): GeomClient {
  if (!client) client = new GeomClient()
  return client
}
