import { describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../src/app.ts'

describe('health integration', () => {
  it('returns ready when PostgreSQL is available', async () => {
    const response = await request(app).get('/readyz')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      status: 'ready',
    })
  })
})
