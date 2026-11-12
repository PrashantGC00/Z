import type { RefreshTokenGenerator, RefreshTokenRepository } from './ports.ts'

export type LogoutDeps = {
  tokenStore: Pick<RefreshTokenRepository, 'findByHash' | 'revokeFamily'>
  refreshTokens: Pick<RefreshTokenGenerator, 'hash'>
  now: () => Date
}

export const makeLogout = (deps: LogoutDeps) => async (refreshToken: string) => {
  const hash = deps.refreshTokens.hash(refreshToken)
  const row = await deps.tokenStore.findByHash(hash)
  if (row) await deps.tokenStore.revokeFamily(row.familyId, deps.now())
}
