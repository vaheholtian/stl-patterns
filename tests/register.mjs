// Node's built-in TS stripping plus extension resolution for the app's Vite imports.
// No extra test runtime or dependency is needed (Node 24+).
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      for (const suffix of ['.ts', '/index.ts']) {
        const candidate = new URL(specifier + suffix, context.parentURL)
        if (existsSync(candidate)) return nextResolve(candidate.href, context)
      }
    }
    return nextResolve(specifier, context)
  },
})
