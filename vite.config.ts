import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, basename } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

/** Dev only: POST /__save?name=file.ext writes the body to ./exports/ (for automated testing). */
function devSave(): Plugin {
  return {
    name: 'dev-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        const url = new URL(req.url ?? '', 'http://x')
        const name = basename(url.searchParams.get('name') ?? 'export.bin')
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          mkdirSync(resolve(__dirname, 'exports'), { recursive: true })
          const out = resolve(__dirname, 'exports', name)
          writeFileSync(out, Buffer.concat(chunks))
          res.setHeader('content-type', 'text/plain')
          res.end(out)
        })
      })
    },
  }
}

/**
 * Emits a service worker that precaches the built app so the Pattern screen
 * works offline once installed. The file list comes from the bundle, so it is
 * always in step with the build; `public/` files are listed by hand.
 */
function pwa(): Plugin {
  const publicFiles = [
    'manifest.webmanifest',
    'favicon.svg',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/maskable-512.png',
    'icons/apple-touch-icon.png',
  ]
  let base = '/'
  return {
    name: 'pwa-sw',
    apply: 'build',
    configResolved(config) { base = config.base },
    generateBundle(_options, bundle) {
      const files = [base, ...Object.keys(bundle).map((f) => base + f), ...publicFiles.map((f) => base + f)]
      // cache name changes whenever the file list does, which retires old caches
      let hash = 0
      for (const c of files.join('|')) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) | 0
      const source = swTemplate
        .replace('__CACHE__', `stl-patterns-${(hash >>> 0).toString(36)}`)
        .replace('__FILES__', JSON.stringify(files))
        .replace('__INDEX__', JSON.stringify(base))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

const swTemplate = `// Generated at build time by the pwa() plugin in vite.config.ts. Do not edit.
const CACHE = '__CACHE__'
const PRECACHE = __FILES__
const INDEX = __INDEX__

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    // allSettled: one missing file must not fail the whole install
    await Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' }))))
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k.startsWith('stl-patterns-') && k !== CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

// the page asks the waiting worker to take over when the user accepts an update
self.addEventListener('message', (event) => { if (event.data === 'skip-waiting') self.skipWaiting() })

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  if (new URL(req.url).origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    // network first so a deployed update is picked up, cached shell offline
    event.respondWith((async () => {
      try { return await fetch(req) } catch { return (await caches.match(INDEX)) ?? Response.error() }
    })())
    return
  }
  // hashed assets: cache first, and keep anything new we fetch
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true })
    if (hit) return hit
    const res = await fetch(req)
    if (res.ok && res.type === 'basic') (await caches.open(CACHE)).put(req, res.clone())
    return res
  })())
})
`

// https://vite.dev/config/
export default defineConfig({
  base: '/stl-patterns/',
  plugins: [react(), devSave(), pwa()],
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // WASM packages are loaded at runtime; pre-bundling breaks their locateFile logic.
    exclude: ['manifold-3d', 'xatlas-three', 'xatlasjs'],
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
})
