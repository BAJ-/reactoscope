import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const ROUTE_BASE = '/__observatory'

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

/**
 * Vite plugin that serves the pre-built Observatory UI from dist/client/.
 *
 * Only activates when the pre-built client directory exists (i.e., when
 * react-observatory is installed as an npm package). During RO development,
 * the normal Vite dev server handles the UI directly from source.
 */
export function uiPlugin(): Plugin {
  const selfDir = dirname(fileURLToPath(import.meta.url))
  // When built: dist/plugin.mjs → resolve dist/client/
  // When running from source: src/plugin/ → resolve ../../dist/client/
  const clientDir = resolve(selfDir, 'client')

  return {
    name: 'observatory-ui',
    configureServer(server) {
      if (!existsSync(clientDir)) {
        // No pre-built UI — we're in RO dev mode, let Vite handle everything
        return
      }

      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''

        if (!url.startsWith(ROUTE_BASE)) {
          next()
          return
        }

        // Strip the route base to get the asset path
        let assetPath = url.slice(ROUTE_BASE.length) || '/index.html'

        // Strip query strings (e.g. ?component=...)
        const queryIndex = assetPath.indexOf('?')
        if (queryIndex >= 0) {
          assetPath = assetPath.slice(0, queryIndex)
        }

        // Serve index.html for the base route
        if (assetPath === '/' || assetPath === '/index.html') {
          assetPath = '/index.html'
        }

        const filePath = resolve(clientDir, assetPath.slice(1))

        // Security: ensure resolved path is within clientDir
        if (!filePath.startsWith(clientDir)) {
          res.writeHead(403)
          res.end()
          return
        }

        if (!existsSync(filePath)) {
          // SPA fallback: serve index.html for non-asset paths
          const indexPath = resolve(clientDir, 'index.html')
          if (existsSync(indexPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(readFileSync(indexPath, 'utf-8'))
            return
          }
          res.writeHead(404)
          res.end()
          return
        }

        const ext = extname(filePath)
        const contentType = CONTENT_TYPES[ext] || 'application/octet-stream'

        res.writeHead(200, { 'Content-Type': contentType })
        res.end(readFileSync(filePath))
      })
    },
  }
}
