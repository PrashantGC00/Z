import { useQueries } from '@tanstack/react-query'
import type { components } from '@/api/schema'
import { BACKEND_ORDER, BACKENDS, type BackendId } from '@/config/backends'
import { queryClient } from '@/lib/query'
import { useSession } from '@/stores/session'

type Health = components['schemas']['Health']

export type HealthResult = { up: true; health: Health } | { up: false; reason: string }

/**
 * Probes `/health` directly (not through the typed client) so the probe ignores x-status:
 * a backend can be running before it has marked anything LIVE.
 */
async function probe(id: BackendId): Promise<HealthResult> {
  try {
    const res = await fetch(`${BACKENDS[id].baseUrl}/health`, { signal: AbortSignal.timeout(2500) })
    if (!res.ok) return { up: false, reason: `HTTP ${res.status}` }
    return { up: true, health: (await res.json()) as Health }
  } catch {
    return { up: false, reason: 'No response' }
  }
}

export function useAllHealth() {
  return useQueries({
    queries: BACKEND_ORDER.map((id) => ({
      queryKey: ['health', id],
      queryFn: () => probe(id),
      refetchInterval: 20_000,
      staleTime: 10_000,
      retry: false,
    })),
    combine: (results) =>
      Object.fromEntries(BACKEND_ORDER.map((id, i) => [id, results[i].data])) as Record<
        BackendId,
        HealthResult | undefined
      >,
  })
}

/** Switch backends. Each backend has its own data, so everything cached from the old one goes. */
export function switchBackend(id: BackendId) {
  const health = queryClient.getQueriesData({ queryKey: ['health'] })
  useSession.getState().setBackend(id)
  queryClient.clear()
  // Keep health probes so the switcher does not flash "checking" for every backend.
  health.forEach(([key, data]) => queryClient.setQueryData(key, data))
}
