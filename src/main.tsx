import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const isRenderMode = new URLSearchParams(window.location.search).has('render')

async function mount() {
  const root = createRoot(document.getElementById('root')!)

  if (isRenderMode) {
    const { ComponentRenderer } = await import('./ui/ComponentRenderer.tsx')
    root.render(
      <StrictMode>
        <ComponentRenderer />
      </StrictMode>,
    )
  } else {
    const { default: App } = await import('./ui/App.tsx')
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  }
}

mount()
