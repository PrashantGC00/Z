import { InvalidRefreshToken } from '../domain/errors.ts'
import type { AccessTokenIssuer, RefreshTokenGenerator, RefreshTokenRepository } from './ports.ts'

export type RefreshTokensDeps = {
  tokenStore: Pick<RefreshTokenRepository, 'claim' | 'findByHash' | 'revokeFamily' | 'create'>
  refreshTokens: RefreshTokenGenerator
  accessTokens: AccessTokenIssuer
  newId: () => string
  now: () => Date
  refreshTtlSeconds: number
}

export const makeRefreshToken = (deps: RefreshTokensDeps) => async (refreshToken: string) => {
  const now = deps.now()
  const hash = deps.refreshTokens.hash(refreshToken)
  const claim = await deps.tokenStore.claim(hash, now)
  if (!claim) {
    const exists = await deps.tokenStore.findByHash(hash)
    if (!exists) throw new InvalidRefreshToken()
    if (exists.usedAt !== null || exists.revokedAt !== null) await deps.tokenStore.revokeFamily(exists.familyId, now)
    throw new InvalidRefreshToken()
  }

  const { token: newToken, tokenHash } = deps.refreshTokens.generate()
  const expiresAt = new Date(now.getTime() + deps.refreshTtlSeconds * 1000)

  await deps.tokenStore.create({
    id: deps.newId(),
    userId: claim.userId,
    familyId: claim.familyId,
    tokenHash,
    expiresAt,
  })
  const { accessToken, expiresIn } = await deps.accessTokens.issue(claim.userId)
  return {
    accessToken,
    refreshToken: newToken,
    expiresIn,
  }
}
