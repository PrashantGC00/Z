import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { components } from '@/api/schema'
import { type BackendId, DEFAULT_BACKEND } from '@/config/backends'

type AuthTokens = components['schemas']['AuthTokens']

interface SessionState {
  backendId: BackendId
  /**
   * Each backend has its own user database, so a session on one is meaningless on another.
   * Keeping tokens per backend lets you flip between them without signing in again.
   */
  tokens: Partial<Record<BackendId, AuthTokens>>
  /** When true, calls to operations marked OFFLINE for the selected backend are short-circuited. */
  respectStatus: boolean
  setBackend: (id: BackendId) => void
  setTokens: (tokens: AuthTokens | null) => void
  /** For async work that started on one backend and may finish after a switch. */
  setTokensFor: (id: BackendId, tokens: AuthTokens | null) => void
  setRespectStatus: (value: boolean) => void
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      backendId: DEFAULT_BACKEND,
      tokens: {},
      respectStatus: true,
      setBackend: (backendId) => set({ backendId }),
      setTokens: (tokens) => set((s) => ({ tokens: { ...s.tokens, [s.backendId]: tokens ?? undefined } })),
      setTokensFor: (id, tokens) => set((s) => ({ tokens: { ...s.tokens, [id]: tokens ?? undefined } })),
      setRespectStatus: (respectStatus) => set({ respectStatus }),
    }),
    {
      name: 'z.session.v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

export const currentTokens = () => {
  const s = useSession.getState()
  return s.tokens[s.backendId]
}

export const useIsSignedIn = () => useSession((s) => Boolean(s.tokens[s.backendId]))
