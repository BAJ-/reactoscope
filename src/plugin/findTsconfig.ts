import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

/**
 * Find the best tsconfig to use for TypeScript analysis.
 * Prefers `tsconfig.app.json` (Vite convention), falls back to `tsconfig.json`.
 */
export function findTsconfig(root: string): string {
  const app = resolve(root, 'tsconfig.app.json')
  if (existsSync(app)) return app

  const base = resolve(root, 'tsconfig.json')
  if (existsSync(base)) return base

  return app // fall back to app path so the error message is clear
}
