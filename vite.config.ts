/// <reference types="vitest" />
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { observatory } from './src/plugin'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ...observatory()],
  resolve: {
    alias: {
      '@/components': resolve(__dirname, 'src/ui/components'),
      '@/shared': resolve(__dirname, 'src/shared'),
      '@/hooks': resolve(__dirname, 'src/ui/hooks'),
      '@/lib': resolve(__dirname, 'src/ui/lib'),
      '@/ui': resolve(__dirname, 'src/ui'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
