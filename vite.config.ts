/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { observatory } from './src/plugin'
import { aliases } from './vite.aliases'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ...observatory()],
  resolve: {
    alias: aliases,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
