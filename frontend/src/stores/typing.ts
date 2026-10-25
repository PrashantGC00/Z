import { create } from 'zustand'

const TYPING_TTL_MS = 5000

interface TypingState {
  /** conversationId → userId → expiry timestamp */
  typing: Record<string, Record<string, number>>
  mark: (conversationId: string, userId: string) => void
  clear: (conversationId: string, userId: string) => void
}

export const useTyping = create<TypingState>()((set, get) => ({
  typing: {},
  mark: (conversationId, userId) => {
    set((s) => ({
      typing: { ...s.typing, [conversationId]: { ...s.typing[conversationId], [userId]: Date.now() + TYPING_TTL_MS } },
    }))
    setTimeout(() => {
      const expiry = get().typing[conversationId]?.[userId]
      if (expiry && expiry <= Date.now()) get().clear(conversationId, userId)
    }, TYPING_TTL_MS + 50)
  },
  clear: (conversationId, userId) =>
    set((s) => {
      const { [userId]: _gone, ...rest } = s.typing[conversationId] ?? {}
      return { typing: { ...s.typing, [conversationId]: rest } }
    }),
}))
