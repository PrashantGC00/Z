import { describe, expect, it } from 'vitest'
import { redis } from './redis.ts'

describe('testing redis connection', () => {
  it('connects to Redis', async () => {
    await expect(redis.ping()).resolves.toBe('PONG')
  })
})
