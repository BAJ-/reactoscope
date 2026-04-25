import { useState, useCallback, useRef, useEffect } from 'react'
import type { StressResult } from '@/shared/analyzeHealth'
import type { SerializableProps } from '@/lib/resolveProps'
import {
  API_STRESS,
  MSG_STRESS_START,
  MSG_STRESS_TIMING,
  MSG_STRESS_RESULT,
  MSG_STRESS_ERROR,
} from '@/shared/constants'

export interface StressRun {
  running: boolean
  clientResult: StressResult | null
  clientMemoryRunning: boolean
  ssrResult: StressResult | null
  ssrRunning: boolean
  error: string | null
  ssrError: string | null
  props: SerializableProps | null
}

interface UseStressReturn {
  stressRun: StressRun
  runStress: (
    componentPath: string,
    props: SerializableProps,
    iframeRef: React.RefObject<HTMLIFrameElement | null>,
  ) => void
}

const TIMING_TIMEOUT = 30_000
const MEMORY_TIMEOUT = 120_000

let nextRunId = 0

export function useStress(): UseStressReturn {
  const [stressRun, setStressRun] = useState<StressRun>({
    running: false,
    clientResult: null,
    clientMemoryRunning: false,
    ssrResult: null,
    ssrRunning: false,
    error: null,
    ssrError: null,
    props: null,
  })
  const abortRef = useRef<AbortController | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const runStress = useCallback(
    (
      componentPath: string,
      props: SerializableProps,
      iframeRef: React.RefObject<HTMLIFrameElement | null>,
    ) => {
      abortRef.current?.abort()
      cleanupRef.current?.()
      const controller = new AbortController()
      abortRef.current = controller

      const runId = ++nextRunId

      const iframe = iframeRef.current
      if (!iframe?.contentWindow) {
        setStressRun({
          running: false,
          clientResult: null,
          clientMemoryRunning: false,
          ssrResult: null,
          ssrRunning: false,
          error: 'Iframe not available',
          ssrError: null,
          props,
        })
        return
      }

      setStressRun({
        running: true,
        clientResult: null,
        clientMemoryRunning: false,
        ssrResult: null,
        ssrRunning: false,
        error: null,
        ssrError: null,
        props,
      })

      let timingTimer: ReturnType<typeof setTimeout> | null = null
      let memoryTimer: ReturnType<typeof setTimeout> | null = null
      let ssrStarted = false

      function startSSR() {
        if (ssrStarted || controller.signal.aborted) return
        ssrStarted = true

        setStressRun((prev) => ({ ...prev, ssrRunning: true }))

        fetch(API_STRESS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            component: componentPath,
            props,
            iterations: 100,
            warmup: 10,
          }),
          signal: controller.signal,
        })
          .then(async (res) => {
            const data = await res.json()
            if (controller.signal.aborted) return
            if (!res.ok) {
              setStressRun((prev) => ({
                ...prev,
                ssrRunning: false,
                ssrError: data.error ?? 'SSR stress test failed',
              }))
              return
            }
            setStressRun((prev) => ({
              ...prev,
              ssrRunning: false,
              ssrResult: data,
            }))
          })
          .catch((err) => {
            if (err instanceof DOMException && err.name === 'AbortError') return
            if (controller.signal.aborted) return
            setStressRun((prev) => ({
              ...prev,
              ssrRunning: false,
              ssrError: err instanceof Error ? err.message : String(err),
            }))
          })
      }

      function handler(e: MessageEvent) {
        if (e.origin !== window.location.origin) return
        if (controller.signal.aborted) return
        if (e.data?.runId !== runId) return

        if (e.data?.type === MSG_STRESS_TIMING) {
          if (timingTimer) clearTimeout(timingTimer)
          setStressRun((prev) => ({
            ...prev,
            running: false,
            clientResult: e.data.result,
            clientMemoryRunning: true,
          }))

          startSSR()

          memoryTimer = setTimeout(() => {
            setStressRun((prev) => ({ ...prev, clientMemoryRunning: false }))
            cleanup()
          }, MEMORY_TIMEOUT)
        }

        if (e.data?.type === MSG_STRESS_RESULT) {
          if (memoryTimer) clearTimeout(memoryTimer)
          setStressRun((prev) => ({
            ...prev,
            clientResult: e.data.result,
            clientMemoryRunning: false,
          }))
          cleanup()
        }

        if (e.data?.type === MSG_STRESS_ERROR) {
          if (timingTimer) clearTimeout(timingTimer)
          if (memoryTimer) clearTimeout(memoryTimer)
          setStressRun((prev) => ({
            ...prev,
            running: false,
            clientMemoryRunning: false,
            error: e.data.error ?? 'Client-side stress test failed',
          }))
          startSSR()
          cleanup()
        }
      }

      function cleanup() {
        window.removeEventListener('message', handler)
        if (timingTimer) clearTimeout(timingTimer)
        if (memoryTimer) clearTimeout(memoryTimer)
        cleanupRef.current = null
      }

      cleanupRef.current = cleanup
      window.addEventListener('message', handler)

      timingTimer = setTimeout(() => {
        if (controller.signal.aborted) return
        cleanup()
        setStressRun((prev) => ({
          ...prev,
          running: false,
          error: 'Client-side stress test timed out',
        }))
      }, TIMING_TIMEOUT)

      iframe.contentWindow.postMessage(
        { type: MSG_STRESS_START, runId, iterations: 100, warmup: 10 },
        window.location.origin,
      )
    },
    [],
  )

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      cleanupRef.current?.()
    }
  }, [])

  return { stressRun, runStress }
}
