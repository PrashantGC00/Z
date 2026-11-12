import { InvalidRefreshToken } from '../domain/errors.ts'
import type { AccessTokenIssuer, RefreshTokenGenerator, RefreshTokenRepository } from './ports.ts'

export type RefreshTokensDeps = {
  tokenStore: Pick<RefreshTokenRepository, 'rotate' | 'findByHash' | 'revokeFamily'>
  refreshTokens: RefreshTokenGenerator
  accessTokens: AccessTokenIssuer
  newId: () => string
  now: () => Date
  refreshTtlSeconds: number
}

export const makeRefreshToken = (deps: RefreshTokensDeps) => async (refreshToken: string) => {
  const now = deps.now()
  const hash = deps.refreshTokens.hash(refreshToken)

  const { token: newToken, tokenHash: nextHash } = deps.refreshTokens.generate()
  const id = deps.newId()
  const expiresAt = new Date(now.getTime() + deps.refreshTtlSeconds * 1000)

  const rotated = await deps.tokenStore.rotate(
    hash,
    {
      id,
      tokenHash: nextHash,
      expiresAt,
    },
    now,
  )

  if (!rotated) {
    const exists = await deps.tokenStore.findByHash(hash)
    if (!exists) throw new InvalidRefreshToken()
    if (exists.usedAt !== null || exists.revokedAt !== null) {
      await deps.tokenStore.revokeFamily(exists.familyId, now)
    }

    throw new InvalidRefreshToken()
  }

  const { accessToken, expiresIn } = await deps.accessTokens.issue(rotated.userId)

  return {
    accessToken,
    refreshToken: newToken,
    expiresIn,
  }
}
