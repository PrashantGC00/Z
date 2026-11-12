import type { Request, RequestHandler } from 'express'
import type { RateLimiter } from '../rate-limit.ts'
import { ProblemError } from './problem.ts'
import { logger } from '../logger.ts'

export const rateLimit =
  (
    name: string,
    limiter: RateLimiter,
    keyOf: (req: Request) => string | null,
    now: () => Date = () => new Date(),
  ): RequestHandler =>
  async (req, _res, next) => {
    const key = keyOf(req)
    if (key === null) {
      next()
      return
    }
    try {
      const result = await limiter.consume(`rl:${name}:${key}`, now())
      if (result.allowed) {
        next()
        return
      }

      next(
        new ProblemError(429, 'Too Many Requests', 'Too many requests. Please try again later.', undefined, {
          'Retry-After': String(result.retryAfterSeconds),
        }),
      )
    } catch (error) {
      logger.warn({ err: error, limiter: name }, 'Rate limiter unavailable; allowing request')
      next()
    }
  }
