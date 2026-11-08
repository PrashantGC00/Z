import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import app from '../src/app.ts'

const PASSWORD = 'correct horse battery staple'

const uid = () => randomUUID().slice(0, 8)

const validBody = (overrides: Record<string, unknown> = {}) => {
  const id = uid()
  return {
    email: `user_${id}@example.com`,
    password: PASSWORD,
    username: `user_${id}`,
    displayName: 'Test User',
    ...overrides,
  }
}

const register = (body: object) => request(app).post('/v1/auth/register').send(body)

describe('POST /v1/auth/register', () => {
  it('201: returns the user and tokens', async () => {
    const body = validBody()
    const res = await register(body)

    expect(res.status).toBe(201)
    expect(res.body.user.email).toBe(body.email)
    expect(res.body.user.stats).toBeDefined()
    expect(res.body.user.relationship).toBeNull()
    expect(typeof res.body.tokens.accessToken).toBe('string')
    expect(typeof res.body.tokens.refreshToken).toBe('string')
    expect(typeof res.body.tokens.expiresIn).toBe('number')
  })

  it('does not leak secrets in the response', async () => {
    const res = await register(validBody())

    expect(res.status).toBe(201)
    const serialised = JSON.stringify(res.body)
    expect(serialised).not.toContain('argon2')
    expect(serialised).not.toContain(PASSWORD)
  })

  it('409: same email in a different case', async () => {
    const id = uid()
    const first = await register(validBody({ email: `Case_${id}@Example.com` }))
    expect(first.status).toBe(201)

    const res = await register(validBody({ email: `case_${id}@example.com` }))

    expect(res.status).toBe(409)
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/)
  })

  it('409: same username, different email', async () => {
    const username = `taken_${uid()}`
    const first = await register(validBody({ username }))
    expect(first.status).toBe(201)

    const res = await register(validBody({ username }))

    expect(res.status).toBe(409)
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/)
  })

  it('422 from the domain: reserved username', async () => {
    const res = await register(validBody({ username: 'admin' }))

    expect(res.status).toBe(422)
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/)
    expect(res.body.errors[0].field).toBe('username')
  })

  it('422 from the validator: missing displayName', async () => {
    const { displayName: _omit, ...body } = validBody()
    const res = await register(body)

    expect(res.status).toBe(422)
    expect(JSON.stringify(res.body)).toContain('displayName')
  })
})
