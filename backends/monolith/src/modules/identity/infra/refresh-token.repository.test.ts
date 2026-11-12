import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { newId } from '../../../platform/ids.ts'
import { db } from '../../../platform/db/client.ts'
import { isUniqueViolation } from '../../../platform/db/errors.ts'
import { refreshTokenGenerator } from './refresh-token-generator.ts'
import { refreshTokenRepository } from './refresh-token.repository.ts'
import { refreshTokens } from './schema.ts'
import { userRepository } from './user.repository.ts'
import { build, NOW } from '../../../../test/helpers.ts'

const nextToken = (tokenHash: Buffer) => ({
  id: newId(),
  tokenHash,
  expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
})

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

describe('findByHash', () => {
  it('returns a fresh token with matching familyId', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const result = await refreshTokenRepository.findByHash(account.refreshToken.tokenHash)

    expect(result).not.toBeNull()
    expect(result?.familyId).toBe(account.refreshToken.familyId)
    expect(result?.usedAt).toBeNull()
    expect(result?.revokedAt).toBeNull()
  })

  it('returns usedAt after the token has been claimed', async () => {
    const account = build()

    await userRepository.createAccount(account)

    await refreshTokenRepository.claim(account.refreshToken.tokenHash, new Date())

    const result = await refreshTokenRepository.findByHash(account.refreshToken.tokenHash)

    expect(result?.usedAt).toBeInstanceOf(Date)
  })

  it('returns null for an unknown token hash', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const result = await refreshTokenRepository.findByHash(Buffer.alloc(32, 1))

    expect(result).toBeNull()
  })
})

describe('revokeFamily', () => {
  it('revokes all tokens belonging to a family', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const secondToken = refreshTokenGenerator.generate()
    const otherFamilyToken = refreshTokenGenerator.generate()

    const second = {
      id: newId(),
      familyId: account.refreshToken.familyId,
      tokenHash: secondToken.tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      userId: account.user.id,
    }

    const otherFamily = {
      id: newId(),
      familyId: newId(),
      tokenHash: otherFamilyToken.tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      userId: account.user.id,
    }

    await refreshTokenRepository.create(second)
    await refreshTokenRepository.create(otherFamily)

    const now = new Date()

    await refreshTokenRepository.revokeFamily(account.refreshToken.familyId, now)

    const firstResult = await refreshTokenRepository.findByHash(account.refreshToken.tokenHash)

    const secondResult = await refreshTokenRepository.findByHash(second.tokenHash)

    const otherFamilyResult = await refreshTokenRepository.findByHash(otherFamily.tokenHash)

    expect(firstResult?.revokedAt).toEqual(now)
    expect(secondResult?.revokedAt).toEqual(now)
    expect(otherFamilyResult?.revokedAt).toBeNull()
  })

  it('does not allow claiming a revoked token', async () => {
    const account = build()

    await userRepository.createAccount(account)

    await refreshTokenRepository.revokeFamily(account.refreshToken.familyId, new Date())

    const result = await refreshTokenRepository.claim(account.refreshToken.tokenHash, new Date())

    expect(result).toBeNull()
  })

  it('does not overwrite the original revokedAt when revoking twice', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const firstNow = new Date()
    const secondNow = new Date(firstNow.getTime() + 60_000)

    await refreshTokenRepository.revokeFamily(account.refreshToken.familyId, firstNow)

    await refreshTokenRepository.revokeFamily(account.refreshToken.familyId, secondNow)

    const result = await refreshTokenRepository.findByHash(account.refreshToken.tokenHash)

    expect(result?.revokedAt).toEqual(firstNow)
  })
})

describe('rotate', () => {
  it('returns the userId and familyId of the claimed token', async () => {
    const account = build()
    await userRepository.createAccount(account)

    const result = await refreshTokenRepository.rotate(
      account.refreshToken.tokenHash,
      nextToken(refreshTokenGenerator.generate().tokenHash),
      NOW,
    )

    expect(result).toEqual({
      userId: account.user.id,
      familyId: account.refreshToken.familyId,
    })
  })

  it('inserts the next token into the same family', async () => {
    const account = build()
    await userRepository.createAccount(account)

    const next = nextToken(refreshTokenGenerator.generate().tokenHash)

    await refreshTokenRepository.rotate(account.refreshToken.tokenHash, next, NOW)

    const result = await refreshTokenRepository.findByHash(next.tokenHash)

    expect(result).toEqual({
      familyId: account.refreshToken.familyId,
      usedAt: null,
      revokedAt: null,
    })
  })

  it('marks the old token as used', async () => {
    const account = build()
    await userRepository.createAccount(account)

    await refreshTokenRepository.rotate(
      account.refreshToken.tokenHash,
      nextToken(refreshTokenGenerator.generate().tokenHash),
      NOW,
    )

    const result = await refreshTokenRepository.findByHash(account.refreshToken.tokenHash)

    expect(result?.usedAt).toEqual(NOW)
  })

  it('does not insert another token when the old token was already used', async () => {
    const account = build()
    await userRepository.createAccount(account)

    const oldHash = account.refreshToken.tokenHash

    await refreshTokenRepository.rotate(oldHash, nextToken(refreshTokenGenerator.generate().tokenHash), NOW)

    const secondNext = nextToken(refreshTokenGenerator.generate().tokenHash)

    const result = await refreshTokenRepository.rotate(oldHash, secondNext, NOW)

    expect(result).toBeNull()

    expect(await refreshTokenRepository.findByHash(secondNext.tokenHash)).toBeNull()
  })

  it('rolls back the old token claim when inserting the next token fails', async () => {
    const account = build()
    await userRepository.createAccount(account)

    const oldHash = account.refreshToken.tokenHash
    const existing = nextToken(refreshTokenGenerator.generate().tokenHash)

    await refreshTokenRepository.create({
      ...existing,
      userId: account.user.id,
      familyId: account.refreshToken.familyId,
    })

    await expect(refreshTokenRepository.rotate(oldHash, nextToken(existing.tokenHash), NOW)).rejects.toSatisfy((err) =>
      isUniqueViolation(err, 'refresh_tokens_token_hash_unique'),
    )

    const oldToken = await refreshTokenRepository.findByHash(oldHash)

    expect(oldToken?.usedAt).toBeNull()
  })

  it('allows only one rotation when two requests race', async () => {
    const account = build()
    await userRepository.createAccount(account)

    const oldHash = account.refreshToken.tokenHash

    const results = await Promise.all([
      refreshTokenRepository.rotate(oldHash, nextToken(refreshTokenGenerator.generate().tokenHash), NOW),
      refreshTokenRepository.rotate(oldHash, nextToken(refreshTokenGenerator.generate().tokenHash), NOW),
    ])

    expect(results.filter((result) => result !== null)).toHaveLength(1)
  })
})
