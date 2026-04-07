import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createReadStream, existsSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { networkInterfaces } from 'node:os'

const PORT = Number(process.env.PORT ?? 8787)
const ROOT = resolve('dist')
const CLIENT_TTL_MS = 12_000
const MAX_BODY_BYTES = 8 * 1024 * 1024

let room = {
  payload: null,
  revision: 0,
  clients: new Map(),
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

const now = () => Date.now()

const cleanupClients = () => {
  const cutoff = now() - CLIENT_TTL_MS
  for (const [client, lastSeen] of room.clients) {
    if (lastSeen < cutoff) room.clients.delete(client)
  }

  if (room.clients.size === 0) {
    room = {
      payload: null,
      revision: 0,
      clients: new Map(),
    }
  }
}

const touchClient = (client) => {
  if (!client || typeof client !== 'string') return
  room.clients.set(client.slice(0, 96), now())
}

const sendJson = (response, status, data) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  })
  response.end(JSON.stringify(data))
}

const readJsonBody = async (request) => {
  let size = 0
  const chunks = []

  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(chunk)
  }

  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const isNotebook = (payload) =>
  payload &&
  typeof payload === 'object' &&
  Array.isArray(payload.items) &&
  payload.view &&
  typeof payload.view.x === 'number' &&
  typeof payload.view.y === 'number' &&
  typeof payload.view.zoom === 'number'

const handleApi = async (request, response, url) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    })
    response.end()
    return
  }

  cleanupClients()

  if (url.pathname === '/api/localnet/state' && request.method === 'GET') {
    touchClient(url.searchParams.get('client'))
    cleanupClients()
    sendJson(response, 200, {
      ok: true,
      revision: room.revision,
      payload: room.payload,
      clients: room.clients.size,
      empty: room.payload === null,
    })
    return
  }

  if (url.pathname === '/api/localnet/state' && request.method === 'POST') {
    const body = await readJsonBody(request)
    touchClient(body.client)

    if (!isNotebook(body.payload)) {
      sendJson(response, 400, { ok: false, error: 'invalid notebook payload' })
      return
    }

    room.payload = body.payload
    room.revision += 1
    cleanupClients()
    sendJson(response, 200, {
      ok: true,
      revision: room.revision,
      payload: room.payload,
      clients: room.clients.size,
      empty: false,
    })
    return
  }

  if (url.pathname === '/api/localnet/leave' && request.method === 'POST') {
    const body = await readJsonBody(request)
    if (body.client) room.clients.delete(String(body.client).slice(0, 96))
    cleanupClients()
    sendJson(response, 200, { ok: true, clients: room.clients.size })
    return
  }

  sendJson(response, 404, { ok: false, error: 'not found' })
}

const serveStatic = async (request, response, url) => {
  const pathname = decodeURIComponent(url.pathname)
  const normalized = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  const candidate = join(ROOT, normalized === '/' ? 'index.html' : normalized)
  const filePath = candidate.startsWith(ROOT) && existsSync(candidate) ? candidate : join(ROOT, 'index.html')
  const extension = extname(filePath)

  response.writeHead(200, {
    'content-type': mimeTypes[extension] ?? 'application/octet-stream',
    'cache-control': extension === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
  })
  createReadStream(filePath).pipe(response)
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

    if (url.pathname.startsWith('/api/localnet/')) {
      await handleApi(request, response, url)
      return
    }

    await serveStatic(request, response, url)
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : 'server error' })
  }
})

const lanAddresses = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((address) => address && address.family === 'IPv4' && !address.internal)
    .map((address) => `http://${address.address}:${PORT}`)

if (!existsSync(join(ROOT, 'index.html'))) {
  await readFile(join(ROOT, 'index.html'))
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Local net share server running at http://localhost:${PORT}`)
  for (const address of lanAddresses()) console.log(`LAN URL: ${address}`)
})
