import { existsSync, readFileSync, statSync } from 'node:fs'
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

/** Inject a <base> tag so relative asset URLs resolve under /__observatory/. */
function injectBase(html: string): string {
  return html.replace('<head>', `<head><base href="${ROUTE_BASE}/">`)
}

/**
 * Vite plugin that serves the pre-built Observatory UI from dist/client/.
 *
 * Only activates when the pre-built client directory exists (i.e., when
 * reactoscope is installed as an npm package). During RO development,
 * the normal Vite dev server handles the UI directly from source.
 */
const VIRTUAL_RENDER_ID = 'virtual:observatory-render'
const RESOLVED_RENDER_ID = '\0' + VIRTUAL_RENDER_ID

export function uiPlugin(): Plugin {
  const selfDir = dirname(fileURLToPath(import.meta.url))
  // When built: dist/plugin.mjs → dist/client/ and dist/render/
  const clientDir = resolve(selfDir, 'client')
  const renderEntry = resolve(selfDir, 'render', 'entry.js')

  return {
    name: 'observatory-ui',
    resolveId(id) {
      if (id === VIRTUAL_RENDER_ID) return RESOLVED_RENDER_ID
    },
    load(id) {
      if (id === RESOLVED_RENDER_ID && existsSync(renderEntry)) {
        // Return the pre-built render entry. Vite will transform the
        // bare imports (react, react-dom) into optimized dep references.
        return readFileSync(renderEntry, 'utf-8')
      }
    },
    configureServer(server) {
      if (!existsSync(clientDir)) {
        // No pre-built UI — we're in RO dev mode, let Vite handle everything
        return
      }

      // Serve a virtual HTML page for the component iframe.
      // /?render=&component=... loads ComponentRenderer via Vite's pipeline.
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        const qs = url.indexOf('?')
        if (qs < 0) {
          next()
          return
        }
        const params = new URLSearchParams(url.slice(qs))
        if (!params.has('render')) {
          next()
          return
        }
        const html = `<!doctype html>
<html><head><meta charset="UTF-8" /></head>
<body><div id="root"></div>
<script type="module" src="/@id/__x00__${VIRTUAL_RENDER_ID}"></script>
</body></html>`
        server
          .transformIndexHtml(url, html)
          .then((transformed) => {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(transformed)
          })
          .catch(next)
        return
      })

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

        // Serve index.html for the base route (with <base> tag injected)
        if (assetPath === '/' || assetPath === '/index.html') {
          const indexPath = resolve(clientDir, 'index.html')
          if (existsSync(indexPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(injectBase(readFileSync(indexPath, 'utf-8')))
            return
          }
        }

        const filePath = resolve(clientDir, assetPath.slice(1))

        // Security: ensure resolved path is within clientDir
        if (!filePath.startsWith(clientDir)) {
          res.writeHead(403)
          res.end()
          return
        }

        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          // SPA fallback: serve index.html for non-asset paths
          const indexPath = resolve(clientDir, 'index.html')
          if (existsSync(indexPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(injectBase(readFileSync(indexPath, 'utf-8')))
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
