import { type InfiniteData, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { unwrap } from '@/api/errors'
import type { components } from '@/api/schema'
import { keys, nextCursor, queryClient } from '@/lib/query'
import { useIsSignedIn } from '@/stores/session'

type S = components['schemas']
type NotificationPage = S['NotificationPage']

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: keys.notifications,
    queryFn: async ({ pageParam }) =>
      unwrap(await api().GET('/notifications', { params: { query: { cursor: pageParam, limit: 20 } } })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  })
}

/** Realtime pushes `unread.changed`; polling is only the fallback when the socket is down. */
export function useUnreadCounts() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: keys.unread,
    queryFn: async () => unwrap(await api().GET('/notifications/unread-count')),
    enabled: signedIn,
    refetchInterval: 60_000,
  })
}

const markAll = (read: (n: S['Notification']) => boolean) =>
  queryClient.setQueryData<InfiniteData<NotificationPage>>(
    keys.notifications,
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((p) => ({ ...p, data: p.data.map((n) => (read(n) ? { ...n, read: true } : n)) })),
      },
  )

export function useMarkNotificationRead() {
  return useMutation({
    mutationFn: async (notificationId: string) =>
      unwrap(await api().POST('/notifications/{notificationId}/read', { params: { path: { notificationId } } })),
    onMutate: (id) => markAll((n) => n.id === id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.unread }),
  })
}

export function useMarkAllRead() {
  return useMutation({
    mutationFn: async () => unwrap(await api().POST('/notifications/read-all')),
    onMutate: () => markAll(() => true),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.unread }),
  })
}

export function usePreferences() {
  return useQuery({
    queryKey: keys.preferences,
    queryFn: async () => unwrap(await api().GET('/notifications/preferences')),
  })
}

export function useUpdatePreferences() {
  return useMutation({
    mutationFn: async (body: S['NotificationPreferences']) =>
      unwrap(await api().PUT('/notifications/preferences', { body })),
    onMutate: (body) => queryClient.setQueryData(keys.preferences, body),
    onSuccess: (prefs) => queryClient.setQueryData(keys.preferences, prefs),
  })
}
