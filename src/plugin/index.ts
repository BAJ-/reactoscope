import type { Plugin, ResolvedConfig } from 'vite'
import { schemaPlugin } from './schemaPlugin'
import { stressPlugin } from './stressPlugin'
import { aiPlugin } from './aiPlugin'
import { uiPlugin } from './uiPlugin'

export interface ObservatoryOptions {
  /** Ollama API base URL (default: "http://localhost:11434") */
  ollamaUrl?: string
}

/** Mutable ref so configResolved can set root after plugin creation. */
export interface RootRef {
  root: string
}

/**
 * Create the React Observatory Vite plugin array.
 *
 * Usage:
 * ```ts
 * import { observatory } from 'reactoscope'
 * export default defineConfig({
 *   plugins: [react(), ...observatory()]
 * })
 * ```
 */
export function observatory(options?: ObservatoryOptions): Plugin[] {
  const rootRef: RootRef = { root: process.cwd() }
  const ollamaUrl = options?.ollamaUrl ?? 'http://localhost:11434'

  const rootPlugin: Plugin = {
    name: 'observatory:root',
    configResolved(config: ResolvedConfig) {
      rootRef.root = config.root
    },
  }

  return [
    rootPlugin,
    uiPlugin(),
    schemaPlugin(rootRef),
    stressPlugin(rootRef),
    aiPlugin(ollamaUrl, rootRef),
  ]
}

export type { PropInfo } from '../shared/types'
