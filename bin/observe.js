#!/usr/bin/env node

const { resolve, relative } = await import('node:path')
const { fileURLToPath } = await import('node:url')
const { existsSync } = await import('node:fs')
const { createServer } = await import('vite')
const { default: react } = await import('@vitejs/plugin-react')

const componentPath = process.argv[2]

if (!componentPath) {
  console.error('Usage: reactoscope path/to/MyComponent.tsx')
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

const { observatory } = await import(resolve(pkgRoot, 'dist/plugin.mjs'))

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

const extraPlugins = [...observatory()]

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
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    open: `/__observatory?component=${encodeURIComponent(rel)}`,
  },
})

await server.listen()
server.printUrls()
