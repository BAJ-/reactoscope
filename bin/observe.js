#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const componentPath = process.argv[2]

if (!componentPath) {
  console.error('Usage: observe path/to/MyComponent.tsx')
  process.exit(1)
}

const projectRoot = resolve(fileURLToPath(import.meta.url), '../..')
const abs = resolve(componentPath)

// Make it relative to project root so we don't leak absolute paths
const rel = relative(projectRoot, abs)

if (rel.startsWith('..')) {
  console.error('Error: Component must be inside the project directory.')
  process.exit(1)
}

const viteBin = resolve(projectRoot, 'node_modules/.bin/vite')

// spawn avoids shell injection — no shell is involved
const existingNodeOptions = process.env.NODE_OPTIONS ?? ''
const child = spawn(
  viteBin,
  ['--open', `/?component=${encodeURIComponent(rel)}`],
  {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: `${existingNodeOptions} --expose-gc`.trim(),
    },
  },
)

child.on('exit', (code) => process.exit(code ?? 0))
