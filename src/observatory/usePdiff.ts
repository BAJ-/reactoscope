import { useState, useCallback, useRef, useEffect } from 'react'
import type { Scenario } from './useScenarios'
import { compareSnapshots } from './pdiff'
import { captureIframe } from './captureIframe'
import { MSG_PROPS, MSG_RENDERED } from './constants'

export interface StepPairDiff {
  beforeUrl: string
  afterUrl: string
  diffUrl: string
  changedPixels: number
}

export interface PdiffRun {
  scenarioId: string
  pairs: StepPairDiff[]
  running: boolean
}

interface UsePdiffReturn {
  pdiffRun: PdiffRun | null
  runPdiff: (
    scenario: Scenario,
    iframe: HTMLIFrameElement,
    onComplete?: () => void,
  ) => void
  clearPdiff: () => void
}

function imageDataToDataUrl(imageData: ImageData): string {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL()
}

export function usePdiff(): UsePdiffReturn {
  const [pdiffRun, setPdiffRun] = useState<PdiffRun | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Clean up on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const runPdiff = useCallback(
    (
      scenario: Scenario,
      iframe: HTMLIFrameElement,
      onComplete?: () => void,
    ) => {
      if (scenario.steps.length < 2) return

      abortControllerRef.current?.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller
      const { signal } = controller
      setPdiffRun({ scenarioId: scenario.id, pairs: [], running: true })

      const steps = scenario.steps

      async function run() {
        try {
          const snapshots: { imageData: ImageData; dataUrl: string }[] = []

          for (let i = 0; i < steps.length; i++) {
            if (signal.aborted) return

            // Send props to iframe
            iframe.contentWindow?.postMessage(
              { type: MSG_PROPS, props: steps[i].props },
              window.location.origin,
            )

            // Wait for rendered signal (cleaned up on abort)
            await new Promise<void>((resolve, reject) => {
              function handler(e: MessageEvent) {
                if (
                  e.source === iframe.contentWindow &&
                  e.origin === window.location.origin &&
                  e.data?.type === MSG_RENDERED
                ) {
                  cleanup()
                  resolve()
                }
              }

              function onAbort() {
                cleanup()
                reject(new DOMException('Aborted', 'AbortError'))
              }

              function cleanup() {
                window.removeEventListener('message', handler)
                signal.removeEventListener('abort', onAbort)
              }

              window.addEventListener('message', handler)
              signal.addEventListener('abort', onAbort)
            })

            // Extra frame to ensure paint is flushed
            await new Promise((r) => requestAnimationFrame(r))

            if (signal.aborted) return

            const imageData = await captureIframe(iframe)
            snapshots.push({
              imageData,
              dataUrl: imageDataToDataUrl(imageData),
            })
          }

          if (signal.aborted) return

          // Compare adjacent pairs — convert to dataUrls and discard ImageData
          const pairs: StepPairDiff[] = []
          for (let i = 0; i < snapshots.length - 1; i++) {
            const diff = compareSnapshots(
              snapshots[i].imageData,
              snapshots[i + 1].imageData,
            )
            pairs.push({
              beforeUrl: snapshots[i].dataUrl,
              afterUrl: snapshots[i + 1].dataUrl,
              diffUrl: imageDataToDataUrl(diff.diff),
              changedPixels: diff.changedPixels,
            })
          }

          setPdiffRun((prev) =>
            prev ? { ...prev, pairs, running: false } : null,
          )
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setPdiffRun((prev) => (prev ? { ...prev, running: false } : null))
        } finally {
          onComplete?.()
        }
      }

      run()
    },
    [],
  )

  const clearPdiff = useCallback(() => {
    abortControllerRef.current?.abort()
    setPdiffRun(null)
  }, [])

  return { pdiffRun, runPdiff, clearPdiff }
}
