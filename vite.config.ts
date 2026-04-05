/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { schemaPlugin } from './src/observatory/plugins/schemaPlugin'
import { stressPlugin } from './src/observatory/plugins/stressPlugin'
import { aiPlugin } from './src/observatory/plugins/aiPlugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), schemaPlugin(), stressPlugin(), aiPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
