import { createContext, type ReactNode, use, useEffect, useState } from 'react'
import type { InfiniteData } from '@tanstack/react-query'
import { api } from '@/api/client'
import { isLive } from '@/api/contract'
import { unwrap } from '@/api/errors'
import type { components } from '@/api/schema'
import { upsertMessage } from '@/features/chat/api'
import { keys, queryClient, updatePostEverywhere } from '@/lib/query'
import { useIsSignedIn, useSession } from '@/stores/session'
import { useTyping } from '@/stores/typing'
import { type ConnectionState, RealtimeClient } from './client'
import { transportFor } from './transports'

type S = components['schemas']

interface RealtimeContextValue {
  client: RealtimeClient | null
  state: ConnectionState
}

const RealtimeContext = createContext<RealtimeContextValue>({ client: null, state: 'idle' })

// eslint-disable-next-line react-refresh/only-export-components
export const useRealtime = () => use(RealtimeContext)

/** Route server events into the query cache, so components only ever read from React Query. */
function wire(client: RealtimeClient, myId: () => string | undefined) {
  const offs = [
    client.on('message.created', (message) => {
      upsertMessage(message)
      useTyping.getState().clear(message.conversationId, message.sender.id)
      if (message.sender.id !== myId()) {
        queryClient.setQueryData<InfiniteData<S['ConversationPage']>>(
          keys.conversations,
          (data) =>
            data && {
              ...data,
              pages: data.pages.map((p) => ({
                ...p,
                data: p.data.map((c) =>
                  c.id === message.conversationId ? { ...c, unreadCount: c.unreadCount + 1 } : c,
                ),
              })),
            },
        )
      }
    }),
    client.on('typing', ({ conversationId, userId }) => {
      if (userId !== myId()) useTyping.getState().mark(conversationId, userId)
    }),
    client.on('notification.created', () => void queryClient.invalidateQueries({ queryKey: keys.notifications })),
    client.on('unread.changed', (counts) => queryClient.setQueryData(keys.unread, counts)),
    client.on('post.stats', ({ postId, likes, comments, shares }) =>
      updatePostEverywhere(postId, (p) => ({ ...p, stats: { likes, comments, shares } })),
    ),
  ]
  return () => offs.forEach((off) => off())
}

/**
 * Owns the single realtime connection. Reconnects when the backend or session changes and
 * stays idle on backends that have not built the ticket endpoint yet.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const backendId = useSession((s) => s.backendId)
  const respect = useSession((s) => s.respectStatus)
  const signedIn = useIsSignedIn()
  const enabled = signedIn && (!respect || isLive('createRealtimeTicket', backendId))
  const [value, setValue] = useState<RealtimeContextValue>({ client: null, state: 'idle' })

  useEffect(() => {
    if (!enabled) return
    const client = new RealtimeClient(async () => unwrap(await api().POST('/realtime/tickets')).url, transportFor)
    const unwire = wire(client, () => queryClient.getQueryData<S['Me']>(keys.me)?.id)
    const offState = client.onState((state) => setValue({ client, state }))
    client.start()
    return () => {
      offState()
      unwire()
      client.stop()
      setValue({ client: null, state: 'idle' })
    }
  }, [backendId, enabled])

  return <RealtimeContext value={value}>{children}</RealtimeContext>
}
