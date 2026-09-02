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

// https://vite.dev/config/
export default defineConfig({
  base: '/stl-patterns/',
  plugins: [react(), devSave()],
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
