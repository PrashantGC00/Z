import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import app from '../src/app.ts'
import { db } from '../src/platform/db/client.ts'
import { users } from '../src/platform/db/schema.ts'
import { newId } from '../src/platform/ids.ts'

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
const patchMe = (token: string | undefined, body: object) => {
  const req = request(app).patch('/v1/users/me').send(body)
  if (token) req.set('Authorization', `Bearer ${token}`)
  return req
}

const getMe = (token?: string) => {
  const req = request(app).get('/v1/users/me')

  if (token) req.set('Authorization', `Bearer ${token}`)

  return req
}

describe('GET /v1/users/me', () => {
  it('200: returns the authenticated user', async () => {
    const body = validBody()
    const registration = await register(body)

    expect(registration.status).toBe(201)

    const token = registration.body.tokens.accessToken

    const res = await getMe(token)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(registration.body.user.id)
    expect(res.body.email).toBe(body.email)

    expect(res.body).not.toHaveProperty('passwordHash')
  })

  it('401: without an authorization header', async () => {
    const res = await getMe()

    expect(res.status).toBe(401)
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/)
  })

  it('401: with an invalid access token', async () => {
    const res = await getMe('garbage')

    expect(res.status).toBe(401)
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/)
  })

  it('401: when the user associated with a valid token no longer exists', async () => {
    const body = validBody()
    const registration = await register(body)

    expect(registration.status).toBe(201)

    const token = registration.body.tokens.accessToken
    const userId = registration.body.user.id

    const invalidToken = await getMe('garbage')

    await db.delete(users).where(eq(users.id, userId))

    const deletedUser = await getMe(token)

    expect(deletedUser.status).toBe(401)
    expect(deletedUser.headers['content-type']).toMatch(/^application\/problem\+json/)

    expect({
      title: deletedUser.body.title,
      detail: deletedUser.body.detail,
    }).toEqual({
      title: invalidToken.body.title,
      detail: invalidToken.body.detail,
    })
  })
})

describe('PATCH /v1/users/me', () => {
  it('200: updates displayName and bio', async () => {
    const registration = await register(validBody())

    const token = registration.body.tokens.accessToken

    const res = await patchMe(token, {
      displayName: 'New Name',
      bio: 'hi',
    })

    expect(res.status).toBe(200)
    expect(res.body.displayName).toBe('New Name')
    expect(res.body.bio).toBe('hi')
  })

  it('persists updated profile fields', async () => {
    const registration = await register(validBody())

    const token = registration.body.tokens.accessToken

    await patchMe(token, {
      displayName: 'New Name',
      bio: 'hi',
    })

    const res = await getMe(token)

    expect(res.status).toBe(200)
    expect(res.body.displayName).toBe('New Name')
    expect(res.body.bio).toBe('hi')
  })

  it('200: clears bio when set to null', async () => {
    const registration = await register(validBody())

    const token = registration.body.tokens.accessToken

    await patchMe(token, { bio: 'Existing bio' })

    const res = await patchMe(token, { bio: null })

    expect(res.status).toBe(200)
    expect(res.body.bio).toBeNull()
  })

  it('422: rejects an empty patch', async () => {
    const registration = await register(validBody())

    const token = registration.body.tokens.accessToken

    const res = await patchMe(token, {})

    expect(res.status).toBe(422)
  })

  it('422: rejects an invalid website', async () => {
    const registration = await register(validBody())

    const token = registration.body.tokens.accessToken

    const res = await patchMe(token, {
      website: 'javascript:alert(1)',
    })

    expect(res.status).toBe(422)
    expect(res.body.errors[0].field).toBe('website')
  })

  it('422: rejects unsupported avatarMediaId', async () => {
    const registration = await register(validBody())
    const token = registration.body.tokens.accessToken

    const res = await patchMe(token, {
      avatarMediaId: newId(),
    })

    expect(res.status).toBe(422)
    expect(res.body.errors[0].field).toBe('avatarMediaId')
    expect(res.body.errors[0].message).toBe('not supported yet')
  })

  it('401: rejects unauthenticated requests before body validation', async () => {
    const res = await patchMe(undefined, {
      website: '',
    })

    expect(res.status).toBe(401)
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/)
  })

  it('422: rejects invalid request body values', async () => {
    const registration = await register(validBody())

    const token = registration.body.tokens.accessToken

    const res = await patchMe(token, {
      displayName: 123,
    })

    expect(res.status).toBe(422)
  })
})
