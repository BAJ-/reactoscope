import { resolve, relative, isAbsolute, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { API_STRESS } from '../shared/constants'
import { computeStats } from '../shared/stressStats'
import type { StressResult } from '../shared/analyzeHealth'
import { extractProps } from './schemaPlugin'
import { hydrateProps } from './hydrateProps'
import { findTsconfig } from './findTsconfig'
import { readBody, jsonResponse } from './httpUtils'
import type { RootRef } from './index'

interface StressRequest {
  component: string
  props: Record<string, unknown>
  iterations: number
  warmup?: number
}

/** Call V8's garbage collector if exposed via --expose-gc. */
function runGC(): void {
  if ('gc' in globalThis) {
    const gc = (globalThis as unknown as { gc: () => void }).gc
    // V8's GC is generational — multiple passes are needed to
    // reliably collect all unreachable objects.
    gc()
    gc()
    gc()
  }
}

async function handleStress(
  req: IncomingMessage,
  res: ServerResponse,
  server: ViteDevServer,
  rootRef: RootRef,
): Promise<void> {
  if (req.method !== 'POST') {
    jsonResponse(res, 405, { error: 'Method not allowed' })
    return
  }

  const raw = await readBody(req)
  let params: StressRequest
  try {
    params = JSON.parse(raw)
  } catch {
    jsonResponse(res, 400, { error: 'Invalid JSON body' })
    return
  }

  const { component, props, iterations, warmup = 0 } = params

  if (
    !component ||
    !props ||
    typeof props !== 'object' ||
    Array.isArray(props) ||
    typeof iterations !== 'number'
  ) {
    jsonResponse(res, 400, {
      error:
        'Required: component (string), props (object), iterations (number)',
    })
    return
  }

  if (iterations < 1 || iterations > 10_000) {
    jsonResponse(res, 400, {
      error: 'iterations must be between 1 and 10,000',
    })
    return
  }

  if (warmup < 0 || warmup > 1000) {
    jsonResponse(res, 400, { error: 'warmup must be between 0 and 1,000' })
    return
  }

  const absPath = resolve(rootRef.root, component)
  const rel = relative(rootRef.root, absPath)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    jsonResponse(res, 403, { error: 'Path outside project root' })
    return
  }

  try {
    const mod = await server.ssrLoadModule(component)
    const Component =
      mod.default ?? Object.values(mod).find((v) => typeof v === 'function')

    if (typeof Component !== 'function') {
      jsonResponse(res, 400, { error: 'No component export found' })
      return
    }

    // Load the rendering helper via SSR so React is resolved through
    // Vite's normal externalization (avoids CJS/ESM mismatch).
    const selfDir = dirname(fileURLToPath(import.meta.url))
    // In dev: selfDir is src/plugin/, stressRender.ts is a sibling.
    // As npm package: selfDir is dist/, stressRender.mjs is a sibling.
    const localPath = resolve(selfDir, 'stressRender.ts')
    const stressRenderPath = existsSync(localPath)
      ? localPath
      : resolve(selfDir, 'stressRender.mjs')
    const { render } = (await server.ssrLoadModule(stressRenderPath)) as {
      render: (comp: unknown, props: Record<string, unknown>) => string
    }

    // Hydrate function props so the component receives callable stubs
    const tsconfigPath = findTsconfig(rootRef.root)
    const propInfos = extractProps(absPath, tsconfigPath)
    const hydratedProps = hydrateProps(props, propInfos)

    try {
      // Warmup: render without measuring to let JIT settle
      for (let i = 0; i < warmup; i++) {
        render(Component, hydratedProps)
      }

      runGC()

      // ── Phase 1: Determinism + timing (use requested iteration count) ──
      const timings: number[] = []
      let firstOutput: string | null = null
      let mismatchedRenders = 0
      const outputLengths: number[] = []
      let firstOutputSize = 0

      for (let i = 0; i < iterations; i++) {
        const start = performance.now()
        const html = render(Component, hydratedProps)
        timings.push(performance.now() - start)

        const len = Buffer.byteLength(html, 'utf8')
        outputLengths.push(len)
        if (i === 0) {
          firstOutput = html
          firstOutputSize = len
        } else if (firstOutput !== null && html !== firstOutput) {
          mismatchedRenders++
        }
      }

      // ── Phase 2: Memory leak detection (multi-round) ──
      // Render in rounds of 500, measuring heap after each round.
      // If memory grows consistently across rounds, there's a leak.
      const gcAvailable = 'gc' in globalThis
      const rounds = 10
      const rendersPerRound = 500
      let heapPerRound: number[] | null = null

      if (gcAvailable) {
        heapPerRound = []

        // Baseline: GC and measure before any rounds
        runGC()
        heapPerRound.push(process.memoryUsage().heapUsed)

        for (let r = 0; r < rounds; r++) {
          for (let i = 0; i < rendersPerRound; i++) {
            render(Component, hydratedProps)
          }
          runGC()
          heapPerRound.push(process.memoryUsage().heapUsed)
        }
      }

      const result: StressResult = {
        iterations,
        totalRenders:
          iterations + (heapPerRound ? rounds * rendersPerRound : 0),
        warmup,
        timings: computeStats(timings),
        mismatchedRenders,
        outputLengths,
        outputByteSize: firstOutputSize,
        heapPerRound,
        rendersPerRound,
      }

      jsonResponse(res, 200, result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      jsonResponse(res, 500, { error: message })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    jsonResponse(res, 500, { error: message })
  }
}

export function stressPlugin(rootRef: RootRef): Plugin {
  return {
    name: 'observatory-stress',
    configureServer(server) {
      server.middlewares.use(API_STRESS, (req, res) => {
        handleStress(req, res, server, rootRef).catch((err) => {
          if (!res.headersSent) {
            jsonResponse(res, 500, { error: String(err) })
          }
        })
      })
    },
  }
}
