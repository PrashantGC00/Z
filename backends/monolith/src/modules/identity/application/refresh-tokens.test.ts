import { describe, expect, it, vi } from 'vitest'
import { InvalidRefreshToken } from '../domain/errors.ts'
import type { AccessTokenIssuer, RefreshTokenGenerator, RefreshTokenRepository } from './ports.ts'
import { makeRefreshToken } from './refresh-tokens.ts'
import { NOW } from '../../../../test/helpers.ts'

const TTL = 60 * 60 * 24 * 30

const setup = () => {
  const tokenStore = {
    rotate: vi.fn<RefreshTokenRepository['rotate']>(async () => ({
      userId: 'user-1',
      familyId: 'fam-1',
    })),
    findByHash: vi.fn<RefreshTokenRepository['findByHash']>(async () => null),
    revokeFamily: vi.fn<RefreshTokenRepository['revokeFamily']>(async () => {}),
  }

  const refreshTokens = {
    generate: vi.fn<RefreshTokenGenerator['generate']>(() => ({
      token: 'new-raw',
      tokenHash: Buffer.from('new-hash'),
    })),
    hash: vi.fn<RefreshTokenGenerator['hash']>(() => Buffer.from('presented-hash')),
  }

  const accessTokens = {
    issue: vi.fn<AccessTokenIssuer['issue']>(async () => ({
      accessToken: 'access-jwt',
      expiresIn: 900,
    })),
  }

  const refresh = makeRefreshToken({
    tokenStore,
    refreshTokens,
    accessTokens,
    newId: () => 'id-1',
    now: () => NOW,
    refreshTtlSeconds: TTL,
  })

  return { refresh, tokenStore, refreshTokens, accessTokens }
}

describe('refreshToken', () => {
  it('returns new access and refresh tokens', async () => {
    const { refresh } = setup()

    const result = await refresh('old-raw')

    expect(result).toEqual({
      accessToken: 'access-jwt',
      refreshToken: 'new-raw',
      expiresIn: 900,
    })
  })

  it('rotates the presented token and inserts its replacement', async () => {
    const { refresh, tokenStore } = setup()

    await refresh('old-raw')

    expect(tokenStore.rotate).toHaveBeenCalledWith(
      Buffer.from('presented-hash'),
      {
        id: 'id-1',
        tokenHash: Buffer.from('new-hash'),
        expiresAt: new Date(NOW.getTime() + TTL * 1000),
      },
      NOW,
    )
  })

  it('rejects an unknown refresh token', async () => {
    const { refresh, tokenStore } = setup()

    tokenStore.rotate.mockResolvedValueOnce(null)
    tokenStore.findByHash.mockResolvedValueOnce(null)

    await expect(refresh('old-raw')).rejects.toBeInstanceOf(InvalidRefreshToken)

    expect(tokenStore.revokeFamily).not.toHaveBeenCalled()
  })

  it('revokes the family when a used token is presented', async () => {
    const { refresh, tokenStore } = setup()

    tokenStore.rotate.mockResolvedValueOnce(null)
    tokenStore.findByHash.mockResolvedValueOnce({
      familyId: 'fam-1',
      usedAt: NOW,
      revokedAt: null,
    })

    await expect(refresh('old-raw')).rejects.toBeInstanceOf(InvalidRefreshToken)

    expect(tokenStore.revokeFamily).toHaveBeenCalledWith('fam-1', NOW)
  })

  it('revokes the family when a revoked token is presented', async () => {
    const { refresh, tokenStore } = setup()

    tokenStore.rotate.mockResolvedValueOnce(null)
    tokenStore.findByHash.mockResolvedValueOnce({
      familyId: 'fam-1',
      usedAt: null,
      revokedAt: NOW,
    })

    await expect(refresh('old-raw')).rejects.toBeInstanceOf(InvalidRefreshToken)

    expect(tokenStore.revokeFamily).toHaveBeenCalledWith('fam-1', NOW)
  })

  it('rejects an expired token without revoking its family', async () => {
    const { refresh, tokenStore } = setup()

    tokenStore.rotate.mockResolvedValueOnce(null)
    tokenStore.findByHash.mockResolvedValueOnce({
      familyId: 'fam-1',
      usedAt: null,
      revokedAt: null,
    })

    await expect(refresh('old-raw')).rejects.toBeInstanceOf(InvalidRefreshToken)

    expect(tokenStore.revokeFamily).not.toHaveBeenCalled()
  })

  it('does not issue an access token when a used token is presented', async () => {
    const { refresh, tokenStore, accessTokens } = setup()

    tokenStore.rotate.mockResolvedValueOnce(null)
    tokenStore.findByHash.mockResolvedValueOnce({
      familyId: 'fam-1',
      usedAt: NOW,
      revokedAt: null,
    })

    await expect(refresh('old-raw')).rejects.toBeInstanceOf(InvalidRefreshToken)

    expect(accessTokens.issue).not.toHaveBeenCalled()
  })
})
