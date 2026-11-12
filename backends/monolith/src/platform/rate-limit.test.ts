import { describe, expect, it } from 'vitest'
import { redis } from './redis.ts'
import { makeTokenBucket } from './rate-limit.ts'
import { newId } from './ids.ts'

const limiter = makeTokenBucket(redis, {
  capacity: 3,
  refillPerSecond: 1,
})

const key = () => `test:rate:${newId()}`

const T0 = new Date('2026-01-01T00:00:00.000Z')

const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000)

describe('token bucket rate limiter', () => {
  it('allows requests up to capacity', async () => {
    const bucket = key()

    const results = await Promise.all([
      limiter.consume(bucket, T0),
      limiter.consume(bucket, T0),
      limiter.consume(bucket, T0),
    ])

    expect(results.every((result) => result.allowed)).toBe(true)
  })

  it('rejects requests after capacity is exhausted', async () => {
    const bucket = key()

    await Promise.all([limiter.consume(bucket, T0), limiter.consume(bucket, T0), limiter.consume(bucket, T0)])

    const result = await limiter.consume(bucket, T0)

    expect(result).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    })
  })

  it('allows requests after a full token refill', async () => {
    const bucket = key()

    await Promise.all([limiter.consume(bucket, T0), limiter.consume(bucket, T0), limiter.consume(bucket, T0)])

    const result = await limiter.consume(bucket, at(1))

    expect(result.allowed).toBe(true)
  })

  it('rejects requests when only half a token has refilled', async () => {
    const bucket = key()

    await Promise.all([limiter.consume(bucket, T0), limiter.consume(bucket, T0), limiter.consume(bucket, T0)])

    const result = await limiter.consume(bucket, at(0.5))

    expect(result).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    })
  })

  it('keeps different buckets independent', async () => {
    const first = key()
    const second = key()

    await Promise.all([limiter.consume(first, T0), limiter.consume(first, T0), limiter.consume(first, T0)])

    const result = await limiter.consume(second, T0)

    expect(result.allowed).toBe(true)
  })

  it('allows exactly capacity requests under concurrency', async () => {
    const bucket = key()

    const concurrentLimiter = makeTokenBucket(redis, {
      capacity: 5,
      refillPerSecond: 1,
    })

    const results = await Promise.all(Array.from({ length: 20 }, () => concurrentLimiter.consume(bucket, T0)))

    expect(results.filter((result) => result.allowed)).toHaveLength(5)
    expect(results.filter((result) => !result.allowed)).toHaveLength(15)
  })

  it('sets an expiration on the bucket', async () => {
    const bucket = key()

    await limiter.consume(bucket, T0)

    const ttl = await redis.pttl(bucket)

    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(3000)
  })

  it('rejects zero capacity', () => {
    expect(() =>
      makeTokenBucket(redis, {
        capacity: 0,
        refillPerSecond: 1,
      }),
    ).toThrow()
  })
})
