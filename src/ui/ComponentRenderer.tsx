import { useState, useEffect } from 'react'
import type { PropInfo } from '@/shared/types'
import {
  resolveProps,
  type SerializableProps,
  readPropsFromUrl,
} from '@/lib/resolveProps'
import { ErrorBoundary } from './ErrorBoundary'
import {
  MSG_PROPS,
  MSG_RENDERED,
  MSG_STRESS_START,
  MSG_STRESS_TIMING,
  MSG_STRESS_RESULT,
  MSG_STRESS_ERROR,
  API_SCHEMA,
  COMPONENT_ROOT_ID,
} from '@/shared/constants'
import { runClientStressTest } from '@/lib/stressRunner'

export function ComponentRenderer() {
  const params = new URLSearchParams(window.location.search)
  const componentPath = params.get('component')

  const [Component, setComponent] = useState<React.ComponentType | null>(null)
  const [propInfos, setPropInfos] = useState<PropInfo[]>([])
  const [serializableProps, setSerializableProps] =
    useState<SerializableProps>(readPropsFromUrl)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!componentPath) return

    import(/* @vite-ignore */ `/${componentPath}`)
      .then((module) => {
        const Comp =
          module.default ??
          Object.values(module).find((exp) => typeof exp === 'function')
        if (Comp) {
          setComponent(() => Comp as React.ComponentType)
        } else {
          setError('No component export found in module.')
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
      })

    fetch(`${API_SCHEMA}?component=${encodeURIComponent(componentPath)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.props) setPropInfos(data.props)
      })
  }, [componentPath])

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return
      if (e.data?.type === MSG_PROPS) {
        setSerializableProps(e.data.props)
      }
      if (e.data?.type === MSG_STRESS_START && Component) {
        const { iterations = 100, warmup = 10, runId } = e.data
        const resolvedProps =
          propInfos.length > 0
            ? resolveProps(serializableProps, propInfos)
            : (serializableProps as Record<string, unknown>)
        runClientStressTest({
          Component: Component as React.ComponentType<Record<string, unknown>>,
          props: resolvedProps,
          iterations,
          warmup,
          onTimingComplete: (result) => {
            window.parent.postMessage(
              { type: MSG_STRESS_TIMING, runId, result },
              window.location.origin,
            )
          },
        })
          .then((result) => {
            window.parent.postMessage(
              { type: MSG_STRESS_RESULT, runId, result },
              window.location.origin,
            )
          })
          .catch((err) => {
            window.parent.postMessage(
              {
                type: MSG_STRESS_ERROR,
                runId,
                error: err instanceof Error ? err.message : String(err),
              },
              window.location.origin,
            )
          })
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [Component, propInfos, serializableProps])

  useEffect(() => {
    requestAnimationFrame(() => {
      window.parent.postMessage({ type: MSG_RENDERED }, window.location.origin)
    })
  }, [serializableProps])

  const resolvedProps =
    propInfos.length > 0
      ? resolveProps(serializableProps, propInfos)
      : serializableProps

  if (error) return <p className="observatory-error">{error}</p>
  if (!Component) return <p>Loading...</p>

  return (
    <div id={COMPONENT_ROOT_ID} style={{ display: 'inline-block' }}>
      <ErrorBoundary key={JSON.stringify(serializableProps)}>
        <Component {...resolvedProps} />
      </ErrorBoundary>
    </div>
  )
}
