import { resolve, relative } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { API_STRESS } from '../constants'
import { computeStats } from '../stressStats'
import type { StressResult } from '../analyzeHealth'

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

const MAX_BODY_BYTES = 1_048_576 // 1 MB

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    let bytes = 0
    req.on('data', (chunk: Buffer | string) => {
      bytes +=
        typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length
      if (bytes > MAX_BODY_BYTES) {
        req.destroy()
        reject(new Error('Request body too large'))
        return
      }
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

async function handleStress(
  req: IncomingMessage,
  res: ServerResponse,
  server: ViteDevServer,
): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const raw = await readBody(req)
  let params: StressRequest
  try {
    params = JSON.parse(raw)
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid JSON body' }))
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
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        error:
          'Required: component (string), props (object), iterations (number)',
      }),
    )
    return
  }

  if (iterations < 1 || iterations > 10_000) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({ error: 'iterations must be between 1 and 10,000' }),
    )
    return
  }

  if (warmup < 0 || warmup > 1000) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'warmup must be between 0 and 1,000' }))
    return
  }

  const absPath = resolve(process.cwd(), component)
  const rel = relative(process.cwd(), absPath)
  if (rel.startsWith('..')) {
    res.writeHead(403, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Path outside project root' }))
    return
  }

  try {
    const mod = await server.ssrLoadModule(component)
    const Component =
      mod.default ?? Object.values(mod).find((v) => typeof v === 'function')

    if (typeof Component !== 'function') {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'No component export found' }))
      return
    }

    // Load the rendering helper via SSR so React is resolved through
    // Vite's normal externalization (avoids CJS/ESM mismatch).
    const { render } = (await server.ssrLoadModule(
      '/src/observatory/stressRender.ts',
    )) as { render: (comp: unknown, props: Record<string, unknown>) => string }

    try {
      // Warmup: render without measuring to let JIT settle
      for (let i = 0; i < warmup; i++) {
        render(Component, props)
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
        const html = render(Component, props)
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
            render(Component, props)
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

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: message }))
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: message }))
  }
}

export function stressPlugin(): Plugin {
  return {
    name: 'observatory-stress',
    configureServer(server) {
      server.middlewares.use(API_STRESS, (req, res) => {
        handleStress(req, res, server).catch((err) => {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: String(err) }))
          }
        })
      })
    },
  }
}
