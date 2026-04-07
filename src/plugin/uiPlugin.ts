import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const ROUTE_BASE = '/__observatory'

const VIRTUAL_RENDER_ID = 'virtual:observatory-render'
const RESOLVED_RENDER_ID = '\0' + VIRTUAL_RENDER_ID

const VIRTUAL_UI_ID = 'virtual:observatory-ui'
const RESOLVED_UI_ID = '\0' + VIRTUAL_UI_ID

const VIRTUAL_UI_CSS_ID = 'virtual:observatory-ui.css'
const RESOLVED_UI_CSS_ID = '\0' + VIRTUAL_UI_CSS_ID

export function uiPlugin(): Plugin {
  const selfDir = dirname(fileURLToPath(import.meta.url))
  const renderEntry = resolve(selfDir, 'render', 'entry.js')
  const uiEntry = resolve(selfDir, 'client', 'observatory-ui.js')
  const uiCss = resolve(selfDir, 'client', 'observatory-ui.css')

  return {
    name: 'observatory-ui',
    resolveId(id) {
      if (id === VIRTUAL_RENDER_ID) return RESOLVED_RENDER_ID
      if (id === VIRTUAL_UI_ID) return RESOLVED_UI_ID
      if (id === VIRTUAL_UI_CSS_ID) return RESOLVED_UI_CSS_ID
    },
    load(id) {
      if (id === RESOLVED_RENDER_ID && existsSync(renderEntry)) {
        return readFileSync(renderEntry, 'utf-8')
      }
      if (id === RESOLVED_UI_ID && existsSync(uiEntry)) {
        return readFileSync(uiEntry, 'utf-8')
      }
      if (id === RESOLVED_UI_CSS_ID && existsSync(uiCss)) {
        return readFileSync(uiCss, 'utf-8')
      }
    },
    configureServer(server) {
      if (!existsSync(uiEntry)) {
        // No pre-built UI — we're in dev mode, let Vite handle everything
        return
      }

      // Serve a virtual HTML page for the component iframe.
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith(ROUTE_BASE)) {
          next()
          return
        }
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

      // Serve the Observatory UI at /__observatory
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''

        if (!url.startsWith(ROUTE_BASE)) {
          next()
          return
        }

        // Strip the route base and query string
        let assetPath = url.slice(ROUTE_BASE.length) || '/'
        const queryIndex = assetPath.indexOf('?')
        if (queryIndex >= 0) {
          assetPath = assetPath.slice(0, queryIndex)
        }

        // Serve the UI HTML for the base route
        if (assetPath === '/' || assetPath === '/index.html') {
          const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reactoscope</title>
  <link rel="stylesheet" href="/@id/__x00__${VIRTUAL_UI_CSS_ID}" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/@id/__x00__${VIRTUAL_UI_ID}"></script>
</body>
</html>`
          server
            .transformIndexHtml(url, html)
            .then((transformed) => {
              res.writeHead(200, { 'Content-Type': 'text/html' })
              res.end(transformed)
            })
            .catch(next)
          return
        }

        next()
      })
    },
  }
}
