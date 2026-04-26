import { describe, it, expect, vi, afterEach } from 'vitest'
import { PassThrough } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import { aiPlugin } from './aiPlugin'
import type { RootRef } from './index'

function fakeReq(method: string, body?: string): IncomingMessage {
  const stream = new PassThrough()
  ;(stream as unknown as IncomingMessage).method = method
  if (body !== undefined) {
    process.nextTick(() => stream.end(body))
  }
  return stream as unknown as IncomingMessage
}

function fakeRes(): ServerResponse & {
  _status: number
  _body: string
  _headers: Record<string, string>
  _written: string[]
  done: Promise<void>
} {
  let resolveDone!: () => void
  const done = new Promise<void>((r) => {
    resolveDone = r
  })
  const res = {
    _status: 0,
    _body: '',
    _headers: {} as Record<string, string>,
    _written: [] as string[],
    headersSent: false,
    done,
    writeHead(status: number, headers?: Record<string, string>) {
      res._status = status
      res.headersSent = true
      if (headers) Object.assign(res._headers, headers)
      return res
    },
    setHeader(name: string, value: string) {
      res._headers[name] = value
      return res
    },
    write(chunk: string) {
      res._written.push(chunk)
      return true
    },
    end(body?: string) {
      if (body) res._body = body
      res.headersSent = true
      resolveDone()
      return res
    },
  }
  return res as unknown as ServerResponse & typeof res
}

function getHandlers(ollamaUrl = 'http://localhost:11434') {
  const rootRef: RootRef = { root: '/project' }
  const plugin = aiPlugin(ollamaUrl, rootRef)
  const configureServer = plugin.configureServer as (
    server: ViteDevServer,
  ) => void

  const handlers: Record<
    string,
    (req: IncomingMessage, res: ServerResponse) => void
  > = {}
  const fakeServer = {
    middlewares: {
      use(
        path: string,
        fn: (req: IncomingMessage, res: ServerResponse) => void,
      ) {
        handlers[path] = fn
      },
    },
  } as unknown as ViteDevServer

  configureServer(fakeServer)
  return handlers
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('aiPlugin', () => {
  describe('handleChat validation', () => {
    it('rejects non-POST methods', async () => {
      const handlers = getHandlers()
      const req = fakeReq('GET')
      const res = fakeRes()
      process.nextTick(() => (req as unknown as PassThrough).end())
      handlers['/api/ai/chat'](req, res)
      await res.done
      expect(res._status).toBe(405)
    })

    it('rejects invalid JSON', async () => {
      const handlers = getHandlers()
      const req = fakeReq('POST', 'not json')
      const res = fakeRes()
      handlers['/api/ai/chat'](req, res)
      await res.done
      expect(res._status).toBe(400)
      expect(JSON.parse(res._body).error).toBe('Invalid JSON body')
    })

    it('rejects missing model', async () => {
      const handlers = getHandlers()
      const req = fakeReq(
        'POST',
        JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
      )
      const res = fakeRes()
      handlers['/api/ai/chat'](req, res)
      await res.done
      expect(res._status).toBe(400)
      expect(JSON.parse(res._body).error).toMatch(/Required/)
    })

    it('rejects empty messages array', async () => {
      const handlers = getHandlers()
      const req = fakeReq(
        'POST',
        JSON.stringify({ model: 'llama3', messages: [] }),
      )
      const res = fakeRes()
      handlers['/api/ai/chat'](req, res)
      await res.done
      expect(res._status).toBe(400)
    })
  })

  describe('component source path traversal', () => {
    it('does not inject source for paths outside project root', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          body: {
            getReader: () => ({
              read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
            }),
          },
        }),
      )

      const handlers = getHandlers()
      const req = fakeReq(
        'POST',
        JSON.stringify({
          model: 'llama3',
          messages: [{ role: 'user', content: 'analyze this' }],
          component: '../../etc/passwd',
        }),
      )
      const res = fakeRes()
      handlers['/api/ai/chat'](req, res)
      await res.done

      // fetch was called — meaning request wasn't rejected
      const fetchCall = vi.mocked(fetch).mock.calls[0]
      const body = JSON.parse(fetchCall[1]!.body as string)
      // The messages should NOT contain any source code block
      for (const msg of body.messages) {
        expect(msg.content).not.toContain('Component source code')
      }
    })

    it('does not inject source for absolute paths', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          body: {
            getReader: () => ({
              read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
            }),
          },
        }),
      )

      const handlers = getHandlers()
      const req = fakeReq(
        'POST',
        JSON.stringify({
          model: 'llama3',
          messages: [{ role: 'user', content: 'analyze' }],
          component: '/etc/passwd',
        }),
      )
      const res = fakeRes()
      handlers['/api/ai/chat'](req, res)
      await res.done

      const fetchCall = vi.mocked(fetch).mock.calls[0]
      const body = JSON.parse(fetchCall[1]!.body as string)
      for (const msg of body.messages) {
        expect(msg.content).not.toContain('Component source code')
      }
    })
  })

  describe('handleModels', () => {
    it('returns 502 when Ollama is unreachable', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      )

      const handlers = getHandlers()
      const req = fakeReq('GET')
      const res = fakeRes()
      process.nextTick(() => (req as unknown as PassThrough).end())
      handlers['/api/ai/models'](req, res)
      await res.done

      expect(res._status).toBe(502)
      expect(JSON.parse(res._body).error).toContain('Ollama is not running')
    })

    it('returns model list on success', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              models: [
                { name: 'llama3', details: { parameter_size: '8B' } },
                { name: 'codellama', details: { parameter_size: '7B' } },
              ],
            }),
        }),
      )

      const handlers = getHandlers()
      const req = fakeReq('GET')
      const res = fakeRes()
      process.nextTick(() => (req as unknown as PassThrough).end())
      handlers['/api/ai/models'](req, res)
      await res.done

      expect(res._status).toBe(200)
      const data = JSON.parse(res._body)
      expect(data.models).toEqual([
        { name: 'llama3', size: '8B' },
        { name: 'codellama', size: '7B' },
      ])
    })
  })
})
