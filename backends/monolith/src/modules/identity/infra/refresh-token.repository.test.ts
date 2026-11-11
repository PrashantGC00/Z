import { newId } from '../../../platform/ids.ts'
import { refreshTokenGenerator } from './refresh-token-generator.ts'
import { refreshTokenRepository } from './refresh-token.repository.ts'
import { describe, expect, it } from 'vitest'
import { db } from '../../../platform/db/client.ts'
import { refreshTokens } from './schema.ts'
import { eq } from 'drizzle-orm'
import { userRepository } from './user.repository.ts'
import { build } from '../../../../test/helpers.ts'
import { isUniqueViolation } from '../../../platform/db/errors.ts'

describe('refreshTokenRepository', () => {
  it('creates a refresh token row', async () => {
    const account = build()

    await userRepository.createAccount(account)
    const generated = refreshTokenGenerator.generate()

    const token = {
      id: newId(),
      familyId: newId(),
      tokenHash: generated.tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      userId: account.user.id,
    }

    await refreshTokenRepository.create(token)

    const [selected] = await db.select().from(refreshTokens).where(eq(refreshTokens.id, token.id))

    expect(selected).toBeDefined()
    expect(selected?.familyId).toBe(token.familyId)
    expect(selected?.userId).toBe(token.userId)
    expect(selected?.tokenHash).toEqual(token.tokenHash)
    expect(selected?.usedAt).toBeNull()
    expect(selected?.revokedAt).toBeNull()
  })

  it('allows multiple refresh-token families for the same user', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const firstFamilyId = newId()
    const secondFamilyId = newId()

    const firstToken = refreshTokenGenerator.generate()
    const secondToken = refreshTokenGenerator.generate()

    const tokenA = {
      id: newId(),
      familyId: firstFamilyId,
      tokenHash: firstToken.tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      userId: account.user.id,
    }
    const tokenB = {
      id: newId(),
      familyId: secondFamilyId,
      tokenHash: secondToken.tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      userId: account.user.id,
    }

    await refreshTokenRepository.create(tokenA)
    await refreshTokenRepository.create(tokenB)

    const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, account.user.id))

    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.familyId)).toContain(firstFamilyId)
    expect(rows.map((row) => row.familyId)).toContain(secondFamilyId)
  })

  it('rejects duplicate token hashes', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const token = {
      id: newId(),
      familyId: newId(),
      tokenHash: account.refreshToken.tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      userId: account.user.id,
    }

    await expect(refreshTokenRepository.create(token)).rejects.toSatisfy((err) =>
      isUniqueViolation(err, 'refresh_tokens_token_hash_unique'),
    )
  })
})

describe('claim', () => {
  it('returns userId and familyId for a fresh token', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const now = new Date()

    const result = await refreshTokenRepository.claim(account.refreshToken.tokenHash, now)

    expect(result).toEqual({
      userId: account.user.id,
      familyId: account.refreshToken.familyId,
    })
  })

  it('returns null when claiming the same token twice', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const now = new Date()

    const first = await refreshTokenRepository.claim(account.refreshToken.tokenHash, now)

    const second = await refreshTokenRepository.claim(account.refreshToken.tokenHash, now)

    expect(first).not.toBeNull()
    expect(second).toBeNull()
  })

  it('returns null for an expired token', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const now = new Date(Date.now() + 120_000)

    const result = await refreshTokenRepository.claim(account.refreshToken.tokenHash, now)

    expect(result).toBeNull()
  })

  it('returns null for an unknown token hash', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const result = await refreshTokenRepository.claim(Buffer.from('unknown-token-hash'), new Date())

    expect(result).toBeNull()
  })

  it('allows exactly one claim when two requests race', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const now = new Date()
    const tokenHash = account.refreshToken.tokenHash

    const results = await Promise.all([
      refreshTokenRepository.claim(tokenHash, now),
      refreshTokenRepository.claim(tokenHash, now),
    ])

    const successfulClaims = results.filter((result) => result !== null)

    expect(successfulClaims).toHaveLength(1)
  })
})
