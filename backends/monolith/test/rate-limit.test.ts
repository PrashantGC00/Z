import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest'

vi.resetModules()

process.env.DATABASE_URL = inject('databaseUrl')
process.env.REDIS_URL = inject('redisUrl')

for (const name of ['DEFAULT', 'LOGIN_IP', 'LOGIN_EMAIL', 'REGISTER_IP', 'REFRESH_IP']) {
  process.env[`RATE_LIMIT_${name}`] = '100000/1'
}

process.env.RATE_LIMIT_REGISTER_IP = '2/3600'
process.env.RATE_LIMIT_LOGIN_EMAIL = '2/3600'

const { default: app } = await import('../src/app.ts')
const { redis } = await import('../src/platform/redis.ts')

await redis.connect()

afterAll(async () => {
  await redis.quit()
})

const PASSWORD = 'testtest123'
const uid = () => randomUUID().slice(0, 8)

const session: { refreshToken?: string } = {}

const validBody = (overrides: Record<string, unknown> = {}) => ({
  email: `user_${uid()}@example.com`,
  password: PASSWORD,
  username: `user${uid()}`,
  displayName: 'Test User',
  ...overrides,
})

let ip = ''
beforeEach(() => {
  ip = `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
})

const register = () => request(app).post('/v1/auth/register').set('X-Forwarded-For', ip).send(validBody())

const login = (userEmail: string, password = 'wrong-password') =>
  request(app).post('/v1/auth/login').send({
    email: userEmail,
    password,
  })

describe('rate limits', () => {
  it('returns 429 with numeric Retry-After and problem+json when registration limit is exceeded', async () => {
    const first = await register()
    const second = await register()

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)

    session.refreshToken = first.body.tokens.refreshToken

    const third = await register()

    expect(third.status).toBe(429)
    expect(third.headers['content-type']).toContain('application/problem+json')

    const retryAfter = Number(third.headers['retry-after'])

    expect(Number.isFinite(retryAfter)).toBe(true)
    expect(retryAfter).toBeGreaterThan(0)
  })

  it('does not share the registration rate-limit bucket with refresh', async () => {
    const first = await register()
    const second = await register()

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)

    const refreshToken = first.body.tokens.refreshToken

    const third = await register()

    expect(third.status).toBe(429)

    const response = await request(app).post('/v1/auth/refresh').send({
      refreshToken,
    })

    expect(response.status).toBe(200)
    expect(response.status).not.toBe(429)
  })

  it('rate-limits the third failed login attempt for the same email', async () => {
    const userEmail = validBody().email

    const first = await login(userEmail)
    const second = await login(userEmail)

    expect(first.status).toBe(401)
    expect(second.status).toBe(401)

    const third = await login(userEmail)

    expect(third.status).toBe(429)
  })

  it('normalizes email casing when applying login rate limits', async () => {
    const userEmail = validBody().email

    const first = await login(userEmail)
    const second = await login(userEmail)

    expect(first.status).toBe(401)
    expect(second.status).toBe(401)

    const third = await login(userEmail.toUpperCase())

    expect(third.status).toBe(429)
  })

  it('does not rate-limit login attempts for a different email', async () => {
    const firstEmail = validBody().email
    const secondEmail = validBody().email

    const first = await login(firstEmail)
    const second = await login(firstEmail)

    expect(first.status).toBe(401)
    expect(second.status).toBe(401)

    const third = await login(firstEmail)

    expect(third.status).toBe(429)

    const differentAccount = await login(secondEmail)

    expect(differentAccount.status).toBe(401)
    expect(differentAccount.status).not.toBe(429)
  })

  it('never rate-limits health checks', async () => {
    const responses = await Promise.all(Array.from({ length: 30 }, () => request(app).get('/v1/health')))

    expect(responses.every((response) => response.status !== 429)).toBe(true)
  })
})
