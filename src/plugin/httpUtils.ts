import type { IncomingMessage, ServerResponse } from 'node:http'

const MAX_BODY_BYTES = 1_048_576 // 1 MB

export function readBody(req: IncomingMessage): Promise<string> {
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

export function jsonResponse(
  res: ServerResponse,
  status: number,
  data: unknown,
): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}
