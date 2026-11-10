import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessTokenVerifier } from '../application/ports.ts'
import { makeRequireAuth } from './require-auth.ts'
import { problemHandler } from '../../../platform/http/problem.ts'

const verifier = {
  verify: vi.fn<AccessTokenVerifier['verify']>(async () => null),
}

const app = express()

app.get('/x', makeRequireAuth(verifier), (req, res) => res.json(req.auth))
app.use(problemHandler)

const get = (authorization?: string) => {
  const r = request(app).get('/x')
  return authorization ? r.set('Authorization', authorization) : r
}

beforeEach(() => verifier.verify.mockClear())

describe('requireAuth', () => {
  it('rejects requests without an Authorization header', async () => {
    const res = await get()

    expect(res.status).toBe(401)
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/)
    expect(verifier.verify).not.toHaveBeenCalled()
  })

  it('rejects requests with an incorrect authentication scheme', async () => {
    const res = await get('Basic abc')

    expect(res.status).toBe(401)
    expect(verifier.verify).not.toHaveBeenCalled()
  })

  it('rejects requests with an empty bearer token', async () => {
    const res = await get('Bearer ')

    expect(res.status).toBe(401)
    expect(verifier.verify).not.toHaveBeenCalled()
  })

  it('rejects requests when the verifier returns null', async () => {
    const res = await get('Bearer bad')

    expect(res.status).toBe(401)
    expect(verifier.verify).toHaveBeenCalledWith('bad')
  })

  it('attaches the verified identity to req.auth', async () => {
    verifier.verify.mockResolvedValueOnce({ userId: 'u1' })

    const res = await get('Bearer good')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ userId: 'u1' })
    expect(verifier.verify).toHaveBeenCalledWith('good')
    expect(verifier.verify).not.toHaveBeenCalledWith('Bearer good')
  })

  it('accepts a lowercase bearer scheme', async () => {
    verifier.verify.mockResolvedValueOnce({ userId: 'u1' })

    const res = await get('bearer good')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ userId: 'u1' })
    expect(verifier.verify).toHaveBeenCalledWith('good')
  })
})
