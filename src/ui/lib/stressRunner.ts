import { createElement, Profiler, type ProfilerOnRenderCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { computeStats, linearSlope } from '@/shared/stressStats'
import type { StressResult } from '@/shared/analyzeHealth'

interface StressRunnerOptions {
  Component: React.ComponentType<Record<string, unknown>>
  props: Record<string, unknown>
  iterations: number
  warmup: number
  onTimingComplete?: (result: StressResult) => void
}

async function measureMemory(): Promise<number | null> {
  if (
    typeof performance !== 'undefined' &&
    'measureUserAgentSpecificMemory' in performance
  ) {
    try {
      const result = await (
        performance as Performance & {
          measureUserAgentSpecificMemory: () => Promise<{ bytes: number }>
        }
      ).measureUserAgentSpecificMemory()
      return result.bytes
    } catch {
      return null
    }
  }
  return null
}

export async function runClientStressTest({
  Component,
  props,
  iterations,
  warmup,
  onTimingComplete,
}: StressRunnerOptions): Promise<StressResult> {
  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.left = '-9999px'
  container.style.visibility = 'hidden'
  document.body.appendChild(container)

  const encoder = new TextEncoder()
  const timings: number[] = []
  let lastActualDuration = 0

  const onRender: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
    lastActualDuration = actualDuration
  }

  const root = createRoot(container)
  let measuredRoot: ReturnType<typeof createRoot> | null = null

  try {
    for (let i = 0; i < warmup; i++) {
      flushSync(() => {
        root.render(
          createElement(
            Profiler,
            { id: 'stress', onRender },
            createElement(Component, props),
          ),
        )
      })
    }

    flushSync(() => {
      root.unmount()
    })

    measuredRoot = createRoot(container)
    const mRoot = measuredRoot
    let firstOutput: string | null = null
    let mismatchedRenders = 0
    const outputLengths: number[] = []

    // ── Determinism + timing ──
    for (let i = 0; i < iterations; i++) {
      flushSync(() => {
        mRoot.render(
          createElement(
            Profiler,
            { id: 'stress', onRender },
            createElement(Component, props),
          ),
        )
      })

      timings.push(lastActualDuration)

      const html = container.innerHTML
      const byteLen = encoder.encode(html).byteLength
      outputLengths.push(byteLen)

      if (i === 0) {
        firstOutput = html
      } else if (html !== firstOutput) {
        mismatchedRenders++
      }
    }

    const rendersPerRound = 100
    const outputByteSize = firstOutput
      ? encoder.encode(firstOutput).byteLength
      : 0
    const timingResult: StressResult = {
      iterations,
      totalRenders: iterations,
      warmup,
      timings: computeStats(timings),
      mismatchedRenders,
      outputLengths,
      outputByteSize,
      heapPerRound: null,
      rendersPerRound,
    }
    onTimingComplete?.(timingResult)

    // ── Memory leak detection ──
    const maxRounds = 10
    const minRounds = 3
    let heapPerRound: number[] | null = null

    const baseline = await measureMemory()
    if (baseline !== null) {
      heapPerRound = [baseline]

      for (let r = 0; r < maxRounds; r++) {
        for (let i = 0; i < rendersPerRound; i++) {
          flushSync(() => {
            mRoot.render(createElement(Component, props))
          })
        }
        const heap = await measureMemory()
        if (heap === null) {
          heapPerRound = null
          break
        }
        heapPerRound.push(heap)

        if (heapPerRound.length >= minRounds + 1) {
          const slope = linearSlope(heapPerRound)
          const bytesPerRender = slope / rendersPerRound
          if (bytesPerRender > 50 || bytesPerRender < 5) break
        }
      }
    }

    const totalRenders =
      iterations +
      (heapPerRound ? (heapPerRound.length - 1) * rendersPerRound : 0)

    return {
      iterations,
      totalRenders,
      warmup,
      timings: computeStats(timings),
      mismatchedRenders,
      outputLengths,
      outputByteSize,
      heapPerRound,
      rendersPerRound,
    }
  } finally {
    try {
      flushSync(() => {
        ;(measuredRoot ?? root).unmount()
      })
    } catch {
      // unmount may throw if root was never rendered
    }
    container.remove()
  }
}
