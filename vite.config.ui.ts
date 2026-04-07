import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Build config for the Observatory UI.
 * Produces a single JS + CSS bundle in dist/client/ that the plugin
 * serves via a virtual module at /__observatory.
 *
 * React is externalized — bare imports are resolved at runtime by
 * Vite's dev server from the host project's node_modules.
 */
export default defineConfig({
  root: '.',
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    lib: {
      entry: 'src/main.tsx',
      formats: ['es'],
      fileName: 'observatory-ui',
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-dom/client',
      ],
      output: {
        inlineDynamicImports: true,
      },
    },
  },
})
