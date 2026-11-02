import { Router, type Router as ExpressRouter } from 'express'
import { checkDBConnection } from './db/client.ts'
import { config } from '../config.ts'
import { isShuttingDown } from './lifecycle.ts'

type DependencyStatus = 'ok' | 'down'

type HealthResponse = {
  status: 'ok' | 'degraded'
  architecture: string
  version: string
  time: string
  dependencies: Record<string, DependencyStatus>
}

type HealthCache = {
  at: number
  body: HealthResponse
}

const CACHE_TTL_MS = 5000

let cache: HealthCache | undefined
let inFlight: Promise<HealthResponse> | undefined

export const healthRouter: ExpressRouter = Router()

healthRouter.get('/livez', (_req, res) => {
  res.status(200).json({ status: 'ok' })
})

healthRouter.get('/readyz', async (_req, res) => {
  const database = await checkDBConnection()

  if (!database || isShuttingDown()) {
    res.status(503).json({ status: 'unavailable' })
    return
  }

  res.status(200).json({ status: 'ready' })
})

async function checkPostgres(): Promise<DependencyStatus> {
  const connected = await checkDBConnection()

  return connected ? 'ok' : 'down'
}

async function checkService(name: string, url: string): Promise<[string, DependencyStatus]> {
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/readyz`, {
      method: 'GET',
      signal: AbortSignal.timeout(config.HEALTH_TIMEOUT_MS),
    })

    return [name, response.ok ? 'ok' : 'down']
  } catch {
    return [name, 'down']
  }
}

async function collectHealth(): Promise<HealthResponse> {
  const [postgres, ...services] = await Promise.all([
    checkPostgres(),
    ...config.HEALTH_SERVICES.map(({ name, url }) => checkService(name, url)),
  ])

  const dependencies: Record<string, DependencyStatus> = {
    postgres,
    ...Object.fromEntries(services),
  }

  const status = Object.values(dependencies).every((value) => value === 'ok') ? 'ok' : 'degraded'

  const body: HealthResponse = {
    status,
    architecture: config.ARCH,
    version: config.VERSION,
    time: new Date().toISOString(),
    dependencies,
  }

  cache = {
    at: Date.now(),
    body,
  }

  return body
}

async function getHealth(): Promise<HealthResponse> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.body
  }

  if (inFlight) {
    return inFlight
  }

  inFlight = collectHealth()

  try {
    return await inFlight
  } finally {
    inFlight = undefined
  }
}

healthRouter.get('/v1/health', async (_req, res, next) => {
  try {
    const health = await getHealth()

    res.status(200).json(health)
  } catch (error) {
    next(error)
  }
})
