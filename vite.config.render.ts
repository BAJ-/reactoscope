import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { aliases } from './vite.aliases'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: aliases,
  },
  build: {
    outDir: 'dist/render',
    emptyOutDir: true,
    lib: {
      entry: 'src/renderEntry.tsx',
      formats: ['es'],
      fileName: 'entry',
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-dom/client',
      ],
    },
  },
})
