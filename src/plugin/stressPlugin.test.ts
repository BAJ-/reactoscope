import { describe, it, expect, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import { stressPlugin } from './stressPlugin'
import type { RootRef } from './index'

vi.mock('./schemaPlugin', () => ({
  extractProps: vi.fn(() => []),
}))

vi.mock('./findTsconfig', () => ({
  findTsconfig: vi.fn(() => null),
}))

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
    headersSent: false,
    done,
    writeHead(status: number, headers?: Record<string, string>) {
      res._status = status
      if (headers) Object.assign(res._headers, headers)
      return res
    },
    setHeader(name: string, value: string) {
      res._headers[name] = value
      return res
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

function getMiddleware(rootRef?: Partial<RootRef>) {
  const plugin = stressPlugin({ root: '/project', ...rootRef } as RootRef)
  const configureServer = plugin.configureServer as (
    server: ViteDevServer,
  ) => void

  let handler: (req: IncomingMessage, res: ServerResponse) => void
  const fakeServer = {
    middlewares: {
      use(_path: string, fn: typeof handler) {
        handler = fn
      },
    },
    ssrLoadModule: vi.fn(),
  } as unknown as ViteDevServer

  configureServer(fakeServer)

  return { handler: handler!, server: fakeServer }
}

async function callHandler(
  method: string,
  body?: string,
  rootRef?: Partial<RootRef>,
) {
  const { handler, server } = getMiddleware(rootRef)
  const req = fakeReq(method, body)
  const res = fakeRes()
  handler(req, res)
  await res.done
  return {
    status: res._status,
    body: res._body ? JSON.parse(res._body) : null,
    server,
  }
}

describe('stressPlugin', () => {
  describe('request validation', () => {
    it('rejects non-POST methods', async () => {
      const { status, body } = await callHandler('GET', undefined)
      expect(status).toBe(405)
      expect(body.error).toBe('Method not allowed')
    })

    it('rejects invalid JSON', async () => {
      const { status, body } = await callHandler('POST', '{not json')
      expect(status).toBe(400)
      expect(body.error).toBe('Invalid JSON body')
    })

    it('rejects missing required fields', async () => {
      const { status, body } = await callHandler(
        'POST',
        JSON.stringify({ component: 'Foo.tsx' }),
      )
      expect(status).toBe(400)
      expect(body.error).toMatch(/Required/)
    })

    it('rejects when props is an array', async () => {
      const { status } = await callHandler(
        'POST',
        JSON.stringify({
          component: 'Foo.tsx',
          props: [1, 2],
          iterations: 10,
        }),
      )
      expect(status).toBe(400)
    })

    it('rejects when props is a string', async () => {
      const { status } = await callHandler(
        'POST',
        JSON.stringify({
          component: 'Foo.tsx',
          props: 'not-an-object',
          iterations: 10,
        }),
      )
      expect(status).toBe(400)
    })

    it('rejects iterations below 1', async () => {
      const { status, body } = await callHandler(
        'POST',
        JSON.stringify({
          component: 'Foo.tsx',
          props: {},
          iterations: 0,
        }),
      )
      expect(status).toBe(400)
      expect(body.error).toMatch(/iterations/)
    })

    it('rejects iterations above 10,000', async () => {
      const { status, body } = await callHandler(
        'POST',
        JSON.stringify({
          component: 'Foo.tsx',
          props: {},
          iterations: 10_001,
        }),
      )
      expect(status).toBe(400)
      expect(body.error).toMatch(/iterations/)
    })

    it('rejects warmup above 1,000', async () => {
      const { status, body } = await callHandler(
        'POST',
        JSON.stringify({
          component: 'Foo.tsx',
          props: {},
          iterations: 10,
          warmup: 1001,
        }),
      )
      expect(status).toBe(400)
      expect(body.error).toMatch(/warmup/)
    })

    it('rejects negative warmup', async () => {
      const { status } = await callHandler(
        'POST',
        JSON.stringify({
          component: 'Foo.tsx',
          props: {},
          iterations: 10,
          warmup: -1,
        }),
      )
      expect(status).toBe(400)
    })
  })

  describe('path traversal', () => {
    it('rejects components outside project root', async () => {
      const { status, body } = await callHandler(
        'POST',
        JSON.stringify({
          component: '../../etc/passwd',
          props: {},
          iterations: 10,
        }),
      )
      expect(status).toBe(403)
      expect(body.error).toBe('Path outside project root')
    })

    it('rejects absolute paths', async () => {
      const { status, body } = await callHandler(
        'POST',
        JSON.stringify({
          component: '/etc/passwd',
          props: {},
          iterations: 10,
        }),
      )
      expect(status).toBe(403)
      expect(body.error).toBe('Path outside project root')
    })
  })

  describe('component loading', () => {
    it('returns 400 when module has no component export', async () => {
      const { handler, server } = getMiddleware()
      const ssrLoad = vi.mocked(server.ssrLoadModule)
      ssrLoad.mockResolvedValueOnce({ version: '1.0' })

      const req = fakeReq(
        'POST',
        JSON.stringify({
          component: 'src/Foo.tsx',
          props: {},
          iterations: 1,
        }),
      )
      const res = fakeRes()
      handler(req, res)
      await res.done

      expect(res._status).toBe(400)
      expect(JSON.parse(res._body).error).toBe('No component export found')
    })

    it('returns 500 when ssrLoadModule throws', async () => {
      const { handler, server } = getMiddleware()
      const ssrLoad = vi.mocked(server.ssrLoadModule)
      ssrLoad.mockRejectedValueOnce(new Error('Module not found'))

      const req = fakeReq(
        'POST',
        JSON.stringify({
          component: 'src/Foo.tsx',
          props: {},
          iterations: 1,
        }),
      )
      const res = fakeRes()
      handler(req, res)
      await res.done

      expect(res._status).toBe(500)
      expect(JSON.parse(res._body).error).toBe('Module not found')
    })
  })

  describe('happy path', () => {
    it('returns 200 with stress results for a valid component', async () => {
      const { handler, server } = getMiddleware()
      const ssrLoad = vi.mocked(server.ssrLoadModule)
      const FakeComponent = () => '<div>hello</div>'
      ssrLoad
        .mockResolvedValueOnce({ default: FakeComponent })
        .mockResolvedValueOnce({
          render: () => '<div>hello</div>',
        })

      const req = fakeReq(
        'POST',
        JSON.stringify({
          component: 'src/Foo.tsx',
          props: {},
          iterations: 3,
          warmup: 1,
        }),
      )
      const res = fakeRes()
      handler(req, res)
      await res.done

      expect(res._status).toBe(200)
      const result = JSON.parse(res._body)
      expect(result.iterations).toBe(3)
      expect(result.warmup).toBe(1)
      expect(result.mismatchedRenders).toBe(0)
      expect(result.timings.mean).toBeGreaterThanOrEqual(0)
      expect(result.outputLengths).toHaveLength(3)
    })

    it('detects mismatched renders from non-deterministic output', async () => {
      const { handler, server } = getMiddleware()
      const ssrLoad = vi.mocked(server.ssrLoadModule)
      let callCount = 0
      ssrLoad
        .mockResolvedValueOnce({ default: () => 'component' })
        .mockResolvedValueOnce({
          render: () => {
            callCount++
            // Warmup: 1 call, then 3 measured — vary the measured ones
            return callCount <= 1
              ? '<div>warmup</div>'
              : `<div>${callCount}</div>`
          },
        })

      const req = fakeReq(
        'POST',
        JSON.stringify({
          component: 'src/Foo.tsx',
          props: {},
          iterations: 3,
          warmup: 1,
        }),
      )
      const res = fakeRes()
      handler(req, res)
      await res.done

      expect(res._status).toBe(200)
      const result = JSON.parse(res._body)
      expect(result.mismatchedRenders).toBeGreaterThan(0)
    })
  })
})
