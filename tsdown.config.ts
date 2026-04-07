import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    plugin: './src/plugin/index.ts',
    stressRender: './src/plugin/stressRender.ts',
  },
  outDir: './dist',
  format: 'esm',
  platform: 'node',
  target: 'node20',
  dts: { build: true },
  deps: {
    neverBundle: ['typescript', 'vite', 'react', 'react-dom'],
  },
})
