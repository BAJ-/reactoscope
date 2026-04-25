import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { runClientStressTest } from './stressRunner'

function StaticDiv() {
  return createElement('div', null, 'hello')
}

function CounterDisplay({ count }: { count: number }) {
  return createElement('span', null, `Count: ${count}`)
}

let callCount = 0
function NonDeterministic() {
  callCount++
  return createElement('p', null, `render-${callCount}`)
}

describe('runClientStressTest', () => {
  it('returns the correct number of iterations and warmup', async () => {
    const result = await runClientStressTest({
      Component: StaticDiv,
      props: {},
      iterations: 5,
      warmup: 2,
    })

    expect(result.iterations).toBe(5)
    expect(result.warmup).toBe(2)
    expect(result.totalRenders).toBe(5)
  })

  it('collects timing stats for each iteration', async () => {
    const result = await runClientStressTest({
      Component: StaticDiv,
      props: {},
      iterations: 10,
      warmup: 0,
    })

    expect(result.timings.min).toBeGreaterThanOrEqual(0)
    expect(result.timings.max).toBeGreaterThanOrEqual(result.timings.min)
    expect(result.timings.mean).toBeGreaterThanOrEqual(0)
    expect(result.timings.median).toBeGreaterThanOrEqual(0)
  })

  it('reports zero mismatches for a deterministic component', async () => {
    const result = await runClientStressTest({
      Component: StaticDiv,
      props: {},
      iterations: 10,
      warmup: 0,
    })

    expect(result.mismatchedRenders).toBe(0)
  })

  it('detects non-deterministic output', async () => {
    callCount = 0
    const result = await runClientStressTest({
      Component: NonDeterministic,
      props: {},
      iterations: 5,
      warmup: 0,
    })

    // First render produces "render-1", subsequent renders produce different output
    expect(result.mismatchedRenders).toBeGreaterThan(0)
  })

  it('records output lengths for each iteration', async () => {
    const result = await runClientStressTest({
      Component: StaticDiv,
      props: {},
      iterations: 3,
      warmup: 0,
    })

    expect(result.outputLengths).toHaveLength(3)
    // All lengths should be identical for a deterministic component
    expect(new Set(result.outputLengths).size).toBe(1)
    expect(result.outputLengths[0]).toBeGreaterThan(0)
  })

  it('sets outputByteSize from the first render', async () => {
    const result = await runClientStressTest({
      Component: StaticDiv,
      props: {},
      iterations: 3,
      warmup: 0,
    })

    expect(result.outputByteSize).toBe(result.outputLengths[0])
  })

  it('passes props to the component', async () => {
    const result = await runClientStressTest({
      Component: CounterDisplay as unknown as React.ComponentType<
        Record<string, unknown>
      >,
      props: { count: 42 },
      iterations: 1,
      warmup: 0,
    })

    // Output should contain Count: 42, so outputByteSize > 0
    expect(result.outputByteSize).toBeGreaterThan(0)
    expect(result.mismatchedRenders).toBe(0)
  })

  it('does not leave detached containers in the DOM', async () => {
    const before = document.body.children.length

    await runClientStressTest({
      Component: StaticDiv,
      props: {},
      iterations: 3,
      warmup: 1,
    })

    expect(document.body.children.length).toBe(before)
  })

  it('cleans up detached container when component throws during render', async () => {
    const before = document.body.children.length

    // Suppress React 19 dev-mode uncaught exception re-throws and
    // console warnings that pollute test output.
    const suppress = (e: ErrorEvent) => {
      if (e.error?.message === 'render boom') e.preventDefault()
    }
    window.addEventListener('error', suppress)
    const origWarn = console.warn
    const origError = console.error
    console.warn = () => {}
    console.error = () => {}

    function Throws() {
      throw new Error('render boom')
    }

    // React catches render errors internally in flushSync, so the promise
    // may resolve with empty output rather than rejecting. Either way,
    // the container must be cleaned up.
    try {
      await runClientStressTest({
        Component: Throws as unknown as React.ComponentType<
          Record<string, unknown>
        >,
        props: {},
        iterations: 3,
        warmup: 0,
      })
    } catch {
      // expected — error may or may not propagate
    } finally {
      console.warn = origWarn
      console.error = origError
      window.removeEventListener('error', suppress)
    }

    expect(document.body.children.length).toBe(before)
  })

  it('measures outputByteSize using byte length, not string length', async () => {
    function UnicodeDiv() {
      // "café" — the é is 2 bytes in UTF-8 but 1 code unit in JS
      return createElement('div', null, 'café')
    }

    const result = await runClientStressTest({
      Component: UnicodeDiv,
      props: {},
      iterations: 1,
      warmup: 0,
    })

    // UTF-8 byte length should be greater than JS string length for non-ASCII
    const html = '<div>café</div>'
    const expectedBytes = new TextEncoder().encode(html).byteLength
    expect(result.outputByteSize).toBe(expectedBytes)
    expect(result.outputByteSize).toBeGreaterThan(html.length)
  })

  it('sets heapPerRound to null when memory API unavailable', async () => {
    const result = await runClientStressTest({
      Component: StaticDiv,
      props: {},
      iterations: 3,
      warmup: 0,
    })

    expect(result.heapPerRound).toBeNull()
  })

  it('handles warmup without affecting measured results', async () => {
    callCount = 0
    const withWarmup = await runClientStressTest({
      Component: StaticDiv,
      props: {},
      iterations: 5,
      warmup: 10,
    })

    // Warmup renders should not be counted in iterations or timings
    expect(withWarmup.iterations).toBe(5)
    expect(withWarmup.outputLengths).toHaveLength(5)
  })

  it('calls onTimingComplete with timing results before memory phase', async () => {
    let timingResult: Awaited<ReturnType<typeof runClientStressTest>> | null =
      null

    const fullResult = await runClientStressTest({
      Component: StaticDiv,
      props: {},
      iterations: 5,
      warmup: 1,
      onTimingComplete: (result) => {
        timingResult = result
      },
    })

    // Timing callback must have fired
    expect(timingResult).not.toBeNull()
    expect(timingResult!.iterations).toBe(5)
    expect(timingResult!.warmup).toBe(1)
    expect(timingResult!.totalRenders).toBe(5)
    expect(timingResult!.timings.mean).toBeGreaterThanOrEqual(0)
    expect(timingResult!.heapPerRound).toBeNull()

    // Full result should also be valid
    expect(fullResult.iterations).toBe(5)
  })
})
