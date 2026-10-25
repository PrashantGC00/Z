import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { unwrap } from '@/api/errors'
import { keys } from '@/lib/query'

export function useSearch(q: string) {
  const query = q.trim()
  return useQuery({
    queryKey: keys.search(query),
    queryFn: async () => unwrap(await api().GET('/search', { params: { query: { q: query, type: 'all', limit: 8 } } })),
    enabled: query.length > 0,
    placeholderData: keepPreviousData,
  })
}

export function useTrending() {
  return useQuery({
    queryKey: keys.trending,
    queryFn: async () => unwrap(await api().GET('/hashtags/trending', { params: { query: { limit: 6 } } })).data,
    staleTime: 5 * 60_000,
  })
}
