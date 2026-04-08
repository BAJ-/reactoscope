import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export const aliases = {
  '@/components': resolve(__dirname, 'src/ui/components'),
  '@/shared': resolve(__dirname, 'src/shared'),
  '@/hooks': resolve(__dirname, 'src/ui/hooks'),
  '@/lib': resolve(__dirname, 'src/ui/lib'),
  '@/ui': resolve(__dirname, 'src/ui'),
}
