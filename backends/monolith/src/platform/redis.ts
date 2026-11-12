import { config } from './config.ts'
import { Redis } from 'ioredis'
import { logger } from './logger.ts'

export const redis = new Redis(config.REDIS_URL, {
  connectTimeout: 5_000,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  lazyConnect: true,
})

redis.on('error', (error: Error) => {
  logger.warn({ err: error }, 'Redis connection error')
  process.exit(1)
})
