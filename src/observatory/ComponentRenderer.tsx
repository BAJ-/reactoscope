import { useState, useEffect } from 'react'
import type { PropInfo } from './plugins/schemaPlugin'
import {
  resolveProps,
  type SerializableProps,
  readPropsFromUrl,
} from './resolveProps'
import { ErrorBoundary } from './ErrorBoundary'
import {
  MSG_PROPS,
  MSG_RENDERED,
  API_SCHEMA,
  COMPONENT_ROOT_ID,
} from './constants'

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

    import(/* @vite-ignore */ `../${componentPath.replace(/^src\//, '')}`)
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

  // Listen for prop updates from the parent window
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.origin === window.location.origin && e.data?.type === MSG_PROPS) {
        setSerializableProps(e.data.props)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Signal to parent that we've rendered after each props change
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
