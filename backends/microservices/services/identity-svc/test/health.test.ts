import { createServer, type Server, type RequestListener } from 'node:http'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { checkDBConnection } = vi.hoisted(() => ({
  checkDBConnection: vi.fn(),
}))

vi.mock('../src/platform/db/client.ts', () => ({
  checkDBConnection,
}))

const servers: Server[] = []

async function startServer(handler: RequestListener) {
  const server = createServer(handler)

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  servers.push(server)

  const address = server.address()

  if (!address || typeof address === 'string') {
    throw new Error('Could not determine test server address')
  }

  return `http://127.0.0.1:${address.port}`
}

async function loadApp(services = '', timeout = '100') {
  vi.resetModules()

  vi.stubEnv('HEALTH_SERVICES', services)
  vi.stubEnv('HEALTH_TIMEOUT_MS', timeout)

  const { default: app } = await import('../src/app.ts')

  return app
}

beforeEach(() => {
  checkDBConnection.mockResolvedValue(true)
})

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve())
          server.closeAllConnections()
        }),
    ),
  )

  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('health endpoints', () => {
  it('returns the health response', async () => {
    const app = await loadApp()

    const response = await request(app).get('/v1/health')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      status: 'ok',
      architecture: 'microservices',
      time: expect.any(String),
      version: expect.any(String),
      dependencies: {
        postgres: 'ok',
      },
    })

    expect(Number.isNaN(Date.parse(response.body.time))).toBe(false)
  })

  it('reports a dependency as down when it returns 503', async () => {
    const serviceUrl = await startServer((_req, res) => {
      res.writeHead(503).end()
    })

    const app = await loadApp(`media=${serviceUrl}`)

    const response = await request(app).get('/v1/health')

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('degraded')
    expect(response.body.dependencies).toMatchObject({
      postgres: 'ok',
      media: 'down',
    })
  })

  it('reports a dependency as down when it times out', async () => {
    const serviceUrl = await startServer(() => {})

    const app = await loadApp(`media=${serviceUrl}`, '100')
    const startedAt = Date.now()

    const response = await request(app).get('/v1/health')

    const elapsed = Date.now() - startedAt

    expect(response.body.status).toBe('degraded')
    expect(response.body.dependencies.media).toBe('down')
    expect(elapsed).toBeLessThan(1000)
  })

  it('caches health results for consecutive requests', async () => {
    let hits = 0

    const serviceUrl = await startServer((_req, res) => {
      hits++
      res.writeHead(200).end()
    })

    const app = await loadApp(`media=${serviceUrl}`)

    await request(app).get('/v1/health')
    await request(app).get('/v1/health')

    expect(hits).toBe(1)
  })
})

describe('server live', () => {
  it('returns server status', async () => {
    const app = await loadApp()

    const response = await request(app).get('/livez')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      status: 'ok',
    })
  })
})

describe('server ready', () => {
  it('returns server ready status', async () => {
    const app = await loadApp()

    const response = await request(app).get('/readyz')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      status: 'ready',
    })
  })
})

it('reports postgres as down when the database is unavailable', async () => {
  checkDBConnection.mockResolvedValue(false)

  const app = await loadApp()

  const healthResponse = await request(app).get('/v1/health')

  expect(healthResponse.status).toBe(200)
  expect(healthResponse.body).toMatchObject({
    status: 'degraded',
    dependencies: {
      postgres: 'down',
    },
  })

  const readyResponse = await request(app).get('/readyz')

  expect(readyResponse.status).toBe(503)
  expect(readyResponse.body).toMatchObject({
    status: 'unavailable',
  })
})
