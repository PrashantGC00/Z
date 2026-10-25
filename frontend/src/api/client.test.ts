import { delay, http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BACKENDS } from '@/config/backends'
import { useSession } from '@/stores/session'
import { api } from './client'
import { ApiError, unwrap } from './errors'

const base = BACKENDS.monolith.baseUrl
const OLD = { accessToken: 'old-access', refreshToken: 'old-refresh', expiresIn: 900 }
const NEW = { accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 900 }
const me = { id: '01J0000000000000000000000', username: 'test' }

const server = setupServer()
let refreshCalls = 0

/** `/users/me` accepts only the new token; the refresh endpoint rotates old → new. */
function useAuthHandlers({ refresh = () => HttpResponse.json(NEW) }: { refresh?: () => Response } = {}) {
  server.use(
    http.get(`${base}/users/me`, ({ request }) =>
      request.headers.get('Authorization') === `Bearer ${NEW.accessToken}`
        ? HttpResponse.json(me)
        : new HttpResponse(null, { status: 401 }),
    ),
    http.post(`${base}/auth/refresh`, async () => {
      refreshCalls++
      await delay(10)
      return refresh()
    }),
  )
}

const getMe = async () => unwrap(await api().GET('/users/me'))

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
beforeEach(() => {
  refreshCalls = 0
  useSession.setState({ backendId: 'monolith', tokens: { monolith: OLD }, respectStatus: false })
})

describe('token refresh', () => {
  it('refreshes on a 401 and replays the request with the new token', async () => {
    useAuthHandlers()
    await expect(getMe()).resolves.toEqual(me)
    expect(refreshCalls).toBe(1)
    expect(useSession.getState().tokens.monolith).toEqual(NEW)
  })

  it('shares one refresh between concurrent 401s', async () => {
    useAuthHandlers()
    await expect(Promise.all([getMe(), getMe(), getMe()])).resolves.toEqual([me, me, me])
    expect(refreshCalls).toBe(1)
  })

  it('replays a late 401 for an already rotated token without refreshing again', async () => {
    useAuthHandlers()
    // The slow request was sent with the old token but only fails after the refresh is done.
    server.use(
      http.get(`${base}/users/me`, async ({ request }) => {
        if (request.headers.get('X-Slow')) await delay(50)
        return request.headers.get('Authorization') === `Bearer ${NEW.accessToken}`
          ? HttpResponse.json(me)
          : new HttpResponse(null, { status: 401 })
      }),
    )
    const slow = api().GET('/users/me', { headers: { 'X-Slow': '1' } })
    await expect(getMe()).resolves.toEqual(me)
    expect(unwrap(await slow)).toEqual(me)
    expect(refreshCalls).toBe(1)
  })

  it('signs out when the refresh token is rejected', async () => {
    useAuthHandlers({ refresh: () => new HttpResponse(null, { status: 401 }) })
    await expect(getMe()).rejects.toMatchObject({ status: 401 })
    expect(useSession.getState().tokens.monolith).toBeUndefined()
  })

  it('keeps the session when the refresh call fails with a 5xx', async () => {
    useAuthHandlers({ refresh: () => new HttpResponse(null, { status: 503 }) })
    await expect(getMe()).rejects.toMatchObject({ status: 401 })
    expect(useSession.getState().tokens.monolith).toEqual(OLD)
  })
})

describe('failures before the backend answers', () => {
  it('turns an unreachable backend into an ApiError', async () => {
    server.use(http.get(`${base}/users/me`, () => HttpResponse.error()))
    const error = await getMe().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).isUnreachable).toBe(true)
  })

  it('short-circuits operations that are OFFLINE on the selected backend', async () => {
    let called = false
    server.use(
      http.get(`${base}/users/me`, () => {
        called = true
        return HttpResponse.json(me)
      }),
    )
    useSession.setState({ respectStatus: true })
    const error = await getMe().catch((e: unknown) => e)
    expect((error as ApiError).isOffline).toBe(true)
    expect(called).toBe(false)
  })
})
