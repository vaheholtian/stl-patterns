import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  base: '/stl-patterns/',
  plugins: [react()],
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
