import { Router, type Router as ExpressRouter } from 'express'
import { checkDBConnection } from './db/client.ts'
import { config } from './config.ts'
import { isShuttingDown } from './shutdown.ts'

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

healthRouter.get('/v1/health', async (_req, res) => {
  const time = new Date().toISOString()
  const version = config.VERSION
  const architecture = config.ARCH
  const dependencies = {
    database: 'ok',
  }

  let status = 'ok'

  const db_connected = await checkDBConnection()

  if (!db_connected) {
    dependencies.database = 'degraded'
  }

  const values = Object.values(dependencies)
  if (values.includes('degraded')) {
    status = 'degraded'
  }

  res.json({
    status,
    architecture,
    version,
    time,
    dependencies,
  })
})
