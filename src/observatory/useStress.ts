import { useState, useCallback, useRef } from 'react'
import type { StressResult } from './analyzeHealth'
import type { SerializableProps } from './resolveProps'
import { API_STRESS } from './constants'

export interface StressRun {
  running: boolean
  result: StressResult | null
  error: string | null
  props: SerializableProps
}

interface UseStressReturn {
  stressRun: StressRun | null
  runStress: (componentPath: string, props: SerializableProps) => void
  clearStress: () => void
}

export function useStress(): UseStressReturn {
  const [stressRun, setStressRun] = useState<StressRun | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const runStress = useCallback(
    (componentPath: string, props: SerializableProps) => {
      // Abort any in-flight request before starting a new one
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setStressRun({
        running: true,
        result: null,
        error: null,
        props,
      })

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
          if (!res.ok) {
            setStressRun((prev) =>
              prev
                ? {
                    ...prev,
                    running: false,
                    error: data.error ?? 'Unknown error',
                  }
                : null,
            )
            return
          }
          setStressRun((prev) =>
            prev ? { ...prev, running: false, result: data } : null,
          )
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setStressRun((prev) =>
            prev
              ? {
                  ...prev,
                  running: false,
                  error: err instanceof Error ? err.message : String(err),
                }
              : null,
          )
        })
    },
    [],
  )

  const clearStress = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStressRun(null)
  }, [])

  return { stressRun, runStress, clearStress }
}
