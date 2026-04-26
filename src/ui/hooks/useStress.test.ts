import { type RefObject } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStress } from './useStress'
import {
  MSG_STRESS_START,
  MSG_STRESS_TIMING,
  MSG_STRESS_RESULT,
  MSG_STRESS_ERROR,
} from '@/shared/constants'
import type { StressResult } from '@/shared/analyzeHealth'

// jsdom default origin
const FAKE_ORIGIN = window.location.origin

function fakeStressResult(overrides?: Partial<StressResult>): StressResult {
  return {
    iterations: 100,
    totalRenders: 100,
    warmup: 10,
    timings: { min: 0.5, max: 2, mean: 1, median: 1, p95: 2, stddev: 0.1 },
    mismatchedRenders: 0,
    outputLengths: [100],
    outputByteSize: 100,
    heapPerRound: null,
    rendersPerRound: 100,
    ...overrides,
  }
}

function makeIframeRef(hasContentWindow = true) {
  const postMessage = vi.fn()
  const ref = {
    current: hasContentWindow
      ? ({ contentWindow: { postMessage } } as unknown as HTMLIFrameElement)
      : null,
  } as RefObject<HTMLIFrameElement | null>
  return { ref, postMessage }
}

function postFromIframe(data: Record<string, unknown>) {
  window.dispatchEvent(
    new MessageEvent('message', { origin: FAKE_ORIGIN, data }),
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useStress', () => {
  it('starts with idle state', () => {
    const { result } = renderHook(() => useStress())
    expect(result.current.stressRun.running).toBe(false)
    expect(result.current.stressRun.clientResult).toBeNull()
    expect(result.current.stressRun.error).toBeNull()
  })

  it('sets error when iframe is unavailable', () => {
    const { result } = renderHook(() => useStress())
    const { ref } = makeIframeRef(false)

    act(() => result.current.runStress('Foo.tsx', {}, ref))

    expect(result.current.stressRun.error).toBe('Iframe not available')
    expect(result.current.stressRun.running).toBe(false)
  })

  it('posts MSG_STRESS_START to iframe', () => {
    const { result } = renderHook(() => useStress())
    const { ref, postMessage } = makeIframeRef()

    act(() => result.current.runStress('Foo.tsx', { name: 'test' }, ref))

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MSG_STRESS_START,
        iterations: 100,
        warmup: 10,
      }),
      FAKE_ORIGIN,
    )
  })

  it('sets running=true after starting', () => {
    const { result } = renderHook(() => useStress())
    const { ref } = makeIframeRef()

    act(() => result.current.runStress('Foo.tsx', {}, ref))

    expect(result.current.stressRun.running).toBe(true)
  })

  it('handles timing results and starts memory phase', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(fakeStressResult()), { status: 200 }),
    )
    const { result } = renderHook(() => useStress())
    const { ref, postMessage } = makeIframeRef()

    act(() => result.current.runStress('Foo.tsx', { color: 'red' }, ref))
    const runId = postMessage.mock.calls[0][0].runId
    const timingResult = fakeStressResult()

    await act(async () =>
      postFromIframe({ type: MSG_STRESS_TIMING, runId, result: timingResult }),
    )

    expect(result.current.stressRun.running).toBe(false)
    expect(result.current.stressRun.clientResult).toEqual(timingResult)
    expect(result.current.stressRun.clientMemoryRunning).toBe(true)
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/stress')
    const body = JSON.parse(init!.body as string)
    expect(body).toEqual({
      component: 'Foo.tsx',
      props: { color: 'red' },
      iterations: 100,
      warmup: 10,
    })
  })

  it('handles full result with memory data', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(fakeStressResult()), { status: 200 }),
    )
    const { result } = renderHook(() => useStress())
    const { ref, postMessage } = makeIframeRef()

    act(() => result.current.runStress('Foo.tsx', {}, ref))
    const runId = postMessage.mock.calls[0][0].runId

    await act(async () =>
      postFromIframe({
        type: MSG_STRESS_TIMING,
        runId,
        result: fakeStressResult(),
      }),
    )

    const fullResult = fakeStressResult({ heapPerRound: [100, 200, 300] })
    await act(async () =>
      postFromIframe({ type: MSG_STRESS_RESULT, runId, result: fullResult }),
    )

    expect(result.current.stressRun.clientResult).toEqual(fullResult)
    expect(result.current.stressRun.clientMemoryRunning).toBe(false)
  })

  it('handles client error and still starts SSR', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(fakeStressResult()), { status: 200 }),
    )
    const { result } = renderHook(() => useStress())
    const { ref, postMessage } = makeIframeRef()

    act(() => result.current.runStress('Foo.tsx', {}, ref))
    const runId = postMessage.mock.calls[0][0].runId

    await act(async () =>
      postFromIframe({
        type: MSG_STRESS_ERROR,
        runId,
        error: 'Component threw',
      }),
    )

    expect(result.current.stressRun.running).toBe(false)
    expect(result.current.stressRun.error).toBe('Component threw')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('ignores messages from stale runs', () => {
    const { result } = renderHook(() => useStress())
    const { ref, postMessage } = makeIframeRef()

    act(() => result.current.runStress('Foo.tsx', {}, ref))
    const firstRunId = postMessage.mock.calls[0][0].runId

    // Start a second run which increments runId
    act(() => result.current.runStress('Foo.tsx', {}, ref))

    // Send a result from the first (stale) run
    act(() =>
      postFromIframe({
        type: MSG_STRESS_TIMING,
        runId: firstRunId,
        result: fakeStressResult(),
      }),
    )

    // Should still be in the running state from the second run
    expect(result.current.stressRun.running).toBe(true)
    expect(result.current.stressRun.clientResult).toBeNull()
  })

  it('ignores messages from wrong origin', () => {
    const { result } = renderHook(() => useStress())
    const { ref, postMessage } = makeIframeRef()

    act(() => result.current.runStress('Foo.tsx', {}, ref))
    const runId = postMessage.mock.calls[0][0].runId

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://evil.com',
          data: {
            type: MSG_STRESS_TIMING,
            runId,
            result: fakeStressResult(),
          },
        }),
      )
    })

    expect(result.current.stressRun.running).toBe(true)
    expect(result.current.stressRun.clientResult).toBeNull()
  })

  it('handles SSR failure', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Render failed' }), {
        status: 500,
      }),
    )
    const { result } = renderHook(() => useStress())
    const { ref, postMessage } = makeIframeRef()

    act(() => result.current.runStress('Foo.tsx', {}, ref))
    const runId = postMessage.mock.calls[0][0].runId

    // Trigger timing to start SSR
    await act(async () =>
      postFromIframe({
        type: MSG_STRESS_TIMING,
        runId,
        result: fakeStressResult(),
      }),
    )

    // Wait for fetch to resolve
    await vi.waitFor(() => {
      expect(result.current.stressRun.ssrRunning).toBe(false)
    })

    expect(result.current.stressRun.ssrError).toBe('Render failed')
  })

  it('handles SSR network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useStress())
    const { ref, postMessage } = makeIframeRef()

    act(() => result.current.runStress('Foo.tsx', {}, ref))
    const runId = postMessage.mock.calls[0][0].runId

    await act(async () =>
      postFromIframe({
        type: MSG_STRESS_TIMING,
        runId,
        result: fakeStressResult(),
      }),
    )

    await vi.waitFor(() => {
      expect(result.current.stressRun.ssrRunning).toBe(false)
    })

    expect(result.current.stressRun.ssrError).toBe('Network error')
  })

  it('cleans up on unmount', () => {
    const removeListenerSpy = vi.spyOn(window, 'removeEventListener')
    const { result, unmount } = renderHook(() => useStress())
    const { ref } = makeIframeRef()

    act(() => result.current.runStress('Foo.tsx', {}, ref))
    unmount()

    expect(
      removeListenerSpy.mock.calls.some(([type]) => type === 'message'),
    ).toBe(true)
  })

  it('aborts previous fetch when re-running', async () => {
    const abortSignals: AbortSignal[] = []
    vi.mocked(fetch).mockImplementation(
      (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.signal) abortSignals.push(init.signal)
        return new Promise(() => {})
      },
    )
    const { result } = renderHook(() => useStress())
    const { ref, postMessage } = makeIframeRef()

    act(() => result.current.runStress('Foo.tsx', {}, ref))
    const firstRunId = postMessage.mock.calls[0][0].runId

    await act(async () =>
      postFromIframe({
        type: MSG_STRESS_TIMING,
        runId: firstRunId,
        result: fakeStressResult(),
      }),
    )

    const firstSignal = abortSignals[0]
    expect(firstSignal?.aborted).toBe(false)

    // Start a second run — should abort the first
    act(() => result.current.runStress('Foo.tsx', {}, ref))

    expect(firstSignal?.aborted).toBe(true)
  })

  it('times out when no timing response arrives', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useStress())
    const { ref } = makeIframeRef()

    act(() => result.current.runStress('Foo.tsx', {}, ref))
    expect(result.current.stressRun.running).toBe(true)

    act(() => vi.advanceTimersByTime(30_000))

    expect(result.current.stressRun.running).toBe(false)
    expect(result.current.stressRun.error).toBe(
      'Client-side stress test timed out',
    )
  })

  it('memory timeout stops waiting for memory results', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(fakeStressResult()), { status: 200 }),
    )
    const { result } = renderHook(() => useStress())
    const { ref, postMessage } = makeIframeRef()

    act(() => result.current.runStress('Foo.tsx', {}, ref))
    const runId = postMessage.mock.calls[0][0].runId

    await act(async () =>
      postFromIframe({
        type: MSG_STRESS_TIMING,
        runId,
        result: fakeStressResult(),
      }),
    )

    expect(result.current.stressRun.clientMemoryRunning).toBe(true)

    await act(async () => vi.advanceTimersByTime(120_000))

    expect(result.current.stressRun.clientMemoryRunning).toBe(false)
  })
})
