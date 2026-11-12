import { afterAll, inject } from 'vitest'

process.env.DATABASE_URL = inject('databaseUrl')
process.env.REDIS_URL = inject('redisUrl')

for (const name of ['DEFAULT', 'LOGIN_IP', 'LOGIN_EMAIL', 'REGISTER_IP', 'REFRESH_IP']) {
  process.env[`RATE_LIMIT_${name}`] = '100000/1'
}
const { redis } = await import('../src/platform/redis.ts')
await redis.connect()
afterAll(() => redis.quit())
