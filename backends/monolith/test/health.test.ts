import { describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../src/app.ts'

describe('health endpoints', () => {
  it('returns the health response', async () => {
    const response = await request(app).get('/v1/health')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      status: 'ok',
      architecture: 'monolith',
      time: expect.any(String),
      version: expect.any(String),
      dependencies: {
        database: 'ok',
      },
    })

    expect(Number.isNaN(Date.parse(response.body.time))).toBe(false)
  })
})

describe('server live', () => {
  it('returns server status', async () => {
    const response = await request(app).get('/livez')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      status: 'ok',
    })
  })
})

describe('server ready', () => {
  it('returns server ready status', async () => {
    const response = await request(app).get('/readyz')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      status: 'ready',
    })
  })
})
