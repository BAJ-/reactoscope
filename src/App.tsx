import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const componentPath = new URLSearchParams(window.location.search).get(
    'component',
  )

  const [Component, setComponent] = useState<React.ComponentType | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!componentPath) return

    setComponent(null)
    setError(null)

    import(/* @vite-ignore */ `./${componentPath.replace(/^src\//, '')}`)
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
  }, [componentPath])

  return (
    <>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {Component ? (
        <Component />
      ) : componentPath ? (
        <p>Loading...</p>
      ) : (
        <p>
          No component specified. Run: npm run observe path/to/MyComponent.tsx
        </p>
      )}
    </>
  )
}

export default App
