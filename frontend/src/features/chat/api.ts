import { type InfiniteData, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { unwrap } from '@/api/errors'
import type { components } from '@/api/schema'
import { keys, nextCursor, queryClient } from '@/lib/query'

type S = components['schemas']
type MessagePage = S['MessagePage']
type ConversationPage = S['ConversationPage']

/** Messages that are on screen but not yet confirmed by the server. */
export type ChatMessage = S['Message'] & { pending?: boolean; failed?: boolean }

export function useConversations() {
  return useInfiniteQuery({
    queryKey: keys.conversations,
    queryFn: async ({ pageParam }) =>
      unwrap(await api().GET('/conversations', { params: { query: { cursor: pageParam, limit: 30 } } })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  })
}

export function useConversation(conversationId: string) {
  return useQuery({
    queryKey: keys.conversation(conversationId),
    queryFn: async () =>
      unwrap(await api().GET('/conversations/{conversationId}', { params: { path: { conversationId } } })),
  })
}

export function useMessages(conversationId: string) {
  return useInfiniteQuery({
    queryKey: keys.messages(conversationId),
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api().GET('/conversations/{conversationId}/messages', {
          params: { path: { conversationId }, query: { cursor: pageParam, limit: 30 } },
        }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  })
}

/**
 * Insert or replace a message in the cache. Matching on clientMessageId means the optimistic
 * copy, the POST response and the realtime echo all collapse into one bubble, in any order.
 */
export function upsertMessage(message: ChatMessage) {
  queryClient.setQueryData<InfiniteData<MessagePage>>(keys.messages(message.conversationId), (data) => {
    if (!data) return data
    const exists = data.pages.some((p) => p.data.some((m) => m.clientMessageId === message.clientMessageId))
    const pages = exists
      ? data.pages.map((p) => ({
          ...p,
          data: p.data.map((m) => (m.clientMessageId === message.clientMessageId ? message : m)),
        }))
      : data.pages.map((p, i) => (i === 0 ? { ...p, data: [message, ...p.data] } : p))
    return { ...data, pages }
  })
  queryClient.setQueryData<InfiniteData<ConversationPage>>(keys.conversations, (data) => {
    if (!data) return data
    const all = data.pages.flatMap((p) => p.data)
    const convo = all.find((c) => c.id === message.conversationId)
    if (!convo) {
      void queryClient.invalidateQueries({ queryKey: keys.conversations })
      return data
    }
    const updated = { ...convo, lastMessage: message, updatedAt: message.createdAt }
    const [first, ...rest] = data.pages
    return {
      ...data,
      pages: [
        { ...first, data: [updated, ...first.data.filter((c) => c.id !== convo.id)] },
        ...rest.map((p) => ({ ...p, data: p.data.filter((c) => c.id !== convo.id) })),
      ],
    }
  })
}

export function useSendMessage(conversationId: string, me: S['UserSummary'] | undefined) {
  return useMutation({
    mutationFn: async (body: S['SendMessageRequest']) =>
      unwrap(
        await api().POST('/conversations/{conversationId}/messages', { params: { path: { conversationId } }, body }),
      ),
    onMutate: (body) => {
      if (!me) return
      upsertMessage({
        id: `pending-${body.clientMessageId}`,
        conversationId,
        clientMessageId: body.clientMessageId,
        sender: me,
        text: body.text ?? '',
        media: [],
        replyToId: body.replyToId ?? null,
        createdAt: new Date().toISOString(),
        pending: true,
      })
    },
    onSuccess: (message) => upsertMessage(message),
    onError: (_e, body) => {
      const data = queryClient.getQueryData<InfiniteData<MessagePage>>(keys.messages(conversationId))
      const optimistic = data?.pages.flatMap((p) => p.data).find((m) => m.clientMessageId === body.clientMessageId)
      if (optimistic) upsertMessage({ ...optimistic, pending: false, failed: true })
    },
  })
}

export function useMarkRead(conversationId: string) {
  return useMutation({
    mutationFn: async (lastReadMessageId: string) =>
      unwrap(
        await api().POST('/conversations/{conversationId}/read', {
          params: { path: { conversationId } },
          body: { lastReadMessageId },
        }),
      ),
    onSuccess: () => {
      queryClient.setQueryData<InfiniteData<ConversationPage>>(
        keys.conversations,
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((p) => ({
              ...p,
              data: p.data.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
            })),
          },
      )
    },
  })
}

export function useStartConversation() {
  return useMutation({
    mutationFn: async (body: S['CreateConversationRequest']) => unwrap(await api().POST('/conversations', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.conversations }),
  })
}
