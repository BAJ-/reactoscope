import { describe, it, expect } from 'vitest'
import { PassThrough } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readBody, jsonResponse } from './httpUtils'

function fakeRequest(): PassThrough {
  return new PassThrough()
}

describe('readBody', () => {
  it('reads a complete request body', async () => {
    const req = fakeRequest()
    const promise = readBody(req as unknown as IncomingMessage)
    req.end('{"hello":"world"}')
    expect(await promise).toBe('{"hello":"world"}')
  })

  it('concatenates multiple chunks', async () => {
    const req = fakeRequest()
    const promise = readBody(req as unknown as IncomingMessage)
    req.write('abc')
    req.write('def')
    req.end()
    expect(await promise).toBe('abcdef')
  })

  it('rejects when body exceeds 1 MB', async () => {
    const req = fakeRequest()
    const promise = readBody(req as unknown as IncomingMessage)
    // Write a chunk larger than 1 MB
    const big = Buffer.alloc(1_048_577, 'x')
    req.write(big)
    await expect(promise).rejects.toThrow('Request body too large')
  })

  it('rejects on stream error', async () => {
    const req = fakeRequest()
    const promise = readBody(req as unknown as IncomingMessage)
    req.destroy(new Error('connection reset'))
    await expect(promise).rejects.toThrow('connection reset')
  })
})

describe('jsonResponse', () => {
  it('writes status, content-type header and JSON body', () => {
    let writtenStatus = 0
    let writtenHeaders: Record<string, string> = {}
    let writtenBody = ''

    const res = {
      writeHead(status: number, headers: Record<string, string>) {
        writtenStatus = status
        writtenHeaders = headers
      },
      end(body: string) {
        writtenBody = body
      },
    } as unknown as ServerResponse

    jsonResponse(res, 201, { ok: true })

    expect(writtenStatus).toBe(201)
    expect(writtenHeaders['Content-Type']).toBe('application/json')
    expect(JSON.parse(writtenBody)).toEqual({ ok: true })
  })
})
