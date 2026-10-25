import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { unwrap } from '@/api/errors'
import type { components } from '@/api/schema'
import { keys, nextCursor, queryClient } from '@/lib/query'

type S = components['schemas']

export function useProfile(username: string) {
  return useQuery({
    queryKey: keys.profile(username),
    queryFn: async () => unwrap(await api().GET('/users/{username}', { params: { path: { username } } })),
  })
}

export function useConnections(username: string, kind: 'followers' | 'following', enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.followers(username, kind),
    queryFn: async ({ pageParam }) => {
      const params = { path: { username }, query: { cursor: pageParam, limit: 20 } }
      return unwrap(
        kind === 'followers'
          ? await api().GET('/users/{username}/followers', { params })
          : await api().GET('/users/{username}/following', { params }),
      )
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled,
  })
}

export function useSuggestions() {
  return useQuery({
    queryKey: keys.suggestions,
    queryFn: async () => unwrap(await api().GET('/suggestions/users', { params: { query: { limit: 4 } } })).data,
  })
}

function applyRelationship(username: string, relationship: S['Relationship'], followerDelta: number) {
  queryClient.setQueryData<S['UserProfile']>(
    keys.profile(username),
    (p) => p && { ...p, relationship, stats: { ...p.stats, followers: p.stats.followers + followerDelta } },
  )
}

export function useToggleFollow() {
  return useMutation({
    mutationFn: async ({ username, following }: { username: string; following: boolean }) => {
      const params = { path: { username } }
      return unwrap(
        following
          ? await api().DELETE('/users/{username}/follow', { params })
          : await api().PUT('/users/{username}/follow', { params }),
      )
    },
    onSuccess: (relationship, { username, following }) => {
      applyRelationship(username, relationship, following ? -1 : 1)
      void queryClient.invalidateQueries({ queryKey: keys.suggestions })
      void queryClient.invalidateQueries({ queryKey: keys.feed })
      void queryClient.invalidateQueries({ queryKey: keys.me })
    },
  })
}

export function useToggleBlock() {
  return useMutation({
    mutationFn: async ({ username, blocking }: { username: string; blocking: boolean }) => {
      const params = { path: { username } }
      return unwrap(
        blocking
          ? await api().DELETE('/users/{username}/block', { params })
          : await api().PUT('/users/{username}/block', { params }),
      )
    },
    onSuccess: (_relationship, { username }) => {
      void queryClient.invalidateQueries({ queryKey: keys.profile(username) })
      void queryClient.invalidateQueries({ queryKey: keys.posts })
    },
  })
}
