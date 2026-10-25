import createClient, { type Client, type Middleware } from 'openapi-fetch'
import { BACKENDS, type BackendId } from '@/config/backends'
import { currentTokens, useSession } from '@/stores/session'
import { operationForRoute, statusOf } from './contract'
import { NETWORK_PROBLEM_TYPE, OFFLINE_PROBLEM_TYPE, problemResponse } from './errors'
import type { components, paths } from './schema'

type AuthTokens = components['schemas']['AuthTokens']

const replayable = new Map<string, Request>()

/** A stand-in response for a fetch that threw, so callers get an ApiError instead of a TypeError. */
function unreachable(backendId: BackendId): Response {
  return problemResponse({
    type: NETWORK_PROBLEM_TYPE,
    title: 'Backend unreachable',
    status: 503,
    detail: `Could not reach ${BACKENDS[backendId].name} at ${BACKENDS[backendId].baseUrl}.`,
  })
}

/** Turns a fetch that threw (backend down, CORS, DNS) into a problem+json response. */
const network = (backendId: BackendId): Middleware => ({
  onError() {
    return unreachable(backendId)
  },
})

/**
 * Refuses calls the selected backend has not built yet (x-status: OFFLINE), so the UI can
 * explain what is missing instead of showing a generic network failure.
 */
const statusGate = (backendId: BackendId): Middleware => ({
  onRequest({ request, schemaPath }) {
    if (!useSession.getState().respectStatus) return
    const op = operationForRoute(request.method, schemaPath)
    if (!op || statusOf(op, backendId) === 'LIVE') return
    return problemResponse({
      type: OFFLINE_PROBLEM_TYPE,
      title: 'Not built yet',
      status: 503,
      detail: `${op.operationId} is OFFLINE on the ${BACKENDS[backendId].name} backend.`,
    })
  },
})

const auth: Middleware = {
  onRequest({ request }) {
    const tokens = currentTokens()
    if (tokens) request.headers.set('Authorization', `Bearer ${tokens.accessToken}`)
    return request
  },
}

// Per backend: a refresh in flight on one must not hand its tokens to a 401 from another.
const refreshing = new Map<BackendId, Promise<AuthTokens | null>>()

/**
 * Single-flight token rotation: concurrent 401s share one refresh call. Only a rejected refresh
 * token (400/401) signs out; a network blip or 5xx keeps the session for the next attempt.
 */
function refreshOnce(backendId: BackendId, client: Client<paths>): Promise<AuthTokens | null> {
  const inFlight = refreshing.get(backendId)
  if (inFlight) return inFlight
  const next = (async () => {
    const refreshToken = useSession.getState().tokens[backendId]?.refreshToken
    if (!refreshToken) return null
    const { data, response } = await client.POST('/auth/refresh', { body: { refreshToken } })
    if (data) {
      useSession.getState().setTokensFor(backendId, data)
      return data
    }
    if (response.status === 400 || response.status === 401) useSession.getState().setTokensFor(backendId, null)
    return null
  })().finally(() => {
    refreshing.delete(backendId)
  })
  refreshing.set(backendId, next)
  return next
}

const refresh = (backendId: BackendId, getClient: () => Client<paths>): Middleware => ({
  onRequest({ id, request, schemaPath }) {
    if (!schemaPath.startsWith('/auth/')) replayable.set(id, request.clone())
  },
  async onResponse({ id, response }) {
    const original = replayable.get(id)
    replayable.delete(id)
    if (response.status !== 401 || !original) return
    // A 401 for a token that has since been rotated just needs replaying; refreshing again
    // would spend the new refresh token for nothing.
    const sent = original.headers.get('Authorization')
    const current = useSession.getState().tokens[backendId]
    const tokens =
      current && sent !== `Bearer ${current.accessToken}` ? current : await refreshOnce(backendId, getClient())
    if (!tokens) return
    original.headers.set('Authorization', `Bearer ${tokens.accessToken}`)
    try {
      return await fetch(original)
    } catch {
      return unreachable(backendId)
    }
  },
})

const clients = new Map<BackendId, Client<paths>>()

function clientFor(backendId: BackendId): Client<paths> {
  let client = clients.get(backendId)
  if (!client) {
    const created = createClient<paths>({ baseUrl: BACKENDS[backendId].baseUrl })
    created.use(
      network(backendId),
      statusGate(backendId),
      auth,
      refresh(backendId, () => created),
    )
    clients.set(backendId, created)
    client = created
  }
  return client
}

/** The typed client for whichever backend is selected right now. */
export function api(): Client<paths> {
  return clientFor(useSession.getState().backendId)
}
