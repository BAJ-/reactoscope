# Reactoscope

Explore, stress-test, and get AI feedback on your React components — without writing a single test or storybook file.

## Features

- **Explore** — Renders any component with auto-generated prop controls based on its TypeScript types
- **Stress Test** — Measures render performance, detects non-determinism, and spots memory leaks via server-side rendering
- **AI Feedback** — Connects to a local Ollama instance to review component source code and provide suggestions

## Quick Start

### As a standalone CLI (no Vite project required)

```bash
npx reactoscope path/to/MyComponent.tsx
```

This starts a dev server and opens the Observatory UI in your browser.

### As a Vite plugin

```bash
npm install reactoscope --save-dev
```

Add it to your Vite config:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { observatory } from 'reactoscope'

export default defineConfig({
  plugins: [react(), ...observatory()],
})
```

Then visit `/__observatory?component=path/to/MyComponent.tsx` in your browser while the dev server is running.

## Options

```ts
observatory({
  ollamaUrl: 'http://localhost:11434', // default
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ollamaUrl` | `string` | `http://localhost:11434` | Base URL for the Ollama API used by the AI feedback panel |

## Requirements

- Node.js >= 22.18.0
- React 19
- TypeScript >= 5.8

## How It Works

Reactoscope is a set of Vite plugins that:

1. **Schema plugin** — Parses your component's TypeScript props at dev time and serves them as JSON, powering the auto-generated prop controls
2. **Stress plugin** — Renders your component server-side in a loop, measuring timing, output determinism, and heap growth
3. **AI plugin** — Proxies requests to a local Ollama instance, injecting your component's source code as context
4. **UI plugin** — Serves the pre-built Reactoscope dashboard at `/__observatory`

The CLI wraps all of this into a single command using Vite's `createServer` API, so it works even in projects that don't use Vite.

## AI Feedback

The AI panel requires [Ollama](https://ollama.ai) running locally. Install it, pull a model, and the panel will auto-detect available models:

```bash
ollama pull llama3
```

## License

MIT
