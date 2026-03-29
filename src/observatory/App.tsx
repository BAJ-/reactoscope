import { useState, useEffect, useCallback, useRef } from 'react'
import type { PropInfo } from './plugins/schemaPlugin'
import { generateProps } from './generateProps'
import { type SerializableProps } from './resolveProps'
import { PropsPanel } from './PropsPanel'
import { ViewportControls } from './ViewportControls'
import './App.css'

function readPropsFromUrl(): SerializableProps {
  const raw = new URLSearchParams(window.location.search).get('props')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function writePropsToUrl(props: SerializableProps) {
  const url = new URL(window.location.href)
  url.searchParams.set('props', JSON.stringify(props))
  window.history.replaceState(null, '', url.toString())
}

// Build the iframe URL once so prop edits don't reload it
function useStableIframeSrc(
  componentPath: string | null,
  initialProps: SerializableProps,
): string | null {
  const [src] = useState(() => {
    if (!componentPath) return null
    const params = new URLSearchParams()
    params.set('render', '')
    params.set('component', componentPath)
    params.set('props', JSON.stringify(initialProps))
    return `/?${params.toString()}`
  })
  return src
}

function App() {
  const componentPath = new URLSearchParams(window.location.search).get(
    'component',
  )

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [propInfos, setPropInfos] = useState<PropInfo[]>([])
  const [serializableProps, setSerializableProps] =
    useState<SerializableProps>(readPropsFromUrl)
  const [error, setError] = useState<string | null>(null)
  const [viewportWidth, setViewportWidth] = useState<number | null>(null)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)

  useEffect(() => {
    if (!componentPath) return

    fetch(`/api/schema?component=${encodeURIComponent(componentPath)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.props) {
          setPropInfos(data.props)
          const urlProps = readPropsFromUrl()
          if (Object.keys(urlProps).length === 0) {
            const generated = generateProps(data.props)
            setSerializableProps(generated)
            writePropsToUrl(generated)
          }
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
      })
  }, [componentPath])

  // Re-fetch schema when component source changes via HMR
  useEffect(() => {
    if (!componentPath || !import.meta.hot) return

    const path = componentPath
    function refetchSchema() {
      fetch(`/api/schema?component=${encodeURIComponent(path)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.props) {
            setPropInfos(data.props)
            // Generate defaults for any newly added props
            setSerializableProps((prev) => {
              const generated = generateProps(data.props)
              const merged = { ...generated, ...prev }
              writePropsToUrl(merged)
              return merged
            })
          }
        })
    }

    import.meta.hot.on('observatory:schema-update', refetchSchema)
    return () =>
      import.meta.hot!.off('observatory:schema-update', refetchSchema)
  }, [componentPath])

  // Send props to the iframe whenever they change
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'observatory:props', props: serializableProps },
      window.location.origin,
    )
  }, [serializableProps])

  const handlePropChange = useCallback((key: string, value: unknown) => {
    setSerializableProps((prev) => {
      const next = { ...prev, [key]: value }
      writePropsToUrl(next)
      return next
    })
  }, [])

  const handleViewportChange = (w: number | null, h: number | null) => {
    setViewportWidth(w)
    setViewportHeight(h)
  }

  const iframeSrc = useStableIframeSrc(componentPath, serializableProps)

  if (!componentPath) {
    return (
      <p>
        No component specified. Run: npm run observe path/to/MyComponent.tsx
      </p>
    )
  }

  return (
    <div className="observatory">
      {error && <p className="observatory-error">{error}</p>}
      <div className="observatory-layout">
        <aside className="observatory-panel">
          {propInfos.length > 0 ? (
            <PropsPanel
              props={propInfos}
              values={serializableProps}
              onChange={handlePropChange}
            />
          ) : (
            <p>Loading schema...</p>
          )}
        </aside>
        <main className="observatory-preview">
          <ViewportControls
            width={viewportWidth}
            height={viewportHeight}
            onChange={handleViewportChange}
          />
          <div className="viewport-frame">
            <iframe
              ref={iframeRef}
              src={iframeSrc ?? undefined}
              title="Component preview"
              style={{
                width: viewportWidth ? `${viewportWidth}px` : '100%',
                height: viewportHeight ? `${viewportHeight}px` : '100%',
              }}
            />
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
