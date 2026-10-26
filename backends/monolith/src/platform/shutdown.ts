import type { Server } from 'node:http'
import { pool } from './db/client.js'
import { logger } from './logger.js'
import { telemetry } from './telemetry.js'

let shuttingDown = false
export const isShuttingDown = () => shuttingDown

const DRAIN_MS = 10_000
const GRACE = 5_000

export const startShutdownHandlers = (server: Server) => {
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, 'graceful shutdown started')
    await new Promise((r) => setTimeout(r, GRACE))

    const deadline = setTimeout(() => {
      logger.error('drain deadline hit, forcing connections closed')
      server.closeAllConnections()
    }, DRAIN_MS)
    deadline.unref()

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
        server.closeIdleConnections()
      })
      clearTimeout(deadline)

      await pool.end()
      await telemetry.shutdown()
      logger.info('graceful shutdown completed')
      process.exit(0)
    } catch (err) {
      logger.error({ err }, 'graceful shutdown failed')
      process.exit(1)
    }
  }

  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))
}
