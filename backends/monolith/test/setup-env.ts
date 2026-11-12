import { afterAll, inject } from 'vitest'
process.env.DATABASE_URL = inject('databaseUrl')
process.env.REDIS_URL = inject('redisUrl')

const { redis } = await import('../src/platform/redis.ts')
await redis.connect()
afterAll(() => redis.quit())
