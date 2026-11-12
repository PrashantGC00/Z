import type { Redis } from 'ioredis'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export type RateLimitResult = {
  allowed: boolean
  retryAfterSeconds: number
}

export interface RateLimiter {
  consume(key: string, now: Date): Promise<RateLimitResult>
}

const SCRIPT = readFileSync(fileURLToPath(new URL('../../scripts/rate-limit.lua', import.meta.url)), 'utf8')

export const makeTokenBucket = (
  redis: Redis,
  opts: {
    capacity: number
    refillPerSecond: number
  },
): RateLimiter => {
  if (!Number.isFinite(opts.capacity) || opts.capacity < 1) {
    throw new Error('Rate limit capacity must be a positive number')
  }

  if (!Number.isFinite(opts.refillPerSecond) || opts.refillPerSecond <= 0) {
    throw new Error('Rate limit refill rate must be a positive number')
  }

  return {
    async consume(key, now) {
      const [allowed, retryAfterSeconds] = (await redis.eval(
        SCRIPT,
        1,
        key,
        opts.capacity,
        opts.refillPerSecond,
        now.getTime(),
      )) as [number, number]

      return {
        allowed: allowed === 1,
        retryAfterSeconds,
      }
    },
  }
}
