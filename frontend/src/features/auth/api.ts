import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { unwrap } from '@/api/errors'
import type { components } from '@/api/schema'
import { keys, queryClient } from '@/lib/query'
import { currentTokens, useIsSignedIn, useSession } from '@/stores/session'

type S = components['schemas']

export function useMe() {
  const signedIn = useIsSignedIn()
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => unwrap(await api().GET('/users/me')),
    enabled: signedIn,
    staleTime: 5 * 60_000,
  })
}

function startSession(session: S['AuthSession']) {
  useSession.getState().setTokens(session.tokens)
  queryClient.setQueryData(keys.me, session.user)
}

export function useLogin() {
  return useMutation({
    mutationFn: async (body: S['LoginRequest']) => unwrap(await api().POST('/auth/login', { body })),
    onSuccess: startSession,
  })
}

export function useRegister() {
  return useMutation({
    mutationFn: async (body: S['RegisterRequest']) => unwrap(await api().POST('/auth/register', { body })),
    onSuccess: startSession,
  })
}

export function useLogout() {
  return useMutation({
    mutationFn: async () => {
      const refreshToken = currentTokens()?.refreshToken
      // Signing out locally must work even when the backend is down or has not built logout.
      if (refreshToken)
        await api()
          .POST('/auth/logout', { body: { refreshToken } })
          .catch(() => {})
    },
    onSettled: () => {
      useSession.getState().setTokens(null)
      queryClient.clear()
    },
  })
}

export function useUpdateProfile() {
  return useMutation({
    mutationFn: async (body: S['UpdateProfileRequest']) => unwrap(await api().PATCH('/users/me', { body })),
    onSuccess: (me) => {
      queryClient.setQueryData(keys.me, me)
      void queryClient.invalidateQueries({ queryKey: keys.profile(me.username) })
    },
  })
}
