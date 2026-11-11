import { describe, expect, it, vi } from 'vitest'
import { makeLogout } from './logout.ts'
import type { RefreshTokenGenerator, RefreshTokenRepository } from './ports.ts'
import { NOW } from '../../../../test/helpers.ts'

const HASH = Buffer.from('presented-hash')

const setup = () => {
  const tokenStore = {
    findByHash: vi.fn<RefreshTokenRepository['findByHash']>(async () => ({
      familyId: 'fam-1',
      usedAt: null,
      revokedAt: null,
    })),
    revokeFamily: vi.fn<RefreshTokenRepository['revokeFamily']>(async () => {}),
  }

  const refreshTokens = {
    hash: vi.fn<RefreshTokenGenerator['hash']>(() => HASH),
  }

  const logout = makeLogout({
    tokenStore,
    refreshTokens,
    now: () => NOW,
  })

  return { logout, tokenStore, refreshTokens }
}

describe('makeLogout', () => {
  it('revokes the token family when the refresh token exists', async () => {
    const { logout, tokenStore } = setup()

    await logout('x')

    expect(tokenStore.revokeFamily).toHaveBeenCalledWith('fam-1', NOW)
  })

  it('does nothing when the refresh token does not exist', async () => {
    const { logout, tokenStore } = setup()
    tokenStore.findByHash.mockResolvedValue(null)

    await expect(logout('x')).resolves.toBeUndefined()

    expect(tokenStore.revokeFamily).not.toHaveBeenCalled()
  })

  it('looks up the hashed refresh token instead of the raw token', async () => {
    const { logout, tokenStore, refreshTokens } = setup()

    await logout('x')

    expect(refreshTokens.hash).toHaveBeenCalledWith('x')
    expect(tokenStore.findByHash).toHaveBeenCalledWith(HASH)
  })

  it('resolves without an error when the token is already revoked', async () => {
    const { logout, tokenStore } = setup()

    tokenStore.findByHash.mockResolvedValue({
      familyId: 'fam-1',
      usedAt: null,
      revokedAt: NOW,
    })

    await expect(logout('x')).resolves.toBeUndefined()

    expect(tokenStore.revokeFamily).toHaveBeenCalledWith('fam-1', NOW)
  })
})
