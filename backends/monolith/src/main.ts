import app from './app.ts'
import { config } from './platform/config.ts'
import { logger } from './platform/logger.ts'
import { startShutdownHandlers } from './platform/shutdown.ts'

const port = config.PORT

const server = app.listen(config.PORT, '0.0.0.0', () => {
  logger.info({ port }, 'server is running')
})

server.on('error', (err) => {
  logger.fatal({ err }, 'server error')
  process.exit(1)
})

server.requestTimeout = 30_000
server.headersTimeout = 10_000
server.keepAliveTimeout = 65_000

startShutdownHandlers(server)
