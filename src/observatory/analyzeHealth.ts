import type { TimingStats } from './stressStats'
import { computeTrend, linearSlope } from './stressStats'

/** Shape returned by the backend stress endpoint. */
export interface StressResult {
  iterations: number
  totalRenders: number
  warmup: number
  timings: TimingStats
  /** Number of renders whose HTML output differed from the first render. */
  mismatchedRenders: number
  /** Byte length of each render's HTML output. */
  outputLengths: number[]
  /** Byte length of the first render's output (representative size). */
  outputByteSize: number
  /** Heap usage measured after each round of renders. null if GC not available. */
  heapPerRound: number[] | null
  /** Number of renders in each memory-measurement round. */
  rendersPerRound: number
}

export type Severity = 'pass' | 'warn' | 'fail'

export interface Finding {
  id: string
  severity: Severity
  message: string
}

function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function analyzeHealth(result: StressResult): Finding[] {
  const findings: Finding[] = []

  // ── 1. Determinism ────────────────────────────
  if (result.mismatchedRenders > 0) {
    findings.push({
      id: 'determinism',
      severity: 'fail',
      message:
        `Output changed across renders with identical props — ` +
        `${result.mismatchedRenders} of ${result.iterations} renders differed from the first. ` +
        `This usually means the component mutates module-level state or uses ` +
        `non-deterministic values (Date.now, Math.random).`,
    })
  } else {
    findings.push({
      id: 'determinism',
      severity: 'pass',
      message:
        'Output is deterministic — identical props produce identical output every time.',
    })
  }

  // ── 2. Output growth ─────────────────────────
  if (result.outputLengths.length >= 10) {
    const lengthTrend = computeTrend(result.outputLengths)
    if (lengthTrend === 'increasing') {
      const first = result.outputLengths[0]
      const last = result.outputLengths[result.outputLengths.length - 1]
      const growth =
        first > 0 ? (((last - first) / first) * 100).toFixed(0) : '∞'
      findings.push({
        id: 'output-growth',
        severity: 'fail',
        message:
          `Output size grew ${growth}% over ${result.iterations} renders. ` +
          `The component accumulates content across renders — likely appending to ` +
          `a list or array that persists outside React's lifecycle.`,
      })
    } else {
      findings.push({
        id: 'output-growth',
        severity: 'pass',
        message: 'Output size is stable across renders.',
      })
    }
  }

  // ── 3. Memory leak detection ──────────────────
  // heapPerRound has N+1 entries: baseline + N round measurements.
  // Use linear regression to compute the growth rate (bytes per render).
  // This is far more robust than counting growing rounds, which is
  // easily thrown off by a single noisy measurement.
  if (result.heapPerRound && result.heapPerRound.length >= 4) {
    const heap = result.heapPerRound
    const n = heap.length

    const slope = linearSlope(heap)
    const bytesPerRender = slope / result.rendersPerRound

    // >50 bytes/render is a definite leak; >20 bytes/render is suspicious.
    // A single string push + array slot in V8 costs ~50-100 bytes,
    // so these thresholds catch real accumulation while ignoring GC noise.
    if (bytesPerRender > 50) {
      const totalRenders = result.rendersPerRound * (n - 1)
      const growthKB = ((heap[n - 1] - heap[0]) / 1024).toFixed(0)
      findings.push({
        id: 'memory-leak',
        severity: 'fail',
        message:
          `Memory grew by ${growthKB} KB across ${totalRenders} renders ` +
          `(~${bytesPerRender.toFixed(0)} bytes per render). ` +
          `The component likely retains references that prevent garbage collection — ` +
          `check for module-level arrays, caches, or closures that capture growing state.`,
      })
    } else if (bytesPerRender > 20) {
      const growthKB = ((heap[n - 1] - heap[0]) / 1024).toFixed(0)
      findings.push({
        id: 'memory-leak',
        severity: 'warn',
        message:
          `Memory grew by ${growthKB} KB across renders ` +
          `(~${bytesPerRender.toFixed(0)} bytes per render). ` +
          `This may indicate a slow leak — run again to confirm.`,
      })
    } else {
      findings.push({
        id: 'memory-leak',
        severity: 'pass',
        message: 'No memory growth detected across render rounds.',
      })
    }
  }

  // ── 4. Render speed ──────────────────────────
  const medianMs = result.timings.median
  if (medianMs >= 100) {
    findings.push({
      id: 'render-speed',
      severity: 'fail',
      message: `Median render time is ${formatMs(medianMs)} — this will cause visible delays.`,
    })
  } else if (medianMs >= 16) {
    findings.push({
      id: 'render-speed',
      severity: 'warn',
      message: `Median render time is ${formatMs(medianMs)} — may cause jank during rapid updates.`,
    })
  } else {
    findings.push({
      id: 'render-speed',
      severity: 'pass',
      message: `Renders in ${formatMs(medianMs)} — no speed concerns.`,
    })
  }

  // ── 5. Output size ───────────────────────────
  const bytes = result.outputByteSize
  if (bytes > 100_000) {
    findings.push({
      id: 'output-size',
      severity: 'fail',
      message:
        `Render output is ${formatBytes(bytes)}. A large DOM tree can slow down ` +
        `mounting and updates — consider splitting into smaller components or virtualizing lists.`,
    })
  } else if (bytes > 50_000) {
    findings.push({
      id: 'output-size',
      severity: 'warn',
      message:
        `Render output is ${formatBytes(bytes)} — on the larger side. ` +
        `Check whether all this DOM is necessary.`,
    })
  } else {
    findings.push({
      id: 'output-size',
      severity: 'pass',
      message: `Render output is ${formatBytes(bytes)} — no size concerns.`,
    })
  }

  return findings
}

/** The worst severity across all findings. */
export function worstSeverity(findings: Finding[]): Severity {
  if (findings.some((f) => f.severity === 'fail')) return 'fail'
  if (findings.some((f) => f.severity === 'warn')) return 'warn'
  return 'pass'
}
