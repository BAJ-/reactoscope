import { readFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { API_AI_MODELS, API_AI_CHAT } from '../shared/constants'

const OLLAMA_BASE = 'http://localhost:11434'
const MAX_BODY_BYTES = 1_048_576 // 1 MB

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    let bytes = 0
    req.on('data', (chunk: Buffer | string) => {
      bytes +=
        typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length
      if (bytes > MAX_BODY_BYTES) {
        req.destroy()
        reject(new Error('Request body too large'))
        return
      }
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function jsonResponse(
  res: ServerResponse,
  status: number,
  data: unknown,
): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

async function handleModels(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/tags`)
    if (!response.ok) {
      jsonResponse(res, 502, { error: 'Failed to reach Ollama' })
      return
    }
    const data = (await response.json()) as {
      models: { name: string; details: { parameter_size: string } }[]
    }
    const models = data.models.map((m) => ({
      name: m.name,
      size: m.details.parameter_size,
    }))
    jsonResponse(res, 200, { models })
  } catch {
    jsonResponse(res, 502, {
      error: 'Ollama is not running at ' + OLLAMA_BASE,
    })
  }
}

interface ChatRequest {
  model: string
  messages: { role: string; content: string }[]
  component?: string
}

function readComponentSource(componentPath: string): string | null {
  const absPath = resolve(process.cwd(), componentPath)
  const rel = relative(process.cwd(), absPath)
  if (rel.startsWith('..')) return null
  try {
    return readFileSync(absPath, 'utf-8')
  } catch {
    return null
  }
}

async function handleChat(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    jsonResponse(res, 405, { error: 'Method not allowed' })
    return
  }

  const raw = await readBody(req)
  let params: ChatRequest
  try {
    params = JSON.parse(raw)
  } catch {
    jsonResponse(res, 400, { error: 'Invalid JSON body' })
    return
  }

  if (
    !params.model ||
    !Array.isArray(params.messages) ||
    params.messages.length === 0
  ) {
    jsonResponse(res, 400, {
      error: 'Required: model (string), messages (non-empty array)',
    })
    return
  }

  // If component path is provided, read source and inject as system context
  const messages = [...params.messages]
  if (params.component) {
    const source = readComponentSource(params.component)
    if (source) {
      const systemMsg = messages.find((m) => m.role === 'system')
      const sourceBlock = `\n\nComponent source code:\n\`\`\`tsx\n${source}\n\`\`\``
      if (systemMsg) {
        systemMsg.content += sourceBlock
      } else {
        messages.unshift({ role: 'system', content: sourceBlock })
      }
    }
  }

  try {
    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model,
        messages,
        stream: true,
      }),
    })

    if (!response.ok || !response.body) {
      jsonResponse(res, 502, { error: 'Ollama request failed' })
      return
    }

    // Stream Ollama's response directly to the client
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          res.write(`data: ${line}\n\n`)
        }
      }
      // Flush any remaining buffered content
      if (buffer.trim()) {
        res.write(`data: ${buffer}\n\n`)
      }
    } finally {
      res.end()
    }
  } catch {
    if (!res.headersSent) {
      jsonResponse(res, 502, {
        error: 'Ollama is not running at ' + OLLAMA_BASE,
      })
    }
  }
}

export function aiPlugin(): Plugin {
  return {
    name: 'observatory-ai',
    configureServer(server) {
      server.middlewares.use(API_AI_MODELS, (req, res) => {
        handleModels(req, res).catch((err) => {
          if (!res.headersSent) {
            jsonResponse(res, 500, { error: String(err) })
          }
        })
      })
      server.middlewares.use(API_AI_CHAT, (req, res) => {
        handleChat(req, res).catch((err) => {
          if (!res.headersSent) {
            jsonResponse(res, 500, { error: String(err) })
          }
        })
      })
    },
  }
}
