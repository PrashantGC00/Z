import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../src/app.ts'

describe('error contract (routes behind validateRequests)', () => {
  it('returns problem+json for an unknown route', async () => {
    const res = await request(app).get('/v1/nope')

    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/)
    expect(res.body).toMatchObject({ status: 404 })
    expect(typeof res.body.title).toBe('string')
  })

  it('maps validation failures to 422 with a field-level error', async () => {
    const res = await request(app).post('/v1/auth/login').send({ email: 'x' })

    expect(res.status).toBe(422)
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/)
    expect(Array.isArray(res.body.errors)).toBe(true)
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'password' })]))
  })
})
