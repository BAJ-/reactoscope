#!/usr/bin/env node

import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

const componentPath = process.argv[2]

if (!componentPath) {
  console.error('Usage: react-observatory path/to/MyComponent.tsx')
  process.exit(1)
}

const cwd = process.cwd()
const abs = resolve(cwd, componentPath)

if (!existsSync(abs)) {
  console.error(`Error: File not found: ${abs}`)
  process.exit(1)
}

const rel = relative(cwd, abs)

if (rel.startsWith('..')) {
  console.error(
    'Error: Component must be inside the current working directory.',
  )
  process.exit(1)
}

const pkgRoot = resolve(fileURLToPath(import.meta.url), '../..')

// Dynamic import so this works whether the user installed the package
// or is running from the repo itself.
const { observatory } = await import(resolve(pkgRoot, 'dist/plugin.mjs'))

/** Check whether the user's Vite config already includes a React plugin. */
function hasReactPlugin(plugins) {
  const reactPluginNames = new Set([
    'vite:react-babel',
    'vite:react-swc',
    'vite:react-refresh',
  ])
  return plugins.some((p) => {
    if (Array.isArray(p)) return p.some((pp) => reactPluginNames.has(pp.name))
    return reactPluginNames.has(p.name)
  })
}

// Build the plugin list — always include observatory + tsconfigPaths,
// only add react() if the user's config doesn't already provide one.
const extraPlugins = [...observatory(), tsconfigPaths()]

const server = await createServer({
  root: cwd,
  plugins: [
    {
      name: 'observatory:inject',
      config(config) {
        const existing = config.plugins?.flat() ?? []
        if (!hasReactPlugin(existing)) {
          config.plugins = [react(), ...existing]
        }
      },
    },
    ...extraPlugins,
  ],
  server: {
    open: `/__observatory?component=${encodeURIComponent(rel)}`,
  },
})

await server.listen()
server.printUrls()
