/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { schemaPlugin } from './src/plugin/schemaPlugin'
import { stressPlugin } from './src/plugin/stressPlugin'
import { aiPlugin } from './src/plugin/aiPlugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), schemaPlugin(), stressPlugin(), aiPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
