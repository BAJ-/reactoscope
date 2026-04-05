import type { Plugin } from 'vite'
import { schemaPlugin } from './schemaPlugin'
import { stressPlugin } from './stressPlugin'
import { aiPlugin } from './aiPlugin'

export interface ObservatoryOptions {
  /** Ollama API base URL (default: "http://localhost:11434") */
  ollamaUrl?: string
}

/**
 * Create the React Observatory Vite plugin array.
 *
 * Usage:
 * ```ts
 * import { observatory } from 'react-observatory'
 * export default defineConfig({
 *   plugins: [react(), ...observatory()]
 * })
 * ```
 */
export function observatory(options?: ObservatoryOptions): Plugin[] {
  void options // wired in Step 7
  return [schemaPlugin(), stressPlugin(), aiPlugin()]
}

export type { PropInfo } from '../shared/types'
